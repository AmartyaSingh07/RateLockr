import serverless from "serverless-http";
import { app } from "../src/app";
import { initRedis } from "../src/store/redis";

let initialized = false;

async function initializeOnce(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;
  await initRedis();
}

const handler = serverless(app);

export default async function vercelHandler(req: any, res: any) {
  await initializeOnce();
  return handler(req, res);
}
