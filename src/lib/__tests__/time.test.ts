import { describe, expect, it } from "vitest";

import type { Preferences, Section } from "@/types/catalog";

import {
  applyLinkedPairs,
  dayCharToIndex,
  overlaps,
  sectionOverlaps,
  toMinutes,
  violatesProtected,
  violatesWindow,
} from "../time";

describe("time helpers", () => {
  const sectionTR: Section = {
    id: "SEC-TR",
    courseId: "COURSE-1",
    section: "A",
    meetings: [
      { day: "T", start: "09:30", end: "10:45" },
      { day: "R", start: "09:30", end: "10:45" },
    ],
    termId: "TERM-1",
  };

  const sectionMWF: Section = {
    id: "SEC-MWF",
    courseId: "COURSE-2",
    section: "B",
    meetings: [
      { day: "M", start: "09:00", end: "09:50" },
      { day: "W", start: "09:00", end: "09:50" },
      { day: "F", start: "09:00", end: "09:50" },
    ],
    termId: "TERM-1",
  };

  const labLecture: Section[] = [
    {
      id: "LECTURE",
      courseId: "SCI-101",
      section: "001",
      meetings: [
        { day: "M", start: "13:00", end: "14:15" },
        { day: "W", start: "13:00", end: "14:15" },
      ],
      termId: "TERM-1",
      linkedWith: "LAB",
    },
    {
      id: "LAB",
      courseId: "SCI-101",
      section: "01L",
      meetings: [{ day: "F", start: "10:00", end: "12:00" }],
      termId: "TERM-1",
      linkedWith: "LECTURE",
    },
  ];

  const preferences: Preferences = {
    earliest: "08:00",
    latest: "17:00",
    targetCredits: 15,
    minBreakMins: 15,
    density: "compact",
    fridays: "neutral",
    daysOff: [],
    protectedBlocks: [
      { day: "T", start: "10:30", end: "12:00", label: "Club" },
      { day: "R", start: "14:00", end: "15:30", label: "Work" },
    ],
    avoidProfIds: [],
    preferProfIds: [],
  };

  it("converts time to minutes and checks overlaps", () => {
    expect(toMinutes("09:30")).toBe(570);
    const rangeA = { start: 540, end: 600 };
    const rangeB = { start: 585, end: 630 };
    const rangeC = { start: 600, end: 660 };
    expect(overlaps(rangeA, rangeB)).toBe(true);
    expect(overlaps(rangeA, rangeC)).toBe(false);
  });

  it("maps day characters to indices", () => {
    expect(dayCharToIndex("M")).toBe(0);
    expect(dayCharToIndex("R")).toBe(3);
    expect(() => dayCharToIndex("S")).toThrow();
  });

  it("detects meeting overlaps across sections", () => {
    const overlapSection: Section = {
      id: "SEC-TR2",
      courseId: "COURSE-3",
      section: "C",
      meetings: [
        { day: "T", start: "10:00", end: "11:15" },
        { day: "R", start: "10:00", end: "11:15" },
      ],
      termId: "TERM-1",
    };

    expect(sectionOverlaps(sectionTR, overlapSection)).toBe(true);
    expect(sectionOverlaps(sectionTR, sectionMWF)).toBe(false);
  });

  it("flags sections that violate protected blocks", () => {
    expect(violatesProtected(sectionTR, preferences)).toBe(true);
    expect(violatesProtected(sectionMWF, preferences)).toBe(false);
  });

  it("flags sections that violate preferred time window", () => {
    const earlySection: Section = {
      id: "EARLY",
      courseId: "COURSE-4",
      section: "D",
      meetings: [{ day: "M", start: "07:00", end: "08:15" }],
      termId: "TERM-1",
    };

    const lateSection: Section = {
      id: "LATE",
      courseId: "COURSE-5",
      section: "E",
      meetings: [{ day: "R", start: "16:30", end: "18:00" }],
      termId: "TERM-1",
    };

    expect(violatesWindow(earlySection, preferences)).toBe(true);
    expect(violatesWindow(lateSection, preferences)).toBe(true);
    expect(violatesWindow(sectionMWF, preferences)).toBe(false);
  });

  it("groups linked lecture/lab pairs and standalone sections", () => {
    const grouped = applyLinkedPairs([...labLecture, sectionTR, sectionMWF]);
    const pair = grouped.find((group) => group.length === 2);
    expect(pair).toBeDefined();
    const ids = new Set(pair!.map((section) => section.id));
    expect(ids).toEqual(new Set(["LECTURE", "LAB"]));

    const singles = grouped.filter((group) => group.length === 1).flat();
    const singleIds = singles.map((section) => section.id);
    expect(singleIds).toContain("SEC-TR");
    expect(singleIds).toContain("SEC-MWF");
  });
});
