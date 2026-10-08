// backend/utils/textChunker.js
// Semantic / heading-aware chunker.
//
// Old behaviour: fixed 500-word windows that ignored sentence and heading boundaries
// (and flattened every newline). New behaviour:
//   * keeps headings and remembers the current section for every chunk
//   * packs whole sentences, never cuts a sentence in half
//   * never crosses a page boundary, so pageNumber citations stay exact
//   * small sentence overlap between neighbouring chunks of the same section

const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

const PAGE_MARKER = /^\s*--\s*\d+\s*(of|\/)\s*\d+\s*--\s*$/i;
const BULLET = /^\s*([•●▪◦‣\-*–—]|\d{1,3}[.)]|[a-zA-Z][.)])\s+/;
const NUMBERED_HEADING = /^(\d+(\.\d+)*[.)]?|[IVX]{1,6}[.)]|chapter\s+\w+|section\s+\w+|unit\s+\w+|module\s+\w+|appendix\s+\w+)\s+\S/i;

const looksLikeHeading = (line, prevBlank) => {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return false;
  const words = t.split(/\s+/);
  if (words.length > 12) return false;
  if (/[.,;]$/.test(t) && !NUMBERED_HEADING.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  if (NUMBERED_HEADING.test(t) && words.length <= 10 && !/[.!?]$/.test(t)) return true;
  if (letters === letters.toUpperCase() && words.length <= 10) return true; // ALL CAPS
  const capitalised = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
  return prevBlank && words.length <= 8 && capitalised / words.length >= 0.7 && !/[.!?]$/.test(t);
};

const splitSentences = (paragraph) =>
  paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Break an over-long "sentence" (slides / tables without punctuation) into word slices. */
const hardSplit = (sentence, maxWords) => {
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return [sentence];
  const parts = [];
  for (let i = 0; i < words.length; i += maxWords) parts.push(words.slice(i, i + maxWords).join(" "));
  return parts;
};

/** Turn the raw text of ONE page into [{ text, heading }] sentence units. */
const pageToUnits = (rawText, state, maxWords) => {
  const units = [];
  const lines = rawText.replace(/\r/g, "").split("\n");

  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    const paragraph = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    for (const s of splitSentences(paragraph)) {
      for (const piece of hardSplit(s, maxWords)) units.push({ text: piece, heading: state.heading });
    }
  };

  let prevBlank = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || PAGE_MARKER.test(line)) {
      flush();
      prevBlank = true;
      continue;
    }
    if (looksLikeHeading(line, prevBlank)) {
      flush();
      state.heading = line.replace(/\s+/g, " ");
      prevBlank = false;
      continue;
    }
    if (BULLET.test(line)) flush(); // every bullet starts its own unit
    buffer.push(line);
    prevBlank = false;
  }
  flush();
  return units;
};

/**
 * pages: [{ num, text }]  (shape returned by pdf-parse)
 * returns: [{ content, heading, pageNumber, chunkIndex }]
 */
export const chunkPages = (pages, options = {}) => {
  const { targetWords = 200, maxWords = 300, overlapWords = 35, minWords = 25 } =
    typeof options === "object" && options !== null ? options : {};

  const chunks = [];
  const state = { heading: "" };

  for (const page of pages || []) {
    const units = pageToUnits(page.text || "", state, maxWords);
    if (!units.length) continue;

    let current = [];
    let currentWords = 0;
    let currentHeading = units[0].heading;
    const pageChunks = [];

    const emit = () => {
      if (!current.length) return;
      pageChunks.push({
        content: current.map((u) => u.text).join(" "),
        heading: currentHeading || "",
        pageNumber: page.num,
      });
    };

    for (const unit of units) {
      const w = wordCount(unit.text);
      const headingChanged = unit.heading !== currentHeading;
      const full = currentWords + w > maxWords || (currentWords >= targetWords && w > 0 && currentWords + w > targetWords * 1.25);

      if (current.length && (full || (headingChanged && currentWords >= minWords * 2))) {
        emit();
        // carry a little overlap forward (same section only)
        let carry = [];
        if (!headingChanged) {
          let acc = 0;
          for (let i = current.length - 1; i >= 0 && acc < overlapWords; i--) {
            carry.unshift(current[i]);
            acc += wordCount(current[i].text);
          }
          if (acc > overlapWords * 2) carry = [];
        }
        current = carry;
        currentWords = carry.reduce((s, u) => s + wordCount(u.text), 0);
      }
      if (!current.length) currentHeading = unit.heading;
      current.push(unit);
      currentWords += w;
    }
    emit();

    // merge tiny chunks (e.g. a lone heading line) into their predecessor on the same page
    for (let i = pageChunks.length - 1; i > 0; i--) {
      if (wordCount(pageChunks[i].content) < minWords) {
        const tiny = pageChunks[i];
        const label = tiny.heading && tiny.heading !== pageChunks[i - 1].heading ? `${tiny.heading}. ` : "";
        pageChunks[i - 1].content += ` ${label}${tiny.content}`;
        pageChunks.splice(i, 1);
      }
    }
    chunks.push(...pageChunks);
  }

  return chunks.map((c, i) => ({ ...c, chunkIndex: i }));
};

/** Kept for backward compatibility with older imports. */
export const chunkText = (text, options = {}) => chunkPages([{ num: 0, text }], options);
