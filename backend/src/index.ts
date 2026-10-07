import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { pool } from "./db.js";
import { sendError } from "./errors.js";
import { addSseClient } from "./realtime.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { taskRoutes } from "./routes/tasks.js";
import { userRoutes } from "./routes/users.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-User-Id"],
});

app.get("/health", async () => ({ ok: true }));

app.get("/events", async (req, reply) => {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": req.headers.origin ?? "*",
  });
  reply.raw.write("event: ready\ndata: {}\n\n");
  addSseClient(reply);
  const ping = setInterval(() => {
    try {
      reply.raw.write("event: ping\ndata: {}\n\n");
    } catch {
      clearInterval(ping);
    }
  }, 25000);
  req.raw.on("close", () => clearInterval(ping));
});

await app.register(userRoutes);
await app.register(taskRoutes);
await app.register(dashboardRoutes);

app.setErrorHandler((err, _req, reply) => sendError(reply, err));

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: "0.0.0.0" });
