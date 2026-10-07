import { pool, readSql } from "../db.js";

async function seed() {
  const sql = readSql("seed.sql");
  await pool.query(sql);
  console.log("seed complete");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
