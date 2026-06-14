import { app } from "../src/app";
import { initRedis } from "../src/store/redis";

let initPromise: Promise<void> | null = null;

function initializeOnce(): Promise<void> {
  if (!initPromise) {
    initPromise = initRedis();
  }
  return initPromise;
}

export default async function vercelHandler(req: any, res: any) {
  await initializeOnce();
  return app(req, res);
}
