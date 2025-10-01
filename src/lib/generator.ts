import type { Course, Preferences, Section, Day } from "@/types/catalog";

import { scoreSchedule } from "./scoring";
import { dayCharToIndex, sectionOverlaps, toMinutes, violatesProtected, violatesWindow } from "./time";

interface GroupInput {
  groupId: string;
  groupTitle?: string;
  candidateCourseIds: string[];
  type: string;
  needed: number;
}

interface BeamNode {
  sections: Section[];
  selectedCourses: Set<string>;
  credits: number;
  groupProgress: Map<string, number>;
  score: number;
}

interface GroupInfo extends GroupInput {
  isRequired: boolean;
  metric: "credits" | "count";
}

const DAY_NAMES: Record<Day, string> = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

function cloneNode(node: BeamNode): BeamNode {
  return {
    sections: [...node.sections],
    selectedCourses: new Set(node.selectedCourses),
    credits: node.credits,
    groupProgress: new Map(node.groupProgress),
    score: node.score,
  };
}

function gatherLinkedSections(
  section: Section,
  sectionIndex: Map<string, Section>
): Section[] {
  const stack: Section[] = [section];
  const collected = new Map<string, Section>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (collected.has(current.id)) continue;
    collected.set(current.id, current);
    if (current.linkedWith) {
      const partner = sectionIndex.get(current.linkedWith);
      if (partner && !collected.has(partner.id)) {
        stack.push(partner);
      }
    }
  }

  return Array.from(collected.values());
}

function hasConflict(sections: Section[], candidate: Section): boolean {
  return sections.some((existing) => sectionOverlaps(existing, candidate));
}

function formatSectionLabel(section: Section, byCourseId: Map<string, Course>): string {
  const course = byCourseId.get(section.courseId);
  const code = course?.code ?? section.courseId;
  return section.section ? `${code} · ${section.section}` : code;
}

function collectDayOffConflicts(section: Section, prefs: Preferences): string[] {
  const daysOff = prefs.daysOff ?? [];
  if (daysOff.length === 0) return [];
  const daySet = new Set(daysOff);
  const reasons = new Set<string>();
  for (const meeting of section.meetings) {
    if (daySet.has(meeting.day as Day)) {
      reasons.add(`Falls on preferred day off (${DAY_NAMES[meeting.day as Day] ?? meeting.day})`);
    }
  }
  return Array.from(reasons.values());
}

function collectSeedConflicts(
  section: Section,
  existing: Section[],
  prefs: Preferences,
  byCourseId: Map<string, Course>
): string[] {
  const reasons = new Set<string>();

  if (violatesProtected(section, prefs)) {
    reasons.add("Conflicts with protected time block");
  }

  for (const reason of collectWindowConflicts(section, prefs)) {
    reasons.add(reason);
  }

  for (const reason of collectDayOffConflicts(section, prefs)) {
    reasons.add(reason);
  }

  for (const other of existing) {
    if (sectionOverlaps(other, section)) {
      reasons.add(`Overlaps with ${formatSectionLabel(other, byCourseId)}`);
    }
  }

  return Array.from(reasons.values());
}

function collectGroupConflicts(
  group: Section[],
  existing: Section[],
  prefs: Preferences,
  byCourseId: Map<string, Course>
): string[] {
  const reasons = new Set<string>();
  for (const section of group) {
    for (const reason of collectSeedConflicts(section, existing, prefs, byCourseId)) {
      reasons.add(reason);
    }
  }

  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      if (sectionOverlaps(group[i], group[j])) {
        reasons.add(
          `Linked sections ${formatSectionLabel(group[i], byCourseId)} and ${formatSectionLabel(
            group[j],
            byCourseId
          )} overlap`
        );
      }
    }
  }

  return Array.from(reasons.values());
}

function collectWindowConflicts(section: Section, prefs: Preferences): string[] {
  const reasons = new Set<string>();
  const earliest = prefs.earliest ? toMinutes(prefs.earliest) : undefined;
  const latest = prefs.latest ? toMinutes(prefs.latest) : undefined;

  if (earliest === undefined && latest === undefined) {
    return [];
  }

  for (const meeting of section.meetings) {
    const startMinutes = toMinutes(meeting.start);
    const endMinutes = toMinutes(meeting.end);
    if (earliest !== undefined && startMinutes < earliest) {
      reasons.add(`Starts before preferred time (${prefs.earliest})`);
    }
    if (latest !== undefined && endMinutes > latest) {
      reasons.add(`Ends after preferred time (${prefs.latest})`);
    }
  }

  return Array.from(reasons);
}

