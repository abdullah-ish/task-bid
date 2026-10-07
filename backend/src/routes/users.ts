import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { sendError } from "../errors.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/users", async (_req, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, email, hourly_rate, max_capacity, current_workload,
                (max_capacity - current_workload) AS remaining_capacity
         FROM users
         ORDER BY name`
      );
      return { users: rows };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/users/:id/workload", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { rows } = await pool.query(
        `SELECT id, name, email, hourly_rate, max_capacity, current_workload,
                (max_capacity - current_workload) AS remaining_capacity
         FROM users
         WHERE id = $1`,
        [id]
      );
      if (!rows[0]) {
        return reply.status(404).send({
          error: "USER_NOT_FOUND",
          message: "User not found.",
        });
      }
      return rows[0];
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
