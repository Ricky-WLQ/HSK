import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";

// AI grader for produced writing (sentence / essay / translation). Login-gated +
// rate-limited; validates and length-caps every field BEFORE the DeepSeek call so
// malformed/oversized input can't amplify cost.

type Dimension = { name: string; score: number; comment: string };
type Grade = { score: number; band: string; dimensions: Dimension[]; feedback: string };
const EMPTY: Grade = { score: 0, band: "", dimensions: [], feedback: "" };

const LEVELS = new Set(["2", "3", "4", "5", "6", "7-9"]);
const TYPES = new Set(["writing-sentence", "writing-essay", "translation-passage"]);

function sysFor(type: string): string {
  const base =
    "你是一位专业、严谨的HSK中文写作阅卷老师。请依据题目要求评分，分数为0-100的整数。" +
    '只用 JSON 返回（全部用中文）：{"score":<0-100整数>,"band":"<优秀|良好|合格|待提高>",' +
    '"dimensions":[{"name":"<维度>","score":<0-100>,"comment":"<简评>"}],"feedback":"<总体反馈与改进建议>"}。';
  if (type === "writing-sentence") {
    return base + "评分维度：用词是否正确使用给定词语、语法是否正确、是否符合图片/语境、句子是否完整通顺。";
  }
  if (type === "translation-passage") {
    return base + "这是英译中。评分维度：忠实度（是否准确传达原文）、流畅度（中文是否自然）、完整度（有无遗漏）。";
  }
  return base + "这是作文。评分维度：内容（切题、充实）、语言（语法、词汇、用词准确）、结构（条理、连贯）、字数是否达标。";
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(`hsk-grade:${session.user.id}`, 30)) {
    return NextResponse.json(EMPTY, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(EMPTY);
  }
  const level = String(body.level ?? "");
  const type = String(body.type ?? "");
  if (!LEVELS.has(level) || !TYPES.has(type)) return NextResponse.json(EMPTY);

  const prompt = String(body.prompt ?? "").slice(0, 2000);
  const givenWord = String(body.givenWord ?? "").slice(0, 40);
  const sourceText = String(body.sourceText ?? "").slice(0, 3000);
  const sample = String(body.sample ?? "").slice(0, 3000);
  const minChars = Number.isFinite(body.minChars) ? Number(body.minChars) : 0;
  const studentText = String(body.studentText ?? "").slice(0, 6000);
  if (studentText.trim().length === 0) {
    return NextResponse.json({ ...EMPTY, feedback: "请先写作再提交。" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return NextResponse.json({ ...EMPTY, feedback: "评分服务暂不可用。" });

  const user =
    `HSK${level} 写作题。\n题目要求：${prompt}\n` +
    (givenWord ? `给定词语：${givenWord}\n` : "") +
    (sourceText ? `原文（英文）：${sourceText}\n` : "") +
    (minChars ? `字数要求：不少于${minChars}字\n` : "") +
    (sample ? `参考答案（仅供评分参照，不要照搬）：${sample}\n` : "") +
    `\n学生作答（共${studentText.length}字）：\n${studentText}`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [
          { role: "system", content: sysFor(type) },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        stream: false,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return NextResponse.json({ ...EMPTY, feedback: "评分服务暂时繁忙，请稍后再试。" });
    const j = (await res.json()) as { choices: { message: { content: string } }[] };
    const p = JSON.parse(j.choices[0].message.content) as Partial<Grade>;
    const score = Math.max(0, Math.min(100, Math.round(Number(p.score) || 0)));
    const grade: Grade = {
      score,
      band: typeof p.band === "string" ? p.band : "",
      dimensions: Array.isArray(p.dimensions)
        ? p.dimensions.slice(0, 5).map((d) => ({
            name: String(d?.name ?? "").slice(0, 20),
            score: Math.max(0, Math.min(100, Math.round(Number(d?.score) || 0))),
            comment: String(d?.comment ?? "").slice(0, 400),
          }))
        : [],
      feedback: String(p.feedback ?? "").slice(0, 2000),
    };
    return NextResponse.json(grade);
  } catch {
    return NextResponse.json({ ...EMPTY, feedback: "评分超时，请稍后再试。" });
  }
}
