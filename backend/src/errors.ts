import type { FastifyReply } from "fastify";
import { isPgError } from "./db.js";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string
  ) {
    super(message);
  }
}

export function mapDbError(err: unknown): HttpError | null {
  if (!isPgError(err)) return null;
  const message = err.message ?? "Database error";

  if (message.includes("OWN_TASK_BID")) {
    return new HttpError(400, "You cannot bid on your own task.", "OWN_TASK_BID");
  }
  if (message.includes("BIDDING_CLOSED")) {
    return new HttpError(
      409,
      "Bids cannot be placed after bidding is closed.",
      "BIDDING_CLOSED"
    );
  }
  if (message.includes("CAPACITY_EXCEEDED")) {
    return new HttpError(
      409,
      "This bid would exceed your remaining weekly capacity.",
      "CAPACITY_EXCEEDED"
    );
  }
  if (message.includes("TASK_STATUS_REGRESSION")) {
    return new HttpError(
      409,
      "A task cannot move backward in its status lifecycle.",
      "TASK_STATUS_REGRESSION"
    );
  }
  if (err.code === "23505") {
    return new HttpError(
      409,
      "You have already placed a bid on this task.",
      "DUPLICATE_BID"
    );
  }
  if (err.code === "23P01" || err.code === "23514") {
    return new HttpError(409, message, "CHECK_VIOLATION");
  }
  return new HttpError(400, message, err.code ?? "DB_ERROR");
}

export function sendError(reply: FastifyReply, err: unknown) {
  const mapped = err instanceof HttpError ? err : mapDbError(err);
  if (mapped) {
    return reply.status(mapped.statusCode).send({
      error: mapped.code,
      message: mapped.message,
    });
  }
  console.error(err);
  return reply.status(500).send({
    error: "INTERNAL",
    message: "Unexpected server error.",
  });
}
