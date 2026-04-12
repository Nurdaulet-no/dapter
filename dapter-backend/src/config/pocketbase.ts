import PocketBase from "pocketbase";
import { env } from "./env";

export const pocketbase = new PocketBase(env.pocketbaseUrl);
