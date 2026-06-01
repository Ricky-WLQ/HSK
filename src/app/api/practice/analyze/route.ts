import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type Analysis = { summary: string; analysis: string; relatedVocab: string[] };
const EMPTY: Analysis = { summary: "", analysis: "", relatedVocab: [] };

const SYS =
  "你是一位专业的HSK中文阅读老师。学生在一道阅读题中选错了答案，请简洁分析。" +
  '只用 JSON 返回（全部用中文）：{"summary":"一句话点出考点","analysis":"1) 正确答案为什么对（引用原文依据）2) 学生答案为什么不对","relatedVocab":["相关词1","相关词2","相关词3"]}';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(EMPTY);
  }
  const level = String(body.level ?? "");
  const section = String(body.section ?? "reading");
  const contentId = String(body.contentId ?? "");
  const questionId = String(body.questionId ?? "");
  const prompt = String(body.prompt ?? "").slice(0, 2000);
  const passage = body.passage ? String(body.passage).slice(0, 4000) : "";
  const userAnswer = String(body.userAnswer ?? "");
  const correctAnswer = String(body.correctAnswer ?? "");
  const options = body.options ?? null;
  const bank = body.bank ?? null;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  let result: Analysis = EMPTY;
  if (apiKey) {
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    const user =
      `HSK${level} 阅读题。\n` +
      (passage ? `短文：${passage}\n` : "") +
      (bank ? `词库：${JSON.stringify(bank)}\n` : "") +
      `题目：${prompt}\n` +
      (options ? `选项：${JSON.stringify(options)}\n` : "") +
      `学生答案：${userAnswer}\n正确答案：${correctAnswer}`;
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYS },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          stream: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const j = (await res.json()) as { choices: { message: { content: string } }[] };
        const p = JSON.parse(j.choices[0].message.content) as Partial<Analysis>;
        result = {
          summary: p.summary ?? "",
          analysis: p.analysis ?? "",
          relatedVocab: Array.isArray(p.relatedVocab) ? p.relatedVocab.slice(0, 6) : [],
        };
      }
    } catch {
      // fall through with EMPTY
    }
  }

  // persist to the mistake notebook (best-effort)
  if (contentId && questionId) {
    try {
      await prisma.hskMistake.upsert({
        where: {
          userId_level_section_contentId_questionId: {
            userId: session.user.id,
            level,
            section,
            contentId,
            questionId,
          },
        },
        create: {
          userId: session.user.id,
          level,
          section,
          contentId,
          questionId,
          questionText: prompt,
          questionContext: passage || null,
          options: options ? JSON.stringify(options) : null,
          userAnswer,
          correctAnswer,
          analysis: JSON.stringify(result),
        },
        update: { userAnswer, analysis: JSON.stringify(result), status: "new" },
      });
    } catch {
      // best-effort
    }
  }

  return NextResponse.json(result);
}