function addSectionsToNode(
  node: BeamNode,
  sectionsToAdd: Section[],
  byCourseId: Map<string, Course>,
  courseToGroups: Map<string, GroupInfo[]>,
  prefs: Preferences,
  targetCredits: number
): BeamNode | null {
  const next = cloneNode(node);

  for (const section of sectionsToAdd) {
    if (next.sections.find((existing) => existing.id === section.id)) {
      continue;
    }

    if (violatesProtected(section, prefs)) {
      return null;
    }

    if (hasConflict(next.sections, section)) {
      return null;
    }

    next.sections.push(section);

    if (!next.selectedCourses.has(section.courseId)) {
      next.selectedCourses.add(section.courseId);
      const course = byCourseId.get(section.courseId);
      const credits = course?.credits ?? 0;
      next.credits += credits;

      const groups = courseToGroups.get(section.courseId) ?? [];
      for (const group of groups) {
        const prev = next.groupProgress.get(group.groupId) ?? 0;
        const delta = group.metric === "credits" ? credits : 1;
        next.groupProgress.set(group.groupId, prev + delta);
      }
    }
  }

  const creditBuffer = Math.max(3, Math.round(targetCredits * 0.2));
  if (next.credits > targetCredits + creditBuffer) {
    return null;
  }

  return next;
}

function sortGroups(groups: GroupInfo[]): GroupInfo[] {
  return [...groups].sort((a, b) => {
    if (a.isRequired !== b.isRequired) {
      return a.isRequired ? -1 : 1;
    }
    const lenDiff = a.candidateCourseIds.length - b.candidateCourseIds.length;
    if (lenDiff !== 0) return lenDiff;
    return a.groupId.localeCompare(b.groupId);
  });
}

function uniqueSignature(sections: Section[]): string {
  return sections
    .map((section) => section.id)
    .sort()
    .join("|");
}

function courseSignature(courses: Set<string>): string {
  return Array.from(courses).sort().join("|");
}

function orderMeetings(section: Section): number {
  const firstMeeting = section.meetings[0];
  return dayCharToIndex(firstMeeting.day) * 1440 + toMinutes(firstMeeting.start);
}

function makeExplanation(
  sections: Section[],
  groups: Map<string, GroupInfo>,
  interestOf: (courseId: string) => number,
  prefs: Preferences
): Record<string, string> {
  const groupByCourse = new Map<string, GroupInfo>();
  for (const group of groups.values()) {
    for (const courseId of group.candidateCourseIds) {
      if (!groupByCourse.has(courseId)) {
        groupByCourse.set(courseId, group);
      }
    }
  }

  const explanations: Record<string, string> = {};
  const seenCourses = new Set<string>();
  for (const section of sections) {
    if (seenCourses.has(section.courseId)) continue;
    seenCourses.add(section.courseId);

    const group = groupByCourse.get(section.courseId);
    const groupTitle = group?.groupTitle ?? group?.groupId ?? section.courseId;
    const withinWindow = !violatesProtected(section, prefs) && !violatesWindow(section, prefs);
    const windowText = withinWindow ? "fits your protected times" : "needs flexibility";
    const hasFriday = section.meetings.some((meeting) => meeting.day === "F");
    let fridayText = "avoids Fridays";
    if (hasFriday) {
      fridayText = prefs.fridays === "avoid" ? "may require Fridays" : "includes Friday sessions";
    }
    const interest = interestOf(section.courseId).toFixed(2);
    explanations[section.courseId] = `Fulfills ${groupTitle}; fits ${windowText}; ${fridayText}; interest ${interest}.`;
  }

  return explanations;
}

export interface GenerateSchedulesInput {
  remainingByGroup: Array<{
    groupId: string;
    groupTitle?: string;
    candidateCourseIds: string[];
    type: string;
    needed: number;
  }>;
  sectionsByCourse: Map<string, Section[]>;
  prefs: Preferences;
  requiredCourseIds: Set<string>;
  interestByCourse: Record<string, number>;
  byCourseId: Map<string, Course>;
  targetCredits: number;
  beamSize?: number;
  maxNodes?: number;
  lockedSectionIds?: string[];
}

export interface GenerateSchedulesResult {
  primary: Section[];
  backups: Section[][];
  scores: number[];
  explanations: Record<string, string>;
  lockConflicts: Record<string, string>;
}

