"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type RequirementMetric = "courses" | "credits";

export interface RequirementTreeItem {
  id: string;
  category: string;
  title: string;
  metric: RequirementMetric;
  completed: number;
  total: number;
}

interface RequirementTreeProps {
  items: RequirementTreeItem[];
  selectedGroupId?: string;
  onSelectGroup: (id?: string) => void;
}

export function RequirementTree({ items, selectedGroupId, onSelectGroup }: RequirementTreeProps) {
  const [celebrating, setCelebrating] = useState<Record<string, boolean>>({});
  const previousFulfilled = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const updates: Record<string, boolean> = {};
    const currentFulfilled: Record<string, boolean> = {};

    items.forEach((item) => {
      const isFulfilled = item.completed >= item.total;
      const wasFulfilled = previousFulfilled.current[item.id];
      currentFulfilled[item.id] = isFulfilled;

      if (isFulfilled && !wasFulfilled) {
        updates[item.id] = true;
        window.setTimeout(() => {
          setCelebrating((prev) => ({ ...prev, [item.id]: false }));
        }, 700);
      }
    });

    if (Object.keys(updates).length > 0) {
      setCelebrating((prev) => ({ ...prev, ...updates }));
    }

    previousFulfilled.current = currentFulfilled;
  }, [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, RequirementTreeItem[]>();
    items.forEach((item) => {
      if (!map.has(item.category)) {
        map.set(item.category, []);
      }
      map.get(item.category)!.push(item);
    });
    return Array.from(map.entries());
  }, [items]);

  const percentToGrad = useMemo(() => {
    const totals = items.reduce(
      (acc, item) => {
        acc.completed += Math.min(item.completed, item.total);
        acc.total += item.total;
        return acc;
      },
      { completed: 0, total: 0 }
    );
    if (totals.total === 0) return 0;
    return Math.min(100, Math.round((totals.completed / totals.total) * 100));
  }, [items]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-brand-primary/10 bg-white p-5 shadow-md transition-all duration-300 ease-out">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-primary">Requirements</h2>
          <p className="text-xs text-brand-text/70">Monitor how each plan satisfies your program.</p>
        </div>
        <div className="flex items-center gap-2 text-right text-xs text-brand-text/70">
          <div>
            <p className="font-semibold text-brand-primary">{percentToGrad}%</p>
            <p>Toward graduation</p>
          </div>
          <ProgressRing value={percentToGrad} size={44} strokeWidth={6} />
        </div>
      </header>
      <div className="space-y-6 text-sm">
        {grouped.map(([category, categoryItems]) => (
          <section key={category} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-text/60">{category}</h3>
            <div className="space-y-2">
              {categoryItems.map((item) => {
                const fulfilled = item.completed >= item.total;
                const percentage = Math.min(100, Math.round((item.completed / item.total) * 100));
                const selected = selectedGroupId === item.id;
                const celebrate = celebrating[item.id];

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectGroup(selected ? undefined : item.id)}
                    className={cn(
                      "flex w-full flex-col gap-2 rounded-xl border border-brand-primary/10 bg-white p-3 text-left shadow-sm transition-all duration-300 ease-out",
                      selected
                        ? "border-brand-primary shadow-md ring-1 ring-brand-primary/30"
                        : "hover:border-brand-primary/50 hover:shadow-md"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-brand-text">{item.title}</p>
                        <p className="text-xs text-brand-text/60">
                          {item.completed}/{item.total} {item.metric === "credits" ? "credits" : "courses"} fulfilled
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition",
                          fulfilled
                            ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                            : "border-brand-primary/20 bg-brand-primary/5 text-brand-primary/40",
                          celebrate ? "animate-pop" : ""
                        )}
                      >
                        ✓
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-brand-primary/10">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          fulfilled ? "bg-brand-accent" : "bg-brand-primary/70"
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <style jsx>{`
        @keyframes pop {
          0% {
            transform: scale(0.8);
            opacity: 0.4;
          }
          50% {
            transform: scale(1.25);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-pop {
          animation: pop 0.45s ease-out;
        }
      `}</style>
    </div>
  );
}

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
}

function ProgressRing({ value, size = 40, strokeWidth = 6 }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className="text-brand-primary/15"
      role="img"
      aria-label={`Progress ${value}%`}
    >
      <circle
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        className="origin-center -rotate-90 transform text-brand-accent transition-all duration-500 ease-out"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
    </svg>
  );
}
