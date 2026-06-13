import { prisma } from "../../config/db.js";
import { openai, AI_EMBED_MODEL } from "../../config/openai.js";

/** Split text into ~chunkSize-char chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, chunkSize = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= chunkSize) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);
    if (end < clean.length) {
      const lastBreak = clean.lastIndexOf("\n", end);
      const lastDot = clean.lastIndexOf(". ", end);
      const boundary = Math.max(lastBreak, lastDot);
      if (boundary > start + chunkSize * 0.5) end = boundary + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter(Boolean);
}

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await openai().embeddings.create({ model: AI_EMBED_MODEL, input: texts });
  return res.data.map((d) => d.embedding);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Embed + persist all chunks of a knowledge document. */
export async function indexDocument(documentId: string): Promise<number> {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id: documentId } });
  if (!doc) return 0;
  await prisma.knowledgeChunk.deleteMany({ where: { documentId } });
  const chunks = chunkText(doc.content);
  if (!chunks.length) return 0;
  const vectors = await embed(chunks);
  await prisma.$transaction(
    chunks.map((content, i) =>
      prisma.knowledgeChunk.create({
        data: { documentId, chunkIndex: i, content, embedding: vectors[i] as object, embeddedAt: new Date() },
      })
    )
  );
  return chunks.length;
}

export interface RetrievedChunk {
  content: string;
  title: string;
  score: number;
}

/** Top-k knowledge chunks most similar to the query (in-DB cosine). */
export async function retrieve(query: string, k = 4): Promise<RetrievedChunk[]> {
  const [queryVec] = await embed([query]);
  if (!queryVec) return [];
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { embedding: { not: undefined }, document: { isActive: true } },
    select: { content: true, embedding: true, document: { select: { title: true } } },
    take: 2000,
  });
  return chunks
    .map((c) => ({ content: c.content, title: c.document.title, score: cosine(queryVec, c.embedding as number[]) }))
    .filter((c) => c.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
