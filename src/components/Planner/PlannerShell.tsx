"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { WifiOff } from "lucide-react";

import { AdvisorDrawer } from "@/components/Planner/AdvisorDrawer";
import { ConflictMeter } from "@/components/Planner/ConflictMeter";
import {
  PlansRail,
  type PlannerPlan,
  type PlanCourse,
  type PlanMeeting,
} from "@/components/Planner/PlansRail";
import {
  RequirementTree,
  type RequirementTreeItem,
} from "@/components/Planner/RequirementTree";
import { WeekCalendar } from "@/components/Planner/WeekCalendar";
import { Button } from "@/components/ui/button";
import type { Day, Preferences, ProtectedBlock, Section, Course } from "@/types/catalog";
import { toMinutes } from "@/lib/time";
import { generateSchedulesAsync } from "@/lib/generatorWorkerClient";
import type { GenerateSchedulesInput, GenerateSchedulesResult } from "@/lib/generator";
import type { PlanExportPayload } from "@/lib/exportPdf";
import { useOfflineMode } from "@/lib/catalogCache";

const DEFAULT_PREFS: Preferences = {
  earliest: "08:00",
  latest: "18:00",
  targetCredits: 15,
  density: "compact",
  fridays: "neutral",
  minBreakMins: 15,
  daysOff: [],
  protectedBlocks: [],
  avoidProfIds: [],
  preferProfIds: [],
};

const DEFAULT_TARGET_CREDITS = DEFAULT_PREFS.targetCredits ?? 15;

const MIN_WIDTH = 18; // percent

const DEFAULT_TERM = "Spring 2026";
const DEFAULT_TERM_DATES = {
  start: "2026-01-12",
  end: "2026-05-01",
};

const DAY_NAMES: Record<Day, string> = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

const REQUIREMENTS: Array<{
  id: string;
  category: string;
  title: string;
  metric: "courses" | "credits";
  total: number;
}> = [
  {
    id: "core-foundations",
    category: "Core",
    title: "Core Foundations",
    metric: "courses",
    total: 8,
  },
  {
    id: "core-analytics",
    category: "Core",
    title: "Analytics Toolkit",
    metric: "courses",
    total: 4,
  },
  {
    id: "gened-writing",
    category: "Gen-Ed",
    title: "Writing Intensive",
    metric: "courses",
    total: 1,
  },
  {
    id: "gened-global",
    category: "Gen-Ed",
    title: "Global Perspective",
    metric: "courses",
    total: 1,
  },
  {
    id: "elective-leadership",
    category: "Electives",
    title: "Leadership Track",
    metric: "credits",
    total: 6,
  },
];

type PlanCourseOption = {
  id: string;
  section: string;
  meetings: PlanMeeting[];
  location?: string;
  scoreDelta: number;
  why: string;
  capacity?: number;
  enrolled?: number;
};

type PlanCourseBlueprint = {
  courseId: string;
  courseCode: string;
  title: string;
  credits: number;
  groups: string[];
  options: PlanCourseOption[];
};

type PlanBlueprint = {
  id: string;
  label: string;
  description: string;
  baseScore: number;
  explainers: string[];
  courses: PlanCourseBlueprint[];
};

