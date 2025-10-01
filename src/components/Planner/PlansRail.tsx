"use client";

import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Info, Lock, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toMinutes } from "@/lib/time";
import type { Day, TimeString } from "@/types/catalog";

export interface PlanMeeting {
  day: Day;
  start: TimeString;
  end: TimeString;
  location?: string;
}

export interface PlanCourseAlternate {
  id: string;
  section: string;
  meetings: PlanMeeting[];
  location?: string;
  scoreDelta: number;
  label: string;
  why: string;
  capacity?: number;
  enrolled?: number;
  spotsLeft?: number;
  lowCapacity?: boolean;
}

export interface PlanCourse {
  courseId: string;
  courseCode: string;
  title: string;
  section?: string;
  credits: number;
  meetings: PlanMeeting[];
  location?: string;
  groups: string[];
  why: string;
  alternates: PlanCourseAlternate[];
  locked?: boolean;
  capacity?: number;
  enrolled?: number;
  spotsLeft?: number;
  lowCapacity?: boolean;
  lockConflictReason?: string;
}

export interface PlannerPlan {
  id: string;
  label: string;
  description: string;
  score: number;
  explainers: string[];
  groupProgress: Record<string, number>;
  courses: PlanCourse[];
}

interface PlansRailProps {
  plans: PlannerPlan[];
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
  highlightedGroupId?: string;
  highlightedCourseId?: string;
  onHighlightCourse: (courseId?: string) => void;
  onSwapSection: (planId: string, courseId: string, optionId: string) => void;
  onToggleLock: (courseId: string) => void;
  lockedCourseIds: string[];
}

