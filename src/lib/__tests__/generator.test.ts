import { describe, expect, it } from "vitest";

import type { Course, Preferences, Section, Day, TimeString } from "@/types/catalog";

import { generateSchedules } from "../generator";

const prefs: Preferences = {
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

const makeSection = (
  id: string,
  courseId: string,
  dayPairs: Array<[Day, TimeString, TimeString]>
): Section => ({
  id,
  courseId,
  section: id,
  meetings: dayPairs.map(([day, start, end]) => ({ day, start, end })),
  termId: "T1",
});

const courses: Course[] = [
  { id: "BUS-201", code: "BUS 201", title: "Operations", credits: 3 },
  { id: "FIN-310", code: "FIN 310", title: "Finance", credits: 3 },
  { id: "MKT-220", code: "MKT 220", title: "Marketing", credits: 3 },
  { id: "LEAD-305", code: "LEAD 305", title: "Leadership", credits: 3 },
];

const sectionsByCourse = new Map<string, Section[]>([
  [
    "BUS-201",
    [
      makeSection("BUS-201-A", "BUS-201", [
        ["M", "09:00", "10:15"],
        ["W", "09:00", "10:15"],
      ]),
      makeSection("BUS-201-B", "BUS-201", [
        ["T", "11:00", "12:15"],
        ["R", "11:00", "12:15"],
      ]),
    ],
  ],
  [
    "FIN-310",
    [
      makeSection("FIN-310-A", "FIN-310", [
        ["M", "13:00", "14:15"],
        ["W", "13:00", "14:15"],
      ]),
      makeSection("FIN-310-B", "FIN-310", [["T", "09:30", "10:45"], ["R", "09:30", "10:45"]]),
    ],
  ],
  [
    "MKT-220",
    [
      makeSection("MKT-220-A", "MKT-220", [["T", "14:00", "15:15"], ["R", "14:00", "15:15"]]),
      makeSection("MKT-220-B", "MKT-220", [["M", "15:00", "16:15"], ["W", "15:00", "16:15"]]),
    ],
  ],
  [
    "LEAD-305",
    [
      makeSection("LEAD-305-A", "LEAD-305", [["F", "09:00", "11:00"]]),
      makeSection("LEAD-305-B", "LEAD-305", [["M", "11:00", "12:15"], ["W", "11:00", "12:15"]]),
    ],
  ],
]);

const remainingByGroup = [
  {
    groupId: "core-ops",
    groupTitle: "Operations Core",
    candidateCourseIds: ["BUS-201"],
    type: "allOf",
    needed: 1,
  },
  {
    groupId: "finance-choice",
    groupTitle: "Finance Choice",
    candidateCourseIds: ["FIN-310", "MKT-220"],
    type: "chooseN",
    needed: 1,
  },
  {
    groupId: "leadership-overlay",
    groupTitle: "Leadership",
    candidateCourseIds: ["LEAD-305", "MKT-220"],
    type: "chooseN",
    needed: 1,
  },
];

const byCourseId = new Map(courses.map((course) => [course.id, course]));

const requiredCourseIds = new Set<string>(["BUS-201", "FIN-310"]);

const interestByCourse: Record<string, number> = {
  "BUS-201": 0.9,
  "FIN-310": 0.8,
  "MKT-220": 0.7,
  "LEAD-305": 0.6,
};

describe("generateSchedules", () => {
  it("returns primary plan, backups, and explanations within time limits", () => {
    const start = Date.now();
    const result = generateSchedules({
      remainingByGroup,
      sectionsByCourse,
      prefs,
      requiredCourseIds,
      interestByCourse,
      byCourseId,
      targetCredits: 9,
      beamSize: 6,
      maxNodes: 1500,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(result.primary.length).toBeGreaterThan(0);
    expect(result.backups.length).toBeLessThanOrEqual(2);
    expect(result.scores.length).toBeGreaterThan(0);
    expect(result.scores.length).toBeLessThanOrEqual(3);
    expect(result.scores[0]).toBeGreaterThanOrEqual(
      result.scores[result.scores.length - 1]
    );

    const explanationKeys = Object.keys(result.explanations);
    expect(explanationKeys.length).toBeGreaterThan(0);
    for (const key of explanationKeys) {
      expect(result.explanations[key]).toMatch(/Fulfills/);
    }

    expect(result.lockConflicts).toEqual({});
  });

  it("produces distinct course combinations across backups", () => {
    const result = generateSchedules({
      remainingByGroup,
      sectionsByCourse,
      prefs,
      requiredCourseIds,
      interestByCourse,
      byCourseId,
      targetCredits: 9,
      beamSize: 6,
      maxNodes: 1500,
    });

    const signatures = new Set<string>();
    const schedules = [result.primary, ...result.backups];
    for (const schedule of schedules) {
      const signature = schedule
        .map((section) => section.courseId)
        .sort()
        .join("|");
      expect(signatures.has(signature)).toBe(false);
      signatures.add(signature);
    }

    expect(result.lockConflicts).toEqual({});
  });

  it("reports preference conflicts for locked sections", () => {
    const strictPrefs: Preferences = {
      ...prefs,
      earliest: "10:00",
    };

    const result = generateSchedules({
      remainingByGroup,
      sectionsByCourse,
      prefs: strictPrefs,
      requiredCourseIds,
      interestByCourse,
      byCourseId,
      targetCredits: 9,
      lockedSectionIds: ["BUS-201-A"],
    });

    expect(result.lockConflicts["BUS-201"]).toMatch(/Starts before preferred time/);
  });

  it("halts generation when locked sections overlap", () => {
    const sectionsByCourseConflict = new Map<string, Section[]>(
      Array.from(sectionsByCourse.entries()).map(([courseId, list]) => [courseId, list.slice()])
    );

    const overlappingSection = makeSection("FIN-310-Z", "FIN-310", [
      ["M", "09:00", "10:15"],
      ["W", "09:00", "10:15"],
    ]);

    sectionsByCourseConflict.get("FIN-310")!.push(overlappingSection);

    const result = generateSchedules({
      remainingByGroup,
      sectionsByCourse: sectionsByCourseConflict,
      prefs,
      requiredCourseIds,
      interestByCourse,
      byCourseId,
      targetCredits: 9,
      lockedSectionIds: ["BUS-201-A", "FIN-310-Z"],
    });

    expect(result.primary).toHaveLength(0);
    expect(Object.keys(result.lockConflicts)).toContain("FIN-310");
    expect(result.lockConflicts["FIN-310"]).toMatch(/Overlaps with/);
  });
});