const PLAN_BLUEPRINTS: PlanBlueprint[] = [
  {
    id: "primary",
    label: "Primary",
    description: "Max coverage, morning-heavy",
    baseScore: 96,
    explainers: [
      "Covers every core requirement",
      "Wraps by mid-afternoon most days",
      "Lock picks stay intact",
    ],
    courses: [
      {
        courseId: "BUS-201",
        courseCode: "BUS 201",
        title: "Operations Management",
        credits: 3,
        groups: ["core-foundations"],
        options: [
          {
            id: "BUS-201-A",
            section: "A",
            meetings: [
              { day: "M", start: "09:00", end: "10:15", location: "Room 410" },
              { day: "W", start: "09:00", end: "10:15", location: "Room 410" },
            ],
            location: "Room 410",
            scoreDelta: 1,
            why: "Morning core slot that keeps Tue/Thu open for labs.",
            capacity: 32,
            enrolled: 30,
          },
          {
            id: "BUS-201-D",
            section: "D",
            meetings: [
              { day: "T", start: "13:15", end: "14:30", location: "Room 412" },
              { day: "R", start: "13:15", end: "14:30", location: "Room 412" },
            ],
            location: "Room 412",
            scoreDelta: -1,
            why: "Afternoon section that spreads workload across the week.",
            capacity: 28,
            enrolled: 21,
          },
        ],
      },
      {
        courseId: "FIN-310",
        courseCode: "FIN 310",
        title: "Advanced Finance",
        credits: 3,
        groups: ["core-analytics", "elective-leadership"],
        options: [
          {
            id: "FIN-310-B",
            section: "B",
            meetings: [
              { day: "T", start: "11:00", end: "12:15", location: "Finance Lab" },
              { day: "R", start: "11:00", end: "12:15", location: "Finance Lab" },
            ],
            location: "Finance Lab",
            scoreDelta: 0,
            why: "Midday analytics block that leaves afternoons for group work.",
            capacity: 38,
            enrolled: 34,
          },
          {
            id: "FIN-310-D",
            section: "D",
            meetings: [
              { day: "T", start: "08:30", end: "09:45", location: "Finance Lab" },
              { day: "R", start: "08:30", end: "09:45", location: "Finance Lab" },
            ],
            location: "Finance Lab",
            scoreDelta: 2,
            why: "Early start boosts compactness and frees late mornings.",
            capacity: 34,
            enrolled: 31,
          },
          {
            id: "FIN-310-E",
            section: "E",
            meetings: [
              { day: "T", start: "15:30", end: "16:45", location: "Finance Lab" },
              { day: "R", start: "15:30", end: "16:45", location: "Finance Lab" },
            ],
            location: "Finance Lab",
            scoreDelta: -2,
            why: "Late-afternoon option when mornings are protected.",
            capacity: 34,
            enrolled: 27,
          },
        ],
      },
      {
        courseId: "ENG-205",
        courseCode: "ENG 205",
        title: "Writing in Business",
        credits: 3,
        groups: ["gened-writing"],
        options: [
          {
            id: "ENG-205-E",
            section: "E",
            meetings: [{ day: "T", start: "14:00", end: "16:45", location: "Humanities 210" }],
            location: "Humanities 210",
            scoreDelta: 0,
            why: "Single long session that keeps other days lighter.",
            capacity: 22,
            enrolled: 21,
          },
          {
            id: "ENG-205-G",
            section: "G",
            meetings: [{ day: "R", start: "09:00", end: "11:30", location: "Humanities 204" }],
            location: "Humanities 204",
            scoreDelta: -1,
            why: "Earlier meeting for students who prefer mornings.",
            capacity: 22,
            enrolled: 15,
          },
        ],
      },
      {
        courseId: "GLB-210",
        courseCode: "GLB 210",
        title: "Global Markets",
        credits: 3,
        groups: ["gened-global"],
        options: [
          {
            id: "GLB-210-C",
            section: "C",
            meetings: [{ day: "R", start: "13:30", end: "16:15", location: "Global Center" }],
            location: "Global Center",
            scoreDelta: 0,
            why: "Thursday seminar that avoids Friday conflicts.",
            capacity: 26,
            enrolled: 25,
          },
          {
            id: "GLB-210-A",
            section: "A",
            meetings: [{ day: "M", start: "15:00", end: "17:30", location: "Global Center" }],
            location: "Global Center",
            scoreDelta: -1,
            why: "Monday block that keeps the rest of the week open.",
            capacity: 28,
            enrolled: 21,
          },
        ],
      },
    ],
  },
  {
    id: "backup-a",
    label: "Backup A",
    description: "Balanced mornings & afternoons",
    baseScore: 92,
    explainers: [
      "Spreads requirements evenly",
      "Keeps Fridays light",
      "Lock picks stay intact",
    ],
    courses: [
      {
        courseId: "BUS-205",
        courseCode: "BUS 205",
        title: "Business Strategy",
        credits: 3,
        groups: ["core-foundations"],
        options: [
          {
            id: "BUS-205-B",
            section: "B",
            meetings: [
              { day: "M", start: "10:30", end: "11:45", location: "Room 215" },
              { day: "W", start: "10:30", end: "11:45", location: "Room 215" },
            ],
            location: "Room 215",
            scoreDelta: 0,
            why: "Mid-morning slot that pairs well with analytics.",
            capacity: 35,
            enrolled: 32,
          },
          {
            id: "BUS-205-D",
            section: "D",
            meetings: [
              { day: "T", start: "08:45", end: "10:00", location: "Room 220" },
              { day: "R", start: "08:45", end: "10:00", location: "Room 220" },
            ],
            location: "Room 220",
            scoreDelta: 1,
            why: "Early time that frees up the rest of the day and boosts density.",
            capacity: 30,
            enrolled: 23,
          },
        ],
      },
      {
        courseId: "STAT-320",
        courseCode: "STAT 320",
        title: "Predictive Analytics",
        credits: 3,
        groups: ["core-analytics"],
        options: [
          {
            id: "STAT-320-A",
            section: "A",
            meetings: [
              { day: "T", start: "09:30", end: "10:45", location: "Analytics Lab" },
              { day: "R", start: "09:30", end: "10:45", location: "Analytics Lab" },
            ],
            location: "Analytics Lab",
            scoreDelta: 0,
            why: "Pairs with strategy to keep mornings consistent.",
            capacity: 30,
            enrolled: 28,
          },
          {
            id: "STAT-320-C",
            section: "C",
            meetings: [
              { day: "T", start: "13:30", end: "14:45", location: "Analytics Lab" },
              { day: "R", start: "13:30", end: "14:45", location: "Analytics Lab" },
            ],
            location: "Analytics Lab",
            scoreDelta: -1,
            why: "Afternoon alternative when mornings are blocked.",
            capacity: 28,
            enrolled: 20,
          },
        ],
      },
      {
        courseId: "LEAD-305",
        courseCode: "LEAD 305",
        title: "Leading Teams",
        credits: 3,
        groups: ["elective-leadership"],
        options: [
          {
            id: "LEAD-305-F",
            section: "F",
            meetings: [{ day: "F", start: "09:00", end: "11:00", location: "Leadership Hub" }],
            location: "Leadership Hub",
            scoreDelta: 0,
            why: "Friday morning intensive that protects the rest of the week.",
            capacity: 20,
            enrolled: 19,
          },
          {
            id: "LEAD-305-W",
            section: "W",
            meetings: [{ day: "W", start: "16:00", end: "18:00", location: "Leadership Hub" }],
            location: "Leadership Hub",
            scoreDelta: -2,
            why: "Evening leadership lab for students with Friday commitments.",
            capacity: 22,
            enrolled: 14,
          },
        ],
      },
      {
        courseId: "ENG-205",
        courseCode: "ENG 205",
        title: "Writing in Business",
        credits: 3,
        groups: ["gened-writing"],
        options: [
          {
            id: "ENG-205-K",
            section: "K",
            meetings: [{ day: "W", start: "14:00", end: "16:45", location: "Humanities 210" }],
            location: "Humanities 210",
            scoreDelta: 0,
            why: "Afternoon studio that keeps mornings reserved for quant work.",
            capacity: 22,
            enrolled: 21,
          },
          {
            id: "ENG-205-G",
            section: "G",
            meetings: [{ day: "R", start: "09:00", end: "11:30", location: "Humanities 204" }],
            location: "Humanities 204",
            scoreDelta: -1,
            why: "Earlier block that avoids late-day fatigue.",
            capacity: 22,
            enrolled: 15,
          },
        ],
      },
    ],
  },
  {
    id: "backup-b",
    label: "Backup B",
    description: "Light Friday schedule",
    baseScore: 88,
    explainers: [
      "Front-loads the week",
      "Afternoons mostly clear",
      "Lock picks stay intact",
    ],
    courses: [
      {
        courseId: "BUS-201",
        courseCode: "BUS 201",
        title: "Operations Management",
        credits: 3,
        groups: ["core-foundations"],
        options: [
          {
            id: "BUS-201-C",
            section: "C",
            meetings: [
              { day: "T", start: "08:30", end: "09:45", location: "Room 410" },
              { day: "R", start: "08:30", end: "09:45", location: "Room 410" },
            ],
            location: "Room 410",
            scoreDelta: 0,
            why: "Early slot that leaves afternoons open for internships.",
            capacity: 30,
            enrolled: 28,
          },
          {
            id: "BUS-201-E",
            section: "E",
            meetings: [
              { day: "M", start: "12:30", end: "13:45", location: "Room 408" },
              { day: "W", start: "12:30", end: "13:45", location: "Room 408" },
            ],
            location: "Room 408",
            scoreDelta: -1,
            why: "Midday alternative compatible with morning commitments.",
            capacity: 28,
            enrolled: 24,
          },
        ],
      },
      {
        courseId: "DATA-330",
        courseCode: "DATA 330",
        title: "Data Visualization",
        credits: 3,
        groups: ["core-analytics", "elective-leadership"],
        options: [
          {
            id: "DATA-330-B",
            section: "B",
            meetings: [
              { day: "M", start: "13:00", end: "14:15", location: "Innovation Lab" },
              { day: "W", start: "13:00", end: "14:15", location: "Innovation Lab" },
            ],
            location: "Innovation Lab",
            scoreDelta: 1,
            why: "Midday studio that keeps Tue/Thu available for electives.",
            capacity: 25,
            enrolled: 23,
          },
          {
            id: "DATA-330-D",
            section: "D",
            meetings: [
              { day: "T", start: "15:00", end: "16:15", location: "Innovation Lab" },
              { day: "R", start: "15:00", end: "16:15", location: "Innovation Lab" },
            ],
            location: "Innovation Lab",
            scoreDelta: -2,
            why: "Late afternoon option when mid-days are blocked.",
            capacity: 22,
            enrolled: 17,
          },
        ],
      },
      {
        courseId: "GLB-210",
        courseCode: "GLB 210",
        title: "Global Markets",
        credits: 3,
        groups: ["gened-global"],
        options: [
          {
            id: "GLB-210-B",
            section: "B",
            meetings: [{ day: "T", start: "10:30", end: "13:00", location: "Global Center" }],
            location: "Global Center",
            scoreDelta: 1,
            why: "Tuesday block that clears Fridays entirely.",
            capacity: 24,
            enrolled: 22,
          },
          {
            id: "GLB-210-A",
            section: "A",
            meetings: [{ day: "M", start: "15:00", end: "17:30", location: "Global Center" }],
            location: "Global Center",
            scoreDelta: -1,
            why: "Monday session for students protecting Tuesdays.",
            capacity: 28,
            enrolled: 19,
          },
        ],
      },
    ],
  },
];

