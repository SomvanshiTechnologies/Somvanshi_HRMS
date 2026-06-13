import type { Request, Response } from "express";
import type OpenAI from "openai";
import { prisma } from "../../config/db.js";
import { openai, AI_CHAT_MODEL } from "../../config/openai.js";
import { NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { allowedToolNames, runTool, toolDefsFor } from "./ai.tools.js";
import { retrieve } from "./ai.rag.js";

type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function systemPrompt(userName: string, roles: string[], today: string): string {
  return [
    "You are Sera, the AI assistant for Somvanshi HRMS (by Somvanshi Technologies).",
    `You are helping ${userName} (roles: ${roles.join(", ") || "Employee"}). Today is ${today}.`,
    "Be concise, friendly and professional. Use the available tools to fetch REAL data — never invent figures, balances, names or policies.",
    "When a tool returns data, summarise it clearly (use short markdown tables or bullet lists). Format currency in INR.",
    "Before performing an action that changes data (applying leave, raising a ticket), confirm the details with the user first.",
    "If a policy question is asked, rely on the provided knowledge-base context; if it isn't covered, say so and suggest contacting HR.",
    "If the user asks for something they lack permission for, a tool will refuse — relay that politely.",
  ].join(" ");
}

export const aiService = {
  async listConversations(userId: string) {
    return prisma.conversation.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, updatedAt: true },
    });
  },

  async getMessages(userId: string, conversationId: string) {
    const convo = await prisma.conversation.findFirst({ where: { id: conversationId, userId, deletedAt: null } });
    if (!convo) throw new NotFoundError("Conversation");
    return prisma.chatMessage.findMany({
      where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });
  },

  async createConversation(userId: string, title?: string) {
    return prisma.conversation.create({ data: { userId, title: title ?? null } });
  },

  async deleteConversation(userId: string, id: string) {
    await prisma.conversation.updateMany({ where: { id, userId }, data: { deletedAt: new Date() } });
  },

  /**
   * Agentic streaming chat. Streams the final answer token-by-token over SSE,
   * resolving any tool calls (RBAC-scoped) in between. Persists the turn.
   */
  async streamChat(req: Request, res: Response, conversationId: string, userText: string): Promise<void> {
    const userId = req.user!.id;
    const convo = await prisma.conversation.findFirst({ where: { id: conversationId, userId, deletedAt: null } });
    if (!convo) throw new NotFoundError("Conversation");

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, employee: { select: { firstName: true, lastName: true } }, roles: { select: { role: { select: { name: true } } } } },
    });
    const userName = me?.employee ? `${me.employee.firstName} ${me.employee.lastName}` : me?.email ?? "there";
    const roles = me?.roles.map((r) => r.role.name) ?? [];

    // persist the user message
    await prisma.chatMessage.create({ data: { conversationId, role: "USER", content: userText } });

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      // RAG context
      const retrieved = await retrieve(userText).catch(() => []);
      const context = retrieved.length
        ? `\n\nKnowledge base context:\n${retrieved.map((r) => `[${r.title}] ${r.content}`).join("\n---\n")}`
        : "";

      // prior turns (memory)
      const history = await prisma.chatMessage.findMany({
        where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { role: true, content: true },
      });
      const priorMessages: ChatMsg[] = history
        .reverse()
        .slice(0, -1) // exclude the message we just stored (added below)
        .map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }));

      const allowed = await allowedToolNames(req);
      const toolDefs = toolDefsFor(allowed);

      const messages: ChatMsg[] = [
        { role: "system", content: systemPrompt(userName, roles, new Date().toDateString()) + context },
        ...priorMessages,
        { role: "user", content: userText },
      ];

      let finalText = "";
      const client = openai();

      for (let iter = 0; iter < 6; iter++) {
        const stream = await client.chat.completions.create({
          model: AI_CHAT_MODEL,
          messages,
          ...(toolDefs.length ? { tools: toolDefs, tool_choice: "auto" } : {}),
          stream: true,
          temperature: 0.3,
        });

        let content = "";
        const toolCalls: Array<{ id: string; name: string; args: string }> = [];

        for await (const part of stream) {
          const delta = part.choices[0]?.delta;
          if (delta?.content) {
            content += delta.content;
            finalText += delta.content;
            send("token", { text: delta.content });
          }
          for (const tc of delta?.tool_calls ?? []) {
            const idx = tc.index;
            toolCalls[idx] ??= { id: "", name: "", args: "" };
            if (tc.id) toolCalls[idx]!.id = tc.id;
            if (tc.function?.name) toolCalls[idx]!.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx]!.args += tc.function.arguments;
          }
        }

        if (toolCalls.length === 0) break; // final answer streamed

        // execute tools, append results, loop
        messages.push({
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.args || "{}" } })),
        });
        for (const call of toolCalls) {
          send("tool", { name: call.name });
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.args || "{}"); } catch { /* ignore */ }
          const result = await runTool(req, call.name, args);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }

      // persist assistant turn + title
      await prisma.chatMessage.create({ data: { conversationId, role: "ASSISTANT", content: finalText || "(no response)" } });
      const updates: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
      if (!convo.title) updates.title = userText.slice(0, 60);
      await prisma.conversation.update({ where: { id: conversationId }, data: updates });
      audit({ userId, action: "ai.chat", entity: "Conversation", entityId: conversationId, req });

      send("done", { title: updates.title });
      res.end();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      let message = err instanceof Error ? err.message : "Sera failed";
      if (status === 429) message = "Sera is temporarily unavailable — the OpenAI account has no remaining quota. Please add billing/credits at platform.openai.com.";
      else if (status === 401) message = "Sera's OpenAI API key is invalid. Please check OPENAI_API_KEY.";
      send("error", { message });
      res.end();
    }
  },
};
