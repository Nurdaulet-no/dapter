/**
 * Creates or reconciles all PocketBase collections with the schema config.
 *
 * On each run:
 *   - Missing collections are created.
 *   - Existing collections are synced: missing fields are added and mismatched
 *     fields (e.g. select option lists, min/max, relation targets) are patched
 *     in place. System fields (id/created/updated) are preserved.
 *
 * Usage:
 *   bun run scripts/setup-collections.ts <admin-email> <admin-password>
 *
 * Requires a running PocketBase instance (POCKETBASE_URL from .env or default http://127.0.0.1:8090).
 */

import PocketBase from "pocketbase";
import { pocketBaseSchemaMapping } from "../src/config/pocketbase-schema";
import type { PocketBaseCollectionFieldSpec, PocketBaseCollectionSchema } from "../src/types/pocketbase";

const POCKETBASE_URL = Bun.env.POCKETBASE_URL ?? "http://127.0.0.1:8090";

const rawEmail = Bun.argv[2];
const rawPassword = Bun.argv[3];
if (!rawEmail || !rawPassword) {
  console.error("Usage: bun run scripts/setup-collections.ts <admin-email> <admin-password>");
  process.exit(1);
}
const email: string = rawEmail;
const password: string = rawPassword;

const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

type PBField = Record<string, unknown> & { name: string; id?: string; system?: boolean };
type PBCollection = { id: string; name: string; fields?: PBField[] };

// name -> id of collections created so far
const collectionIds = new Map<string, string>();

async function authenticate() {
  try {
    await pb.collection("_superusers").authWithPassword(email, password);
    console.log("Authenticated as superuser.");
  } catch {
    console.error("Failed to authenticate. Check your admin email/password and that PocketBase is running.");
    process.exit(1);
  }
}

async function loadExistingCollections() {
  const existing = (await pb.collections.getFullList()) as unknown as PBCollection[];
  for (const col of existing) {
    collectionIds.set(col.name, col.id);
  }
}

function mapField(field: PocketBaseCollectionFieldSpec): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: field.name,
    type: field.type,
    required: field.required ?? false,
  };

  switch (field.type) {
    case "number":
      if (field.min !== undefined) base.min = field.min;
      if (field.max !== undefined) base.max = field.max;
      break;

    case "file":
      base.maxSize = field.maxSize ?? 5 * 1024 * 1024;
      base.maxSelect = 1;
      break;

    case "select":
      base.values = field.options ?? [];
      base.maxSelect = 1;
      break;

    case "relation": {
      const targetName = field.relation?.collection;
      if (!targetName) throw new Error(`Relation field "${field.name}" missing target collection`);
      const targetId = collectionIds.get(targetName);
      if (!targetId) throw new Error(`Collection "${targetName}" not found — is it defined before "${field.name}"?`);
      base.collectionId = targetId;
      base.cascadeDelete = field.relation?.cascadeDelete ?? false;
      base.maxSelect = field.relation?.maxSelect ?? null;
      break;
    }

    case "autodate":
      base.onCreate = field.onCreate ?? false;
      base.onUpdate = field.onUpdate ?? false;
      break;
  }

  return base;
}

function fieldNeedsUpdate(existing: PBField, desired: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(desired)) {
    if (key === "name" || key === "type") continue;
    const current = existing[key];
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      return true;
    }
  }
  return false;
}

async function syncCollection(schema: PocketBaseCollectionSchema, collectionId: string) {
  const current = (await pb.collections.getOne(collectionId)) as unknown as PBCollection;
  const currentFields = current.fields ?? [];
  const systemFields = currentFields.filter((f) => f.system === true);
  const existingByName = new Map(
    currentFields.filter((f) => !f.system).map((f) => [f.name, f]),
  );

  let changed = false;
  const added: string[] = [];
  const updated: string[] = [];

  const mergedUserFields = schema.fields.map((spec) => {
    const desired = mapField(spec);
    const existing = existingByName.get(spec.name);
    if (!existing) {
      added.push(spec.name);
      changed = true;
      return desired;
    }
    if (fieldNeedsUpdate(existing, desired)) {
      updated.push(spec.name);
      changed = true;
    }
    return { ...existing, ...desired, id: existing.id };
  });

  const removed: string[] = [];
  for (const existing of existingByName.values()) {
    if (!schema.fields.find((f) => f.name === existing.name)) {
      removed.push(existing.name);
      changed = true;
    }
  }

  if (!changed) {
    console.log(`  ok    "${schema.collection}" (already in sync)`);
    return;
  }

  const fields = [...systemFields, ...mergedUserFields];
  await pb.collections.update(collectionId, { fields });

  const parts = [
    added.length ? `+${added.join(",")}` : null,
    updated.length ? `~${updated.join(",")}` : null,
    removed.length ? `-${removed.join(",")}` : null,
  ].filter(Boolean);
  console.log(`  sync  "${schema.collection}" (${parts.join(" ")})`);
}

async function createCollection(schema: PocketBaseCollectionSchema) {
  const fields = schema.fields.map(mapField);
  const created = (await pb.collections.create({
    name: schema.collection,
    type: schema.type,
    fields,
  })) as unknown as PBCollection;
  collectionIds.set(schema.collection, created.id);
  console.log(`  create "${schema.collection}" (${created.id})`);
}

async function run() {
  await authenticate();
  await loadExistingCollections();

  for (const schema of pocketBaseSchemaMapping.collections) {
    const existingId = collectionIds.get(schema.collection);
    if (existingId) {
      await syncCollection(schema, existingId);
    } else {
      await createCollection(schema);
    }
  }

  console.log("\nDone. All collections are in sync.");
}

run().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