const COURSE_BLUEPRINT_MAP = new Map<string, PlanCourseBlueprint>();
for (const plan of PLAN_BLUEPRINTS) {
  for (const course of plan.courses) {
    if (!COURSE_BLUEPRINT_MAP.has(course.courseId)) {
      COURSE_BLUEPRINT_MAP.set(course.courseId, course);
    }
  }
}

const TERM_ID = "DEMO-TERM";

const SECTIONS_BY_COURSE = new Map<string, Section[]>();

COURSE_BLUEPRINT_MAP.forEach((course, courseId) => {
  const sections = course.options.map((option) => {
    return {
      id: option.id,
      courseId,
      section: option.section,
      meetings: option.meetings.map((meeting) => ({ ...meeting })),
      location: option.location,
      capacity: option.capacity,
      enrolled: option.enrolled,
      termId: TERM_ID,
    } satisfies Section;
  });
  SECTIONS_BY_COURSE.set(courseId, sections);
});

const COURSES_BY_ID = new Map<string, Course>();
COURSE_BLUEPRINT_MAP.forEach((course, courseId) => {
  COURSES_BY_ID.set(courseId, {
    id: courseId,
    code: course.courseCode,
    title: course.title,
    credits: course.credits,
  });
});

const INTEREST_BY_COURSE: Record<string, number> = {};
Array.from(COURSE_BLUEPRINT_MAP.keys()).forEach((courseId, index) => {
  INTEREST_BY_COURSE[courseId] = Math.max(0.5, 0.9 - index * 0.05);
});

