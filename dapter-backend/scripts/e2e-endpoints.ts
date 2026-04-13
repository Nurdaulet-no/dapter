/* eslint-disable no-console */
import { readFile } from "node:fs/promises";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3000";
const PDF_PATH = process.env.E2E_PDF_PATH ?? "/home/nuiway/Downloads/Smart Gym Membership.pdf";
const POLL_TIMEOUT_MS = Number(process.env.E2E_POLL_TIMEOUT_MS ?? 180_000);
const POLL_INTERVAL_MS = Number(process.env.E2E_POLL_INTERVAL_MS ?? 3_000);
const REQUEST_TIMEOUT_MS = Number(process.env.E2E_REQUEST_TIMEOUT_MS ?? 15_000);

type DocumentStatus = "PROCESSING" | "COMPLETED" | "FAILED";

interface UploadResponse {
  documentId: string;
  status: "PROCESSING";
}

interface DocumentStatusResponse {
  documentId: string;
  status: DocumentStatus;
  error?: string;
  notes?: unknown[];
  flashcardDecks?: unknown[];
  quizzes?: unknown[];
}

const PB_TOKEN_A = process.env.E2E_PB_TOKEN_A ?? "";
const PB_TOKEN_B = process.env.E2E_PB_TOKEN_B ?? "";
let uploadedDocumentId = "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function logStep(message: string): void {
  console.log(`\n[STEP] ${message}`);
}

const withBearer = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T | Record<string, unknown> }> {
  const response = await Promise.race([
    fetch(`${API_BASE_URL}${path}`, init),
    Bun.sleep(REQUEST_TIMEOUT_MS).then(() => {
      throw new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${path}`);
    }),
  ]) as Response;
  const raw = await response.text();
  let body: T | Record<string, unknown>;
  if (!raw) {
    body = {};
  } else {
    try {
      body = JSON.parse(raw) as T | Record<string, unknown>;
    } catch {
      body = { raw };
    }
  }
  return { status: response.status, body };
}

async function testHealth(): Promise<void> {
  logStep("GET /health");
  const { status, body } = await requestJson<{ status: string }>("/health");
  assert(status === 200, `Expected 200, got ${status}`);
  assert((body as { status?: string }).status === "ok", "Health response mismatch");
}

async function testDocumentsFlow(): Promise<void> {
  logStep("GET /documents without token");
  const unauthorizedList = await requestJson("/documents");
  assert(unauthorizedList.status === 401, `Expected 401, got ${unauthorizedList.status}`);

  logStep("GET /documents with invalid token");
  const invalidAuth = await requestJson("/documents", {
    headers: withBearer("invalid-token"),
  });
  assert(invalidAuth.status === 401, `Expected 401, got ${invalidAuth.status}`);

  logStep("GET /documents with token");
  const list = await requestJson<unknown[]>("/documents", {
    headers: withBearer(PB_TOKEN_A),
  });
  assert(list.status === 200, `List expected 200, got ${list.status}`);
  assert(Array.isArray(list.body), "List response must be array");

  logStep("POST /documents/upload");
  const fileBuffer = await readFile(PDF_PATH);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "application/pdf" }), "Smart Gym Membership.pdf");

  const uploadResponse = await Promise.race([
    fetch(`${API_BASE_URL}/documents/upload`, {
      method: "POST",
      headers: withBearer(PB_TOKEN_A),
      body: form,
    }),
    Bun.sleep(REQUEST_TIMEOUT_MS).then(() => {
      throw new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms: /documents/upload`);
    }),
  ]) as Response;
  const uploadBody = (await uploadResponse.json()) as UploadResponse | Record<string, unknown>;
  assert(uploadResponse.status === 200, `Upload expected 200, got ${uploadResponse.status}`);
  assert((uploadBody as UploadResponse).documentId, "Upload: missing documentId");
  uploadedDocumentId = (uploadBody as UploadResponse).documentId;

  logStep("GET /documents/:id/status polling");
  const start = Date.now();
  let finalStatus: DocumentStatusResponse | null = null;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const polled = await requestJson<DocumentStatusResponse>(
      `/documents/${uploadedDocumentId}/status`,
      { headers: withBearer(PB_TOKEN_A) },
    );
    assert(polled.status === 200, `Status polling expected 200, got ${polled.status}`);
    const statusBody = polled.body as DocumentStatusResponse;
    if (statusBody.status === "COMPLETED" || statusBody.status === "FAILED") {
      finalStatus = statusBody;
      break;
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  assert(finalStatus, "Polling timeout reached before completion");
  assert(finalStatus.status === "COMPLETED", `Document processing failed: ${finalStatus.error ?? "unknown error"}`);

  logStep("GET /documents/:id/notes");
  const notes = await requestJson(`/documents/${uploadedDocumentId}/notes`, {
    headers: withBearer(PB_TOKEN_A),
  });
  assert(notes.status === 200, `Notes expected 200, got ${notes.status}`);

  logStep("GET /documents/:id/flashcards");
  const flashcards = await requestJson(`/documents/${uploadedDocumentId}/flashcards`, {
    headers: withBearer(PB_TOKEN_A),
  });
  assert(flashcards.status === 200, `Flashcards expected 200, got ${flashcards.status}`);

  logStep("GET /documents/:id/quizzes");
  const quizzes = await requestJson(`/documents/${uploadedDocumentId}/quizzes`, {
    headers: withBearer(PB_TOKEN_A),
  });
  assert(quizzes.status === 200, `Quizzes expected 200, got ${quizzes.status}`);
}

async function testOwnershipAndDelete(): Promise<void> {
  assert(uploadedDocumentId, "No uploaded document id for ownership test");

  if (PB_TOKEN_B.length > 10) {
    logStep("Ownership check: user B tries user A document");
    const forbidden = await requestJson(`/documents/${uploadedDocumentId}/status`, {
      headers: withBearer(PB_TOKEN_B),
    });
    assert(forbidden.status === 403, `Expected 403 for foreign document, got ${forbidden.status}`);
  } else {
    console.log("[INFO] E2E_PB_TOKEN_B not set, ownership check skipped.");
  }

  const deleteTarget = async (target: "notes" | "flashcards" | "quizzes") => {
    logStep(`DELETE /documents/:id/forever?target=${target} (owner)`);
    const deleted = await requestJson<{ success: boolean }>(
      `/documents/${uploadedDocumentId}/forever?target=${target}`,
      {
        method: "DELETE",
        headers: withBearer(PB_TOKEN_A),
      },
    );
    assert(deleted.status === 200, `Delete ${target} expected 200, got ${deleted.status}`);
    assert((deleted.body as { success?: boolean }).success === true, "Delete expected success=true");
  };

  await deleteTarget("notes");
  await deleteTarget("flashcards");
  await deleteTarget("quizzes");

  logStep("GET /documents/:id/status after selective deletes");
  const statusAfterDelete = await requestJson(`/documents/${uploadedDocumentId}/status`, {
    headers: withBearer(PB_TOKEN_A),
  });
  assert(
    statusAfterDelete.status === 200,
    `Status after deletes expected 200, got ${statusAfterDelete.status}`,
  );
}

async function run(): Promise<void> {
  console.log("[INFO] API:", API_BASE_URL);
  console.log("[INFO] PDF:", PDF_PATH);
  assert(PB_TOKEN_A.length > 10, "Missing E2E_PB_TOKEN_A");

  await testHealth();
  await testDocumentsFlow();
  await testOwnershipAndDelete();

  console.log("\n✅ E2E: all endpoint tests passed.");
}

run().catch((error) => {
  console.error("\n❌ E2E failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
