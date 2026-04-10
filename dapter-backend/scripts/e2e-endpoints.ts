/* eslint-disable no-console */
import { readFile } from "node:fs/promises";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3000";
const PDF_PATH = process.env.E2E_PDF_PATH ?? "/home/nuiway/Downloads/Smart Gym Membership.pdf";
const POLL_TIMEOUT_MS = Number(process.env.E2E_POLL_TIMEOUT_MS ?? 180_000);
const POLL_INTERVAL_MS = Number(process.env.E2E_POLL_INTERVAL_MS ?? 3_000);

type DocumentStatus = "PROCESSING" | "COMPLETED" | "FAILED";

interface AuthResponse {
  user: { id: string; email: string };
  tokens: { accessToken: string; refreshToken: string };
}

interface UploadResponse {
  documentId: string;
  status: "PROCESSING";
}

interface DocumentStatusResponse {
  documentId: string;
  status: DocumentStatus;
  error?: string;
  notes?: unknown[];
  flashcards?: unknown[];
  quizzes?: unknown[];
}

const nowTag = () => Date.now().toString(36);
const emailA = `e2e-user-a-${nowTag()}@example.com`;
const emailB = `e2e-user-b-${nowTag()}@example.com`;
const password = "StrongPass123";

let accessTokenA = "";
let refreshTokenA = "";
let accessTokenB = "";
let refreshTokenB = "";
let uploadedDocumentId = "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function logStep(message: string): void {
  console.log(`\n[STEP] ${message}`);
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T | Record<string, unknown> }> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
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

async function testRegisterAndLogin(): Promise<void> {
  logStep("POST /auth/register (user A)");
  const registerA = await requestJson<AuthResponse>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailA, password }),
  });
  assert(registerA.status === 201, `Register A expected 201, got ${registerA.status}`);
  const authA = registerA.body as AuthResponse;
  assert(authA.tokens?.accessToken, "Register A: missing accessToken");
  accessTokenA = authA.tokens.accessToken;
  refreshTokenA = authA.tokens.refreshToken;

  logStep("POST /auth/register (duplicate email)");
  const duplicate = await requestJson("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailA, password }),
  });
  assert(duplicate.status === 409, `Duplicate register expected 409, got ${duplicate.status}`);

  logStep("POST /auth/register (user B)");
  const registerB = await requestJson<AuthResponse>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailB, password }),
  });
  assert(registerB.status === 201, `Register B expected 201, got ${registerB.status}`);
  const authB = registerB.body as AuthResponse;
  accessTokenB = authB.tokens.accessToken;
  refreshTokenB = authB.tokens.refreshToken;

  logStep("POST /auth/login (bad password)");
  const badLogin = await requestJson("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailA, password: "WrongPass123" }),
  });
  assert(badLogin.status === 401, `Bad login expected 401, got ${badLogin.status}`);

  logStep("POST /auth/login (valid)");
  const loginA = await requestJson<AuthResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailA, password }),
  });
  assert(loginA.status === 200, `Login expected 200, got ${loginA.status}`);
  const loginPayload = loginA.body as AuthResponse;
  accessTokenA = loginPayload.tokens.accessToken;
  refreshTokenA = loginPayload.tokens.refreshToken;
}

async function testRefreshAndLogout(): Promise<void> {
  logStep("POST /auth/refresh");
  const refreshed = await requestJson<AuthResponse>("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refreshTokenA }),
  });
  assert(refreshed.status === 200, `Refresh expected 200, got ${refreshed.status}`);
  const refreshedBody = refreshed.body as AuthResponse;
  assert(refreshedBody.tokens.accessToken, "Refresh: missing accessToken");
  accessTokenA = refreshedBody.tokens.accessToken;
  refreshTokenA = refreshedBody.tokens.refreshToken;

  logStep("POST /auth/logout");
  const logout = await requestJson<{ success: boolean }>("/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refreshTokenA }),
  });
  assert(logout.status === 200, `Logout expected 200, got ${logout.status}`);
  assert((logout.body as { success?: boolean }).success === true, "Logout: expected success=true");

  logStep("POST /auth/refresh (revoked token)");
  const refreshAfterLogout = await requestJson("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refreshTokenA }),
  });
  assert(
    refreshAfterLogout.status === 401,
    `Refresh after logout expected 401, got ${refreshAfterLogout.status}`,
  );

  const reLogin = await requestJson<AuthResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailA, password }),
  });
  assert(reLogin.status === 200, `Re-login expected 200, got ${reLogin.status}`);
  const reloginPayload = reLogin.body as AuthResponse;
  accessTokenA = reloginPayload.tokens.accessToken;
  refreshTokenA = reloginPayload.tokens.refreshToken;
}

