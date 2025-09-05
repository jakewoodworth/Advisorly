# ACI-NA Chatbot – 3‑Minute Loom Walkthrough

This script guides a short demo: login → banner/expiry → 3 questions → thumbs feedback → rate‑limit message → “About this demo” → production notes.

## Prep (before recording)

- Start the dev server: the app should be reachable at http://localhost:3000.
- Ensure OpenAI + Chroma are configured and ingestion completed.
- Clear previous rate limits if needed (or switch IP/VPN) so you can show one rate‑limit event at the end.
- Set your browser zoom to 100% and close noisy tabs.

## Script with timestamps (~3:00 total)

0:00 – 0:10 Intro

- Narration: “This is a quick tour of the ACI‑NA conference assistant demo. I’ll show login, a few typical questions, feedback, rate limiting, and where to learn more.”

0:10 – 0:30 Login

- Action: Navigate to the app. Show the login prompt.
- Enter the demo password and sign in.
- Narration: “The demo is protected with a simple password. In production you’d see SSO or your member portal login.”

0:30 – 0:45 Demo banner and expiry

- Action: Point to the demo banner/notice (include any expiry or limited‑scope text if visible).
- Narration: “This banner reminds users it’s a limited demo and where policy‑level answers live if not included.”

0:45 – 1:35 Three sample questions (one at a time)

- Q1: “What’s included with registration?”
  - Action: Ask the question. Wait for the answer.
  - Narration: “Answers are concise, sourced from curated FAQs, and avoid links/citations.”
- Q2: “What’s the refund policy?”
  - Action: Ask and briefly scan bullets.
  - Narration: “If dates or prices aren’t in context, the assistant gives the standard fallback and next steps.”
- Q3: “How do I sponsor an event?”
  - Action: Ask and highlight practical steps (e.g., where to inquire and typical info to include).
  - Narration: “Responses favor clear actions and next steps.”

1:35 – 1:55 Thumbs feedback

- Action: Click a thumbs up/down control for the last answer.
- Narration: “Quick thumbs feedback helps track usefulness and gaps for follow‑up.”

1:55 – 2:15 Rate‑limit message

- Action: Rapid‑fire a couple of requests or trigger the limit using a new tab. Show the rate‑limit response.
- Narration: “The demo rate‑limits heavy use to keep costs predictable. The message explains when you can try again.”

2:15 – 2:45 “About this demo” panel

- Action: Open the “About this demo”/info panel.
- Narration: “This panel explains scope, data sources, and the fallback: ‘I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.’”

2:45 – 3:00 Production notes and close

- Narration: “In production we’d add SSO, analytics, governance prompts, full event policies, and tighter rate limiting. Retrieval uses a vector index (Chroma) with OpenAI for embeddings and chat. Thanks for watching!”

## Suggested retakes / tips

- If an answer seems long, ask a shorter follow‑up to keep on time.
- If rate‑limit triggers too early, switch networks or wait and record that segment last.
- Keep the cursor calm. Zoom with Command+Plus only when needed.
