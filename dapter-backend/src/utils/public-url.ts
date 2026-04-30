import { env } from "../config/env";

export const toPublicFileUrl = (internalUrl: string): string => {
  try {
    const url = new URL(internalUrl);
    const publicBase = new URL(env.pocketbasePublicUrl);
    url.protocol = publicBase.protocol;
    url.host = publicBase.host;
    return url.toString();
  } catch {
    return internalUrl;
  }
};
