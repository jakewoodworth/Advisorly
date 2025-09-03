# ACI Demo: Corpus + Ingest Pipeline

This repo includes a simple pipeline to ingest Markdown FAQs into a Chroma vector DB using OpenAI embeddings.

## Add Markdown files
- Put files under `data/aci/`.
- Each file may include frontmatter:

---
title: My Doc Title
source: https://example.com/source
topic: my-topic
---

Content goes here...

## Environment
- Required: `OPENAI_API_KEY`
- Optional:
  - `CHROMA_PATH` (default `.chroma/aci`) – where your persisted vectors live on disk
  - `CHROMA_HOST` (default `localhost`) and `CHROMA_PORT` (default `8000`) if using a remote/local server

## Start Chroma (server mode)
Use Docker and mount the local persistence directory so data lands in `.chroma/aci`:

```bash
docker run -p 8000:8000 -v "$PWD/.chroma/aci:/chroma/chroma-data" ghcr.io/chroma-core/chroma:latest
```

## Install and ingest
Run these from the repo root:

```bash
pnpm install
export OPENAI_API_KEY="sk-..."
pnpm ingest
```

- The ingest script will:
  1) Read all `data/aci/*.md`
  2) Parse frontmatter (gray-matter)
  3) Convert markdown → plain text (remark)
  4) Chunk into ~800 chars (`lib/chunkMarkdown.ts`)
  5) Embed with OpenAI (text-embedding-3-small)
  6) Upsert into Chroma collection `aci_demo` with metadata { title, source, topic, file, chunk }

## Where vectors live
- Vectors persist under `.chroma/aci` (on your host) via the Docker volume mount shown above.

## Optional: quick search peek
Query the collection (requires the Chroma server to be running):

```bash
pnpm dlx tsx scripts/peek.ts "refund policy"
```

This prints top matches as JSON lines with `{ score, content, source }`.
