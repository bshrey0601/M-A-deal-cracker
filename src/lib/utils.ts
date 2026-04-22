import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = (n: number, d: number = 0) =>
  isNaN(n) || !isFinite(n) ? "—" : Number(n).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtP = (n: number, d: number = 1) =>
  isNaN(n) || !isFinite(n) ? "—" : (n >= 0 ? "+" : "") + n.toFixed(d) + "%";

export const fmtX = (n: number, d: number = 1) =>
  isNaN(n) || !isFinite(n) ? "—" : n.toFixed(d) + "x";