export function generateSchedules(input: GenerateSchedulesInput): GenerateSchedulesResult {
  const {
    remainingByGroup,
    sectionsByCourse,
    prefs,
    requiredCourseIds,
    interestByCourse,
    byCourseId,
    targetCredits,
    lockedSectionIds = [],
  } = input;

  const interestOf = (courseId: string) => interestByCourse[courseId] ?? 0.5;
  const beamSize = input.beamSize ?? 6;
  const maxNodes = input.maxNodes ?? 2000;

  const groupInfos: GroupInfo[] = remainingByGroup.map((group) => ({
    ...group,
    isRequired: group.type !== "anyOf",
    metric: group.type === "minCredits" ? "credits" : "count",
  }));

  const groupsSorted = sortGroups(groupInfos);
  const groupMap = new Map(groupInfos.map((group) => [group.groupId, group]));

  const courseToGroups = new Map<string, GroupInfo[]>();
  for (const group of groupInfos) {
    for (const courseId of group.candidateCourseIds) {
      if (!courseToGroups.has(courseId)) {
        courseToGroups.set(courseId, []);
      }
      courseToGroups.get(courseId)!.push(group);
    }
  }

  const sectionIndex = new Map<string, Section>();
  for (const list of sectionsByCourse.values()) {
    for (const section of list) {
      sectionIndex.set(section.id, section);
    }
  }

  let nodesGenerated = 0;

  const initialProgress = new Map<string, number>();
  for (const group of groupInfos) {
    initialProgress.set(group.groupId, 0);
  }

  const lockReasonMap = new Map<string, Set<string>>();

  const lockedGroups: Array<{ courseId: string; sections: Section[] }> = [];
  const processedCourses = new Set<string>();
  const seenSectionIds = new Set<string>();

  for (const sectionId of lockedSectionIds) {
    const section = sectionIndex.get(sectionId);
    if (!section) {
      continue;
    }
    if (processedCourses.has(section.courseId)) {
      continue;
    }
    const linkedGroup = gatherLinkedSections(section, sectionIndex).filter((linked) => {
      if (seenSectionIds.has(linked.id)) return false;
      seenSectionIds.add(linked.id);
      return true;
    });
    lockedGroups.push({ courseId: section.courseId, sections: linkedGroup });
    lockReasonMap.set(section.courseId, new Set<string>());
    if (linkedGroup.length > 1) {
      const reasonSet = lockReasonMap.get(section.courseId)!;
      for (const partner of linkedGroup) {
        if (partner.courseId === section.courseId) continue;
        reasonSet.add(`Requires linked section ${formatSectionLabel(partner, byCourseId)}`);
      }
    }
    processedCourses.add(section.courseId);
  }

  let baseNode: BeamNode = {
    sections: [],
    selectedCourses: new Set(),
    credits: 0,
    groupProgress: initialProgress,
    score: 0,
  };

  let lockedSeedingFailed = false;

  const creditBuffer = Math.max(3, Math.round(targetCredits * 0.2));

  for (const { courseId, sections } of lockedGroups) {
    const reasonSet = lockReasonMap.get(courseId) ?? new Set<string>();
    lockReasonMap.set(courseId, reasonSet);

    const groupConflicts = collectGroupConflicts(
      sections,
      baseNode.sections,
      prefs,
      byCourseId
    );
    for (const reason of groupConflicts) {
      reasonSet.add(reason);
    }

    const additionalCredits = sections.reduce((sum, section) => {
      if (baseNode.selectedCourses.has(section.courseId)) {
        return sum;
      }
      const course = byCourseId.get(section.courseId);
      return sum + (course?.credits ?? 0);
    }, 0);

    if (baseNode.credits + additionalCredits > targetCredits + creditBuffer) {
      reasonSet.add("Exceeds target credit preference");
    }

    const seeded = addSectionsToNode(
      baseNode,
      sections,
      byCourseId,
      courseToGroups,
      prefs,
      targetCredits
    );

    if (!seeded) {
      if (reasonSet.size === 0) {
        reasonSet.add("Locked section cannot be scheduled due to conflicts");
      }
      lockedSeedingFailed = true;
      break;
    }

    baseNode = seeded;
  }

  const lockConflictsRecord = () => {
    const record: Record<string, string> = {};
    for (const [courseId, reasons] of lockReasonMap.entries()) {
      if (reasons.size > 0) {
        record[courseId] = Array.from(reasons).join("; ");
      }
    }
    return record;
  };

  if (lockedSeedingFailed) {
    return {
      primary: [],
      backups: [],
      scores: [],
      explanations: {},
      lockConflicts: lockConflictsRecord(),
    };
  }

  let beam: BeamNode[] = [baseNode];

  const evaluateNode = (node: BeamNode) => {
    const { total } = scoreSchedule(node.sections, {
      prefs,
      requiredCourseIds,
      interestOf,
      byCourseId,
    });
    node.score = total;
  };

  const expandNodeWithCourse = (
    node: BeamNode,
    courseId: string
  ): BeamNode[] => {
    if (node.selectedCourses.has(courseId)) {
      return [cloneNode(node)];
    }

    const sections = sectionsByCourse.get(courseId) ?? [];
    const results: BeamNode[] = [];

    for (const section of sections) {
      const linkedSet = gatherLinkedSections(section, sectionIndex);
      const added = addSectionsToNode(
        node,
        linkedSet,
        byCourseId,
        courseToGroups,
        prefs,
        targetCredits
      );
      if (!added) continue;
      results.push(added);
    }

    return results;
  };

  const expandGroup = (group: GroupInfo, currentBeam: BeamNode[]): BeamNode[] => {
    const nextBeam: BeamNode[] = [];
    const visitedSignatures = new Set<string>();

    const processNode = (base: BeamNode, remainingNeed: number, startIndex: number) => {
      if (nodesGenerated >= maxNodes) return;

      if (remainingNeed <= 0) {
        const signature = uniqueSignature(base.sections);
        if (!visitedSignatures.has(signature)) {
          visitedSignatures.add(signature);
          evaluateNode(base);
          nextBeam.push(base);
          nodesGenerated += 1;
        }
        return;
      }

      const candidates = group.candidateCourseIds.slice(startIndex);
      if (candidates.length === 0) {
        const signature = uniqueSignature(base.sections);
        if (!visitedSignatures.has(signature)) {
          visitedSignatures.add(signature);
          evaluateNode(base);
          nextBeam.push(base);
          nodesGenerated += 1;
        }
        return;
      }

      for (let i = startIndex; i < group.candidateCourseIds.length; i += 1) {
        if (nodesGenerated >= maxNodes) break;
        const courseId = group.candidateCourseIds[i];
        const additions = expandNodeWithCourse(base, courseId);
        for (const addition of additions) {
          const progress = addition.groupProgress.get(group.groupId) ?? 0;
          const needRemaining = Math.max(0, group.needed - progress);
          processNode(addition, needRemaining, i + 1);
        }
      }
    };

    for (const node of currentBeam) {
      const progress = node.groupProgress.get(group.groupId) ?? 0;
      const needRemaining = Math.max(0, group.needed - progress);
      if (needRemaining <= 0) {
        const clone = cloneNode(node);
        evaluateNode(clone);
        nextBeam.push(clone);
        continue;
      }
      processNode(cloneNode(node), needRemaining, 0);
    }

    nextBeam.sort((a, b) => b.score - a.score);
    return nextBeam.slice(0, beamSize);
  };

  for (const group of groupsSorted) {
    beam = expandGroup(group, beam);
    if (beam.length === 0) {
      break;
    }
  }

  if (beam.length === 0) {
    return {
      primary: [],
      backups: [],
      scores: [],
      explanations: {},
      lockConflicts: lockConflictsRecord(),
    };
  }

  const deduped = new Map<string, BeamNode>();
  for (const node of beam) {
    evaluateNode(node);
    const signature = courseSignature(node.selectedCourses);
    if (!deduped.has(signature) || deduped.get(signature)!.score < node.score) {
      deduped.set(signature, node);
    }
  }

  const finalNodes = Array.from(deduped.values()).sort((a, b) => b.score - a.score);
  const topThree = finalNodes.slice(0, 3);

  if (topThree.length === 0) {
    return {
      primary: [],
      backups: [],
      scores: [],
      explanations: {},
      lockConflicts: lockConflictsRecord(),
    };
  }

  const primaryNode = topThree[0];
  const backups = topThree.slice(1).map((node) => [...node.sections]);
  const scores = topThree.map((node) => node.score);
  const explanations = makeExplanation(
    primaryNode.sections,
    groupMap,
    interestOf,
    prefs
  );

  return {
    primary: [...primaryNode.sections].sort(
      (a, b) => orderMeetings(a) - orderMeetings(b)
    ),
    backups,
    scores,
    explanations,
    lockConflicts: lockConflictsRecord(),
  };
}
