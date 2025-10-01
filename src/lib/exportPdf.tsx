import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToStream,
} from "@react-pdf/renderer";

import type { Day, TimeString } from "@/types/catalog";

const DAYS: Day[] = ["M", "T", "W", "R", "F"];
const DAY_LABELS: Record<Day, string> = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

Font.register({ family: "Inter", src: "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrKJ4.ttf" });

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: "Inter",
    fontSize: 12,
    color: "#1f2933",
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 8,
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
  },
  subheading: {
    fontSize: 12,
    marginTop: 4,
    color: "#4b5563",
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
  },
  requirementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  requirementTitle: {
    fontWeight: 500,
  },
  checklistStatus: {
    fontWeight: 600,
  },
  timetable: {
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  timetableHeader: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  timetableHeaderCell: {
    flex: 1,
    padding: 6,
    fontWeight: 600,
    fontSize: 11,
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
  },
  timetableRow: {
    flexDirection: "row",
  },
  timetableCell: {
    flex: 1,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    fontSize: 10,
  },
  courseList: {
    marginTop: 8,
  },
  courseRow: {
    marginBottom: 6,
  },
  footer: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    paddingTop: 8,
    fontSize: 10,
    color: "#64748b",
  },
});

export interface PlanExportRequirement {
  id: string;
  title: string;
  metric: "courses" | "credits";
  completed: number;
  total: number;
}

export interface PlanExportCourseMeeting {
  day: Day;
  start: TimeString;
  end: TimeString;
  location?: string;
}

export interface PlanExportCourse {
  courseCode: string;
  title: string;
  credits: number;
  meetings: PlanExportCourseMeeting[];
}

export interface PlanExportPayload {
  studentName: string;
  term: string;
  planLabel: string;
  creditTotal: number;
  generatedAt: string;
  requirements: PlanExportRequirement[];
  courses: PlanExportCourse[];
}

function formatRequirement(req: PlanExportRequirement): string {
  if (req.metric === "credits") {
    return `${req.completed}/${req.total} credits`;
  }
  return `${req.completed}/${req.total} courses`;
}

function buildScheduleGrid(courses: PlanExportCourse[]) {
  return DAYS.map((day) => {
    const meetings = courses.flatMap((course) =>
      course.meetings
        .filter((meeting) => meeting.day === day)
        .map((meeting) => ({ course, meeting }))
    );
    return {
      day,
      entries: meetings.sort((a, b) => a.meeting.start.localeCompare(b.meeting.start)),
    };
  });
}

const PlanDocument: React.FC<PlanExportPayload> = ({
  studentName,
  term,
  planLabel,
  creditTotal,
  generatedAt,
  requirements,
  courses,
}) => {
  const schedule = buildScheduleGrid(courses);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.heading}>Advisorly Plan • {planLabel}</Text>
          <Text style={styles.subheading}>
            {studentName} • {term} • {creditTotal} credits
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requirements Overview</Text>
          {requirements.map((req) => {
            const fulfilled = req.completed >= req.total;
            return (
              <View key={req.id} style={styles.requirementRow}>
                <Text style={styles.requirementTitle}>{req.title}</Text>
                <Text style={styles.checklistStatus}>
                  {fulfilled ? "✔" : "○"} {formatRequirement(req)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Timetable</Text>
          <View style={styles.timetable}>
            <View style={styles.timetableHeader}>
              {DAYS.map((day, index) => (
                <Text
                  key={day}
                  style={{
                    ...styles.timetableHeaderCell,
                    borderRightWidth: index === DAYS.length - 1 ? 0 : 1,
                  }}
                >
                  {DAY_LABELS[day]}
                </Text>
              ))}
            </View>
            <View style={styles.timetableRow}>
              {schedule.map(({ day, entries }, index) => (
                <View
                  key={day}
                  style={{
                    ...styles.timetableCell,
                    borderRightWidth: index === DAYS.length - 1 ? 0 : 1,
                  }}
                >
                  {entries.length === 0 ? (
                    <Text>-</Text>
                  ) : (
                    entries.map(({ course, meeting }) => (
                      <Text key={`${course.courseCode}-${meeting.start}`}>{
                        `${meeting.start}-${meeting.end} ${course.courseCode}`
                      }</Text>
                    ))
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Course Details</Text>
          <View style={styles.courseList}>
            {courses.map((course) => (
              <View key={course.courseCode} style={styles.courseRow}>
                <Text>
                  {course.courseCode} • {course.title} ({course.credits} credits)
                </Text>
                {course.meetings.map((meeting, index) => (
                  <Text key={`${course.courseCode}-${index}`}>
                    {DAY_LABELS[meeting.day]} {meeting.start}-{meeting.end}
                    {meeting.location ? ` • ${meeting.location}` : ""}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footer}>Generated {new Date(generatedAt).toLocaleString()}</Text>
      </Page>
    </Document>
  );
};

export async function renderPlanPdf(payload: PlanExportPayload): Promise<NodeJS.ReadableStream> {
  const stream = await renderToStream(<PlanDocument {...payload} />);
  return stream;
}
