import PocketBase from "pocketbase";
import { env } from "./env";
import { logger } from "./logger";

export const pocketbase = new PocketBase(env.pocketbaseUrl);
pocketbase.autoCancellation(false);

let inFlight: Promise<void> | null = null;

const authAsSuperuser = async (): Promise<void> => {
  await pocketbase
    .collection("_superusers")
    .authWithPassword(env.pocketbaseSuperuserEmail, env.pocketbaseSuperuserPassword);
  logger.info("pocketbase.superuser.authenticated");
};

export const ensureSuperuserAuth = async (): Promise<void> => {
  if (pocketbase.authStore.isValid) return;
  if (!inFlight) {
    inFlight = authAsSuperuser().finally(() => {
      inFlight = null;
    });
  }
  await inFlight;
};

// Refresh once an hour so a long-running process doesn't drift past token expiry.
setInterval(() => {
  pocketbase.authStore.clear();
  ensureSuperuserAuth().catch((error) => {
    logger.error("pocketbase.superuser.refresh.failed", { error });
  });
}, 60 * 60 * 1000).unref();
