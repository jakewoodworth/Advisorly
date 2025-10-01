import { describe, expect, it } from "vitest";

import type { Preferences } from "@/types/catalog";

import { parseAdvice } from "../advisorRules";

describe("parseAdvice", () => {
  const basePrefs: Preferences = {
    earliest: "08:00",
    latest: "18:00",
    targetCredits: 15,
    minBreakMins: 15,
    density: "compact",
    fridays: "neutral",
    daysOff: [],
    protectedBlocks: [],
    avoidProfIds: [],
    preferProfIds: [],
  };

  it("sets Friday avoidance", () => {
    const prefs = parseAdvice("Please avoid Friday lectures", basePrefs);
    expect(prefs.fridays).toBe("avoid");
  });

  it("adjusts earliest time when avoiding mornings", () => {
    const prefs = parseAdvice("No morning classes before 11", basePrefs);
    expect(prefs.earliest).toBe("11:00");
  });

  it("sets latest time when preferring mornings", () => {
    const prefs = parseAdvice("I love morning sessions", basePrefs);
    expect(prefs.latest).toBe("12:00");
  });

  it("adds specific days off", () => {
    const prefs = parseAdvice("Days off: Monday and Fri", basePrefs);
    expect(new Set(prefs.daysOff)).toEqual(new Set(["M", "F"]));
  });

  it("marks compact density", () => {
    const prefs = parseAdvice("Can we do compact days?", basePrefs);
    expect(prefs.density).toBe("compact");
  });

  it("appends protected time blocks", () => {
    const prefs = parseAdvice("10:00-12:00 Mon", basePrefs);
    expect(prefs.protectedBlocks?.length).toBe(1);
    expect(prefs.protectedBlocks?.[0]).toMatchObject({ day: "M", start: "10:00", end: "12:00" });
  });

  it("adjusts load for heavy term", () => {
    const prefs = parseAdvice("Looking for a heavy load", basePrefs);
    expect(prefs.targetCredits).toBe(basePrefs.targetCredits! + 2);
  });

  it("adjusts load for light term", () => {
    const prefs = parseAdvice("Prefer a light term", basePrefs);
    expect(prefs.targetCredits).toBe(basePrefs.targetCredits! - 2);
  });
});