async function testDocumentsFlow(): Promise<void> {
  logStep("GET /documents without token");
  const unauthorizedList = await requestJson("/documents");
  assert(unauthorizedList.status === 401, `Expected 401, got ${unauthorizedList.status}`);

  logStep("GET /documents with token");
  const list = await requestJson<unknown[]>("/documents", {
    headers: { Authorization: `Bearer ${accessTokenA}` },
  });
  assert(list.status === 200, `List expected 200, got ${list.status}`);
  assert(Array.isArray(list.body), "List response must be array");

  logStep("POST /documents/upload");
  const fileBuffer = await readFile(PDF_PATH);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "application/pdf" }), "Smart Gym Membership.pdf");

  const uploadResponse = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessTokenA}` },
    body: form,
  });
  const uploadBody = (await uploadResponse.json()) as UploadResponse | Record<string, unknown>;
  assert(uploadResponse.status === 200, `Upload expected 200, got ${uploadResponse.status}`);
  assert((uploadBody as UploadResponse).documentId, "Upload: missing documentId");
  uploadedDocumentId = (uploadBody as UploadResponse).documentId;

  logStep("GET /documents/:id/status polling");
  const start = Date.now();
  let finalStatus: DocumentStatusResponse | null = null;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const polled = await requestJson<DocumentStatusResponse>(`/documents/${uploadedDocumentId}/status`, {
      headers: { Authorization: `Bearer ${accessTokenA}` },
    });
    assert(polled.status === 200, `Status polling expected 200, got ${polled.status}`);
    const statusBody = polled.body as DocumentStatusResponse;
    if (statusBody.status === "COMPLETED" || statusBody.status === "FAILED") {
      finalStatus = statusBody;
      break;
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  assert(finalStatus, "Polling timeout reached before completion");
  assert(
    finalStatus.status === "COMPLETED" || finalStatus.status === "FAILED",
    "Unexpected final status",
  );

  logStep("GET /documents/:id/notes");
  const notes = await requestJson(`/documents/${uploadedDocumentId}/notes`, {
    headers: { Authorization: `Bearer ${accessTokenA}` },
  });
  assert(notes.status === 200, `Notes expected 200, got ${notes.status}`);

  logStep("GET /documents/:id/flashcards");
  const flashcards = await requestJson(`/documents/${uploadedDocumentId}/flashcards`, {
    headers: { Authorization: `Bearer ${accessTokenA}` },
  });
  assert(flashcards.status === 200, `Flashcards expected 200, got ${flashcards.status}`);

  logStep("GET /documents/:id/quizzes");
  const quizzes = await requestJson(`/documents/${uploadedDocumentId}/quizzes`, {
    headers: { Authorization: `Bearer ${accessTokenA}` },
  });
  assert(quizzes.status === 200, `Quizzes expected 200, got ${quizzes.status}`);
}

async function testOwnershipAndDelete(): Promise<void> {
  assert(uploadedDocumentId, "No uploaded document id for ownership test");

  logStep("Ownership check: user B tries user A document");
  const forbidden = await requestJson(`/documents/${uploadedDocumentId}/status`, {
    headers: { Authorization: `Bearer ${accessTokenB}` },
  });
  assert(forbidden.status === 403, `Expected 403 for foreign document, got ${forbidden.status}`);

  logStep("DELETE /documents/:id (owner)");
  const deleted = await requestJson<{ success: boolean }>(`/documents/${uploadedDocumentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessTokenA}` },
  });
  assert(deleted.status === 200, `Delete expected 200, got ${deleted.status}`);
  assert((deleted.body as { success?: boolean }).success === true, "Delete expected success=true");

  logStep("GET /documents/:id/status after delete");
  const notFoundAfterDelete = await requestJson(`/documents/${uploadedDocumentId}/status`, {
    headers: { Authorization: `Bearer ${accessTokenA}` },
  });
  assert(
    notFoundAfterDelete.status === 404,
    `Status after delete expected 404, got ${notFoundAfterDelete.status}`,
  );
}

async function testGoogleEndpointAvailability(): Promise<void> {
  logStep("GET /auth/google should redirect");
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: "GET",
    redirect: "manual",
  });
  assert(
    response.status === 302 || response.status === 307,
    `Google auth redirect expected 302/307, got ${response.status}`,
  );
}

async function run(): Promise<void> {
  console.log("[INFO] API:", API_BASE_URL);
  console.log("[INFO] PDF:", PDF_PATH);

  await testHealth();
  await testRegisterAndLogin();
  await testRefreshAndLogout();
  await testGoogleEndpointAvailability();
  await testDocumentsFlow();
  await testOwnershipAndDelete();

  console.log("\n✅ E2E: all endpoint tests passed.");
}

run().catch((error) => {
  console.error("\n❌ E2E failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
