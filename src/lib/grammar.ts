import fs from "node:fs/promises";
import path from "node:path";
import { HSK_LEVELS, isHskLevel, levelBand } from "@/lib/vocab";

export { HSK_LEVELS, isHskLevel, levelBand };
export type { HskLevel } from "@/lib/vocab";

export type GrammarExample = { zh: string; pinyin: string; en: string };
export type GrammarDrill = {
  type: "fill_blank" | "choose_form" | string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};
export type GrammarPoint = {
  id: string;
  level: string;
  category: string;
  nameZh: string;
  nameEn: string;
  explanation: string;
  structuralForm: string;
  examples: GrammarExample[];
  drills: GrammarDrill[];
};

export type GrammarLevelMeta = { level: string; file: string; points: number; drills: number };
export type GrammarIndex = {
  standard: string;
  source: string;
  note?: string;
  levels: GrammarLevelMeta[];
};

const GRAMMAR_DIR = path.join(process.cwd(), "src", "data", "grammar");

// Static read-only data — parse each file at most once per process.
let _index: GrammarIndex | null = null;
const _levels = new Map<string, GrammarPoint[]>();

export async function getGrammarIndex(): Promise<GrammarIndex> {
  if (_index) return _index;
  try {
    const raw = await fs.readFile(path.join(GRAMMAR_DIR, "index.json"), "utf-8");
    _index = JSON.parse(raw) as GrammarIndex;
  } catch {
    _index = { standard: "", source: "", levels: [] };
  }
  return _index;
}

export async function getGrammarLevel(level: string): Promise<GrammarPoint[]> {
  const cached = _levels.get(level);
  if (cached) return cached;
  let points: GrammarPoint[] = [];
  try {
    const raw = await fs.readFile(path.join(GRAMMAR_DIR, `hsk${level}.json`), "utf-8");
    points = JSON.parse(raw) as GrammarPoint[];
  } catch {
    points = []; // missing/corrupt file → graceful empty, never a 500
  }
  _levels.set(level, points);
  return points;
}
