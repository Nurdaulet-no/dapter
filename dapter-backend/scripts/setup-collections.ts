/**
 * Creates all PocketBase collections from the schema config.
 *
 * Usage:
 *   bun run scripts/setup-collections.ts <admin-email> <admin-password>
 *
 * Requires a running PocketBase instance (POCKETBASE_URL from .env or default http://127.0.0.1:8090).
 */

import PocketBase from "pocketbase";
import { pocketBaseSchemaMapping } from "../src/config/pocketbase-schema";
import type { PocketBaseCollectionFieldSpec } from "../src/types/pocketbase";

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
  const existing = await pb.collections.getFullList();
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
  }

  return base;
}

async function run() {
  await authenticate();
  await loadExistingCollections();

  for (const schema of pocketBaseSchemaMapping.collections) {
    if (collectionIds.has(schema.collection)) {
      console.log(`  skip  "${schema.collection}" (already exists)`);
      continue;
    }

    const fields = schema.fields.map(mapField);

    const created = await pb.collections.create({
      name: schema.collection,
      type: schema.type,
      fields,
    });

    collectionIds.set(schema.collection, created.id);
    console.log(`  create "${schema.collection}" (${created.id})`);
  }

  console.log("\nDone. All collections are ready.");
}

run().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
