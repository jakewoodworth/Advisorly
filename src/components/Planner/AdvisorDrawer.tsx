"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { parseAdvice } from "@/lib/advisorRules";
import type { Preferences } from "@/types/catalog";

const QUICK_INTENTS: Array<{ label: string; text: string }> = [
  { label: "Avoid Fridays", text: "avoid Fridays" },
  { label: "Compact Days", text: "prefer compact days" },
  { label: "Heavier", text: "heavy term" },
  { label: "Earlier Start ≥ 10:00", text: "no classes before 10" },
];

export interface AdvisorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: Preferences;
  onPrefsChange: (prefs: Preferences) => void;
  regenerate: () => void;
  submitting?: boolean;
}

export function AdvisorDrawer({
  open,
  onOpenChange,
  prefs,
  onPrefsChange,
  regenerate,
  submitting = false,
}: AdvisorDrawerProps) {
  const [input, setInput] = useState("");

  const handleIntentClick = (text: string) => {
    setInput((prev) => (prev.trim().length ? `${prev.trim()} ${text}` : text));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim()) return;
    const updated = parseAdvice(input, prefs);
    onPrefsChange(updated);
    regenerate();
    setInput("");
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-2xl border border-brand-primary/10 bg-white shadow-xl transition-all duration-300 ease-out">
        <form onSubmit={handleSubmit} className="grid gap-6 p-6">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-brand-primary">Advisor Preferences</DrawerTitle>
            <DrawerDescription className="text-brand-text/70">
              Tell Advisorly how to adjust your schedule. We&apos;ll translate natural language into
              preference updates and refresh the plans.
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-brand-text" htmlFor="advisor-drawer-input">
              Tell Advisorly your constraints
            </label>
            <textarea
              id="advisor-drawer-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="e.g. avoid Fridays and no classes before 10"
              className="min-h-[120px] w-full rounded-xl border border-brand-primary/20 bg-white px-3 py-2 text-sm text-brand-text shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_INTENTS.map((intent) => (
                <Button
                  key={intent.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleIntentClick(intent.text)}
                  disabled={submitting}
                >
                  {intent.label}
                </Button>
              ))}
            </div>
          </div>

          <DrawerFooter className="mt-4 flex-row justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Updating…" : "Apply"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
