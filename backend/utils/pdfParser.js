// backend/utils/pdfParser.js
// Extracts text page by page. Pages without a text layer (scans, photos of notes)
// are sent through OCR automatically, so scanned PDFs work too.

import fs from "fs/promises";
import { PDFParse } from "pdf-parse";
import { pageNeedsOCR, ocrPdfPages } from "./ai/ocr.js";

export const extractTextFromPDF = async (filePath) => {
  let parser;
  try {
    const dataBuffer = await fs.readFile(filePath);
    parser = new PDFParse({ data: new Uint8Array(dataBuffer) });

    // pageJoiner "" -> no "-- 1 of 5 --" markers inside the page text
    const data = await parser.getText({ pageJoiner: "" });

    let pages = (data.pages || []).map((p) => ({ num: p.num, text: p.text || "" }));

    // ---- OCR for pages that have (almost) no text layer ----
    const scanned = pages.filter((p) => pageNeedsOCR(p.text)).map((p) => p.num);
    let ocrPages = [];
    if (scanned.length) {
      console.log(`PDF: ${scanned.length} page(s) look scanned -> running OCR`);
      const ocrText = await ocrPdfPages(dataBuffer, scanned);
      pages = pages.map((p) => (ocrText.has(p.num) ? { ...p, text: ocrText.get(p.num) } : p));
      ocrPages = [...ocrText.keys()];
    }

    const text = pages.map((p) => p.text).join("\n\n").trim();

    return {
      text,
      pages,
      numPages: data.total ?? pages.length,
      info: data.info,
      ocrPages,
    };
  } catch (error) {
    console.error("PDF parsing error", error);
    throw new Error("Failed to extract text from PDF");
  } finally {
    await parser?.destroy?.().catch?.(() => {});
  }
};
