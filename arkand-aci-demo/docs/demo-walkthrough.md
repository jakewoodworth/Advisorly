# ACI-NA Chatbot — Demo Walkthrough Script

This script guides a short live walkthrough of the demo: banner, login, asking questions, feedback, rate limiting, info panel, and expiry message.

## 1) Intro banner

- Navigate to `/demo` (or the root and then to Demo).
- Point out the top banner: “Demo — Internal Evaluation Only. Answers do not include sources.”
- Note the sticky footer: “Demonstration by Arkand AI (Woodworth Group LLC)…”.
- If set, mention the banner’s expiry note: “Demo access expires on <DATE>.”

## 2) Login flow

- Attempt to visit `/demo` directly.
  - Show redirect to `/demo-login`.
- Enter the password (from env) and submit.
  - You should land on `/demo` with access.

## 3) Ask 3–4 sample questions

Use the “Try this” chips or type them manually. Highlight fast answers and no citations.

- “What’s included with registration?”
- “What’s the refund policy?”
- “How do I sponsor an event?”
- Optional: an off-topic or unknown question to show the “I don’t know” behavior.

Callouts:

- Enter sends; Shift+Enter inserts a newline.
- Typing indicator appears while answering.
- No source links or citations are shown in responses.

## 4) Thumbs feedback

- After an answer, click 👍 or 👎 under the assistant message.
- Mention feedback is recorded to a JSONL log file for later review.

## 5) Rate limit warning

- Explain the demo rate limit (~100 requests/day/IP).
- If you hit the limit, point out the friendly notice with remaining time (“try again in about N hour(s)”).

## 6) Info panel

- Toggle “ℹ️ About this Demo”.
- Read the bullets:
  - “This demo is hosted by Arkand AI”
  - “Answers are limited to public conference FAQs”
  - “No sources or private data included”
  - “Production version includes full content + integrations.”

## 7) Expiry message (if past deadline)

- If today is after the expiry date, the chat is disabled and shows:
  - “This demo has expired. Contact Arkand AI for a full version.”

## 8) Close

- Summarize the scope and next steps.
- “This is a demo; production version adds more data + integrations.”
