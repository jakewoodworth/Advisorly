import { NextResponse } from "next/server";
import { z } from "zod";

import { buildPlanIcs, type PlanIcsPayload } from "@/lib/exportIcs";

export const runtime = "nodejs";

const meetingSchema = z.object({
  day: z.enum(["M", "T", "W", "R", "F"]),
  start: z.string(),
  end: z.string(),
  location: z.string().optional(),
});

const courseSchema = z.object({
  courseCode: z.string(),
  section: z.string().optional(),
  title: z.string(),
  meetings: z.array(meetingSchema),
});

const payloadSchema = z.object({
  term: z.string(),
  termStart: z.string(),
  termEnd: z.string(),
  planLabel: z.string(),
  courses: z.array(courseSchema),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const data = payloadSchema.parse(json) as PlanIcsPayload;

    const ics = buildPlanIcs(data);

    const filename = `advisorly-${data.planLabel.toLowerCase().replace(/\s+/g, "-")}.ics`;

    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("ICS export failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid export payload"
            : error instanceof Error
            ? error.message
            : "Unable to generate calendar file",
      },
      { status: 400 }
    );
  }
}
