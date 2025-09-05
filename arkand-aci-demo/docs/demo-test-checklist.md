# Demo Manual Test Checklist

Purpose: Verify the ACI-NA chatbot demo works end-to-end and UI/UX constraints are met.

## Prerequisites

- Environment variables are configured (e.g., OpenAI API key, demo password) and the app can run locally.
- Vector DB (Chroma) is running and the corpus has been ingested.
- Dev server is running and the app is accessible in a browser.

Note: Paths below are relative to `aci-chatbot/` unless stated otherwise.

## 1) Login flow works

- Navigate to `/demo`.
  - Expect: You’re redirected to the login screen.
- Enter the correct password and submit.
  - Expect: You’re redirected to `/demo`; a cookie (e.g., `demo_auth`) is set.
- Refresh the page.
  - Expect: You remain on `/demo` (still authenticated).
- Enter a wrong password and submit.
  - Expect: An error message is shown and you stay on the login page.

## 2) Chat returns answers (no sources)

- On `/demo`, type a question and send.
  - Expect: Assistant replies with an answer.
  - Expect: No source list, links, or citation artifacts appear (e.g., no bracketed [1], [source], or URLs).

## 3) No citations appear

- Read the assistant response content carefully.
  - Expect: It’s plain text, concise; does not include citations, links, or a references section.

## 4) Thumbs feedback logs to file

- After an assistant message appears, click 👍 or 👎 under that message.
  - Expect: The button disables (message marked as voted) and won’t accept a second vote.
- Inspect the feedback log at `logs/feedback.log.jsonl`.
  - Expect: A new JSONL entry is appended with fields like `messageId` and `vote` ("up" or "down").

## 5) Rate limit triggers at 100/day

- Option A (recommended for manual testing): Temporarily lower the limit in `src/app/api/chat/route.ts` from 100 to a small number (e.g., 2), save, and refresh.
  - Send messages until the limit is exceeded.
  - Expect: API responds with HTTP 429 and includes a `resetAt` timestamp.
  - Expect (UI): A friendly notice appears: “You’ve hit today’s limit. Please try again in about N hour(s).”
- Option B: Send >100 chat requests from the same IP in one day.
  - Expect same results as above after the 100th request.

## 6) Banner and sticky footer visible on mobile

- Open responsive/device mode in the browser DevTools (e.g., iPhone viewport).
  - Expect: Top demo banner is visible and readable (low-contrast, not overwhelming).
  - Expect: Sticky footer with the text “Demonstration by Arkand AI (Woodworth Group LLC). For internal evaluation only. Content limited.” is visible.
  - Expect: The footer does not overlap input controls; the input area remains fully usable.

## 7) Error + Retry flow works

- Simulate a network error (e.g., set browser devtools network to Offline) and send a question.
  - Expect: The assistant shows a compact error bubble with a Retry chip.
- Restore the network and click Retry.
  - Expect: The last user message is resent and a normal assistant answer appears.

## 8) Enter / Shift+Enter behaviors

- Focus the message textarea.
  - Press Enter.
    - Expect: Message is sent.
  - Press Shift+Enter.
    - Expect: A newline is inserted and the message is not sent.

## Optional checks

- Rate limit store file (if present) updates: `logs/ratelimit.json` reflects counts and reset timestamps.
- Chat logs are written (if enabled): `.logs/demo.log.jsonl` and/or `logs/demo.log.jsonl` grow with interactions.

---

If any step fails, capture the console/network error and the current commit SHA, then file an issue with reproduction steps.
