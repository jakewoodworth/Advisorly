import type { Course, Major, RequirementGroup, StudentProfile } from "@/types/catalog";

export function normalizeGroups(major: Major): RequirementGroup[] {
  return major.requirementGroups.map((group) => ({
    ...group,
    allOf: group.allOf ? [...group.allOf] : undefined,
    anyOf: group.anyOf ? [...group.anyOf] : undefined,
  }));
}

export function computeFulfilled(
  completed: Set<string>,
  equivalentsMap: Map<string, string[]>
): Set<string> {
  const result = new Set(completed);
  if (equivalentsMap.size === 0) {
    return result;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [courseId, equivalents] of equivalentsMap.entries()) {
      if (result.has(courseId)) {
        for (const equivalent of equivalents) {
          if (!result.has(equivalent)) {
            result.add(equivalent);
            changed = true;
          }
        }
      }

      for (const equivalent of equivalents) {
        if (result.has(equivalent) && !result.has(courseId)) {
          result.add(courseId);
          changed = true;
        }
      }
    }
  }

  return result;
}

type RemainingGroup = {
  id: string;
  title: string;
  type: "allOf" | "anyOf" | "chooseN" | "minCredits" | "minCount";
  needed: number;
  candidateCourseIds: string[];
};

type RequirementSummary = {
  remainingGroups: RemainingGroup[];
  requiredCourseIds: Set<string>;
  fulfilledBy: string[];
};

interface ParsedNote {
  allowDouble: boolean;
  minLevel?: number;
  requiredTag?: string;
}

function parseNote(note?: string): ParsedNote {
  if (!note) {
    return { allowDouble: false };
  }

  const lower = note.toLowerCase();
  const parsed: ParsedNote = {
    allowDouble: /double\s*=\s*true/.test(lower),
  };

  const levelMatch = lower.match(/level\s*>=\s*(\d{3})/);
  if (levelMatch) {
    parsed.minLevel = Number(levelMatch[1]);
  }

  const tagMatch = note.match(/tag\s*=\s*([\w-]+)/i);
  if (tagMatch) {
    parsed.requiredTag = tagMatch[1];
  }

  return parsed;
}

function buildCourseMap(courses: Course[]): Map<string, Course> {
  return new Map(courses.map((course) => [course.id, course]));
}

