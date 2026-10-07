import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { sendError } from "../errors.js";

const STATS_SQL = `
WITH statuses AS (
  SELECT unnest(enum_range(NULL::task_status)) AS status
),
status_counts AS (
  SELECT s.status, count(t.id)::int AS count
  FROM statuses s
  LEFT JOIN tasks t ON t.status = s.status
  GROUP BY s.status
),
avg_bid AS (
  SELECT c.complexity,
         avg(b.hours) AS avg_hours,
         count(b.id)::int AS bid_count
  FROM generate_series(1, 5) AS c(complexity)
  LEFT JOIN tasks t ON t.complexity = c.complexity
  LEFT JOIN bids b ON b.task_id = t.id
  GROUP BY c.complexity
),
top_users AS (
  SELECT u.id, u.name, count(*)::int AS tasks_completed
  FROM tasks t
  JOIN users u ON u.id = t.assigned_to
  WHERE t.status = 'done'
  GROUP BY u.id, u.name
  ORDER BY tasks_completed DESC, u.name
  LIMIT 3
),
unbid_overdue AS (
  SELECT t.id, t.title, t.deadline, t.status
  FROM tasks t
  WHERE t.deadline < now()
    AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.task_id = t.id)
  ORDER BY t.deadline
)
SELECT jsonb_build_object(
  'tasksByStatus', (
    SELECT jsonb_agg(
      jsonb_build_object('status', status, 'count', count)
      ORDER BY status
    )
    FROM status_counts
  ),
  'avgBidByComplexity', (
    SELECT jsonb_agg(
      jsonb_build_object(
        'complexity', complexity,
        'avgHours', avg_hours,
        'bidCount', bid_count
      )
      ORDER BY complexity
    )
    FROM avg_bid
  ),
  'topCompleters', (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'tasksCompleted', tasks_completed
        )
      ),
      '[]'::jsonb
    )
    FROM top_users
  ),
  'unbidOverdueTasks', (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'title', title,
          'deadline', deadline,
          'status', status
        )
      ),
      '[]'::jsonb
    )
    FROM unbid_overdue
  )
) AS stats
`;

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/stats", async (_req, reply) => {
    try {
      const { rows } = await pool.query(STATS_SQL);
      return rows[0]?.stats ?? {};
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
