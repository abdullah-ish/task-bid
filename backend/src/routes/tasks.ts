import type { FastifyInstance } from "fastify";
import type { Client } from "../db.js";
import { pool, withTransaction } from "../db.js";
import { HttpError, sendError } from "../errors.js";
import { broadcast } from "../realtime.js";
import { actorId } from "./context.js";

const STATUSES = [
  "draft",
  "open",
  "bidding_closed",
  "assigned",
  "in_progress",
  "review",
  "done",
] as const;

type TaskStatus = (typeof STATUSES)[number];

const NEXT: Record<TaskStatus, TaskStatus | null> = {
  draft: "open",
  open: "bidding_closed",
  bidding_closed: "assigned",
  assigned: "in_progress",
  in_progress: "review",
  review: "done",
  done: null,
};

const TASK_SELECT = `
  SELECT t.*,
         creator.name AS created_by_name,
         assignee.name AS assigned_to_name,
         COALESCE(b.bid_count, 0) AS bid_count,
         b.lowest_bid
  FROM tasks t
  JOIN users creator ON creator.id = t.created_by
  LEFT JOIN users assignee ON assignee.id = t.assigned_to
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS bid_count, min(hours) AS lowest_bid
    FROM bids
    WHERE task_id = t.id
  ) b ON true
`;

