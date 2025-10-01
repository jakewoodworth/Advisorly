import { randomUUID } from "node:crypto";

import type { Day, TimeString } from "@/types/catalog";

export interface PlanIcsMeeting {
  day: Day;
  start: TimeString;
  end: TimeString;
  location?: string;
}

export interface PlanIcsCourse {
  courseCode: string;
  section?: string;
  title: string;
  meetings: PlanIcsMeeting[];
}

export interface PlanIcsPayload {
  term: string;
  termStart: string; // YYYY-MM-DD
  termEnd: string; // YYYY-MM-DD
  planLabel: string;
  courses: PlanIcsCourse[];
}

const DAY_TO_RRULE: Record<Day, string> = {
  M: "MO",
  T: "TU",
  W: "WE",
  R: "TH",
  F: "FR",
};

const DAY_TO_JS: Record<Day, number> = {
  M: 1,
  T: 2,
  W: 3,
  R: 4,
  F: 5,
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date format: ${value}`);
  }
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unable to parse date: ${value}`);
  }
  return date;
}

function adjustToDay(start: Date, day: Day): Date {
  const target = DAY_TO_JS[day];
  const jsStartDay = start.getDay();
  const offset = (target - jsStartDay + 7) % 7;
  const adjusted = new Date(start);
  adjusted.setDate(start.getDate() + offset);
  return adjusted;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function formatDateTime(date: Date, time: TimeString): string {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const local = new Date(date);
  local.setHours(hours, minutes, 0, 0);
  return `${formatDate(local)}T${pad(local.getHours())}${pad(local.getMinutes())}00`;
}

function formatUtcStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

function createEventLines(
  course: PlanIcsCourse,
  meeting: PlanIcsMeeting,
  termStart: Date,
  termEnd: Date,
  dtStamp: string
): string[] {
  const meetingStart = adjustToDay(termStart, meeting.day);
  const byDay = DAY_TO_RRULE[meeting.day];
  const dtStart = formatDateTime(meetingStart, meeting.start);
  const dtEnd = formatDateTime(meetingStart, meeting.end);
  const until = `${formatDate(termEnd)}T235959`;
  const summary = escapeIcsText(`${course.courseCode}${course.section ? ` ${course.section}` : ""}`);
  const description = escapeIcsText(course.title);
  const location = escapeIcsText(meeting.location ?? "") || undefined;
  const uidSeed = `${course.courseCode}-${course.section ?? ""}-${meeting.day}-${meeting.start}-${meeting.end}`;
  const uid = `${uidSeed}-${randomUUID()}@advisorly.app`;

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=${byDay};UNTIL=${until}`,
  ];

  if (location) {
    lines.push(`LOCATION:${location}`);
  }

  lines.push("END:VEVENT");

  return lines;
}

export function buildPlanIcs(payload: PlanIcsPayload): string {
  const termStart = parseDate(payload.termStart);
  const termEnd = parseDate(payload.termEnd);

  if (termEnd < termStart) {
    throw new Error("Term end must be after term start");
  }

  const dtStamp = formatUtcStamp(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Advisorly//Planner//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:Advisorly • ${escapeIcsText(payload.planLabel)} (${escapeIcsText(payload.term)})`,
  ];

  payload.courses.forEach((course) => {
    course.meetings.forEach((meeting) => {
      lines.push(...createEventLines(course, meeting, termStart, termEnd, dtStamp));
    });
  });

  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}
