import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pct(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}