async function getTask(client: Client | typeof pool, id: string) {
  const { rows } = await client.query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function taskRoutes(app: FastifyInstance) {
  app.get("/tasks", async (_req, reply) => {
    try {
      const { rows } = await pool.query(
        `${TASK_SELECT} ORDER BY t.created_at DESC`
      );
      return { tasks: rows };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/tasks/:id", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const task = await getTask(pool, id);
      if (!task) {
        return reply.status(404).send({
          error: "TASK_NOT_FOUND",
          message: "Task not found.",
        });
      }
      return task;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/tasks", async (req, reply) => {
    try {
      const userId = actorId(req);
      const body = req.body as {
        title?: string;
        description?: string;
        complexity?: number;
        deadline?: string;
      };
      const title = body.title?.trim();
      if (!title) {
        throw new HttpError(400, "Title is required.", "VALIDATION");
      }
      const complexity = Number(body.complexity);
      if (!Number.isInteger(complexity) || complexity < 1 || complexity > 5) {
        throw new HttpError(400, "Complexity must be 1–5.", "VALIDATION");
      }
      if (!body.deadline) {
        throw new HttpError(400, "Deadline is required.", "VALIDATION");
      }

      const task = await withTransaction(userId, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO tasks (title, description, complexity, status, created_by, deadline)
           VALUES ($1, $2, $3, 'draft', $4, $5)
          RETURNING id`,
          [
            title,
            body.description?.trim() ?? "",
            complexity,
            userId,
            body.deadline,
          ]
        );
        return getTask(client, rows[0].id);
      });

      broadcast({ type: "task.updated", payload: { task } });
      return reply.status(201).send(task);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/tasks/:id/status", async (req, reply) => {
    try {
      const userId = actorId(req);
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { status?: string };
      const requested = body.status as TaskStatus | undefined;

      const task = await withTransaction(userId, async (client) => {
        const { rows: locked } = await client.query(
          "SELECT * FROM tasks WHERE id = $1 FOR UPDATE",
          [id]
        );
        const current = locked[0];
        if (!current) {
          throw new HttpError(404, "Task not found.", "TASK_NOT_FOUND");
        }

        const next = NEXT[current.status as TaskStatus];
        if (!next) {
          throw new HttpError(409, "Task is already done.", "NO_NEXT_STATUS");
        }
        if (current.status === "bidding_closed") {
          throw new HttpError(
            409,
            "Use POST /tasks/:id/assign to move from bidding_closed to assigned.",
            "USE_ASSIGN"
          );
        }
        if (requested && requested !== next) {
          throw new HttpError(
            409,
            `Next allowed status is ${next}.`,
            "INVALID_TRANSITION"
          );
        }

        await client.query("UPDATE tasks SET status = $2 WHERE id = $1", [
          id,
          next,
        ]);
        return getTask(client, id);
      });

      broadcast({ type: "task.updated", payload: { task } });
      return task;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/tasks/:id/bids", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { rows } = await pool.query(
        `SELECT b.id, b.task_id, b.user_id, u.name AS user_name, b.hours, b.status, b.created_at
         FROM bids b
         JOIN users u ON u.id = b.user_id
         WHERE b.task_id = $1
         ORDER BY b.hours ASC, b.created_at ASC`,
        [id]
      );
      return { bids: rows };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/tasks/:id/bids", async (req, reply) => {
    try {
      const userId = actorId(req);
      const { id } = req.params as { id: string };
      const body = req.body as { hours?: number };
      const hours = Number(body.hours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new HttpError(400, "Hours must be a positive number.", "VALIDATION");
      }

      const result = await withTransaction(userId, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO bids (task_id, user_id, hours)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [id, userId, hours]
        );
        const { rows: bids } = await client.query(
          `SELECT b.id, b.task_id, b.user_id, u.name AS user_name, b.hours, b.status, b.created_at
           FROM bids b
           JOIN users u ON u.id = b.user_id
           WHERE b.id = $1`,
          [rows[0].id]
        );
        const task = await getTask(client, id);
        return { bid: bids[0], task };
      });

      broadcast({ type: "bid.created", payload: result });
      broadcast({ type: "task.updated", payload: { task: result.task } });
      return reply.status(201).send(result.bid);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/tasks/:id/assign", async (req, reply) => {
    try {
      const userId = actorId(req);
      const { id } = req.params as { id: string };

      const assigned = await withTransaction(userId, async (client) => {
        return assignTask(client, id);
      });

      broadcast({ type: "task.assigned", payload: { task: assigned.task } });
      broadcast({ type: "task.updated", payload: { task: assigned.task } });
      broadcast({
        type: "user.updated",
        payload: { userId: assigned.task.assigned_to },
      });
      return assigned;
    } catch (err) {
      return sendError(reply, err);
    }
  });
}

export async function assignTask(client: Client, taskId: string) {
  const { rows: locked } = await client.query(
    "SELECT * FROM tasks WHERE id = $1 FOR UPDATE",
    [taskId]
  );
  const task = locked[0];
  if (!task) {
    throw new HttpError(404, "Task not found.", "TASK_NOT_FOUND");
  }
  if (task.status !== "bidding_closed") {
    throw new HttpError(
      409,
      `Assignment requires status bidding_closed (current: ${task.status}).`,
      "NOT_READY_TO_ASSIGN"
    );
  }

  const { rows: bids } = await client.query(
    `SELECT * FROM bids
     WHERE task_id = $1 AND status = 'active'
     ORDER BY hours ASC, created_at ASC
     FOR UPDATE`,
    [taskId]
  );

  const skipped: string[] = [];

  for (const bid of bids) {
    const updated = await client.query(
      `UPDATE users
       SET current_workload = current_workload + $2
       WHERE id = $1
         AND current_workload + $2 <= max_capacity
       RETURNING id, name, current_workload, max_capacity`,
      [bid.user_id, bid.hours]
    );

    if (updated.rowCount === 0) {
      await client.query(
        `UPDATE bids SET status = 'skipped_no_capacity' WHERE id = $1`,
        [bid.id]
      );
      skipped.push(bid.id);
      continue;
    }

    await client.query(
      `UPDATE tasks
       SET status = 'assigned', assigned_to = $2, assigned_hours = $3
       WHERE id = $1`,
      [taskId, bid.user_id, bid.hours]
    );
    await client.query(`UPDATE bids SET status = 'won' WHERE id = $1`, [
      bid.id,
    ]);

    const full = await getTask(client, taskId);
    return {
      task: full,
      winner: updated.rows[0],
      skippedBidIds: skipped,
    };
  }

  throw new HttpError(
    409,
    "No bidder currently has remaining capacity for their bid. No assignment was made.",
    "NO_VALID_BIDDER"
  );
}