const REMAINING_BY_GROUP_INPUT = REQUIREMENTS.map((req) => {
  const candidates = Array.from(COURSE_BLUEPRINT_MAP.values())
    .filter((course) => course.groups.includes(req.id))
    .map((course) => course.courseId);

  if (candidates.length === 0) {
    return null;
  }

  const type = req.metric === "credits" ? "minCredits" : "chooseN";
  const needed = req.metric === "credits" ? req.total : Math.min(req.total, Math.max(1, candidates.length));

  return {
    groupId: req.id,
    groupTitle: req.title,
    candidateCourseIds: candidates,
    type,
    needed,
  };
}).filter(Boolean) as GenerateSchedulesInput["remainingByGroup"];

const CORE_GROUP_IDS = new Set(
  REQUIREMENTS.filter((req) => req.category === "Core").map((req) => req.id)
);

const REQUIRED_COURSE_IDS = new Set<string>();
COURSE_BLUEPRINT_MAP.forEach((course) => {
  if (course.groups.some((groupId) => CORE_GROUP_IDS.has(groupId))) {
    REQUIRED_COURSE_IDS.add(course.courseId);
  }
});

const PRIMARY_PLAN_ID = PLAN_BLUEPRINTS[0]?.id ?? "primary";

function buildWorkerInput(
  prefs: Preferences,
  lockedCourseIds: string[],
  selections: PlanSelections
): GenerateSchedulesInput {
  const primarySelections = selections[PRIMARY_PLAN_ID] ?? {};
  const lockedSectionIds = lockedCourseIds
    .map((courseId) => primarySelections[courseId] ?? COURSE_BLUEPRINT_MAP.get(courseId)?.options[0]?.id)
    .filter((value): value is string => Boolean(value));

  return {
    remainingByGroup: REMAINING_BY_GROUP_INPUT,
    sectionsByCourse: SECTIONS_BY_COURSE,
    prefs,
    requiredCourseIds: new Set(REQUIRED_COURSE_IDS),
    interestByCourse: { ...INTEREST_BY_COURSE },
    byCourseId: COURSES_BY_ID,
    targetCredits: prefs.targetCredits ?? DEFAULT_TARGET_CREDITS,
    beamSize: 6,
    maxNodes: 2000,
    lockedSectionIds,
  };
}
type PlanSelections = Record<string, Record<string, string>>;

function createInitialSelections(): PlanSelections {
  const selections: PlanSelections = {};
  for (const plan of PLAN_BLUEPRINTS) {
    const planSelections: Record<string, string> = {};
    for (const course of plan.courses) {
      if (course.options.length > 0) {
        planSelections[course.courseId] = course.options[0].id;
      }
    }
    selections[plan.id] = planSelections;
  }
  return selections;
}

function formatOptionLabel(option: PlanCourseOption): string {
  const schedule = option.meetings
    .map((meeting) => `${meeting.day} ${meeting.start}-${meeting.end}`)
    .join(" • ");
  return `Sec ${option.section} · ${schedule}`;
}

function getSpotsLeft(option: PlanCourseOption): number | undefined {
  if (option.capacity === undefined || option.enrolled === undefined) {
    return undefined;
  }
  return option.capacity - option.enrolled;
}

function isLowCapacity(spotsLeft: number | undefined): boolean {
  if (spotsLeft === undefined) return false;
  return spotsLeft <= 3;
}

function describeProtectedBlockConflict(meeting: PlanMeeting, blocks: ProtectedBlock[]): string | undefined {
  const meetingStart = toMinutes(meeting.start);
  const meetingEnd = toMinutes(meeting.end);
  for (const block of blocks) {
    if (block.day !== meeting.day) continue;
    const blockStart = toMinutes(block.start);
    const blockEnd = toMinutes(block.end);
    if (blockStart < meetingEnd && meetingStart < blockEnd) {
      if (block.label && block.label.trim().length > 0) {
        return `Conflicts with protected block "${block.label}"`;
      }
      return "Conflicts with a protected block";
    }
  }
  return undefined;
}

