"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";

import type { PlannerPlan } from "@/components/Planner/PlansRail";
import type { RequirementTreeItem } from "@/components/Planner/RequirementTree";
import { cn } from "@/lib/utils";
import { toMinutes } from "@/lib/time";
import type { Day, Preferences } from "@/types/catalog";

const STATUS_MAP = {
  green: {
    label: "On track",
    className: "border border-brand-accent/50 bg-brand-accent/15 text-brand-primary",
    icon: Sparkles,
  },
  amber: {
    label: "Optimize",
    className: "border border-brand-warn/60 bg-brand-warn/25 text-brand-text",
    icon: AlertTriangle,
  },
  red: {
    label: "Conflicts",
    className: "border border-red-300 bg-red-100 text-red-700",
    icon: AlertTriangle,
  },
} as const;

export type ConflictStatus = keyof typeof STATUS_MAP;

interface ConflictMeterProps {
  plan?: PlannerPlan;
  prefs: Preferences;
  requirements: RequirementTreeItem[];
  benchmarkScore?: number;
  scoreTolerance?: number;
}

export function ConflictMeter({
  plan,
  prefs,
  requirements,
  benchmarkScore,
  scoreTolerance = 6,
}: ConflictMeterProps) {
  const evaluation = useMemo(() => evaluatePlan(plan, prefs, requirements, benchmarkScore, scoreTolerance), [
    plan,
    prefs,
    requirements,
    benchmarkScore,
    scoreTolerance,
  ]);

  const { status, conflictCount, unmetRequirements, scoreGap, scoreLabel } = evaluation;
  const info = STATUS_MAP[status];
  const [hasCelebrated, setHasCelebrated] = useState(false);

  useEffect(() => {
    if (status === "green" && !hasCelebrated) {
      setHasCelebrated(true);
      void import("canvas-confetti")
        .then(({ default: confetti }) => {
          confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.7 },
            decay: 0.92,
          });
        })
        .catch(() => {
          // Intentionally ignore confetti load failures.
        });
    }
  }, [status, hasCelebrated]);

  const detail = useMemo(() => {
    if (status === "red") {
      if (conflictCount > 0 && unmetRequirements > 0) {
        return `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}, ${unmetRequirements} req left`;
      }
      if (conflictCount > 0) {
        return `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}`;
      }
      if (unmetRequirements > 0) {
        return `${unmetRequirements} requirement${unmetRequirements === 1 ? "" : "s"} open`;
      }
      return "Check constraints";
    }

    if (status === "amber") {
      return scoreGap > 0 ? `Improve score by ${scoreGap.toFixed(0)}+` : scoreLabel;
    }

    return scoreLabel;
  }, [status, conflictCount, unmetRequirements, scoreGap, scoreLabel]);

  const Icon = info.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition-all duration-200 ease-out",
        info.className,
        status === "green" ? "shadow-brand-accent/40 ring-1 ring-brand-accent/40" : ""
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{info.label}</span>
      {detail ? <span className="text-[11px] font-medium text-current/80">{detail}</span> : null}
    </span>
  );
}

function evaluatePlan(
  plan: PlannerPlan | undefined,
  prefs: Preferences,
  requirements: RequirementTreeItem[],
  benchmarkScore: number | undefined,
  scoreTolerance: number
): {
  status: ConflictStatus;
  conflictCount: number;
  unmetRequirements: number;
  scoreGap: number;
  scoreLabel: string;
} {
  if (!plan) {
    return {
      status: "red",
      conflictCount: 0,
      unmetRequirements: requirements.filter((req) => req.total > 0).length,
      scoreGap: 0,
      scoreLabel: "",
    };
  }

  const meetings = plan.courses.flatMap((course) =>
    course.meetings.map((meeting) => ({
      day: meeting.day,
      start: toMinutes(meeting.start),
      end: toMinutes(meeting.end),
    }))
  );

  let conflictCount = 0;

  const daysOff = new Set(prefs.daysOff ?? []);
  const protectedBlocks = prefs.protectedBlocks ?? [];
  const earliest = prefs.earliest ? toMinutes(prefs.earliest) : null;
  const latest = prefs.latest ? toMinutes(prefs.latest) : null;

  // Time conflicts within the schedule.
  const dayBuckets = new Map<Day, Array<{ start: number; end: number }>>();
  meetings.forEach((meeting) => {
    if (!dayBuckets.has(meeting.day)) {
      dayBuckets.set(meeting.day, []);
    }
    const bucket = dayBuckets.get(meeting.day)!;
    const overlaps = bucket.some((slot) => overlapsRange(slot.start, slot.end, meeting.start, meeting.end));
    if (overlaps) {
      conflictCount += 1;
    }
    bucket.push({ start: meeting.start, end: meeting.end });
  });

  // Protected blocks & days off.
  meetings.forEach((meeting) => {
    if (daysOff.has(meeting.day)) {
      conflictCount += 1;
    }

    const violatesBlock = protectedBlocks.some((block) =>
      block.day === meeting.day && overlapsRange(toMinutes(block.start), toMinutes(block.end), meeting.start, meeting.end)
    );
    if (violatesBlock) {
      conflictCount += 1;
    }

    if (earliest !== null && meeting.start < earliest) {
      conflictCount += 1;
    }

    if (latest !== null && meeting.end > latest) {
      conflictCount += 1;
    }
  });

  const unmetRequirements = requirements.filter((requirement) => {
    if (requirement.total <= 0) return false;
    const progress = plan.groupProgress[requirement.id] ?? 0;
    return progress < requirement.total;
  }).length;

  if (conflictCount > 0 || unmetRequirements > 0) {
    return {
      status: "red",
      conflictCount,
      unmetRequirements,
      scoreGap: 0,
      scoreLabel: `Score ${plan.score}`,
    };
  }

  const bestScore = Math.max(plan.score, benchmarkScore ?? 0);
  const threshold = Math.max(0, bestScore - scoreTolerance);
  const meetsScore = plan.score >= threshold;
  const scoreGap = meetsScore ? 0 : Math.max(0, threshold - plan.score);

  return {
    status: meetsScore ? "green" : "amber",
    conflictCount,
    unmetRequirements,
    scoreGap,
    scoreLabel: `Score ${plan.score}${benchmarkScore ? ` / ${Math.round(bestScore)}` : ""}`,
  };
}

function overlapsRange(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
