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

export async function getVocabIndex(): Promise<VocabIndex> {
  const raw = await fs.readFile(path.join(VOCAB_DIR, "index.json"), "utf-8");
  return JSON.parse(raw) as VocabIndex;
}

export async function getVocabLevel(level: string): Promise<VocabWord[]> {
  const raw = await fs.readFile(path.join(VOCAB_DIR, `hsk${level}.json`), "utf-8");
  return JSON.parse(raw) as VocabWord[];
}

/** CEFR-ish band label per HSK 3.0 stage. */
export function levelBand(level: string): string {
  if (["1", "2", "3"].includes(level)) return "Beginner";
  if (["4", "5", "6"].includes(level)) return "Intermediate";
  return "Advanced";
}
