// AI resume parsing + scoring. Extracts text from the stored resume file,
// then uses OpenAI to structure it and (optionally) score it against a posting.
import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { openai, AI_CHAT_MODEL, isAiConfigured, aiErrorMessage } from "../../config/openai.js";
import { BadRequestError } from "../../core/errors.js";

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

export interface ParsedResume {
  summary: string;
  totalExperienceYears: number | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
  emails: string[];
  phones: string[];
  skills: string[];
  education: Array<{ degree: string; institution: string; year: string | null }>;
  experience: Array<{ company: string; role: string; duration: string | null }>;
}

/** Read the resume file from local storage and extract plain text. */
export async function extractResumeText(fileUrl: string, fileName: string): Promise<string> {
  const filename = path.basename(fileUrl);
  const filePath = path.join(uploadRoot, filename);
  if (!fs.existsSync(filePath)) throw new BadRequestError("Resume file not found on the server");
  const ext = path.extname(fileName || filename).toLowerCase();
  if (ext === ".txt" || ext === ".md") return fs.readFileSync(filePath, "utf8");
  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text;
  }
  throw new BadRequestError(`Cannot extract text from ${ext || "this file"} — upload a PDF or paste the text.`);
}

const PARSE_SYSTEM = [
  "You are an expert technical recruiter. Extract structured data from the resume text.",
  "Return STRICT JSON only with this shape:",
  '{ "summary": string (2-3 sentences), "totalExperienceYears": number|null, "currentRole": string|null, "currentCompany": string|null, "location": string|null, "emails": string[], "phones": string[], "skills": string[] (deduped, max 30), "education": [{"degree": string, "institution": string, "year": string|null}], "experience": [{"company": string, "role": string, "duration": string|null}] }',
  "Infer totalExperienceYears from the work history if not stated. Never invent data not present in the resume.",
].join(" ");

export async function parseResumeText(text: string): Promise<ParsedResume> {
  if (!isAiConfigured()) throw new BadRequestError("Resume parsing needs OpenAI — set OPENAI_API_KEY.");
  const clipped = text.slice(0, 24000);
  let res;
  try {
    res = await openai().chat.completions.create({
      model: AI_CHAT_MODEL,
      messages: [{ role: "system", content: PARSE_SYSTEM }, { role: "user", content: clipped }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });
  } catch (err) {
    throw new BadRequestError(aiErrorMessage(err));
  }
  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<ParsedResume>;
  return {
    summary: parsed.summary ?? "",
    totalExperienceYears: parsed.totalExperienceYears ?? null,
    currentRole: parsed.currentRole ?? null,
    currentCompany: parsed.currentCompany ?? null,
    location: parsed.location ?? null,
    emails: parsed.emails ?? [],
    phones: parsed.phones ?? [],
    skills: parsed.skills ?? [],
    education: parsed.education ?? [],
    experience: parsed.experience ?? [],
  };
}

export interface ResumeMatch { overallScore: number; skillScore: number; experienceScore: number; educationScore: number; matchSummary: string }

const SCORE_SYSTEM = [
  "You are a hiring screener. Score how well a candidate matches a job, 0-100.",
  'Return STRICT JSON: { "overallScore": number, "skillScore": number, "experienceScore": number, "educationScore": number, "matchSummary": string (2-3 sentences, mention key gaps & strengths) }.',
  "Be objective and base scores ONLY on the provided resume vs job description.",
].join(" ");

export async function scoreResumeAgainstJob(parsed: ParsedResume, jobTitle: string, jobDescription: string): Promise<ResumeMatch> {
  if (!isAiConfigured()) throw new BadRequestError("Scoring needs OpenAI — set OPENAI_API_KEY.");
  let res;
  try {
    res = await openai().chat.completions.create({
      model: AI_CHAT_MODEL,
      messages: [
        { role: "system", content: SCORE_SYSTEM },
        { role: "user", content: `JOB: ${jobTitle}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}\n\nCANDIDATE RESUME (structured):\n${JSON.stringify(parsed).slice(0, 12000)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
  } catch (err) {
    throw new BadRequestError(aiErrorMessage(err));
  }
  const j = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<ResumeMatch>;
  const clamp = (n: number | undefined) => Math.max(0, Math.min(100, Math.round(n ?? 0)));
  return {
    overallScore: clamp(j.overallScore),
    skillScore: clamp(j.skillScore),
    experienceScore: clamp(j.experienceScore),
    educationScore: clamp(j.educationScore),
    matchSummary: j.matchSummary ?? "",
  };
}

/** Full pipeline: extract → parse → persist on the Resume row. Optionally score vs a posting. */
export async function parseAndStore(resumeId: string, postingId?: string): Promise<{ parsed: ParsedResume; score: ResumeMatch | null }> {
  const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
  if (!resume) throw new BadRequestError("Resume not found");
  const text = resume.parsedText && resume.parsedText.length > 50 ? resume.parsedText : await extractResumeText(resume.fileUrl, resume.fileName);
  const parsed = await parseResumeText(text);
  await prisma.resume.update({ where: { id: resumeId }, data: { parsedText: text.slice(0, 60000), parsedJson: parsed as never } });

  let score: ResumeMatch | null = null;
  if (postingId) {
    const posting = await prisma.jobPosting.findUnique({ where: { id: postingId }, select: { description: true, requisition: { select: { title: true } } } });
    if (posting?.description) {
      score = await scoreResumeAgainstJob(parsed, posting.requisition?.title ?? "Role", posting.description);
      await prisma.resumeScore.create({
        data: { resumeId, overallScore: score.overallScore, skillScore: score.skillScore, experienceScore: score.experienceScore, educationScore: score.educationScore, matchSummary: score.matchSummary, model: AI_CHAT_MODEL },
      });
    }
  }
  return { parsed, score };
}
