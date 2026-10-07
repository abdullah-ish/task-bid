import type { FastifyReply } from "fastify";

type EventName =
  | "bid.created"
  | "task.updated"
  | "task.assigned"
  | "user.updated";

export type RealtimeEvent = {
  type: EventName;
  payload: Record<string, unknown>;
};

const clients = new Set<FastifyReply>();

export function addSseClient(reply: FastifyReply) {
  clients.add(reply);
  reply.raw.on("close", () => {
    clients.delete(reply);
  });
}

export function broadcast(event: RealtimeEvent) {
  const frame = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
  for (const reply of clients) {
    try {
      reply.raw.write(frame);
    } catch {
      clients.delete(reply);
    }
  }
}
