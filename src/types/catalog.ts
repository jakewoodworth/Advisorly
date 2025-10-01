export type Day = "M" | "T" | "W" | "R" | "F";

export type TimeString = `${number}${number}:${number}${number}`;

export interface Meeting {
  day: Day;
  start: TimeString;
  end: TimeString;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  credits: number;
  genEdTags?: string[];
  prereqs?: string[];
  equivalents?: string[];
  tags?: string[];
  level?: number;
}

export interface Section {
  id: string;
  courseId: string;
  section: string;
  instructor?: string;
  location?: string;
  meetings: Meeting[];
  capacity?: number;
  enrolled?: number;
  termId: string;
  linkedWith?: string;
}

export interface RequirementGroup {
  id: string;
  title: string;
  allOf?: string[];
  anyOf?: string[];
  chooseN?: number;
  minCredits?: number;
  minCount?: number;
  note?: string;
}

export interface Major {
  id: string;
  name: string;
  catalogYear: string;
  requirementGroups: RequirementGroup[];
}

export interface Term {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface ProtectedBlock {
  day: Day;
  start: TimeString;
  end: TimeString;
  label?: string;
}

export interface Preferences {
  earliest?: TimeString;
  latest?: TimeString;
  daysOff?: Day[];
  protectedBlocks?: ProtectedBlock[];
  targetCredits?: number;
  minBreakMins?: number;
  avoidProfIds?: string[];
  preferProfIds?: string[];
  density?: "compact" | "spread";
  fridays?: "avoid" | "neutral" | "prefer";
}

export interface StudentProfile {
  id: string;
  name: string;
  majorIds: string[];
  minorIds?: string[];
  catalogYear: string;
  completedCourseIds: string[];
  transferCredits?: number;
  preferences: Preferences;
  interestTags?: Record<string, number>;
}

export interface Plan {
  id: string;
  userId: string;
  termId: string;
  generatedAt: string;
  primary: string[];
  backups: {
    label: string;
    sectionIds: string[];
  }[];
  explanations: Record<string, string>;
  score?: number;
}
