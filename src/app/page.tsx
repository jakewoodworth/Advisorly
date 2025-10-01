"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { highlights } from "@/lib/constants";

export default function Home() {
  const router = useRouter();
  const [isScriptOpen, setIsScriptOpen] = useState(false);
  const year = new Date().getFullYear();

  const checklist = [
    "Open the onboarding wizard and load the demo student.",
    "Show the degree + course completion view.",
    "Take the interest quiz and highlight the score preview.",
    "Adjust scheduling preferences and explain protected blocks.",
    "Generate plans and walk through conflicts vs. exports.",
  ];

  const handleStartDemo = () => {
    setIsScriptOpen(false);
    router.push("/onboarding?demo=1");
  };

  return (
    <main className="flex min-h-screen flex-col">
      <section className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
        <div className="space-y-6">
          <span className="inline-flex items-center rounded-full bg-brand-primary/10 px-3 py-1 text-sm font-semibold text-brand-primary ring-1 ring-inset ring-brand-primary/20">
            👋 Welcome to Advisorly
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-brand-primary md:text-5xl">
            Kickstart your next project in minutes.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-brand-text/80">
            A batteries-included Next.js 14 starter focused on TypeScript, clean linting defaults,
            and a polished Tailwind design system.
          </p>
        </div>

        <div className="flex flex-col gap-4 text-left md:flex-row md:items-start md:justify-center">
          <div className="rounded-2xl border border-brand-primary/10 bg-white p-6 shadow-md">
            <h2 className="text-base font-semibold text-brand-primary">Highlights</h2>
            <ul className="mt-4 space-y-2 text-sm text-brand-text/75">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span aria-hidden className="text-brand-primary/40">
                    •
                  </span>
                  <span className="text-brand-text/85">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="https://nextjs.org/docs"
              className="inline-flex items-center justify-center rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white shadow-md transition-colors duration-200 ease-out hover:bg-brand-primary/90"
            >
              Read the Next.js docs
            </Link>
            <Link
              href="https://tailwindcss.com/docs"
              className="inline-flex items-center justify-center rounded-full border border-brand-primary/20 px-5 py-3 text-sm font-semibold text-brand-primary transition-colors duration-200 ease-out hover:border-brand-primary/40 hover:bg-brand-primary/10"
            >
              Explore Tailwind CSS
            </Link>
            <button
              type="button"
              onClick={() => setIsScriptOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-brand-primary/20 bg-brand-primary/5 px-5 py-3 text-sm font-semibold text-brand-primary transition-colors duration-200 ease-out hover:border-brand-primary/40 hover:bg-brand-primary/10"
            >
              View Demo Script
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-brand-primary/10 bg-white py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 text-sm text-brand-text/70">
          <span>© {year} Advisorly. All rights reserved.</span>
          <Link href="https://github.com/vercel/next.js" className="hover:text-brand-primary/80">
            View Next.js on GitHub
          </Link>
        </div>
      </footer>

      {isScriptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-primary/20 px-4 py-6 transition-opacity duration-300 ease-out">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl transition-all duration-300 ease-out">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary">
                  Presenter Guide
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-brand-primary">Demo Script</h2>
                <p className="mt-2 text-sm text-brand-text/70">
                  Hit these beats to show Advisorly end-to-end in under five minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScriptOpen(false)}
                className="rounded-full border border-brand-primary/20 px-3 py-1 text-sm font-semibold text-brand-text/70 transition-colors duration-200 ease-out hover:border-brand-primary/40 hover:text-brand-primary"
              >
                Close
              </button>
            </div>

            <ol className="mt-6 space-y-3 text-left text-sm text-brand-text/85">
              {checklist.map((item, index) => (
                <li key={item} className="flex items-start gap-3 rounded-xl border border-brand-primary/10 bg-brand-primary/5 px-4 py-3 transition-all duration-300 ease-out">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-semibold text-brand-primary">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsScriptOpen(false)}
                className="inline-flex items-center justify-center rounded-full border border-brand-primary/20 px-4 py-2 text-sm font-semibold text-brand-text/70 transition-colors duration-200 ease-out hover:border-brand-primary/40 hover:text-brand-primary"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleStartDemo}
                className="inline-flex items-center justify-center rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors duration-200 ease-out hover:bg-brand-primary/90"
              >
                Start Demo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
