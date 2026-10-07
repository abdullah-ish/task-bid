export const config = {
  port: Number(process.env.API_PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://taskbid:taskbid@localhost:5433/taskbid",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
};
