import type { Day, Preferences, ProtectedBlock, TimeString } from "@/types/catalog";

const DAY_NAMES: Record<string, string> = {
  monday: "M",
  mon: "M",
  tuesday: "T",
  tue: "T",
  wednesday: "W",
  wed: "W",
  thursday: "R",
  thu: "R",
  friday: "F",
  fri: "F",
};

const DEFAULT_PROTECTED_LABEL = "Protected block";

function normalizePreferences(prefs: Preferences): Preferences {
  return {
    ...prefs,
    daysOff: [...(prefs.daysOff ?? [])],
    protectedBlocks: [...(prefs.protectedBlocks ?? [])],
    avoidProfIds: [...(prefs.avoidProfIds ?? [])],
    preferProfIds: [...(prefs.preferProfIds ?? [])],
  };
}

function parseHour(value: string): TimeString | undefined {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return undefined;
  const clamped = Math.min(Math.max(hour, 0), 23);
  return `${clamped.toString().padStart(2, "0")}:00` as TimeString;
}

function applyFridayRule(text: string, prefs: Preferences): Preferences {
  if (/(no|avoid)\s+friday/i.test(text)) {
    return { ...prefs, fridays: "avoid" };
  }
  return prefs;
}

function applyMorningAvoidRule(text: string, prefs: Preferences): Preferences {
  const match = /(no|avoid)\s+morning/i.exec(text) || /(no|avoid)\s+before\s+(\d{1,2})/i.exec(text);
  if (!match) {
    return prefs;
  }

  let hourText: string | undefined;
  const beforeMatch = /before\s+(\d{1,2})/i.exec(text);
  if (beforeMatch) {
    hourText = beforeMatch[1];
  }

  const earliest = (hourText ? parseHour(hourText) : "10:00") as TimeString;
  if (!earliest) return prefs;
  return { ...prefs, earliest };
}

function applyMorningPreferenceRule(text: string, prefs: Preferences): Preferences {
  if (/(prefer|love)\s+morning/i.test(text)) {
    return { ...prefs, latest: "12:00" };
  }
  return prefs;
}

function applyDayOffRule(text: string, prefs: Preferences): Preferences {
  const dayRegex = /days?\s+off?:?\s*(monday|tuesday|wednesday|thursday|friday|mon|tue|wed|thu|fri)/gi;
  let match;
  let next = prefs;

  while ((match = dayRegex.exec(text)) !== null) {
    const dayName = match[1].toLowerCase();
    const dayCode = DAY_NAMES[dayName];
    if (!dayCode) continue;
    const daysOff = new Set<Day>(next.daysOff ?? []);
    daysOff.add(dayCode as Day);
    next = { ...next, daysOff: Array.from(daysOff) };
  }

  if (/and\s+(monday|tuesday|wednesday|thursday|friday|mon|tue|wed|thu|fri)/i.test(text)) {
    const andPattern = /(monday|tuesday|wednesday|thursday|friday|mon|tue|wed|thu|fri)/gi;
    let matchAnd;
    while ((matchAnd = andPattern.exec(text)) !== null) {
      const dayName = matchAnd[1].toLowerCase();
      const dayCode = DAY_NAMES[dayName];
      if (!dayCode) continue;
      const daysOff = new Set<Day>(next.daysOff ?? []);
      daysOff.add(dayCode as Day);
      next = { ...next, daysOff: Array.from(daysOff) };
    }
  }

  return next;
}

function applyDensityRule(text: string, prefs: Preferences): Preferences {
  if (/(compact|stack(?:ed)?)\s+days/i.test(text)) {
    return { ...prefs, density: "compact" };
  }
  return prefs;
}

function applyProtectedRule(text: string, prefs: Preferences): Preferences {
  const pattern = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*(monday|tuesday|wednesday|thursday|friday|mon|tue|wed|thu|fri)/gi;
  let match;
  let next = prefs;

  while ((match = pattern.exec(text)) !== null) {
    const [, start, end, dayRaw] = match;
    const day = DAY_NAMES[dayRaw.toLowerCase()];
    if (!day) continue;

    const block: ProtectedBlock = {
      day: day as Day,
      start: (start.length === 4 ? `0${start}` : start) as TimeString,
      end: (end.length === 4 ? `0${end}` : end) as TimeString,
      label: DEFAULT_PROTECTED_LABEL,
    };

    next = {
      ...next,
      protectedBlocks: [...(next.protectedBlocks ?? []), block],
    };
  }

  return next;
}

function applyLoadRule(text: string, prefs: Preferences): Preferences {
  const match = /(heavy|light)\s+(term|load)/i.exec(text);
  if (!match) return prefs;
  const delta = match[1].toLowerCase() === "heavy" ? 2 : -2;
  const current = prefs.targetCredits ?? 15;
  return { ...prefs, targetCredits: Math.max(0, current + delta) };
}

export function parseAdvice(input: string, prefs: Preferences): Preferences {
  const normalized = normalizePreferences(prefs);
  const updated = [
    applyFridayRule,
    applyMorningAvoidRule,
    applyMorningPreferenceRule,
    applyDayOffRule,
    applyDensityRule,
    applyProtectedRule,
    applyLoadRule,
  ].reduce((acc, fn) => fn(input, acc), normalized);

  return updated;
}
