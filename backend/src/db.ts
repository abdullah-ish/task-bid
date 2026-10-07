import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

export type Client = pg.PoolClient;

export function dbDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../db"),
    path.resolve(here, "../../../db"),
    path.resolve(process.cwd(), "db"),
    path.resolve(process.cwd(), "../db"),
  ];
  for (const dir of candidates) {
    try {
      if (readdirSync(dir).includes("migrations")) return dir;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not locate db/ directory");
}

export function readSql(relativePath: string): string {
  return readFileSync(path.join(dbDir(), relativePath), "utf8");
}

export async function withTransaction<T>(
  actorId: string | null,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [
      actorId ?? "",
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export function isPgError(err: unknown): err is pg.DatabaseError {
  return Boolean(err && typeof err === "object" && "code" in err);
}
