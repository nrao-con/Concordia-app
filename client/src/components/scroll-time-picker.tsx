import { useState, useRef, useEffect, useCallback } from "react";

const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const CENTER_INDEX = Math.floor(VISIBLE_ITEMS / 2);

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function to12Hour(h24: number): { hour12: number; period: "AM" | "PM" } {
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, period };
}

function to24Hour(hour12: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function snapMinute(m: number): number {
  return MINUTES.reduce((prev, curr) =>
    Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev
  );
}

interface ScrollColumnProps {
  items: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  formatItem: (value: number) => string;
  testIdPrefix: string;
  label: string;
}

function ScrollColumn({ items, selectedIndex, onSelect, formatItem, testIdPrefix, label }: ScrollColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const isUserTouchingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const scrollToIndex = useCallback((index: number, smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    const top = index * ITEM_HEIGHT;
    el.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
  }, []);

  useEffect(() => {
    scrollToIndex(selectedIndex, false);
  }, []);

  useEffect(() => {
    if (!isScrollingRef.current) {
      scrollToIndex(selectedIndex, true);
    }
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = useCallback(() => {
    if (!isUserTouchingRef.current) return;

    isScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      isScrollingRef.current = false;
      onSelect(clamped);
      scrollToIndex(clamped, true);
    }, 150);
  }, [items.length, onSelect, scrollToIndex]);

  const handleInteractionStart = useCallback(() => {
    isUserTouchingRef.current = true;
  }, []);

  const handleInteractionEnd = useCallback(() => {
    setTimeout(() => {
      isUserTouchingRef.current = false;
    }, 300);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = () => {
      isUserTouchingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isUserTouchingRef.current = false;
      }, 300);
    };
    el.addEventListener("wheel", handleWheel, { passive: true });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    let newIdx = selectedIndex;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      newIdx = Math.max(0, selectedIndex - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      newIdx = Math.min(items.length - 1, selectedIndex + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      newIdx = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      newIdx = items.length - 1;
    } else {
      return;
    }
    onSelect(newIdx);
    scrollToIndex(newIdx, true);
  }, [selectedIndex, items.length, onSelect, scrollToIndex]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const paddingTop = CENTER_INDEX * ITEM_HEIGHT;
  const paddingBottom = (VISIBLE_ITEMS - CENTER_INDEX - 1) * ITEM_HEIGHT;

  return (
    <div className="relative flex-1 overflow-hidden" style={{ height: PICKER_HEIGHT }}>
      <div
        className="absolute left-0 right-0 pointer-events-none border-y border-primary/20 bg-primary/5 rounded-lg z-10"
        style={{ top: CENTER_INDEX * ITEM_HEIGHT, height: ITEM_HEIGHT }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          background: "linear-gradient(to bottom, hsl(var(--background)) 0%, transparent 30%, transparent 70%, hsl(var(--background)) 100%)",
        }}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        className="h-full overflow-y-auto scroll-wheel-column"
        onScroll={handleScroll}
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
        onMouseDown={handleInteractionStart}
        onMouseUp={handleInteractionEnd}
        onKeyDown={handleKeyDown}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        data-testid={`scroll-column-${testIdPrefix}`}
      >
        <div style={{ paddingTop, paddingBottom }}>
          {items.map((item, i) => {
            const isSelected = i === selectedIndex;
            return (
              <div
                key={`${testIdPrefix}-${item}`}
                role="option"
                aria-selected={isSelected}
                className={`w-full flex items-center justify-center transition-all duration-150 cursor-pointer select-none ${
                  isSelected
                    ? "text-foreground font-bold text-xl"
                    : "text-muted-foreground/60 font-medium text-lg"
                }`}
                style={{ height: ITEM_HEIGHT }}
                onClick={() => {
                  isUserTouchingRef.current = true;
                  onSelect(i);
                  scrollToIndex(i, true);
                  setTimeout(() => { isUserTouchingRef.current = false; }, 300);
                }}
                data-testid={`${testIdPrefix}-${item}`}
              >
                {formatItem(item)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ScrollWheelTimePickerProps {
  value: string;
  onChange: (time: string) => void;
}

export function ScrollWheelTimePicker({ value, onChange }: ScrollWheelTimePickerProps) {
  const [h24, m24] = (value || "08:00").split(":").map(Number);
  const safeH24 = isNaN(h24) ? 8 : h24;
  const safeM24 = isNaN(m24) ? 0 : m24;
  const { hour12, period } = to12Hour(safeH24);
  const snappedMinute = snapMinute(safeM24);

  const hourIndex = HOURS_12.indexOf(hour12);
  const minuteIndex = MINUTES.indexOf(snappedMinute);

  const [currentPeriod, setCurrentPeriod] = useState<"AM" | "PM">(period);
  const mountedRef = useRef(false);

  useEffect(() => {
    setCurrentPeriod(period);
  }, [period]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (safeM24 !== snappedMinute) {
        const normalized = `${pad2(safeH24)}:${pad2(snappedMinute)}`;
        onChange(normalized);
      }
    }
  }, []);

  const emitChange = useCallback((h12: number, min: number, p: "AM" | "PM") => {
    const h24Val = to24Hour(h12, p);
    onChange(`${pad2(h24Val)}:${pad2(min)}`);
  }, [onChange]);

  const handleHourSelect = useCallback((idx: number) => {
    emitChange(HOURS_12[idx], MINUTES[minuteIndex], currentPeriod);
  }, [minuteIndex, currentPeriod, emitChange]);

  const handleMinuteSelect = useCallback((idx: number) => {
    emitChange(HOURS_12[hourIndex >= 0 ? hourIndex : 0], MINUTES[idx], currentPeriod);
  }, [hourIndex, currentPeriod, emitChange]);

  const togglePeriod = useCallback(() => {
    const newPeriod = currentPeriod === "AM" ? "PM" : "AM";
    setCurrentPeriod(newPeriod);
    emitChange(HOURS_12[hourIndex >= 0 ? hourIndex : 0], MINUTES[minuteIndex >= 0 ? minuteIndex : 0], newPeriod);
  }, [currentPeriod, hourIndex, minuteIndex, emitChange]);

  return (
    <div
      className="rounded-lg border bg-background/80 backdrop-blur-sm p-3"
      data-testid="scroll-wheel-time-picker"
      role="group"
      aria-label="Time picker"
    >
      <div className="flex items-stretch gap-1" style={{ height: PICKER_HEIGHT }}>
        <ScrollColumn
          items={HOURS_12}
          selectedIndex={hourIndex >= 0 ? hourIndex : 0}
          onSelect={handleHourSelect}
          formatItem={(v) => v.toString()}
          testIdPrefix="hour"
          label="Select hour"
        />

        <div className="flex items-center justify-center px-1">
          <span className="text-xl font-bold text-muted-foreground select-none" aria-hidden="true">:</span>
        </div>

        <ScrollColumn
          items={MINUTES}
          selectedIndex={minuteIndex >= 0 ? minuteIndex : 0}
          onSelect={handleMinuteSelect}
          formatItem={(v) => pad2(v)}
          testIdPrefix="minute"
          label="Select minutes"
        />

        <div className="flex items-center pl-2">
          <button
            type="button"
            onClick={togglePeriod}
            className="flex flex-col gap-1 rounded-xl px-3 py-2 active:scale-95 transition-transform"
            data-testid="button-toggle-ampm"
            aria-label={`Currently ${currentPeriod}. Switch to ${currentPeriod === "AM" ? "PM" : "AM"}`}
          >
            <span
              className={`text-base font-bold transition-colors duration-150 ${
                currentPeriod === "AM"
                  ? "text-primary"
                  : "text-muted-foreground/40"
              }`}
            >
              AM
            </span>
            <span
              className={`text-base font-bold transition-colors duration-150 ${
                currentPeriod === "PM"
                  ? "text-primary"
                  : "text-muted-foreground/40"
              }`}
            >
              PM
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
