import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ExtractionService } from "../src/services/extraction.service";

const filePathArg = process.argv[2];
if (!filePathArg) {
  throw new Error("Usage: bun run scripts/test-selected-pages-extract.ts <filePath> [pagesCsv]");
}

const pagesCsv = process.argv[3] ?? "4";
const selectedPages = pagesCsv
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1);

if (selectedPages.length === 0) {
  throw new Error("No valid selected pages provided. Example: 4 or 1,3,8,9");
}

const filePath = resolve(filePathArg);
const bytes = new Uint8Array(readFileSync(filePath));
const lower = filePath.toLowerCase();
const mimeType = lower.endsWith(".pdf")
  ? "application/pdf"
  : "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const extractor = new ExtractionService();
const selectedText = await extractor.extractText({ mimeType, bytes, selectedPages });
const fullText = await extractor.extractText({ mimeType, bytes });

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const selectedNorm = normalize(selectedText);
const fullNorm = normalize(fullText);

console.log("=== Selected pages extraction test ===");
console.log("File:", filePath);
console.log("Mime:", mimeType);
console.log("Selected pages:", selectedPages.join(", "));
console.log("Selected text length:", selectedText.length);
console.log("Full text length:", fullText.length);
console.log("Subset match:", selectedNorm.length > 0 && fullNorm.includes(selectedNorm) ? "YES" : "NO");
console.log("--- Selected text preview (first 1200 chars) ---");
console.log(selectedText.slice(0, 1200));
