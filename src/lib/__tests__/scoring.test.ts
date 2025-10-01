import { describe, expect, it } from "vitest";

import type { Course, Preferences, Section } from "@/types/catalog";

import { scoreSchedule } from "../scoring";

const basePrefs: Preferences = {
  earliest: "08:00",
  latest: "18:00",
  targetCredits: 15,
  minBreakMins: 15,
  density: "compact",
  fridays: "avoid",
  daysOff: ["F"],
  protectedBlocks: [],
  avoidProfIds: [],
  preferProfIds: [],
};

const sectionA: Section = {
  id: "A",
  courseId: "COURSE-A",
  section: "001",
  meetings: [
    { day: "M", start: "09:00", end: "10:15" },
    { day: "W", start: "09:00", end: "10:15" },
  ],
  termId: "TERM-1",
  capacity: 25,
  enrolled: 20,
};

const sectionB: Section = {
  id: "B",
  courseId: "COURSE-B",
  section: "002",
  meetings: [
    { day: "T", start: "11:00", end: "12:15" },
    { day: "R", start: "11:00", end: "12:15" },
  ],
  termId: "TERM-1",
  capacity: 20,
  enrolled: 20,
};

const sectionFriday: Section = {
  id: "C",
  courseId: "COURSE-C",
  section: "003",
  meetings: [{ day: "F", start: "15:00", end: "16:15" }],
  termId: "TERM-1",
};

const lectureLab: Section[] = [
  {
    id: "LECT",
    courseId: "SCI-100",
    section: "A",
    meetings: [
      { day: "M", start: "13:00", end: "14:15" },
      { day: "W", start: "13:00", end: "14:15" },
    ],
    termId: "TERM-1",
    linkedWith: "LAB",
  },
  {
    id: "LAB",
    courseId: "SCI-100",
    section: "LA",
    meetings: [{ day: "F", start: "09:00", end: "11:00" }],
    termId: "TERM-1",
    linkedWith: "LECT",
  },
];

const catalog: Course[] = [
  { id: "COURSE-A", code: "A", title: "Course A", credits: 3 },
  { id: "COURSE-B", code: "B", title: "Course B", credits: 3 },
  { id: "COURSE-C", code: "C", title: "Course C", credits: 3 },
  { id: "SCI-100", code: "SCI 100", title: "Science 100", credits: 4 },
];

const byCourseId = new Map(catalog.map((course) => [course.id, course]));

describe("scoreSchedule", () => {
  it("rewards coverage, interest, and penalizes Friday when avoided", () => {
    const required = new Set(["COURSE-A", "COURSE-B"]);
    const sections = [sectionA, sectionB];

    const interestOf = (courseId: string) => (courseId === "COURSE-A" ? 1 : 0.5);

    const { total, breakdown } = scoreSchedule(sections, {
      prefs: basePrefs,
      requiredCourseIds: required,
      interestOf,
      byCourseId,
    });

    expect(breakdown.coverage).toBeCloseTo(1);
    expect(breakdown.interest).toBeCloseTo(0.75, 2);
    expect(breakdown.fridayPenalty).toBe(0);
    expect(breakdown.capacityPenalty).toBe(1);
    expect(total).toBeCloseTo(6 * 1 + 3 * 0.75 + 3 * 1 + 2 * 1 + 1 * breakdown.density - 1, 2);
  });

  it("applies friday penalty when a section meets on Friday and preference is avoid", () => {
    const required = new Set<string>();
    const interestOf = () => 0.8;

    const { breakdown } = scoreSchedule([sectionFriday], {
      prefs: basePrefs,
      requiredCourseIds: required,
      interestOf,
      byCourseId,
    });

    expect(breakdown.fridayPenalty).toBe(1);
    expect(breakdown.dayOff).toBe(0);
  });

  it("keeps linked lecture/lab pairs together and assesses window violations", () => {
    const prefs: Preferences = {
      ...basePrefs,
      earliest: "12:00",
      latest: "17:00",
    };
    const required = new Set(["SCI-100"]);
    const interestOf = () => 0.9;

    const { breakdown } = scoreSchedule(lectureLab, {
      prefs,
      requiredCourseIds: required,
      interestOf,
      byCourseId,
    });

    expect(breakdown.coverage).toBe(1);
    expect(breakdown.timeWindow).toBeLessThan(1);
    expect(breakdown.fridayPenalty).toBe(1);
  });
});
