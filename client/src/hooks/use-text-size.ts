import { useState, useEffect } from "react";

export type TextSize = "normal" | "large" | "xl";

const TEXT_SIZE_KEY = "concordia-text-size";
const SIZE_CLASSES: Record<TextSize, string> = {
  normal: "",
  large: "text-size-large",
  xl: "text-size-xl",
};

function applySize(size: TextSize) {
  const el = document.documentElement;
  el.classList.remove("text-size-large", "text-size-xl");
  const cls = SIZE_CLASSES[size];
  if (cls) el.classList.add(cls);
}

export function useTextSize() {
  const [size, setSize] = useState<TextSize>(() => {
    try {
      return (localStorage.getItem(TEXT_SIZE_KEY) as TextSize) || "normal";
    } catch {
      return "normal";
    }
  });

  useEffect(() => {
    applySize(size);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, size);
    } catch {
      // ignore
    }
  }, [size]);

  return { size, setSize };
}

export function initTextSize() {
  try {
    const saved = localStorage.getItem(TEXT_SIZE_KEY) as TextSize | null;
    if (saved && saved !== "normal") applySize(saved);
  } catch {
    // ignore
  }
}
