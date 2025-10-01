import { NextResponse } from "next/server";
import { z } from "zod";

import { renderPlanPdf, type PlanExportPayload } from "@/lib/exportPdf";

export const runtime = "nodejs";

const meetingSchema = z.object({
  day: z.enum(["M", "T", "W", "R", "F"]),
  start: z.string(),
  end: z.string(),
  location: z.string().optional(),
});

const courseSchema = z.object({
  courseCode: z.string(),
  title: z.string(),
  credits: z.number(),
  meetings: z.array(meetingSchema),
});

const requirementSchema = z.object({
  id: z.string(),
  title: z.string(),
  metric: z.enum(["courses", "credits"]),
  completed: z.number(),
  total: z.number(),
});

const payloadSchema = z.object({
  studentName: z.string(),
  term: z.string(),
  planLabel: z.string(),
  creditTotal: z.number(),
  generatedAt: z.string(),
  requirements: z.array(requirementSchema),
  courses: z.array(courseSchema),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const data = payloadSchema.parse(json) as PlanExportPayload;

    const stream = await renderPlanPdf(data);

    const filename = `advisorly-${data.planLabel.toLowerCase().replace(/\s+/g, "-")}.pdf`;

    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("PDF export failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid export payload"
            : "Unable to generate PDF",
      },
      { status: 400 }
    );
  }
}
