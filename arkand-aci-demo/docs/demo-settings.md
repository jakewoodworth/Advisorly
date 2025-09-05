# Demo settings

Configure the demo controls via environment variables (local `.env` or Vercel dashboard envs):

```
DEMO_PASSWORD=••••••••••
DEMO_EXPIRY=2025-10-15
DEMO_DAILY_CAP=100
```

- DEMO_PASSWORD: simple gate for the demo login page.
- DEMO_EXPIRY: ISO date (YYYY-MM-DD). Use it in your UI banner to show the demo end date.
- DEMO_DAILY_CAP: per-IP daily request limit for `/api/chat` (default 100).

Notes

- On Vercel, set these in Project Settings → Environment Variables.
- Locally, place them in `aci-chatbot/.env.local` or repo root `.env` as needed.
- The chat API returns 429 with: “Daily demo limit reached. Try again tomorrow or contact Arkand AI for full access.” when the cap is exceeded.
