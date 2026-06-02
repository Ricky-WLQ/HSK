// User-controlled text size for low-vision / older users. Scales the root
// font-size; because the UI is built in rem units, everything enlarges
// proportionally. Persisted in localStorage; applied no-FOUC via an inline
// script in the root layout.
export const FONT_SCALES = [100, 115, 130, 150] as const; // percent
const KEY = "hsk-fontscale";

export function getScaleIndex(): number {
  if (typeof window === "undefined") return 0;
  const v = parseInt(localStorage.getItem(KEY) || "0", 10);
  return Number.isInteger(v) && v >= 0 && v < FONT_SCALES.length ? v : 0;
}

export function setScaleIndex(i: number): void {
  if (typeof window === "undefined") return;
  const idx = Math.max(0, Math.min(FONT_SCALES.length - 1, i));
  localStorage.setItem(KEY, String(idx));
  applyFontScale(idx);
  window.dispatchEvent(new Event("fontscalechange"));
}

export function applyFontScale(i?: number): void {
  if (typeof window === "undefined") return;
  const idx = i ?? getScaleIndex();
  document.documentElement.style.fontSize = `${FONT_SCALES[idx]}%`;
}
