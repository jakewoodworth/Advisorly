"use client";

import Papa from "papaparse";
import { z } from "zod";

import type {
  Course,
  Major,
  Meeting,
  RequirementGroup,
  Section,
  Term,
  TimeString,
} from "@/types/catalog";

export type DatasetKey = "majors" | "courses" | "sections";
export type FileFormat = "csv" | "json";

const dayLetters = ["M", "T", "W", "R", "F"] as const;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const timeStringSchema: z.ZodType<TimeString> = z
  .string()
  .regex(timePattern)
  .transform((value) => value as TimeString);

export const meetingSchema: z.ZodType<Meeting> = z.object({
  day: z.enum(dayLetters),
  start: timeStringSchema,
  end: timeStringSchema,
});

export const requirementGroupSchema: z.ZodType<RequirementGroup> = z.object({
  id: z.string(),
  title: z.string(),
  allOf: z.array(z.string()).optional(),
  anyOf: z.array(z.string()).optional(),
  chooseN: z.number().optional(),
  minCredits: z.number().optional(),
  minCount: z.number().optional(),
  note: z.string().optional(),
});

export const majorSchema: z.ZodType<Major> = z.object({
  id: z.string(),
  name: z.string(),
  catalogYear: z.string(),
  requirementGroups: z.array(requirementGroupSchema),
});

export type MajorRecord = Major;

export const courseSchema: z.ZodType<Course> = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  credits: z.number(),
  genEdTags: z.array(z.string()).optional(),
  prereqs: z.array(z.string()).optional(),
  equivalents: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  level: z.number().optional(),
});

export type CourseRecord = Course;

export const sectionSchema: z.ZodType<Section> = z.object({
  id: z.string(),
  courseId: z.string(),
  section: z.string(),
  instructor: z.string().optional(),
  location: z.string().optional(),
  meetings: z.array(meetingSchema).min(1),
  capacity: z.number().optional(),
  enrolled: z.number().optional(),
  termId: z.string(),
  linkedWith: z.string().optional(),
});

export type SectionRecord = Section;

export const termSchema: z.ZodType<Term> = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

export type TermRecord = Term;

const majorsRowSchema = z.object({
  majorId: z.string().min(1),
  catalogYear: z.string().min(1),
  groupId: z.string().min(1),
  groupTitle: z.string().min(1),
  logic: z.enum(["allOf", "anyOf", "chooseN", "minCredits", "minCount"]),
  courseIds: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

const coursesRowSchema = z.object({
  courseId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  credits: z.union([z.string(), z.number()]),
  genEdTags: z.union([z.string(), z.array(z.string())]).optional(),
  prereqs: z.union([z.string(), z.array(z.string())]).optional(),
  equivalents: z.union([z.string(), z.array(z.string())]).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  level: z.union([z.string(), z.number()]).optional(),
});

const sectionsRowSchema = z.object({
  sectionId: z.string().min(1),
  courseId: z.string().min(1),
  termId: z.string().min(1),
  instructor: z.union([z.string(), z.undefined()]).optional(),
  location: z.union([z.string(), z.undefined()]).optional(),
  days: z.string().optional().default(""),
  start: z.union([z.string(), z.undefined()]).optional(),
  end: z.union([z.string(), z.undefined()]).optional(),
  capacity: z.union([z.string(), z.number(), z.undefined()]).optional(),
  enrolled: z.union([z.string(), z.number(), z.undefined()]).optional(),
  linkedWith: z.union([z.string(), z.undefined()]).optional(),
});

export function detectFormatFromName(name: string): FileFormat {
  return name.toLowerCase().endsWith(".json") ? "json" : "csv";
}

async function parseCsv(content: string): Promise<Record<string, string>[]> {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => (typeof value === "string" ? value.trim() : value),
  });

  if (result.errors.length > 0) {
    const [firstError] = result.errors;
    throw new Error(`CSV parse error on row ${firstError.row}: ${firstError.message}`);
  }

  return result.data.filter((row) => Object.values(row).some((value) => value !== ""));
}

