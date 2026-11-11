import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Not-a-number, null or undefined (a figure that couldn't be computed) shows as a dash.
const bad = (n: unknown): boolean => typeof n !== "number" || !Number.isFinite(n);

export const fmt = (n: number, d: number = 0) =>
  bad(n) ? "—" : Number(n).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtP = (n: number, d: number = 1) =>
  bad(n) ? "—" : (n >= 0 ? "+" : "") + n.toFixed(d) + "%";

export const fmtX = (n: number, d: number = 1) =>
  bad(n) ? "—" : n.toFixed(d) + "x";
