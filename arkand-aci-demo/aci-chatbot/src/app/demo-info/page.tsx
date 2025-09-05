import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demo Info – ACI‑NA Chatbot",
  description: "Scope, constraints, and upgrade path for the ACI‑NA chatbot demo.",
};

export default function DemoInfoPage() {
  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10 space-y-4 text-[15px] leading-6 text-neutral-800">
      <h1 className="text-2xl font-semibold tracking-tight">About this demo</h1>
      <p className="text-neutral-600">Quick overview of what’s included today and what a production rollout adds.</p>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Scope</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Conference FAQs only (curated content, limited coverage).</li>
          <li>No citations or links; concise answers only.</li>
          <li>No access to private or transactional systems.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Upgrade path</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Analytics and feedback dashboards.</li>
          <li>Admin UI to update content without code changes.</li>
          <li>Role‑aware answers (member, exhibitor, sponsor, staff).</li>
          <li>Optional iMIS integration for profile‑aware responses.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Notes</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Fallback when info isn’t in scope is explicit and consistent.</li>
          <li>Daily cap limits heavy use during trials.</li>
        </ul>
      </section>
    </main>
  );
}
