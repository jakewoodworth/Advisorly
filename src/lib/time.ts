import type { Preferences, Section } from "@/types/catalog";

type TimeRange = {
  start: number;
  end: number;
};

type MeetingLike = {
  day: number;
  range: TimeRange;
};

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function dayCharToIndex(day: string): number {
  switch (day) {
    case "M":
      return 0;
    case "T":
      return 1;
    case "W":
      return 2;
    case "R":
      return 3;
    case "F":
      return 4;
    default:
      throw new Error(`Unsupported day code: ${day}`);
  }
}

function expandMeetings(section: Section): MeetingLike[] {
  return section.meetings.map((meeting) => ({
    day: dayCharToIndex(meeting.day),
    range: {
      start: toMinutes(meeting.start),
      end: toMinutes(meeting.end),
    },
  }));
}

export function sectionOverlaps(a: Section, b: Section): boolean {
  const meetingsA = expandMeetings(a);
  const meetingsB = expandMeetings(b);
  for (const meetingA of meetingsA) {
    for (const meetingB of meetingsB) {
      if (meetingA.day === meetingB.day && overlaps(meetingA.range, meetingB.range)) {
        return true;
      }
    }
  }
  return false;
}

function buildProtectedRanges(preferences: Preferences): MeetingLike[] {
  const blocks = preferences.protectedBlocks ?? [];
  return blocks.map((block) => ({
    day: dayCharToIndex(block.day),
    range: {
      start: toMinutes(block.start),
      end: toMinutes(block.end),
    },
  }));
}

export function violatesProtected(section: Section, preferences: Preferences): boolean {
  const blockedRanges = buildProtectedRanges(preferences);
  if (blockedRanges.length === 0) return false;

  const meetings = expandMeetings(section);
  return meetings.some((meeting) =>
    blockedRanges.some(
      (block) => block.day === meeting.day && overlaps(block.range, meeting.range)
    )
  );
}

export function violatesWindow(section: Section, preferences: Preferences): boolean {
  const earliest = preferences.earliest ? toMinutes(preferences.earliest) : undefined;
  const latest = preferences.latest ? toMinutes(preferences.latest) : undefined;

  if (earliest === undefined && latest === undefined) {
    return false;
  }

  return expandMeetings(section).some((meeting) => {
    if (earliest !== undefined && meeting.range.start < earliest) {
      return true;
    }
    if (latest !== undefined && meeting.range.end > latest) {
      return true;
    }
    return false;
  });
}

export function applyLinkedPairs(sections: Section[]): Section[][] {
  const result: Section[][] = [];
  const visited = new Set<string>();
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  for (const section of sections) {
    if (visited.has(section.id)) continue;

    if (!section.linkedWith) {
      result.push([section]);
      visited.add(section.id);
      continue;
    }

    const linkedId = section.linkedWith;
    const partner = sectionById.get(linkedId);
    if (partner) {
      result.push([section, partner]);
      visited.add(section.id);
      visited.add(partner.id);
    } else {
      result.push([section]);
      visited.add(section.id);
    }
  }

  return result;
}
