// backend/utils/ai/ocr.js
// OCR for scanned / image-only PDF pages.
//   1. render the page to PNG with pdf-parse's getScreenshot()
//   2. run Tesseract.js locally (English data ships inside node_modules -> no download)
//   3. if Tesseract fails, fall back to Gemini vision
// Set OCR_PROVIDER=gemini or OCR_PROVIDER=tesseract to force one, OCR_PROVIDER=off to disable,
// OCR_LANGS=eng+hin for other languages (extra language data is downloaded by Tesseract on first use).

import { PDFParse } from "pdf-parse";
import { generateFromImage } from "./genai.js";

const MIN_CHARS_PER_PAGE = Number(process.env.OCR_MIN_CHARS || 40);
const MAX_OCR_PAGES = Number(process.env.OCR_MAX_PAGES || 60);
const BATCH = 3;

export const pageNeedsOCR = (text = "") => text.replace(/\s+/g, "").length < MIN_CHARS_PER_PAGE;

let workerPromise = null;
const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const langs = process.env.OCR_LANGS || "eng";
      const options = { cacheMethod: "none" };
      if (langs === "eng") {
        // bundled offline English data
        const eng = (await import("@tesseract.js-data/eng")).default;
        options.langPath = eng.langPath;
        options.gzip = eng.gzip;
      }
      return createWorker(langs, 1, options);
    })();
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
};

export const terminateOCR = async () => {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch {
    /* ignore */
  }
  workerPromise = null;
};

const tesseractOCR = async (png) => {
  const worker = await getWorker();
  const { data } = await worker.recognize(Buffer.from(png));
  return (data?.text || "").trim();
};

const geminiOCR = async (png) =>
  (
    await generateFromImage(
      png,
      "Transcribe ALL text in this page image exactly as written. Keep headings on their own lines and keep paragraph breaks. " +
        "Return only the transcribed text, no commentary."
    )
  ).trim();

const runOCR = async (png) => {
  const provider = (process.env.OCR_PROVIDER || "auto").toLowerCase();
  if (provider === "gemini") return geminiOCR(png);
  if (provider === "tesseract") return tesseractOCR(png);
  try {
    return await tesseractOCR(png);
  } catch (err) {
    console.warn("Tesseract OCR failed, falling back to Gemini vision:", err.message);
    return geminiOCR(png);
  }
};

/**
 * pdfBuffer: Buffer/Uint8Array of the PDF
 * pageNumbers: pages (1-based) that have no text layer
 * returns Map<pageNumber, text>
 */
export const ocrPdfPages = async (pdfBuffer, pageNumbers) => {
  const result = new Map();
  if ((process.env.OCR_PROVIDER || "").toLowerCase() === "off") return result;

  const todo = pageNumbers.slice(0, MAX_OCR_PAGES);
  if (pageNumbers.length > todo.length) {
    console.warn(`OCR: only the first ${todo.length} of ${pageNumbers.length} scanned pages will be processed (OCR_MAX_PAGES)`);
  }

  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    for (let i = 0; i < todo.length; i += BATCH) {
      const group = todo.slice(i, i + BATCH);
      const shots = await parser.getScreenshot({
        partial: group,
        scale: 2,
        imageBuffer: true,
        imageDataUrl: false,
      });
      for (const shot of shots.pages) {
        try {
          const text = await runOCR(shot.data);
          if (text) result.set(shot.pageNumber ?? shot.num ?? group[shots.pages.indexOf(shot)], text);
        } catch (err) {
          console.error(`OCR failed on page ${shot.pageNumber}:`, err.message);
        }
      }
    }
  } finally {
    await parser.destroy?.().catch?.(() => {});
    await terminateOCR();
  }
  return result;
};
