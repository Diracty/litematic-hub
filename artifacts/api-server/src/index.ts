import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
/** Large .litematic: gzip + parse + DB can take several minutes on free VPS. */
server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 16 * 60 * 1000;

server.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, requestTimeoutMs: server.requestTimeout }, "Server listening");
});
