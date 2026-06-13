// AI job-description generator. Turns requisition details into a polished,
// structured JD via OpenAI.
import { openai, AI_CHAT_MODEL, isAiConfigured, aiErrorMessage } from "../../config/openai.js";
import { BadRequestError } from "../../core/errors.js";

export interface JdInput {
  title: string;
  department?: string;
  employmentType?: string;
  location?: string;
  minExperience?: number;
  maxExperience?: number;
  skills?: string[];
  notes?: string;
}

export interface GeneratedJd {
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  markdown: string;
}

const SYSTEM = [
  "You are an expert technical recruiter writing inclusive, compelling job descriptions for an Indian tech company (Somvanshi Technologies).",
  "Given role details, produce a professional JD. Return STRICT JSON:",
  '{ "summary": string (2-3 sentence role overview), "responsibilities": string[] (5-8 bullets), "requirements": string[] (5-8 must-have bullets), "niceToHave": string[] (3-5 bullets), "markdown": string (the full JD nicely formatted in markdown with headings) }',
  "Use the provided experience range and skills. Be specific and avoid clichés. Do not invent salary unless asked.",
].join(" ");

export async function generateJobDescription(input: JdInput): Promise<GeneratedJd> {
  if (!isAiConfigured()) throw new BadRequestError("Job-description generation needs OpenAI — set OPENAI_API_KEY.");
  const expr = input.minExperience != null || input.maxExperience != null
    ? `Experience: ${input.minExperience ?? 0}-${input.maxExperience ?? "+"} years.` : "";
  const userMsg = [
    `Role: ${input.title}`,
    input.department ? `Department: ${input.department}` : "",
    input.employmentType ? `Type: ${input.employmentType}` : "",
    input.location ? `Location: ${input.location}` : "",
    expr,
    input.skills?.length ? `Key skills: ${input.skills.join(", ")}` : "",
    input.notes ? `Additional notes: ${input.notes}` : "",
  ].filter(Boolean).join("\n");

  let res;
  try {
    res = await openai().chat.completions.create({
      model: AI_CHAT_MODEL,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }],
      response_format: { type: "json_object" },
      temperature: 0.6,
    });
  } catch (err) {
    throw new BadRequestError(aiErrorMessage(err));
  }
  const j = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<GeneratedJd>;
  return {
    summary: j.summary ?? "",
    responsibilities: j.responsibilities ?? [],
    requirements: j.requirements ?? [],
    niceToHave: j.niceToHave ?? [],
    markdown: j.markdown ?? "",
  };
}