function toArray(input?: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);
  }

  if (!input) return [];

  return input
    .split("|")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values))).sort((a, b) => a.localeCompare(b));
}

function parseDirective(note: string | undefined, key: "chooseN" | "minCredits" | "minCount"): number | undefined {
  if (!note) return undefined;
  const regex = new RegExp(`${key}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)`, "i");
  const match = note.match(regex);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export async function parseMajors(content: string, format: FileFormat): Promise<Record<string, MajorRecord>> {
  const recordsRaw =
    format === "csv"
      ? await parseCsv(content)
      : z
          .array(z.record(z.string(), z.unknown()))
          .parse(JSON.parse(content))
          .map((record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value ?? "")]))) ;

  const rows = recordsRaw.map((record) => majorsRowSchema.parse(record));

  type GroupAccumulator = {
    base: RequirementGroup;
    allOfSet: Set<string>;
    anyOfSet: Set<string>;
  };

  const majorsMap = new Map<
    string,
    {
      id: string;
      name: string;
      catalogYear: string;
      groups: Map<string, GroupAccumulator>;
    }
  >();

  for (const row of rows) {
    const majorKey = `${row.majorId}-${row.catalogYear}`;
    if (!majorsMap.has(majorKey)) {
      majorsMap.set(majorKey, {
        id: majorKey,
        name: row.majorId,
        catalogYear: row.catalogYear,
        groups: new Map(),
      });
    }

    const majorEntry = majorsMap.get(majorKey)!;
    if (!majorEntry.groups.has(row.groupId)) {
      majorEntry.groups.set(row.groupId, {
        base: {
          id: row.groupId,
          title: row.groupTitle,
          note: row.note || undefined,
        },
        allOfSet: new Set<string>(),
        anyOfSet: new Set<string>(),
      });
    }

    const group = majorEntry.groups.get(row.groupId)!;
    const courses = toArray(row.courseIds);

    switch (row.logic) {
      case "allOf":
        courses.forEach((course) => group.allOfSet.add(course));
        break;
      case "anyOf":
        courses.forEach((course) => group.anyOfSet.add(course));
        break;
      case "chooseN": {
        courses.forEach((course) => group.anyOfSet.add(course));
        const parsed = parseDirective(row.note, "chooseN");
        if (parsed !== undefined) {
          group.base.chooseN = parsed;
        }
        break;
      }
      case "minCredits": {
        courses.forEach((course) => group.anyOfSet.add(course));
        const parsed = parseDirective(row.note, "minCredits");
        if (parsed !== undefined) {
          group.base.minCredits = parsed;
        }
        break;
      }
      case "minCount": {
        courses.forEach((course) => group.anyOfSet.add(course));
        const parsed = parseDirective(row.note, "minCount");
        if (parsed !== undefined) {
          group.base.minCount = parsed;
        }
        break;
      }
    }

    if (row.note && !group.base.note) {
      group.base.note = row.note;
    }
  }

  const result: Record<string, MajorRecord> = {};

  for (const [majorKey, majorEntry] of majorsMap.entries()) {
    const requirementGroups: RequirementGroup[] = [];

    for (const accumulator of majorEntry.groups.values()) {
      const group: RequirementGroup = {
        ...accumulator.base,
      };

      const allOf = uniqueSorted(accumulator.allOfSet);
      if (allOf.length > 0) {
        group.allOf = allOf;
      }

      const anyOf = uniqueSorted(accumulator.anyOfSet);
      if (anyOf.length > 0) {
        group.anyOf = anyOf;
      }

      requirementGroups.push(group);
    }

    requirementGroups.sort((a, b) => a.title.localeCompare(b.title));

    const majorRecord: MajorRecord = majorSchema.parse({
      id: majorKey,
      name: majorEntry.name,
      catalogYear: majorEntry.catalogYear,
      requirementGroups,
    });

    result[majorKey] = majorRecord;
  }

  return result;
}