function describeDayOffConflict(meeting: PlanMeeting, daysOff: Set<Day>): string | undefined {
  if (!daysOff.has(meeting.day)) return undefined;
  return `Falls on preferred day off (${DAY_NAMES[meeting.day]})`;
}

function describeWindowConflict(
  meeting: PlanMeeting,
  earliest?: string,
  latest?: string
): string | undefined {
  const startMins = toMinutes(meeting.start);
  const endMins = toMinutes(meeting.end);
  if (earliest) {
    const earliestMins = toMinutes(earliest);
    if (startMins < earliestMins) {
      return `Starts before preferred time (${earliest})`;
    }
  }
  if (latest) {
    const latestMins = toMinutes(latest);
    if (endMins > latestMins) {
      return `Ends after preferred time (${latest})`;
    }
  }
  return undefined;
}

type MeetingSlot = { day: Day; start: number; end: number };

function toMeetingSlot(meeting: PlanMeeting): MeetingSlot {
  return {
    day: meeting.day,
    start: toMinutes(meeting.start),
    end: toMinutes(meeting.end),
  };
}

function slotsOverlap(a: MeetingSlot, b: MeetingSlot): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

function formatCourseLabel(course: PlanCourse): string {
  return course.section ? `${course.courseCode} · ${course.section}` : course.courseCode;
}

function buildPlans(
  blueprints: PlanBlueprint[],
  selections: PlanSelections,
  prefs: Preferences,
  lockedCourseIds: string[],
  lockConflictReasons: Record<string, string>,
  scoreOverrides: Record<string, number>
): PlannerPlan[] {
  const lockedSet = new Set(lockedCourseIds);
  const blocks = prefs.protectedBlocks ?? [];

  return blueprints.map((blueprint) => {
    const planSelection = selections[blueprint.id] ?? {};
    let planScore = blueprint.baseScore;
    let droppedCourses = 0;
    let conflictPenalty = 0;

    const courses: PlanCourse[] = [];
    const daysOff = new Set(prefs.daysOff ?? []);
    const earliestPref = prefs.earliest;
    const latestPref = prefs.latest;
    const lockConflictMap = new Map<string, Set<string>>();

    for (const course of blueprint.courses) {
      const options = course.options;
      if (options.length === 0) continue;

      const selectedId = planSelection[course.courseId] ?? options[0].id;
      const selectedOption = options.find((option) => option.id === selectedId) ?? options[0];
      const locked = lockedSet.has(course.courseId);

      let hasConflict = false;
      const reasonSet = locked ? new Set<string>() : undefined;
      for (const meeting of selectedOption.meetings) {
        const dayOffReason = describeDayOffConflict(meeting, daysOff);
        if (dayOffReason) {
          hasConflict = true;
          reasonSet?.add(dayOffReason);
        }
        const windowReason = describeWindowConflict(meeting, earliestPref, latestPref);
        if (windowReason) {
          hasConflict = true;
          reasonSet?.add(windowReason);
        }
        const blockReason = describeProtectedBlockConflict(meeting, blocks);
        if (blockReason) {
          hasConflict = true;
          reasonSet?.add(blockReason);
        }
      }

      if (hasConflict && !locked) {
        droppedCourses += 1;
        continue;
      }

      if (hasConflict && locked) {
        conflictPenalty += 8;
      }

      planScore += selectedOption.scoreDelta;

      const spotsLeft = getSpotsLeft(selectedOption);
      const lowCapacity = isLowCapacity(spotsLeft);

      const alternates = options
        .filter((option) => option.id !== selectedOption.id)
        .map((option) => {
          const altSpotsLeft = getSpotsLeft(option);
          return {
            id: option.id,
            section: option.section,
            meetings: option.meetings,
            location: option.location,
            scoreDelta: option.scoreDelta - selectedOption.scoreDelta,
            label: formatOptionLabel(option),
            why: option.why,
            capacity: option.capacity,
            enrolled: option.enrolled,
            spotsLeft: altSpotsLeft,
            lowCapacity: isLowCapacity(altSpotsLeft),
          };
        });

      const courseEntry: PlanCourse = {
        courseId: course.courseId,
        courseCode: course.courseCode,
        title: course.title,
        section: selectedOption.section,
        credits: course.credits,
        meetings: selectedOption.meetings,
        location: selectedOption.location,
        groups: course.groups,
        why: selectedOption.why,
        alternates,
        locked,
        capacity: selectedOption.capacity,
        enrolled: selectedOption.enrolled,
        spotsLeft,
        lowCapacity,
        lockConflictReason: undefined,
      };

      const externalReason = lockConflictReasons[course.courseId];
      if (externalReason && locked) {
        courseEntry.lockConflictReason = courseEntry.lockConflictReason
          ? `${courseEntry.lockConflictReason}; ${externalReason}`
          : externalReason;
      }

      courses.push(courseEntry);

      if (locked) {
        lockConflictMap.set(course.courseId, reasonSet ?? new Set<string>());
      }
    }

    const meetingSlotsByCourse = new Map<string, MeetingSlot[]>(
      courses.map((course) => [course.courseId, course.meetings.map(toMeetingSlot)])
    );

    const lockedCoursesList = courses.filter((course) => course.locked);

    for (const lockedCourse of lockedCoursesList) {
      if (!lockConflictMap.has(lockedCourse.courseId)) {
        lockConflictMap.set(lockedCourse.courseId, new Set<string>());
      }
      const reasonSet = lockConflictMap.get(lockedCourse.courseId)!;
      const lockedSlots = meetingSlotsByCourse.get(lockedCourse.courseId) ?? [];

      for (const otherCourse of courses) {
        if (otherCourse.courseId === lockedCourse.courseId) continue;
        const otherSlots = meetingSlotsByCourse.get(otherCourse.courseId) ?? [];
        const overlaps = lockedSlots.some((slot) =>
          otherSlots.some((other) => slotsOverlap(slot, other))
        );
        if (!overlaps) continue;
        const label = formatCourseLabel(otherCourse);
        if (otherCourse.locked) {
          reasonSet.add(`Overlaps with locked ${label}`);
        } else {
          reasonSet.add(`Overlaps with ${label}`);
        }
      }
    }

    for (const lockedCourse of lockedCoursesList) {
      const reasons = lockConflictMap.get(lockedCourse.courseId);
      if (reasons && reasons.size > 0) {
        lockedCourse.lockConflictReason = Array.from(reasons).join("; ");
      }
    }

    planScore -= droppedCourses * 5;
    planScore -= conflictPenalty;

    courses.sort((a, b) => a.courseCode.localeCompare(b.courseCode));

    const groupProgress = REQUIREMENTS.reduce<Record<string, number>>((progress, requirement) => {
      if (requirement.metric === "courses") {
        progress[requirement.id] = courses.filter((course) => course.groups.includes(requirement.id)).length;
      } else {
        progress[requirement.id] = courses
          .filter((course) => course.groups.includes(requirement.id))
          .reduce((sum, course) => sum + course.credits, 0);
      }
      return progress;
    }, {} as Record<string, number>);

    const explainers = [...blueprint.explainers];
    const lockedCount = courses.filter((course) => course.locked).length;
    if (explainers.length >= 3) {
      explainers[2] =
        lockedCount > 0 ? `${lockedCount} course${lockedCount === 1 ? "" : "s"} locked in place` : explainers[2];
    }

    const overrideScore = scoreOverrides[blueprint.id];
    const finalScore = overrideScore !== undefined ? overrideScore : Math.max(0, Math.round(planScore));

    return {
      id: blueprint.id,
      label: blueprint.label,
      description: blueprint.description,
      score: finalScore,
      explainers,
      groupProgress,
      courses,
    } satisfies PlannerPlan;
  });
}