function buildEquivalentsMap(courses: Course[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();

  const addRelation = (a: string, b: string) => {
    if (!map.has(a)) {
      map.set(a, new Set());
    }
    map.get(a)!.add(b);
  };

  for (const course of courses) {
    const equivalents = course.equivalents ?? [];
    for (const equivalent of equivalents) {
      addRelation(course.id, equivalent);
      addRelation(equivalent, course.id);
    }
  }

  const result = new Map<string, string[]>();
  for (const [key, valueSet] of map.entries()) {
    result.set(key, Array.from(valueSet));
  }
  return result;
}

function expandEquivalents(
  courseId: string,
  equivalentsMap: Map<string, string[]>,
  cache: Map<string, Set<string>>
): Set<string> {
  if (cache.has(courseId)) {
    return cache.get(courseId)!;
  }

  const visited = new Set<string>();
  const queue: string[] = [courseId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = equivalentsMap.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  cache.set(courseId, visited);
  return visited;
}

function resolveActualCourse(
  courseId: string,
  completedCourses: string[],
  usedCourses: Set<string>,
  equivalentsMap: Map<string, string[]>,
  eqCache: Map<string, Set<string>>,
  allowDouble: boolean
): string | undefined {
  const equivalenceSet = expandEquivalents(courseId, equivalentsMap, eqCache);
  for (const actual of completedCourses) {
    if (!equivalenceSet.has(actual)) continue;
    if (!allowDouble && usedCourses.has(actual)) continue;
    return actual;
  }
  return undefined;
}

function coursePassesFilters(
  courseId: string,
  courseMap: Map<string, Course>,
  filters: ParsedNote
): boolean {
  const course = courseMap.get(courseId);
  if (!course) return false;

  if (typeof filters.minLevel === "number") {
    if (!course.level || course.level < filters.minLevel) {
      return false;
    }
  }

  if (filters.requiredTag) {
    const tags = course.tags ?? [];
    if (!tags.includes(filters.requiredTag)) {
      return false;
    }
  }

  return true;
}

export function computeRemaining(
  profile: StudentProfile,
  major: Major,
  catalogCourses: Course[]
): RequirementSummary {
  const groups = normalizeGroups(major);
  const courseMap = buildCourseMap(catalogCourses);
  const equivalentsMap = buildEquivalentsMap(catalogCourses);

  const completedCourses = [...profile.completedCourseIds];
  const completedSet = new Set<string>(completedCourses);
  const expandedCompleted = computeFulfilled(completedSet, equivalentsMap);

  const eqCache = new Map<string, Set<string>>();
  const usedCourses = new Set<string>();
  const requiredCourseIds = new Set<string>();
  const fulfilledBy: string[] = [];
  const remainingGroups: RemainingGroup[] = [];

  const recordFulfillment = (courseId: string) => {
    if (!fulfilledBy.includes(courseId)) {
      fulfilledBy.push(courseId);
    }
  };

  for (const group of groups) {
    const filters = parseNote(group.note);
    const allowDouble = filters.allowDouble;

    const processCourseList = (courseIds: string[]) => {
      const uniqueCourseIds = Array.from(new Set(courseIds));
      uniqueCourseIds.forEach((courseId) => requiredCourseIds.add(courseId));
      return uniqueCourseIds;
    };

    if (group.allOf && group.allOf.length > 0) {
      const courseIds = processCourseList(group.allOf);
      const missing: string[] = [];

      for (const requiredCourse of courseIds) {
        const equivalenceSet = expandEquivalents(requiredCourse, equivalentsMap, eqCache);
        const hasCompleted = Array.from(equivalenceSet).some((course) =>
          expandedCompleted.has(course)
        );

        if (hasCompleted) {
          const actual = resolveActualCourse(
            requiredCourse,
            completedCourses,
            usedCourses,
            equivalentsMap,
            eqCache,
            allowDouble
          );

          if (actual) {
            if (!allowDouble) {
              usedCourses.add(actual);
            }
            recordFulfillment(actual);
          } else {
            missing.push(requiredCourse);
          }
        } else {
          missing.push(requiredCourse);
        }
      }

      if (missing.length > 0) {
        remainingGroups.push({
          id: group.id,
          title: group.title,
          type: "allOf",
          needed: missing.length,
          candidateCourseIds: missing,
        });
      }

      continue;
    }

    const poolCourses = processCourseList(group.anyOf ?? []);

    if (group.chooseN !== undefined) {
      const requiredCount = group.chooseN;
      let remainingNeeded = requiredCount;
      const candidates: string[] = [];

      for (const courseId of poolCourses) {
        const actual = resolveActualCourse(
          courseId,
          completedCourses,
          usedCourses,
          equivalentsMap,
          eqCache,
          allowDouble
        );
        if (actual && expandedCompleted.has(courseId)) {
          if (remainingNeeded > 0) {
            if (!allowDouble) {
              usedCourses.add(actual);
            }
            recordFulfillment(actual);
            remainingNeeded -= 1;
          }
        } else {
          candidates.push(courseId);
        }
      }

      if (remainingNeeded > 0) {
        remainingGroups.push({
          id: group.id,
          title: group.title,
          type: "chooseN",
          needed: remainingNeeded,
          candidateCourseIds: candidates,
        });
      }

      continue;
    }

    if (group.minCount !== undefined) {
      const requiredCount = group.minCount;
      let remainingNeeded = requiredCount;
      const candidates: string[] = [];

      for (const courseId of poolCourses) {
        if (!coursePassesFilters(courseId, courseMap, filters)) {
          continue;
        }

        const actual = resolveActualCourse(
          courseId,
          completedCourses,
          usedCourses,
          equivalentsMap,
          eqCache,
          allowDouble
        );

        if (actual && expandedCompleted.has(courseId)) {
          if (remainingNeeded > 0) {
            if (!allowDouble) {
              usedCourses.add(actual);
            }
            recordFulfillment(actual);
            remainingNeeded -= 1;
          }
        } else {
          candidates.push(courseId);
        }
      }

      if (remainingNeeded > 0) {
        remainingGroups.push({
          id: group.id,
          title: group.title,
          type: "minCount",
          needed: remainingNeeded,
          candidateCourseIds: candidates,
        });
      }

      continue;
    }

    if (group.minCredits !== undefined) {
      const requiredCredits = group.minCredits;
      let remainingCredits = requiredCredits;
      const candidates: string[] = [];

      for (const courseId of poolCourses) {
        if (!coursePassesFilters(courseId, courseMap, filters)) {
          continue;
        }

        const actual = resolveActualCourse(
          courseId,
          completedCourses,
          usedCourses,
          equivalentsMap,
          eqCache,
          allowDouble
        );

        if (actual && expandedCompleted.has(courseId)) {
          if (remainingCredits > 0) {
            const course = courseMap.get(actual) ?? courseMap.get(courseId);
            const credits = course?.credits ?? 0;
            if (credits > 0) {
              if (!allowDouble) {
                usedCourses.add(actual);
              }
              recordFulfillment(actual);
              remainingCredits = Math.max(0, remainingCredits - credits);
            }
          }
        } else {
          candidates.push(courseId);
        }
      }

      if (remainingCredits > 0) {
        remainingGroups.push({
          id: group.id,
          title: group.title,
          type: "minCredits",
          needed: remainingCredits,
          candidateCourseIds: candidates,
        });
      }

      continue;
    }

    if (poolCourses.length > 0) {
      let satisfied = false;
      const candidates: string[] = [];

      for (const courseId of poolCourses) {
        const actual = resolveActualCourse(
          courseId,
          completedCourses,
          usedCourses,
          equivalentsMap,
          eqCache,
          allowDouble
        );

        if (actual && expandedCompleted.has(courseId) && !satisfied) {
          satisfied = true;
          if (!allowDouble) {
            usedCourses.add(actual);
          }
          recordFulfillment(actual);
        } else {
          candidates.push(courseId);
        }
      }

      if (!satisfied) {
        remainingGroups.push({
          id: group.id,
          title: group.title,
          type: "anyOf",
          needed: 1,
          candidateCourseIds: candidates,
        });
      }
    }
  }

  return {
    remainingGroups,
    requiredCourseIds,
    fulfilledBy,
  };
}