function coerceNumber(value: string | number | undefined, field: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${field}: ${value}`);
  }
  return parsed;
}

export async function parseCourses(content: string, format: FileFormat): Promise<Record<string, CourseRecord>> {
  const raw =
    format === "csv"
      ? await parseCsv(content)
      : z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(content));

  const result: Record<string, CourseRecord> = {};

  for (const entry of raw) {
    const parsedRow = coursesRowSchema.parse(entry);

    const id = parsedRow.courseId.trim();
    const code = parsedRow.code.trim();
    const title = parsedRow.title.trim();
    const credits = Number(parsedRow.credits);
    if (!Number.isFinite(credits)) {
      throw new Error(`Invalid credits value for course ${id}`);
    }

    const course: CourseRecord = courseSchema.parse({
      id,
      code,
      title,
      credits,
      genEdTags: toArray(parsedRow.genEdTags as string | string[] | undefined),
      prereqs: toArray(parsedRow.prereqs as string | string[] | undefined),
      equivalents: toArray(parsedRow.equivalents as string | string[] | undefined),
      tags: toArray(parsedRow.tags as string | string[] | undefined),
      level: coerceNumber(parsedRow.level as string | number | undefined, "level"),
    });

    result[id] = course;
  }

  return result;
}

function deriveSectionCode(sectionId: string): string {
  const parts = sectionId.split("-");
  return parts[parts.length - 1] || sectionId;
}

function splitDays(days: string): (typeof dayLetters)[number][] {
  return days
    .split("")
    .map((day) => day.trim())
    .filter((day): day is (typeof dayLetters)[number] => (dayLetters as readonly string[]).includes(day));
}

export async function parseSections(content: string, format: FileFormat): Promise<Record<string, SectionRecord>> {
  const raw =
    format === "csv"
      ? await parseCsv(content)
      : z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(content));

  const result: Record<string, SectionRecord> = {};

  for (const entry of raw) {
    const parsedRow = sectionsRowSchema.parse(entry);

    const id = parsedRow.sectionId.trim();
    const start = (parsedRow.start ?? "").trim();
    const end = (parsedRow.end ?? "").trim();

    if (!timePattern.test(start) || !timePattern.test(end)) {
      throw new Error(`Invalid time window for section ${id} (${start}-${end})`);
    }

    const days = splitDays(parsedRow.days ?? "");
    if (days.length === 0) {
      throw new Error(`Section ${id} must specify meeting days`);
    }

    const normalizedStart = start as TimeString;
    const normalizedEnd = end as TimeString;

    const meetings = days.map((day) => ({
      day,
      start: normalizedStart,
      end: normalizedEnd,
    }));

    const sectionRecord: SectionRecord = sectionSchema.parse({
      id,
      courseId: parsedRow.courseId.trim(),
      section: deriveSectionCode(id),
      instructor: parsedRow.instructor?.trim() || undefined,
      location: parsedRow.location?.trim() || undefined,
      meetings,
      capacity: coerceNumber(parsedRow.capacity as string | number | undefined, "capacity"),
      enrolled: coerceNumber(parsedRow.enrolled as string | number | undefined, "enrolled"),
      termId: parsedRow.termId.trim(),
      linkedWith: parsedRow.linkedWith?.trim() || undefined,
    });

    result[id] = sectionRecord;
  }

  return result;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, sortValue(val)])
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export type DiffResult<T> = {
  added: Array<{ id: string; record: T }>;
  updated: Array<{ id: string; record: T; previous: T }>;
  removed: Array<{ id: string; record: T }>;
};

export function computeDiff<T extends object>(
  current: Record<string, T>,
  incoming: Record<string, T>
): DiffResult<T> {
  const added: DiffResult<T>["added"] = [];
  const updated: DiffResult<T>["updated"] = [];
  const removed: DiffResult<T>["removed"] = [];

  for (const [id, record] of Object.entries(incoming)) {
    const existing = current[id];
    if (!existing) {
      added.push({ id, record });
      continue;
    }

    if (stableStringify(existing) !== stableStringify(record)) {
      updated.push({ id, record, previous: existing });
    }
  }

  for (const [id, record] of Object.entries(current)) {
    if (!Object.prototype.hasOwnProperty.call(incoming, id)) {
      removed.push({ id, record });
    }
  }

  return { added, updated, removed };
}

function flattenRequirementCourses(group: RequirementGroup): string[] {
  const courses = new Set<string>();
  (group.allOf ?? []).forEach((course) => courses.add(course));
  (group.anyOf ?? []).forEach((course) => courses.add(course));
  return Array.from(courses);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export type IntegrityIssue = {
  type: "error" | "warning";
  message: string;
};

export function runIntegrityChecks(
  data: {
    majors: Record<string, MajorRecord>;
    courses: Record<string, CourseRecord>;
    sections: Record<string, SectionRecord>;
  }
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  const courseIds = new Set(Object.keys(data.courses));

  for (const major of Object.values(data.majors)) {
    for (const group of major.requirementGroups) {
      for (const courseId of flattenRequirementCourses(group)) {
        if (!courseIds.has(courseId)) {
          issues.push({
            type: "error",
            message: `Major ${major.name} (${major.catalogYear}) references missing course ${courseId} in group ${group.title}`,
          });
        }
      }
    }
  }

  for (const course of Object.values(data.courses)) {
    for (const prereq of course.prereqs ?? []) {
      if (!courseIds.has(prereq)) {
        issues.push({
          type: "error",
          message: `Course ${course.id} prerequisite ${prereq} does not exist`,
        });
      }
    }

    for (const equivalent of course.equivalents ?? []) {
      if (!courseIds.has(equivalent)) {
        issues.push({
          type: "error",
          message: `Course ${course.id} equivalent ${equivalent} does not exist`,
        });
      }
    }
  }

  const sectionIds = new Set(Object.keys(data.sections));

  for (const section of Object.values(data.sections)) {
    for (const meeting of section.meetings) {
      if (!(dayLetters as readonly string[]).includes(meeting.day)) {
        issues.push({
          type: "error",
          message: `Section ${section.id} has invalid meeting day ${meeting.day}`,
        });
      }

      if (!timePattern.test(meeting.start) || !timePattern.test(meeting.end)) {
        issues.push({
          type: "error",
          message: `Section ${section.id} has invalid time ${meeting.start}-${meeting.end}`,
        });
        continue;
      }

      if (toMinutes(meeting.start) >= toMinutes(meeting.end)) {
        issues.push({
          type: "error",
          message: `Section ${section.id} has start time after end time (${meeting.start} >= ${meeting.end})`,
        });
      }
    }

    if (section.linkedWith && !sectionIds.has(section.linkedWith)) {
      issues.push({
        type: "error",
        message: `Section ${section.id} linkedWith target ${section.linkedWith} does not exist`,
      });
    }
  }

  return issues;
}

export function formatSummary(
  key: DatasetKey,
  record: MajorRecord | CourseRecord | SectionRecord
): string {
  switch (key) {
    case "majors": {
      const major = record as MajorRecord;
      return `${major.name} (${major.catalogYear}) – ${major.requirementGroups.length} requirement group${major.requirementGroups.length === 1 ? "" : "s"}`;
    }
    case "courses": {
      const course = record as CourseRecord;
      return `${course.code} – ${course.title} (${course.credits} credits)`;
    }
    case "sections": {
      const section = record as SectionRecord;
      const meeting = section.meetings[0];
      const days = section.meetings.map((m) => m.day).join("");
      return `${section.courseId} ${section.section} – ${days} ${meeting.start}-${meeting.end}`;
    }
    default:
      return "";
  }
}
