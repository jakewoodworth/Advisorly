"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PlannerPlan } from "@/components/Planner/PlansRail";
import type { Day, ProtectedBlock, TimeString } from "@/types/catalog";
import { cn } from "@/lib/utils";
import { toMinutes } from "@/lib/time";

const DAYS: Day[] = ["M", "T", "W", "R", "F"];
const DAY_LABELS: Record<Day, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
};
const START_MINUTES = 8 * 60;
const END_MINUTES = 20 * 60;
const SLOT_MINUTES = 30;
const TOTAL_MINUTES = END_MINUTES - START_MINUTES;
const SLOT_COUNT = (END_MINUTES - START_MINUTES) / SLOT_MINUTES;

interface WeekCalendarProps {
  plan: PlannerPlan;
  highlightedCourseId?: string;
  onHighlightCourse: (courseId?: string) => void;
  protectedBlocks: ProtectedBlock[];
  onAddProtectedBlock: (block: ProtectedBlock) => void;
}

interface CellPosition {
  dayIndex: number;
  slotIndex: number;
}

function minutesToTime(minutes: number): TimeString {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}` as TimeString;
}

function formatMeeting(day: Day, start: TimeString, end: TimeString, location?: string) {
  return `${DAY_LABELS[day]} ${start}-${end}${location ? ` · ${location}` : ""}`;
}

function meetingOverlapsProtected(
  day: Day,
  start: TimeString,
  end: TimeString,
  blocks: ProtectedBlock[]
): boolean {
  const meetingStart = toMinutes(start);
  const meetingEnd = toMinutes(end);
  return blocks.some((block) => {
    if (block.day !== day) return false;
    const blockStart = toMinutes(block.start);
    const blockEnd = toMinutes(block.end);
    return blockStart < meetingEnd && meetingStart < blockEnd;
  });
}

export function WeekCalendar({
  plan,
  highlightedCourseId,
  onHighlightCourse,
  protectedBlocks,
  onAddProtectedBlock,
}: WeekCalendarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [blockMode, setBlockMode] = useState(false);
  const [dragStart, setDragStart] = useState<CellPosition | null>(null);
  const [dragCurrent, setDragCurrent] = useState<CellPosition | null>(null);
  const [focusedCell, setFocusedCell] = useState<CellPosition>({ dayIndex: 0, slotIndex: 0 });

  useEffect(() => {
    if (!blockMode) {
      setDragStart(null);
      setDragCurrent(null);
    }
  }, [blockMode]);

  const meetings = useMemo(
    () =>
      plan.courses.flatMap((course) =>
        course.meetings.map((meeting) => ({
          course,
          meeting,
        }))
      ),
    [plan]
  );

  useEffect(() => {
    const handleMouseUp = () => {
      if (!blockMode || !dragStart || !dragCurrent) return;
      if (dragStart.dayIndex !== dragCurrent.dayIndex) return;
      const dayIndex = dragStart.dayIndex;
      const minSlot = Math.min(dragStart.slotIndex, dragCurrent.slotIndex);
      const maxSlot = Math.max(dragStart.slotIndex, dragCurrent.slotIndex) + 1;
      const startMinutes = START_MINUTES + minSlot * SLOT_MINUTES;
      const endMinutes = START_MINUTES + maxSlot * SLOT_MINUTES;
      const startTime = minutesToTime(startMinutes);
      const endTime = minutesToTime(endMinutes);
      const day = DAYS[dayIndex];
      const label = window.prompt("Label for protected block", "Focus time");
      if (label !== null) {
        onAddProtectedBlock({ day, start: startTime, end: endTime, label: label || "Protected" });
      }
      setDragStart(null);
      setDragCurrent(null);
      setBlockMode(false);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [blockMode, dragStart, dragCurrent, onAddProtectedBlock]);

  const handleCellMouseDown = (dayIndex: number, slotIndex: number) => {
    if (!blockMode) return;
    setDragStart({ dayIndex, slotIndex });
    setDragCurrent({ dayIndex, slotIndex });
  };

  const handleCellMouseEnter = (dayIndex: number, slotIndex: number) => {
    if (!blockMode || !dragStart) return;
    if (dragStart.dayIndex !== dayIndex) return;
    setDragCurrent({ dayIndex, slotIndex });
  };

  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, position: CellPosition) => {
    const { key } = event;
    if (key === "ArrowRight") {
      event.preventDefault();
      setFocusedCell((prev) => ({ dayIndex: Math.min(prev.dayIndex + 1, DAYS.length - 1), slotIndex: prev.slotIndex }));
    } else if (key === "ArrowLeft") {
      event.preventDefault();
      setFocusedCell((prev) => ({ dayIndex: Math.max(prev.dayIndex - 1, 0), slotIndex: prev.slotIndex }));
    } else if (key === "ArrowDown") {
      event.preventDefault();
      setFocusedCell((prev) => ({ dayIndex: prev.dayIndex, slotIndex: Math.min(prev.slotIndex + 1, SLOT_COUNT - 1) }));
    } else if (key === "ArrowUp") {
      event.preventDefault();
      setFocusedCell((prev) => ({ dayIndex: prev.dayIndex, slotIndex: Math.max(prev.slotIndex - 1, 0) }));
    } else if (key === "Enter" && blockMode) {
      event.preventDefault();
      const startMinutes = START_MINUTES + position.slotIndex * SLOT_MINUTES;
      const endMinutes = startMinutes + SLOT_MINUTES;
      const day = DAYS[position.dayIndex];
      const label = window.prompt("Label for protected block", "Focus time");
      if (label !== null) {
        onAddProtectedBlock({
          day,
          start: minutesToTime(startMinutes),
          end: minutesToTime(endMinutes),
          label: label || "Protected",
        });
      }
      setBlockMode(false);
    } else if (key === "Escape") {
      event.preventDefault();
      setBlockMode(false);
      setDragStart(null);
      setDragCurrent(null);
    }
  };

  const isCellSelected = (dayIndex: number, slotIndex: number) => {
    if (!dragStart || !dragCurrent) return false;
    if (dragStart.dayIndex !== dayIndex || dragCurrent.dayIndex !== dayIndex) return false;
    const minSlot = Math.min(dragStart.slotIndex, dragCurrent.slotIndex);
    const maxSlot = Math.max(dragStart.slotIndex, dragCurrent.slotIndex);
    return slotIndex >= minSlot && slotIndex <= maxSlot;
  };

  const renderMeetingBlock = (
    courseId: string,
    index: number,
    meeting: { day: Day; start: TimeString; end: TimeString; location?: string }
  ) => {
    const startMinutes = toMinutes(meeting.start) - START_MINUTES;
    const endMinutes = toMinutes(meeting.end) - START_MINUTES;
    const top = (startMinutes / TOTAL_MINUTES) * 100;
    const height = ((endMinutes - startMinutes) / TOTAL_MINUTES) * 100;
    const highlighted = highlightedCourseId === courseId;
    const conflict = meetingOverlapsProtected(meeting.day, meeting.start, meeting.end, protectedBlocks);

    return (
      <div
        key={`${courseId}-${index}`}
        className={cn(
          "absolute inset-x-1 rounded-xl border px-2 py-1 text-xs shadow-sm transition-all duration-300 ease-out",
          highlighted
            ? "border-brand-primary bg-brand-primary text-white"
            : conflict
            ? "border-brand-warn/60 bg-brand-warn/30 text-brand-text"
            : "border-brand-primary/30 bg-brand-primary/10 text-brand-text"
        )}
        style={{ top: `${top}%`, height: `${height}%` }}
        title={formatMeeting(meeting.day, meeting.start, meeting.end, meeting.location)}
        onClick={(event) => {
          event.stopPropagation();
          onHighlightCourse(highlighted ? undefined : courseId);
        }}
        onMouseEnter={() => onHighlightCourse(courseId)}
        onMouseLeave={() => onHighlightCourse(undefined)}
      >
        <p className={cn("text-[11px] font-semibold", highlighted ? "text-white" : "text-brand-primary")}
          {plan.courses.find((course) => course.courseId === courseId)?.courseCode}
        </p>
        <p className={cn("text-[10px]", highlighted ? "text-white/80" : "text-brand-text/70")}
          {meeting.start}–{meeting.end}
        </p>
        {meeting.location && (
          <p className={cn("text-[10px]", highlighted ? "text-white/70" : "text-brand-text/60")}>{meeting.location}</p>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-primary/10 bg-white shadow-md transition-all duration-300 ease-out">
      <header className="flex items-center justify-between border-b border-brand-primary/10 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-primary">Weekly Plan</h2>
          <p className="text-xs text-brand-text/60">
            Preview meetings and reserve time for priorities.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBlockMode((value) => !value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 ease-out",
            blockMode
              ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
              : "border-brand-primary/20 text-brand-text/70 hover:border-brand-primary/40 hover:text-brand-primary"
          )}
        >
          {blockMode ? "Finish block" : "Block time"}
        </button>
      </header>
      <div className="relative flex-1 overflow-hidden" ref={containerRef}>
        <div className="grid h-full w-full grid-cols-[60px_repeat(5,_1fr)] text-xs">
          <div className="sticky top-0 z-20 bg-brand-bg" />
          {DAYS.map((day) => (
            <div
              key={`header-${day}`}
              className="sticky top-0 z-20 border-l border-brand-primary/10 bg-brand-bg p-2 text-center font-semibold text-brand-text"
            >
              {DAY_LABELS[day]}
            </div>
          ))}
          {Array.from({ length: SLOT_COUNT }).map((_, slotIndex) => {
            const label = slotIndex % 2 === 0 ? minutesToTime(START_MINUTES + slotIndex * SLOT_MINUTES) : "";
            return (
              <div key={`row-${slotIndex}`} className="contents">
                <div
                  className={cn(
                    "flex items-start justify-end border-t border-brand-primary/10 p-2 pr-3 text-brand-text/60",
                    slotIndex === 0 && "border-t-0"
                  )}
                >
                  {label}
                </div>
                {DAYS.map((day, dayIndex) => (
                  <div
                    key={`${day}-${slotIndex}`}
                    role="gridcell"
                    tabIndex={
                      focusedCell.dayIndex === dayIndex && focusedCell.slotIndex === slotIndex ? 0 : -1
                    }
                    onFocus={() => setFocusedCell({ dayIndex, slotIndex })}
                    onKeyDown={(event) => handleCellKeyDown(event, { dayIndex, slotIndex })}
                    onMouseDown={() => handleCellMouseDown(dayIndex, slotIndex)}
                    onMouseEnter={() => handleCellMouseEnter(dayIndex, slotIndex)}
                    className={cn(
                      "relative border-l border-t border-brand-primary/10 transition-colors duration-200 ease-out",
                      slotIndex === 0 && "border-t-0",
                      blockMode && "cursor-crosshair",
                      isCellSelected(dayIndex, slotIndex) && "bg-brand-primary/10"
                    )}
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-0 grid grid-cols-[60px_repeat(5,_1fr)]">
          <div />
          {DAYS.map((day) => (
            <div key={`layer-${day}`} className="relative">
              {meetings
                .filter(({ meeting }) => meeting.day === day)
                .map(({ course, meeting }, index) =>
                  renderMeetingBlock(course.courseId, index, meeting)
                )}
              {protectedBlocks
                .filter((block) => block.day === day)
                .map((block, index) => {
                  const start = toMinutes(block.start) - START_MINUTES;
                  const end = toMinutes(block.end) - START_MINUTES;
                  const top = (start / TOTAL_MINUTES) * 100;
                  const height = ((end - start) / TOTAL_MINUTES) * 100;
                  return (
                  <div
                    key={`protected-${block.day}-${index}`}
                    className="absolute inset-x-1 rounded-xl border border-brand-warn/60 bg-brand-warn/40 px-2 py-1 text-[10px] font-semibold text-brand-text"
                    style={{ top: `${top}%`, height: `${height}%` }}
                    title={`${DAY_LABELS[block.day]} ${block.start}-${block.end}`}
                  >
                    {block.label ?? "Protected"}
                  </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