export function PlansRail({
  plans,
  selectedPlanId,
  onSelectPlan,
  highlightedGroupId,
  highlightedCourseId,
  onHighlightCourse,
  onSwapSection,
  onToggleLock,
  lockedCourseIds,
}: PlansRailProps) {
  const lockedSet = useMemo(() => new Set(lockedCourseIds), [lockedCourseIds]);
  const [swapTarget, setSwapTarget] = useState<{ planId: string; courseId: string } | null>(null);

  const activePlan = swapTarget ? plans.find((plan) => plan.id === swapTarget.planId) : undefined;
  const activeCourse = swapTarget && activePlan
    ? activePlan.courses.find((course) => course.courseId === swapTarget.courseId)
    : undefined;

  const handlePlanKeyDown = (event: KeyboardEvent<HTMLDivElement>, planId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectPlan(planId);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-brand-primary/10 bg-white p-5 shadow-md transition-all duration-300 ease-out">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-primary">Recommended Plans</h2>
          <p className="text-xs text-brand-text/60">Tap a plan to update requirement progress.</p>
        </div>
      </header>
      <div className="space-y-4">
        {plans.map((plan) => {
          const isSelected = plan.id === selectedPlanId;
          return (
            <div
              key={plan.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => onSelectPlan(plan.id)}
              onKeyDown={(event) => handlePlanKeyDown(event, plan.id)}
              className={cn(
                "rounded-2xl border border-brand-primary/10 bg-white p-4 shadow-md transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
                isSelected
                  ? "border-brand-primary ring-1 ring-brand-primary/40"
                  : "hover:border-brand-primary/40 hover:shadow-lg"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-brand-text/60">{plan.label}</p>
                  <p className="text-sm font-semibold text-brand-text">{plan.description}</p>
                </div>
                <div className="rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white shadow">Score {plan.score}</div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-brand-text/65">
                {plan.explainers.slice(0, 3).map((explainer, index) => (
                  <li key={`${plan.id}-explainer-${index}`} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-accent" aria-hidden />
                    <span>{explainer}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-4 space-y-3">
                {plan.courses.map((course) => {
                  const courseInGroup = highlightedGroupId ? course.groups.includes(highlightedGroupId) : true;
                  const isCourseHighlighted = highlightedCourseId === course.courseId;
                  const isLocked = lockedSet.has(course.courseId);
                  const scheduleLabel = formatSchedule(course.meetings);
                  const primaryLocation = course.location ?? course.meetings[0]?.location;
                  const seatBadge = course.lowCapacity ? formatSeatLabel(course.spotsLeft) : undefined;
                  const lockTooltip = course.lockConflictReason
                    ? `${course.lockConflictReason}. Unlock to proceed`
                    : isLocked
                    ? "Unlock course"
                    : "Lock course";

                  const otherSlots = plan.courses
                    .filter((other) => other.courseId !== course.courseId)
                    .flatMap((other) => other.meetings.map(meetingToSlot));

                  const nonConflictingAlternates = course.alternates
                    .filter((alternate) => !hasConflicts(alternate.meetings, otherSlots))
                    .sort((a, b) => (plan.score + b.scoreDelta) - (plan.score + a.scoreDelta));

                  const autoSwapContent = (() => {
                    if (course.alternates.length === 0) {
                      return null;
                    }
                    if (isLocked) {
                      return (
                        <p className="mt-3 flex items-center gap-1 text-[11px] text-brand-text">
                          <Lock className="h-3 w-3 text-brand-warn" /> Unlock to auto-swap.
                        </p>
                      );
                    }
                    if (nonConflictingAlternates.length === 0) {
                      return (
                        <p className="mt-3 text-[11px] text-brand-text/60">
                          All alternates conflict with this plan.
                        </p>
                      );
                    }
                    return (
                      <div className="mt-3">
                        <Select
                          key={`${plan.id}-${course.courseId}-${course.section}`}
                          onValueChange={(value) => {
                            onSwapSection(plan.id, course.courseId, value);
                          }}
                        >
                          <SelectTrigger className="h-8 w-full rounded-full border-brand-primary/20 bg-white text-xs text-brand-text">
                            <SelectValue placeholder="Auto-swap (no conflicts)" />
                          </SelectTrigger>
                          <SelectContent>
                            {nonConflictingAlternates.map((alternate) => {
                              const newScore = Math.round(plan.score + alternate.scoreDelta);
                              const seatLabel =
                                alternate.spotsLeft !== undefined ? formatSeatLabel(alternate.spotsLeft) : undefined;
                              const parts = [alternate.label, `Score ${newScore}`];
                              if (seatLabel) {
                                parts.push(seatLabel);
                              }
                              if (alternate.lowCapacity && !seatLabel) {
                                parts.push("Low seats");
                              }
                              return (
                                <SelectItem
                                  key={alternate.id}
                                  value={alternate.id}
                                  className="text-xs text-brand-text hover:!bg-brand-primary/10"
                                >
                                  {parts.join(" · ")}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })();

                  return (
                    <li
                      key={`${plan.id}-${course.courseId}`}
                      tabIndex={0}
                      className={cn(
                        "rounded-xl border border-brand-primary/10 bg-brand-primary/5 px-3 py-2 text-left shadow-sm transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
                        highlightedGroupId && !courseInGroup && "opacity-50",
                        highlightedGroupId && courseInGroup && "border-brand-primary/60",
                        isCourseHighlighted && "ring-2 ring-brand-primary",
                        isLocked && "border-brand-warn bg-brand-warn/20"
                      )}
                      onMouseEnter={(event) => {
                        event.stopPropagation();
                        onHighlightCourse(course.courseId);
                      }}
                      onFocus={() => onHighlightCourse(course.courseId)}
                      onMouseLeave={(event) => {
                        event.stopPropagation();
                        onHighlightCourse(undefined);
                      }}
                      onBlur={() => onHighlightCourse(undefined)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-brand-text">
                              {course.courseCode}
                              {course.section ? ` · ${course.section}` : ""}
                            </p>
                            <span
                              className="text-brand-primary/70"
                              title={course.why}
                              aria-label="Why this pick?"
                              role="img"
                            >
                              <Info className="h-4 w-4" />
                            </span>
                            {isLocked && (
                              <span className="rounded-sm bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary">
                                Locked
                              </span>
                            )}
                            {seatBadge && (
                              <span className="inline-flex items-center gap-1 rounded-sm bg-brand-warn/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-text">
                                <AlertTriangle className="h-3 w-3" />
                                {seatBadge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-brand-text/70">{course.title}</p>
                          <p className="text-[11px] text-brand-text/60">{scheduleLabel}</p>
                          {primaryLocation && (
                            <p className="text-[11px] text-brand-text/55">{primaryLocation}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            type="button"
                            variant={isLocked ? "secondary" : "ghost"}
                            size="icon"
                            aria-pressed={isLocked}
                            aria-label={isLocked ? "Unlock course" : "Lock course"}
                            title={lockTooltip}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleLock(course.courseId);
                            }}
                          >
                            {isLocked ? (
                              <Lock className="h-4 w-4 text-brand-primary" />
                            ) : (
                              <Unlock className="h-4 w-4 text-brand-primary transition-colors duration-200 ease-out hover:text-brand-accent" />
                            )}
                          </Button>
                          {course.alternates.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSwapTarget({ planId: plan.id, courseId: course.courseId });
                              }}
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                              Swap section
                            </Button>
                          )}
                        </div>
                      </div>
                      {isLocked && course.lockConflictReason ? (
                        <div className="mt-3 rounded-md border border-brand-warn/60 bg-brand-warn/30 px-2 py-1 text-[11px] text-brand-text">
                          <div className="flex items-start gap-1">
                            <AlertTriangle className="mt-0.5 h-3 w-3 text-brand-warn" />
                            <span>{course.lockConflictReason}</span>
                          </div>
                          <button
                            type="button"
                            className="mt-1 text-[11px] font-semibold text-brand-primary underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleLock(course.courseId);
                            }}
                          >
                            Unlock to proceed
                          </button>
                        </div>
                      ) : null}
                      {autoSwapContent}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <Dialog
        open={Boolean(swapTarget && activeCourse)}
        onOpenChange={(open) => {
          if (!open) {
            setSwapTarget(null);
          }
        }}
      >
        {activeCourse && activePlan && (
          <DialogContent className="max-w-md rounded-2xl border border-brand-primary/10 bg-white shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-brand-primary">Swap section for {activeCourse.courseCode}</DialogTitle>
              <DialogDescription className="text-brand-text/70">
                Choose an alternate section to update the {activePlan.label.toLowerCase()} plan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl bg-brand-primary/5 p-3 text-xs text-brand-text/75">
                <p className="font-semibold text-brand-primary">Current section</p>
                <p>{`Sec ${activeCourse.section ?? ""} · ${formatSchedule(activeCourse.meetings)}`}</p>
                <p className="text-brand-text/60">{activeCourse.why}</p>
              </div>
              <div className="space-y-2">
                {activeCourse.alternates.length === 0 && (
                  <p className="text-xs text-brand-text/60">No alternate sections available.</p>
                )}
                {activeCourse.alternates.map((alternate) => (
                  <button
                    key={alternate.id}
                    type="button"
                    className={cn(
                      "w-full rounded-xl border border-brand-primary/20 bg-white p-3 text-left text-sm shadow-sm transition-all duration-200 ease-out hover:border-brand-primary hover:bg-brand-primary/5",
                      alternate.scoreDelta > 0 ? "ring-1 ring-brand-accent/40" : undefined
                    )}
                    onClick={() => {
                      onSwapSection(activePlan.id, activeCourse.courseId, alternate.id);
                      setSwapTarget(null);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-brand-text">{alternate.label}</span>
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          alternate.scoreDelta > 0
                            ? "text-brand-accent"
                            : alternate.scoreDelta < 0
                            ? "text-brand-warn"
                            : "text-brand-text/60"
                        )}
                      >
                        {alternate.scoreDelta > 0 ? `+${alternate.scoreDelta}` : alternate.scoreDelta}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-brand-text/60">{alternate.why}</p>
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSwapTarget(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function formatSchedule(meetings: PlanMeeting[]): string {
  return meetings.map((meeting) => `${meeting.day} ${meeting.start}-${meeting.end}`).join(" · ");
}

type MeetingSlot = { day: Day; start: number; end: number };

function meetingToSlot(meeting: PlanMeeting): MeetingSlot {
  return {
    day: meeting.day,
    start: toMinutes(meeting.start),
    end: toMinutes(meeting.end),
  };
}

function hasConflicts(meetings: PlanMeeting[], slots: MeetingSlot[]): boolean {
  return meetings.some((meeting) => {
    const candidate = meetingToSlot(meeting);
    return slots.some(
      (slot) => slot.day === candidate.day && intervalsOverlap(slot.start, slot.end, candidate.start, candidate.end)
    );
  });
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function formatSeatLabel(spotsLeft?: number): string {
  if (spotsLeft === undefined) return "Low seats";
  if (spotsLeft <= 0) return "Waitlist likelihood";
  if (spotsLeft === 1) return "1 seat left";
  return `${spotsLeft} seats left`;
}
