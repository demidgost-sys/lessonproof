import "dotenv/config";

import { createLessonProofServer } from "./app";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const host =
  process.env.HOST ??
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = createLessonProofServer();
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.listen(port, host, () => {
  process.stdout.write(`LessonProof listening on http://${host}:${port}\n`);
});

function shutdown(): void {
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
