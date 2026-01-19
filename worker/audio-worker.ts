import { initDb } from "../app/db";

async function workerLoop() {
  await initDb();
  console.log("[AudioWorker] Initialized (disabled: no queue configured)");

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}

console.log("[AudioWorker] Starting...");
workerLoop().catch((error) => {
  console.error("[AudioWorker] Fatal error:", error);
  process.exit(1);
});
