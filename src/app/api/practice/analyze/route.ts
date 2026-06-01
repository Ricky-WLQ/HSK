import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";

type Analysis = { summary: string; analysis: string; relatedVocab: string[] };
const EMPTY: Analysis = { summary: "", analysis: "", relatedVocab: [] };
const LEVELS = new Set(["1", "2", "3", "4", "5", "6", "7-9"]);
const SECTIONS = new Set(["listening", "reading", "writing", "translation", "speaking"]);
const CONTENT_ID = /^hsk[\w-]{2,40}$/;
const QUESTION_ID = /^[\w-]{1,20}$/;

const SYS =
  "你是一位专业的HSK中文阅读老师。学生在一道阅读题中选错了答案，请简洁分析。" +
  '只用 JSON 返回（全部用中文）：{"summary":"一句话点出考点","analysis":"1) 正确答案为什么对（引用原文依据）2) 学生答案为什么不对","relatedVocab":["相关词1","相关词2","相关词3"]}';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(`hsk-analyze:${session.user.id}`, 40)) {
    return NextResponse.json(EMPTY, { status: 429 });
  }

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
  // Validate BEFORE any DeepSeek call so malformed/oversized input can't amplify cost.
  if (!LEVELS.has(level) || !SECTIONS.has(section) || !CONTENT_ID.test(contentId) || !QUESTION_ID.test(questionId)) {
    return NextResponse.json(EMPTY);
  }
  const prompt = String(body.prompt ?? "").slice(0, 2000);
  const passage = body.passage ? String(body.passage).slice(0, 4000) : "";
  const userAnswer = String(body.userAnswer ?? "").slice(0, 200);
  const correctAnswer = String(body.correctAnswer ?? "").slice(0, 200);
  const bankStr = body.bank ? JSON.stringify(body.bank).slice(0, 2000) : "";
  const optionsStr = body.options ? JSON.stringify(body.options).slice(0, 2000) : "";

  const apiKey = process.env.DEEPSEEK_API_KEY;
  let result: Analysis = EMPTY;
  if (apiKey) {
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    const user =
      `HSK${level} 阅读题。\n` +
      (passage ? `短文：${passage}\n` : "") +
      (bankStr ? `词库：${bankStr}\n` : "") +
      `题目：${prompt}\n` +
      (optionsStr ? `选项：${optionsStr}\n` : "") +
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
      // network/parse error → EMPTY
    }
  }

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
        options: optionsStr || null,
        userAnswer,
        correctAnswer,
        analysis: JSON.stringify(result),
      },
      update: { userAnswer, analysis: JSON.stringify(result), status: "new" },
    });
  } catch {
    // best-effort persistence
  }

  return NextResponse.json(result);
}
