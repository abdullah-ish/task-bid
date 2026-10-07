import type { FastifyRequest } from "fastify";
import { HttpError } from "../errors.js";

export function actorId(req: FastifyRequest): string {
  const header = req.headers["x-user-id"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new HttpError(
      401,
      "Set the X-User-Id header (use the user switcher).",
      "NO_USER"
    );
  }
  return value;
}
