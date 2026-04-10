import JSZip from "jszip";
import pdfParse from "pdf-parse";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../config/logger";

export interface IExtractionService {
  extractText(input: { mimeType: string; bytes: Uint8Array }): Promise<string>;
}

export class ExtractionService implements IExtractionService {
  private readonly xmlParser = new XMLParser({ ignoreAttributes: false });

  public async extractText(input: { mimeType: string; bytes: Uint8Array }): Promise<string> {
    logger.info("extraction.started", {
      mimeType: input.mimeType,
      byteLength: input.bytes.byteLength,
    });
    if (input.mimeType === "application/pdf") {
      const parsed = await pdfParse(Buffer.from(input.bytes));
      logger.info("extraction.pdf.completed", {
        textLength: parsed.text.length,
        pages: parsed.numpages,
      });
      return parsed.text.trim();
    }

    if (
      input.mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
      logger.debug("extraction.pptx.detected");
      return this.extractPptxText(input.bytes);
    }

    logger.error("extraction.unsupported_mime_type", {
      mimeType: input.mimeType,
    });
    throw new Error(`Unsupported mime type for extraction: ${input.mimeType}`);
  }

  private async extractPptxText(bytes: Uint8Array): Promise<string> {
    const zip = await JSZip.loadAsync(bytes);
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const texts: string[] = [];
    logger.debug("extraction.pptx.slides.discovered", {
      slides: slideFiles.length,
    });

    for (const fileName of slideFiles) {
      const xml = await zip.files[fileName]?.async("text");
      if (!xml) {
        logger.error("extraction.pptx.slide.read_failed", { fileName });
        continue;
      }
      const parsed = this.xmlParser.parse(xml) as {
        "p:sld"?: {
          "p:cSld"?: {
            "p:spTree"?: {
              "p:sp"?: Array<{ "p:txBody"?: { "a:p"?: unknown } }> | { "p:txBody"?: { "a:p"?: unknown } };
            };
          };
        };
      };
      const shapeTree = parsed["p:sld"]?.["p:cSld"]?.["p:spTree"];
      const shapes = shapeTree?.["p:sp"]
        ? Array.isArray(shapeTree["p:sp"])
          ? shapeTree["p:sp"]
          : [shapeTree["p:sp"]]
        : [];

      for (const shape of shapes) {
        const paragraphs = shape["p:txBody"]?.["a:p"];
        const paragraphArray = Array.isArray(paragraphs) ? paragraphs : paragraphs ? [paragraphs] : [];
        for (const paragraph of paragraphArray) {
          const text = this.extractTextNodes(paragraph);
          if (text) {
            texts.push(text);
          }
        }
      }
    }

    const result = texts.join("\n").trim();
    logger.info("extraction.pptx.completed", {
      extractedFragments: texts.length,
      textLength: result.length,
    });
    return result;
  }

  private extractTextNodes(node: unknown): string {
    if (!node || typeof node !== "object") {
      return "";
    }
    const typedNode = node as Record<string, unknown>;
    const runs = typedNode["a:r"];
    if (!runs) {
      return "";
    }
    const runArray = Array.isArray(runs) ? runs : [runs];
    const fragments = runArray
      .map((run) => {
        if (!run || typeof run !== "object") {
          return "";
        }
        const textNode = (run as Record<string, unknown>)["a:t"];
        return typeof textNode === "string" ? textNode : "";
      })
      .filter(Boolean);
    return fragments.join(" ").trim();
  }
}
