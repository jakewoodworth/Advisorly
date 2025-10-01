import type { Course, Preferences, Section } from "@/types/catalog";

import {
  applyLinkedPairs,
  dayCharToIndex,
  sectionOverlaps,
  toMinutes,
  violatesWindow,
} from "./time";

export type ScoreBreakdown = {
  coverage: number;
  interest: number;
  timeWindow: number;
  dayOff: number;
  density: number;
  fridayPenalty: number;
  breakPenalty: number;
  capacityPenalty: number;
};

const LETTER_DAYS = ["M", "T", "W", "R", "F"] as const;

function coverageScore(
  sections: Section[],
  requiredCourseIds: Set<string>
): number {
  if (requiredCourseIds.size === 0) return 1;
  const covered = new Set<string>();
  for (const section of sections) {
    if (requiredCourseIds.has(section.courseId)) {
      covered.add(section.courseId);
    }
  }
  return covered.size / requiredCourseIds.size;
}

function interestScore(
  sections: Section[],
  interestOf: (courseId: string) => number
): number {
  if (sections.length === 0) return 0;
  const scores = sections.map((section) => interestOf(section.courseId));
  const total = scores.reduce((sum, score) => sum + score, 0);
  return total / sections.length;
}

function timeWindowScore(sections: Section[], prefs: Preferences): number {
  if (sections.length === 0) return 1;
  const violations = sections.filter((section) => violatesWindow(section, prefs)).length;
  return Math.max(0, 1 - violations / sections.length);
}

function dayOffScore(sections: Section[], prefs: Preferences): number {
  const daysOff = new Set(prefs.daysOff ?? []);
  if (daysOff.size === 0) return 1;

  const meetingsByDay = new Set<string>();
  for (const section of sections) {
    for (const meeting of section.meetings) {
      meetingsByDay.add(meeting.day);
    }
  }

  const protectedDayCount = Array.from(daysOff).filter(
    (day) => !meetingsByDay.has(day)
  ).length;
  return protectedDayCount / daysOff.size;
}

function densityScore(sections: Section[]): number {
  if (sections.length === 0) return 1;
  const counts = new Array(LETTER_DAYS.length).fill(0);

  for (const section of sections) {
    for (const meeting of section.meetings) {
      const index = dayCharToIndex(meeting.day);
      counts[index] += 1;
    }
  }

  const totalMeetings = counts.reduce((sum, value) => sum + value, 0);
  if (totalMeetings === 0) return 1;

  const mean = totalMeetings / counts.length;
  const variance =
    counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / counts.length;

  const maxPossibleVariance = totalMeetings ** 2;
  if (maxPossibleVariance === 0) return 1;

  const normalizedVariance = Math.min(variance / maxPossibleVariance, 1);
  return 1 - normalizedVariance;
}

function fridayPenalty(sections: Section[], prefs: Preferences): number {
  if (prefs.fridays !== "avoid") return 0;
  const hasFriday = sections.some((section) =>
    section.meetings.some((meeting) => meeting.day === "F")
  );
  return hasFriday ? 1 : 0;
}

function breakPenalty(sections: Section[]): number {
  const sortedSections = [...sections].sort((a, b) =>
    toMinutes(a.meetings[0].start) - toMinutes(b.meetings[0].start)
  );

  let penalty = 0;
  for (let i = 0; i < sortedSections.length; i++) {
    for (let j = i + 1; j < sortedSections.length; j++) {
      const a = sortedSections[i];
      const b = sortedSections[j];
      if (a.termId !== b.termId) continue;
      if (sectionOverlaps(a, b)) continue;

      const breakMinutes = Math.abs(
        toMinutes(b.meetings[0].start) - toMinutes(a.meetings[0].end)
      );
      if (breakMinutes < 15) {
        penalty += 1;
      }
    }
  }
  return penalty;
}

function capacityPenalty(sections: Section[], byCourseId: Map<string, Course>): number {
  let penalty = 0;
  for (const section of sections) {
    const course = byCourseId.get(section.courseId);
    if (!course) continue;
    if (section.capacity !== undefined && section.enrolled !== undefined) {
      if (section.enrolled >= section.capacity) {
        penalty += 1;
      }
    }
  }
  return penalty;
}

export function scoreSchedule(
  sections: Section[],
  opts: {
    prefs: Preferences;
    requiredCourseIds: Set<string>;
    interestOf: (courseId: string) => number;
    byCourseId: Map<string, Course>;
  }
): { total: number; breakdown: ScoreBreakdown } {
  const { prefs, requiredCourseIds, interestOf, byCourseId } = opts;

  const linkedGroups = applyLinkedPairs(sections);
  const flattenedSections = linkedGroups.flat();

  const coverage = coverageScore(flattenedSections, requiredCourseIds);
  const interest = interestScore(flattenedSections, interestOf);
  const timeWindow = timeWindowScore(flattenedSections, prefs);
  const dayOff = dayOffScore(flattenedSections, prefs);
  const density = densityScore(flattenedSections);
  const friday = fridayPenalty(flattenedSections, prefs);
  const breakP = breakPenalty(flattenedSections);
  const capacity = capacityPenalty(flattenedSections, byCourseId);

  const breakdown: ScoreBreakdown = {
    coverage,
    interest,
    timeWindow,
    dayOff,
    density,
    fridayPenalty: friday,
    breakPenalty: breakP,
    capacityPenalty: capacity,
  };

  const total =
    coverage * 6 +
    interest * 3 +
    timeWindow * 3 +
    dayOff * 2 +
    density * 1 -
    friday * 2 -
    breakP * 2 -
    capacity * 1;

  return { total, breakdown };
}
