# Advisorly

A modern Next.js 14 starter that pairs the App Router with TypeScript, Tailwind CSS, and an opinionated linting + formatting toolkit.

## Requirements

- Node.js 18.18+ or 20+
- pnpm 8+ (alternatively npm or yarn)

## Getting Started

```bash
pnpm install
pnpm dev
```

Visit http://localhost:3000 to see the landing page. Edits under `src/` are hot-reloaded during development.

## Available Scripts

| Script        | Description                                          |
| ------------- | ---------------------------------------------------- |
| `pnpm dev`    | Start the development server.                        |
| `pnpm build`  | Create an optimized production build.                |
| `pnpm start`  | Run the production build locally.                    |
| `pnpm lint`   | Run ESLint using the Next.js configuration.          |
| `pnpm format` | Format the codebase with Prettier + Tailwind plugin. |

## Tooling Highlights

- **Next.js 14 App Router** with a minimal hero page in `src/app/page.tsx`.
- **Tailwind CSS** configured via `tailwind.config.ts`, powered by PostCSS and Autoprefixer.
- **TypeScript** strict mode plus absolute imports using the `@/*` alias (`tsconfig.json`).
- **ESLint + Prettier** tuned for Next.js and Tailwind-aware formatting (`eslint.config.mjs`, `prettier.config.mjs`).

## Project Structure

```
.
├── public/           # Static assets served as-is
├── src/
│   ├── app/          # App Router routes, layout, and global styles
│   └── lib/          # Shared utilities imported via @/lib
├── tailwind.config.ts
└── postcss.config.mjs
```

## Next Steps

- Update the landing content in `src/app/page.tsx` to match your product messaging.
- Extend `tailwind.config.ts` with your design tokens and component patterns.
- Introduce new routes under `src/app/` or colocate components alongside route segments as needed.

## Environment Variables

Create a `.env.local` (or configure in Vercel) with the following keys:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase web API key. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project ID. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase storage bucket. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase messaging sender ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase web app ID. |
| `AI_ENABLED` | Optional | Set to `true` to enable the Advisor AI endpoint. |
| `OFFLINE_MODE` | Optional | Set to `true` to default the UI into offline/demo mode. |
| `OPENAI_API_KEY` | Optional | Required only when `AI_ENABLED=true` and you want LLM-powered rationales. |

All variables have example placeholders in `.env.example`.

## Demo PIN

Use PIN `4242` for the internal demo flows that expect quick student sign-in.

## Deploying to Vercel

1. Install dependencies locally with `pnpm install` and confirm the build passes: `pnpm build && pnpm test`.
2. Create a new Vercel project and link this repository: `vercel link`.
3. In the Vercel dashboard, add the environment variables listed above in the *Production*, *Preview*, and *Development* environments as needed.
4. Deploy with `vercel --prod` or push to your main branch. The included `vercel.json` ensures API routes run on the Node.js runtime.
5. After deployment, visit `/admin/etl` to seed catalog data and `/onboarding` to confirm onboarding + planner flows.

## Demo Seed Data

Sample CSV/JSON payloads for the Spring 2026 term live in `src/data/seeds/spring-2026/`. They include five majors (Business, Computer Science, Biology, Psychology, Communication), a 60-course catalog, and 30 sections (with linked lab pairs and low-seat alerts) that load cleanly through the ETL console.

## Acceptance Checklist

- Seed data loads via `/admin/etl` and validates.
- Onboarding collects quiz + preferences + protected blocks.
- Generator returns Primary + Backups with explainers in <1s.
- Advisor Drawer refines prefs (rule-based); optional AI endpoint works behind flag.
- WeekCalendar supports drag-to-block; PlansRail supports lock/swap; ConflictMeter hits GREEN.
- PDF and ICS exports download successfully.
- Works offline with cached catalog; Web Worker keeps UI smooth.
- Tests pass; a11y clean; deployable on Vercel.
