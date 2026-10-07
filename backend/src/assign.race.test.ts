import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { pool, readSql, withTransaction } from "./db.js";
import { HttpError } from "./errors.js";
import { assignTask } from "./routes/tasks.js";

const TASK_X = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";
const TASK_Y = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4";
const AMINA = "11111111-1111-1111-1111-111111111111";

before(async () => {
  await pool.query(readSql("seed.sql"));
});

after(async () => {
  await pool.end();
});

test("two simultaneous assigns cannot give Amina both overlapping tasks", async () => {
  const results = await Promise.allSettled([
    withTransaction(AMINA, (client) => assignTask(client, TASK_X)),
    withTransaction(AMINA, (client) => assignTask(client, TASK_Y)),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      assert.ok(
        result.reason instanceof HttpError || result.reason instanceof Error
      );
    }
  }

  const { rows: tasks } = await pool.query(
    `SELECT id, assigned_to, assigned_hours, status
     FROM tasks
     WHERE id IN ($1, $2)`,
    [TASK_X, TASK_Y]
  );

  const aminaWins = tasks.filter((t) => t.assigned_to === AMINA);
  assert.equal(
    aminaWins.length,
    1,
    "Amina has 8h remaining and must not win both 5h and 7h assignments"
  );

  const { rows: amina } = await pool.query(
    "SELECT current_workload, max_capacity FROM users WHERE id = $1",
    [AMINA]
  );
  assert.ok(Number(amina[0].current_workload) <= Number(amina[0].max_capacity));
  assert.equal(Number(amina[0].current_workload), 32 + Number(aminaWins[0].assigned_hours));
});