interface PlannerShellProps {
  advisorEnabled: boolean;
}

export function PlannerShell({ advisorEnabled }: PlannerShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [paneWidths, setPaneWidths] = useState<[number, number, number]>([24, 46, 30]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [exportOpen, setExportOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const generationTimerRef = useRef<number | null>(null);
  const [planSelections, setPlanSelections] = useState<PlanSelections>(() => createInitialSelections());
  const [lockedCourses, setLockedCourses] = useState<string[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(PLAN_BLUEPRINTS[0].id);
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | undefined>();
  const [highlightedCourseId, setHighlightedCourseId] = useState<string | undefined>();
  const [lockConflictReasons, setLockConflictReasons] = useState<Record<string, string>>({});
  const [planScores, setPlanScores] = useState<Record<string, number>>(() =>
    PLAN_BLUEPRINTS.reduce((acc, blueprint) => {
      acc[blueprint.id] = blueprint.baseScore;
      return acc;
    }, {} as Record<string, number>)
  );
  const abortRef = useRef<AbortController | null>(null);
  const [generationToken, setGenerationToken] = useState(1);
  const offlineMode = useOfflineMode();
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingIcs, setIsExportingIcs] = useState(false);

  useEffect(() => {
    if (!advisorEnabled) {
      setDrawerOpen(false);
    }
  }, [advisorEnabled]);

  const totalWidth = useMemo(() => paneWidths.reduce((sum, value) => sum + value, 0), [paneWidths]);

  const plans: PlannerPlan[] = useMemo(
    () =>
      buildPlans(
        PLAN_BLUEPRINTS,
        planSelections,
        prefs,
        lockedCourses,
        lockConflictReasons,
        planScores
      ),
    [planSelections, prefs, lockedCourses, lockConflictReasons, planScores]
  );

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId]
  );

  const bestPlanScore = useMemo(
    () => plans.reduce((max, plan) => Math.max(max, plan.score), 0),
    [plans]
  );

  const applyWorkerResult = useCallback((result: GenerateSchedulesResult) => {
    setPlanSelections((prev) => {
      const next: PlanSelections = {};
      PLAN_BLUEPRINTS.forEach((blueprint, index) => {
        const previous = prev[blueprint.id] ?? {};
        const sections = index === 0 ? result.primary : result.backups[index - 1] ?? [];
        if (sections.length === 0) {
          next[blueprint.id] = previous;
          return;
        }
        const selection = { ...previous };
        sections.forEach((section) => {
          selection[section.courseId] = section.id;
        });
        next[blueprint.id] = selection;
      });
      return next;
    });

    setLockConflictReasons({ ...result.lockConflicts });

    setPlanScores(() => {
      const nextScores: Record<string, number> = {};
      PLAN_BLUEPRINTS.forEach((blueprint, index) => {
        const score = result.scores[index] ?? blueprint.baseScore;
        nextScores[blueprint.id] = Math.round(score);
      });
      return nextScores;
    });
  }, []);

  const requirementItems: RequirementTreeItem[] = useMemo(() => {
    return REQUIREMENTS.map((req) => {
      const completed = selectedPlan.groupProgress[req.id] ?? 0;
      return {
        id: req.id,
        category: req.category,
        title: req.title,
        metric: req.metric,
        completed,
        total: req.total,
      };
    });
  }, [selectedPlan]);

  const planSelectionsRef = useRef(planSelections);
  useEffect(() => {
    planSelectionsRef.current = planSelections;
  }, [planSelections]);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current?.abort();
    abortRef.current = abort;

    if (generationTimerRef.current !== null) {
      window.clearTimeout(generationTimerRef.current);
    }

    const timeout = window.setTimeout(() => setIsGenerating(true), 200);
    generationTimerRef.current = timeout;

    const input = buildWorkerInput(prefs, lockedCourses, planSelectionsRef.current);

    generateSchedulesAsync(input, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        applyWorkerResult(result);
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        console.error("Failed to generate schedules", error);
      })
      .finally(() => {
        if (abort.signal.aborted) return;
        window.clearTimeout(timeout);
        generationTimerRef.current = null;
        setIsGenerating(false);
      });

    return () => {
      abort.abort();
      window.clearTimeout(timeout);
      generationTimerRef.current = null;
      setIsGenerating(false);
    };
  }, [prefs, lockedCourses, generationToken, applyWorkerResult]);

  const handleResizeStart = (index: number) => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const containerWidth = containerRef.current?.clientWidth ?? 1;
    const startWidths = [...paneWidths] as [number, number, number];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const next = [...startWidths] as [number, number, number];
      next[index] = Math.max(MIN_WIDTH, startWidths[index] + deltaPercent);
      next[index + 1] = Math.max(MIN_WIDTH, startWidths[index + 1] - deltaPercent);
      const adjustedTotal = next.reduce((sum, value) => sum + value, 0);
      const scale = totalWidth / adjustedTotal;
      setPaneWidths([
        Number((next[0] * scale).toFixed(2)),
        Number((next[1] * scale).toFixed(2)),
        Number((next[2] * scale).toFixed(2)),
      ]);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const regeneratePlans = useCallback(() => {
    setGenerationToken((prev) => prev + 1);
    setHighlightedGroupId(undefined);
    setHighlightedCourseId(undefined);
  }, []);

  const handlePreferenceChange = (updated: Preferences) => {
    setPrefs(updated);
  };

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
    setHighlightedCourseId(undefined);
  };

  const handleSelectGroup = (groupId?: string) => {
    setHighlightedGroupId(groupId);
  };

  const handleHighlightCourse = (courseId?: string) => {
    setHighlightedCourseId(courseId);
  };

  const handleToggleLock = (courseId: string) => {
    setLockedCourses((prev) => {
      if (prev.includes(courseId)) {
        return prev.filter((id) => id !== courseId);
      }
      return [...prev, courseId];
    });
    setGenerationToken((prev) => prev + 1);
  };

  const handleSwapSection = (planId: string, courseId: string, optionId: string) => {
    setPlanSelections((prev) => {
      const next: PlanSelections = { ...prev };
      const planEntry = { ...(next[planId] ?? {}) };
      planEntry[courseId] = optionId;
      next[planId] = planEntry;
      return next;
    });
    if (planId !== selectedPlanId) {
      setSelectedPlanId(planId);
    }
    setGenerationToken((prev) => prev + 1);
  };

  const handleAddProtectedBlock = (block: ProtectedBlock) => {
    setPrefs((prev) => {
      const existing = prev.protectedBlocks ?? [];
      return {
        ...prev,
        protectedBlocks: [...existing, block],
      };
    });
  };

  const handleExportPdf = useCallback(async () => {
    if (!selectedPlan) return;
    try {
      setIsExportingPdf(true);
      const creditTotal = selectedPlan.courses.reduce((sum, course) => sum + (course.credits ?? 0), 0);
      const payload = {
        studentName: "Advisorly Student",
        term: DEFAULT_TERM,
        planLabel: selectedPlan.label,
        creditTotal,
        generatedAt: new Date().toISOString(),
        requirements: requirementItems.map((item) => ({
          id: item.id,
          title: item.title,
          metric: item.metric,
          completed: item.completed,
          total: item.total,
        })),
        courses: selectedPlan.courses.map((course) => ({
          courseCode: course.courseCode,
          title: course.title,
          credits: course.credits,
          meetings: course.meetings,
        })),
      } satisfies PlanExportPayload;

      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `advisorly-${selectedPlan.label.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Unable to export PDF", error);
      window.alert("Unable to export PDF. Please try again.");
    } finally {
      setIsExportingPdf(false);
      setExportOpen(false);
    }
  }, [requirementItems, selectedPlan]);

  const handleExportIcs = useCallback(async () => {
    if (!selectedPlan) return;
    try {
      setIsExportingIcs(true);
      const payload = {
        term: DEFAULT_TERM,
        termStart: DEFAULT_TERM_DATES.start,
        termEnd: DEFAULT_TERM_DATES.end,
        planLabel: selectedPlan.label,
        courses: selectedPlan.courses.map((course) => ({
          courseCode: course.courseCode,
          section: course.section,
          title: course.title,
          meetings: course.meetings,
        })),
      } as const;

      const response = await fetch("/api/export/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `advisorly-${selectedPlan.label.toLowerCase().replace(/\s+/g, "-")}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Unable to export calendar", error);
      window.alert("Unable to export calendar. Please try again.");
    } finally {
      setIsExportingIcs(false);
      setExportOpen(false);
    }
  }, [selectedPlan]);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Advisorly Planner</h1>
          <p className="text-sm text-muted-foreground">
            Tune requirements, visualize your week, and lock in plans.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {offlineMode && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-warn/25 px-3 py-1 text-xs font-semibold text-brand-text">
              <WifiOff className="h-3 w-3" /> Demo Catalog (offline)
            </span>
          )}
          <ConflictMeter
            plan={selectedPlan}
            prefs={prefs}
            requirements={requirementItems}
            benchmarkScore={bestPlanScore}
          />
          <div className="relative">
            <Button variant="outline" onClick={() => setExportOpen((open) => !open)}>
              Export
            </Button>
            {exportOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-brand-primary/10 bg-white p-3 shadow-lg">
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-brand-text transition-colors duration-200 ease-out hover:bg-brand-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                >
                  {isExportingPdf ? "Exporting…" : "Export as PDF"}
                </button>
                <button
                  type="button"
                  className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm text-brand-text transition-colors duration-200 ease-out hover:bg-brand-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleExportIcs}
                  disabled={isExportingIcs}
                >
                  {isExportingIcs ? "Exporting…" : "Export as .ics"}
                </button>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => advisorEnabled && setDrawerOpen(true)}
            disabled={!advisorEnabled}
            title={advisorEnabled ? undefined : "Enable AI to use Ask Advisor"}
          >
            Ask Advisor
          </Button>
          <Button onClick={regeneratePlans} disabled={isGenerating}>
            {isGenerating ? "Generating…" : "Generate Plans"}
          </Button>
        </div>
      </header>

      <div className="relative flex-1" ref={containerRef}>
        <div className="flex h-full w-full overflow-hidden rounded-2xl border border-brand-primary/10 bg-brand-bg">
          <div style={{ width: `${paneWidths[0]}%` }} className="h-full min-w-[220px] max-w-full">
            <RequirementTree
              items={requirementItems}
              selectedGroupId={highlightedGroupId}
              onSelectGroup={handleSelectGroup}
            />
          </div>
          <div className="relative flex items-stretch" onMouseDown={handleResizeStart(0)}>
            <div className="h-full w-1 cursor-col-resize bg-transparent" />
          </div>
          <div style={{ width: `${paneWidths[1]}%` }} className="h-full min-w-[260px] max-w-full">
            <WeekCalendar
              plan={selectedPlan}
              highlightedCourseId={highlightedCourseId}
              onHighlightCourse={handleHighlightCourse}
              protectedBlocks={prefs.protectedBlocks ?? []}
              onAddProtectedBlock={handleAddProtectedBlock}
            />
          </div>
          <div className="relative flex items-stretch" onMouseDown={handleResizeStart(1)}>
            <div className="h-full w-1 cursor-col-resize bg-transparent" />
          </div>
          <div style={{ width: `${paneWidths[2]}%` }} className="h-full min-w-[240px] max-w-full">
            <PlansRail
              plans={plans}
              selectedPlanId={selectedPlanId}
              onSelectPlan={handleSelectPlan}
              highlightedGroupId={highlightedGroupId}
              highlightedCourseId={highlightedCourseId}
              onHighlightCourse={handleHighlightCourse}
              onSwapSection={handleSwapSection}
              onToggleLock={handleToggleLock}
              lockedCourseIds={lockedCourses}
            />
          </div>
        </div>
      </div>

      {advisorEnabled ? (
        <AdvisorDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          prefs={prefs}
          onPrefsChange={handlePreferenceChange}
          regenerate={regeneratePlans}
          submitting={isGenerating}
        />
      ) : null}
    </div>
  );
}
