// Number count-up for display strings like "$1,234.56 Mn", "12.3x – 18.0x" or "+4.2%".
// It only changes what is painted during a short animation; the final frame is always the
// original string, character for character, so no figure the model produced is ever altered.

const NUM = /\d[\d,]*(?:\.\d+)?/g;

/** The text at progress p (0..1): every number scaled by p, keeping its decimals and thousands separators. */
export function tweenText(text: string, p: number): string {
  if (p >= 1) return text;
  return text.replace(NUM, raw => {
    const grouped = raw.includes(",");
    const decimals = raw.includes(".") ? raw.length - raw.indexOf(".") - 1 : 0;
    const v = Number(raw.replace(/,/g, "")) * Math.max(0, p);
    return v.toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  });
}

/** True when the string holds at least one number worth counting up. */
export const hasNumber = (text: string) => /\d/.test(text);

/** easeOutCubic: fast start, gentle landing. */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
