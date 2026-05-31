import fs from "node:fs/promises";
import path from "node:path";

export type VocabExample = { hanzi: string; pinyin: string; english: string };

export type VocabWord = {
  id: string;
  hanzi: string;
  traditional: string | null;
  level: string;
  pinyin: string;
  readings: string[];
  pos: string[];
  definition?: string;
  examples?: VocabExample[];
};

export type VocabLevelMeta = { level: string; file: string; count: number };
export type VocabIndex = {
  standard: string;
  source: string;
  note?: string;
  levels: VocabLevelMeta[];
};

/** Display order of HSK 3.0 levels. */
export const HSK_LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"] as const;
export type HskLevel = (typeof HSK_LEVELS)[number];

export function isHskLevel(value: string): value is HskLevel {
  return (HSK_LEVELS as readonly string[]).includes(value);
}

const VOCAB_DIR = path.join(process.cwd(), "src", "data", "vocab");

// The word lists are static read-only data (hsk7-9.json alone is ~2 MB), so we
// parse each file at most once per process instead of on every request.
let _index: VocabIndex | null = null;
const _levels = new Map<string, VocabWord[]>();

export async function getVocabIndex(): Promise<VocabIndex> {
  if (_index) return _index;
  const raw = await fs.readFile(path.join(VOCAB_DIR, "index.json"), "utf-8");
  _index = JSON.parse(raw) as VocabIndex;
  return _index;
}

export async function getVocabLevel(level: string): Promise<VocabWord[]> {
  const cached = _levels.get(level);
  if (cached) return cached;
  const raw = await fs.readFile(path.join(VOCAB_DIR, `hsk${level}.json`), "utf-8");
  const words = JSON.parse(raw) as VocabWord[];
  _levels.set(level, words);
  return words;
}

/** CEFR-ish band label per HSK 3.0 stage. */
export function levelBand(level: string): string {
  if (["1", "2", "3"].includes(level)) return "Beginner";
  if (["4", "5", "6"].includes(level)) return "Intermediate";
  return "Advanced";
}
