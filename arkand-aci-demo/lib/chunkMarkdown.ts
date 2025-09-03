/**
 * Chunk Markdown into ~max-char segments while respecting headings, paragraphs,
 * code fences, and sentence boundaries where possible.
 */
export type Chunk = {
  id: string;
  content: string;
  tokens?: number; // approximate token count (chars/4)
};

/**
 * Create a stable 53-bit hash (cyrb53) for deterministic IDs without deps.
 * https://stackoverflow.com/a/52171480
 */
function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h2 >>> 15), 2246822507) ^ Math.imul(h2 ^ (h1 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h2 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function approxTokens(text: string): number {
  // Simple heuristic: ~4 chars per token for English prose
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

type BlockType = "heading" | "paragraph" | "code" | "list" | "other";

interface Block {
  type: BlockType;
  content: string;
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim());
}

function isListItem(line: string): boolean {
  return /^(\s*[-*+]\s+|\s*\d+\.\s+)/.test(line);
}

function isFence(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

function stripFrontMatter(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        return lines.slice(i + 1).join("\n");
      }
    }
  }
  return text;
}

function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split(/\r?\n/);

  let i = 0;
  let inFence = false;
  let fenceDelimiter = "";

  while (i < lines.length) {
    let line = lines[i];

    // Skip multiple blank lines
    if (!inFence && line.trim() === "") {
      i++;
      continue;
    }

    // Code fences
    if (!inFence && isFence(line)) {
      inFence = true;
      fenceDelimiter = line.match(/(```|~~~)/)![0];
      const buf: string[] = [line];
      i++;
      while (i < lines.length) {
        buf.push(lines[i]);
        if (isFence(lines[i]) && lines[i].includes(fenceDelimiter)) {
          i++;
          break;
        }
        i++;
      }
      blocks.push({ type: "code", content: buf.join("\n").trimEnd() });
      continue;
    }

    if (isHeading(line)) {
      blocks.push({ type: "heading", content: line.trimEnd() });
      i++;
      continue;
    }

    if (isListItem(line)) {
      const buf: string[] = [line];
      i++;
      while (i < lines.length && (isListItem(lines[i]) || lines[i].trim() === "")) {
        if (lines[i].trim() === "") {
          // allow a single blank for wrapped list items but break on double-blank
          if (i + 1 < lines.length && lines[i + 1].trim() === "") break;
        }
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ type: "list", content: buf.join("\n").trimEnd() });
      continue;
    }

    // Paragraph (consume until blank line or next heading/fence)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isHeading(lines[i]) &&
      !isFence(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    const paragraph = buf.join(" ").replace(/\s+/g, " ").trim();
    if (paragraph) blocks.push({ type: "paragraph", content: paragraph });
  }

  return blocks;
}

function splitBySentences(text: string): string[] {
  // Rough sentence splitter; handles punctuation + closing quotes/parens.
  const sentences = text.match(/[^.!?\n]+[.!?]+(?:[\)"]+)?(?=\s|$)|[^.!?\n]+$/g);
  if (!sentences) return [text];
  return sentences.map((s) => s.trim()).filter(Boolean);
}

function splitOversizedBlock(block: Block, max: number): string[] {
  const t = block.content.trim();
  if (t.length <= max) return [t];

  if (block.type === "code") {
    const lines = t.split(/\r?\n/);
    const out: string[] = [];
    let buf: string[] = [];
    let size = 0;
    for (const ln of lines) {
      if (size + ln.length + 1 > max && buf.length) {
        out.push(buf.join("\n"));
        buf = [];
        size = 0;
      }
      buf.push(ln);
      size += ln.length + 1;
    }
    if (buf.length) out.push(buf.join("\n"));
    return out;
  }

  const sentences = splitBySentences(t);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (!buf) {
      buf = s;
      continue;
    }
    if (buf.length + 1 + s.length <= max) {
      buf += " " + s;
    } else {
      out.push(buf);
      buf = s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Packs blocks into ~max-sized chunks. Starts a fresh chunk for headings to
 * keep them attached to their following content when possible.
 */
function packBlocks(blocks: Block[], max: number): string[] {
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trimEnd());
    current = "";
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // If block alone exceeds max, split it smartly
    if (block.content.length > max) {
      const parts = splitOversizedBlock(block, max);
      for (const p of parts) {
        if (!current) {
          current = p;
        } else if (current.length + 2 + p.length <= max) {
          current += "\n\n" + p;
        } else {
          pushCurrent();
          current = p;
        }
      }
      continue;
    }

    // Prefer new chunk for headings to bind with subsequent content
    if (block.type === "heading") {
      if (current) pushCurrent();
      current = block.content;
      continue;
    }

    // Normal packing with blank line separation
    if (!current) {
      current = block.content;
    } else if (current.length + 2 + block.content.length <= max) {
      current += "\n\n" + block.content;
    } else {
      pushCurrent();
      current = block.content;
    }
  }

  pushCurrent();
  return chunks;
}

export function chunkMarkdown(text: string, max = 800): Chunk[] {
  const input = stripFrontMatter((text || "").replace(/\r\n/g, "\n").trim());
  if (!input) return [];

  const blocks = toBlocks(input);
  const packed = packBlocks(blocks, max);

  return packed.map((content, i) => ({
    id: `md_${i}_${hash53(content).toString(36)}`,
    content,
    tokens: approxTokens(content),
  }));
}

export default chunkMarkdown;
