import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
};

export function getDateLocale(language: string): string {
  const lang = language?.split("-")[0]?.split("_")[0] || "en";
  return LOCALE_MAP[lang] || "en-US";
}
