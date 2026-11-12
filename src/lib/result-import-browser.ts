import { read, utils } from "@e965/xlsx";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import {
  parseOcrResults,
  parseResultMatrix,
  type ImportedResult,
  type ResultStudent,
} from "./result-import";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 10;

export function validateResultFiles(files: File[]) {
  if (!files.length) throw new Error("Choose at least one result file.");
  if (files.length > 8) throw new Error("Upload up to 8 files at a time.");
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > 50 * 1024 * 1024)
    throw new Error("The combined upload size must be under 50 MB.");
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`${file.name} is too large. Each file must be 20 MB or less.`);
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["png", "jpg", "jpeg", "webp", "pdf", "csv", "xlsx"].includes(extension ?? "")) {
      throw new Error(`${file.name} is not supported. Use PNG, JPG, WEBP, PDF, CSV, or XLSX.`);
    }
  }
}

export async function readSpreadsheetResults(
  file: File,
  roster: ResultStudent[],
  defaultTerm: string,
  defaultStudent = "",
): Promise<ImportedResult[]> {
  const workbook = read(await file.arrayBuffer(), { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`${file.name} does not contain a worksheet.`);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`${file.name} has an unreadable worksheet.`);
  const matrix = utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
    range: 0,
  });
  if (matrix.length > 2001) throw new Error(`${file.name} has more than 2,000 rows.`);
  return parseResultMatrix(matrix, roster, defaultTerm, defaultStudent);
}

async function recognizeFiles(
  files: File[],
  onProgress: (message: string) => void,
): Promise<string[]> {
  const worker = await createWorker("eng", 1, {
    logger: ({ status, progress }) => {
      const percent = Math.round(progress * 100);
      onProgress(`${status}${percent ? ` ${percent}%` : ""}`);
    },
  });
  const pages: string[] = [];
  try {
    for (const file of files) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension !== "pdf") {
        onProgress(`Reading ${file.name}`);
        const { data } = await worker.recognize(file);
        pages.push(data.text);
        continue;
      }

      onProgress(`Opening ${file.name}`);
      const loadingTask = getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      });
      const pdf = await loadingTask.promise;
      try {
        if (pdf.numPages > MAX_PDF_PAGES) {
          throw new Error(`${file.name} has more than ${MAX_PDF_PAGES} pages.`);
        }
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          onProgress(`Reading ${file.name}, page ${pageNumber} of ${pdf.numPages}`);
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.6 });
          const canvas = document.createElement("canvas");
          const maxDimension = 3000;
          const scale = Math.min(1, maxDimension / Math.max(viewport.width, viewport.height));
          const boundedViewport = page.getViewport({ scale: 1.6 * scale });
          canvas.width = Math.ceil(boundedViewport.width);
          canvas.height = Math.ceil(boundedViewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not prepare a PDF page for local text recognition.");
          await page.render({ canvas, canvasContext: context, viewport: boundedViewport }).promise;
          const { data } = await worker.recognize(canvas);
          pages.push(data.text);
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
      } finally {
        await loadingTask.destroy();
      }
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}

export async function readImageAndPdfResults(
  files: File[],
  roster: ResultStudent[],
  defaultTerm: string,
  defaultStudent: string,
  onProgress: (message: string) => void,
): Promise<{ rows: ImportedResult[]; unreadablePages: number }> {
  const textPages = await recognizeFiles(files, onProgress);
  let unreadablePages = 0;
  const rows = textPages.flatMap((text, index) => {
    try {
      return parseOcrResults(text, roster, defaultTerm, defaultStudent).map((row, rowIndex) => ({
        ...row,
        id: `${index}-${rowIndex}-${row.id}`,
      }));
    } catch {
      unreadablePages += 1;
      return [];
    }
  });
  if (!rows.length) {
    throw new Error(
      "No result rows could be read from these files. Use clear photos of a result table, or upload a spreadsheet.",
    );
  }
  return { rows, unreadablePages };
}

export function splitResultFiles(files: File[]) {
  const spreadsheetFiles: File[] = [];
  const imageAndPdfFiles: File[] = [];
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "csv" || extension === "xlsx") spreadsheetFiles.push(file);
    else imageAndPdfFiles.push(file);
  }
  return { spreadsheetFiles, imageAndPdfFiles };
}
