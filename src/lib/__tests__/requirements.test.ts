import { describe, expect, it } from "vitest";

import type { Course, Major, StudentProfile } from "@/types/catalog";

import {
  computeFulfilled,
  computeRemaining,
  normalizeGroups,
} from "../requirements";

describe("requirements helpers", () => {
  const catalogCourses: Course[] = [
    {
      id: "BUS-101",
      code: "BUS 101",
      title: "Foundations of Business",
      credits: 3,
      level: 100,
      tags: ["Strategy"],
    },
    {
      id: "MAT-101",
      code: "MAT 101",
      title: "College Algebra",
      credits: 3,
      level: 100,
      tags: ["Quant"],
      equivalents: ["MATH-101H"],
    },
    {
      id: "MATH-101H",
      code: "MATH 101H",
      title: "Honors Algebra",
      credits: 3,
      level: 100,
      tags: ["Quant"],
      equivalents: ["MAT-101"],
    },
    {
      id: "MAT-102",
      code: "MAT 102",
      title: "Applied Calculus",
      credits: 4,
      level: 200,
      tags: ["Quant"],
    },
    {
      id: "STAT-310",
      code: "STAT 310",
      title: "Statistical Modeling",
      credits: 3,
      level: 300,
      tags: ["Quant"],
    },
    {
      id: "ADV-401",
      code: "ADV 401",
      title: "Advanced Strategy",
      credits: 3,
      level: 400,
      tags: ["Strategy"],
    },
    {
      id: "LEAD-210",
      code: "LEAD 210",
      title: "Leading Teams",
      credits: 3,
      level: 200,
      tags: ["Leadership"],
    },
  ];

  const major: Major = {
    id: "bs-business",
    name: "B.S. Business",
    catalogYear: "2026-2027",
    requirementGroups: [
      {
        id: "core",
        title: "Business Core",
        allOf: ["BUS-101", "MAT-101"],
      },
      {
        id: "quant-choice",
        title: "Quantitative Choice",
        anyOf: ["MAT-102", "LEAD-210"],
        chooseN: 1,
      },
      {
        id: "advanced-quant",
        title: "Advanced Quant",
        anyOf: ["MAT-101", "MAT-102", "STAT-310"],
        minCount: 2,
        note: "tag=Quant double=true",
      },
      {
        id: "senior-depth",
        title: "Senior Depth",
        anyOf: ["STAT-310", "ADV-401"],
        minCredits: 6,
        note: "level>=300",
      },
      {
        id: "leadership-overlay",
        title: "Leadership Overlay",
        anyOf: ["LEAD-210", "STAT-310"],
        chooseN: 1,
        note: "double=true",
      },
    ],
  };

  const baseProfile: StudentProfile = {
    id: "student-1",
    name: "Alex Planner",
    majorIds: ["bs-business"],
    catalogYear: "2026-2027",
    completedCourseIds: ["BUS-101", "MATH-101H", "STAT-310"],
    preferences: {
      earliest: "08:00",
      latest: "18:00",
      daysOff: [],
      protectedBlocks: [],
      targetCredits: 15,
      minBreakMins: 15,
      avoidProfIds: [],
      preferProfIds: [],
      density: "compact",
      fridays: "neutral",
    },
  };

  it("normalizes requirement groups without altering semantics", () => {
    const normalized = normalizeGroups(major);
    expect(normalized).toHaveLength(major.requirementGroups.length);
    expect(normalized[0].allOf).toEqual(["BUS-101", "MAT-101"]);
  });

  it("expands completed courses with declared equivalents", () => {
    const completed = new Set(["MATH-101H"]);
    const equivalentsMap = new Map<string, string[]>([["MAT-101", ["MATH-101H"]]]);
    const fulfilled = computeFulfilled(completed, equivalentsMap);
    expect(fulfilled.has("MAT-101")).toBe(true);
    expect(fulfilled.has("MATH-101H")).toBe(true);
  });

  it("computes remaining requirements with partial overlaps and equivalents", () => {
    const summary = computeRemaining(baseProfile, major, catalogCourses);

    const remainingById = new Map(summary.remainingGroups.map((group) => [group.id, group]));

    // Quantitative choice still needs a course.
    const quantChoice = remainingById.get("quant-choice");
    expect(quantChoice).toBeDefined();
    expect(quantChoice!.type).toBe("chooseN");
    expect(quantChoice!.needed).toBe(1);
    expect(new Set(quantChoice!.candidateCourseIds)).toEqual(new Set(["MAT-102", "LEAD-210"]));

    // Senior depth needs three more credits at 300+ level.
    const seniorDepth = remainingById.get("senior-depth");
    expect(seniorDepth).toBeDefined();
    expect(seniorDepth!.type).toBe("minCredits");
    expect(seniorDepth!.needed).toBe(3);
    expect(seniorDepth!.candidateCourseIds).toContain("ADV-401");

    // Advanced quant satisfied via double-count allowance.
    expect(remainingById.has("advanced-quant")).toBe(false);

    // Required course ids include all referenced catalog options.
    expect(summary.requiredCourseIds.has("BUS-101")).toBe(true);
    expect(summary.requiredCourseIds.has("MAT-102")).toBe(true);
    expect(summary.requiredCourseIds.has("ADV-401")).toBe(true);

    // Fulfilled list includes actual completed courses counting toward requirements.
    expect(new Set(summary.fulfilledBy)).toEqual(
      new Set(["BUS-101", "MATH-101H", "STAT-310"])
    );
  });
});
