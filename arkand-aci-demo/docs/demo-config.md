# Demo configuration

Generated on: 2025-09-04

- Repository: Arkand-ACI-Demo (branch: main)
- Commit: 5099b18
- App path: `aci-chatbot/`

## Environment variables (aci-chatbot/.env.local)

Values are redacted; only presence is shown.

- OPENAI_API_KEY: set
- DEMO_PASSWORD: set
- DEMO_EXPIRY: not set
- DEMO_DAILY_CAP: not set (defaults to 100/day/IP)

Notes

- You can also configure these in Vercel → Project Settings → Environment Variables.
- The API reads `DEMO_EXPIRY` to display the demo expiry banner text.
- The chat API enforces the daily cap via `DEMO_DAILY_CAP` (per-IP; default 100 if not set).

## Rate limit

- Daily cap: 100 requests per IP (from `DEMO_DAILY_CAP` or default)
- 429 message: "Daily demo limit reached. Try again tomorrow or contact Arkand AI for full access."

## Expiry date

- No expiry configured (`DEMO_EXPIRY` not set).

## Quick commands

Run these from the repo root unless noted.

Re-run ingest (indexes `data/aci/*.md` into Chroma):

```bash
cd aci-chatbot
pnpm ingest
```

Redeploy to production (Vercel):

```bash
# Optional: pull env vars for production locally
cd aci-chatbot
pnpm dlx vercel pull --yes --environment=production

# Deploy current commit to production
pnpm dlx vercel deploy --prod
```

If the project isn’t linked yet, you may need to run:

```bash
cd aci-chatbot
pnpm dlx vercel link
```
