# TaskBid

Internal task auction: teammates post work, others bid hours, the lowest *valid* bid wins. Built as a TypeScript React + Node.js + PostgreSQL app with constraints enforced in the database.

**Live URL:** _add after deploy_

## Stack

- PostgreSQL 16, raw SQL migrations, `pg` (no Prisma / TypeORM)
- Node.js 22+ API (Fastify)
- React + Vite frontend, Recharts on the dashboard
- SSE for live bid/task updates
- Docker Compose for Postgres + API + web

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:3001/health
- Postgres: localhost:5433 (user/password/db: `taskbid`)

Compose maps Postgres to **5433** so it does not collide with a local Postgres on 5432.

On API start the container runs migrations and **re-seeds demo data**.

## Local dev (API + Vite, Docker only for DB)

```bash
docker compose up db -d
nvm use
npm install
npm run migrate
npm run seed
npm run dev:api    # :3001
npm run dev:web    # :5173
```

Use the **Acting as** dropdown to switch users (sent as `X-User-Id`). No login.

## Demo scenarios

| Board card | What to do |
|---|---|
| Race A / Race B | Amina has 8h left. Assign both tasks (two browsers or `curl` in parallel). She can win only one; the other goes to the next bidder. |
| Stale bid: Chen | Assign it. Chen’s 3h bid is skipped (2h remaining); Diego wins. |
| Open: CSV export | Switch to Bilal or Diego and bid; watch another tab update without refresh. |
| Overdue with zero bids | Shows on **Dashboard**. |
| Elena | 0h remaining — bid form and DB both reject new bids. |

Parallel assign (after seed, before assigning those two tasks):

```bash
USER=11111111-1111-1111-1111-111111111111
curl -s -X POST -H "X-User-Id: $USER" http://localhost:3001/tasks/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3/assign &
curl -s -X POST -H "X-User-Id: $USER" http://localhost:3001/tasks/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4/assign &
wait
```

Race-condition test (mutates the DB; re-seed afterwards):

```bash
npm test
npm run seed
```

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | User switcher |
| GET | `/users/:id/workload` | Workload and remaining capacity |
| POST | `/tasks` | Create (starts `draft`) |
| GET | `/tasks` | Board payload |
| GET | `/tasks/:id` | Detail |
| PATCH | `/tasks/:id/status` | Next lifecycle step. `bidding_closed → assigned` must use `/assign` |
| POST | `/tasks/:id/bids` | Place bid |
| GET | `/tasks/:id/bids` | Hours ascending |
| POST | `/tasks/:id/assign` | Atomic lowest-valid-bidder assign |
| GET | `/dashboard/stats` | One SQL query, four metrics |
| GET | `/events` | SSE stream |

All mutating routes require `X-User-Id`.

Status lifecycle: `draft → open → bidding_closed → assigned → in_progress → review → done`.

## Database constraints (why they are in SQL)

These races are about **shared mutable state**. Application checks are necessary for clear API errors, but two requests can both pass a Node `if` before either writes. Postgres constraints and triggers serialize the write:

- Unique `(task_id, user_id)` — one bid per user per task
- Trigger: cannot bid on your own task
- Trigger: cannot bid unless `status = open`
- Trigger: `current_workload + bid.hours <= max_capacity` at bid time
- Trigger: task status rank cannot decrease
- Check: `current_workload <= max_capacity` on `users`

**Trade-offs:** business rules become harder to change (a migration instead of a code edit); error messages are mapped from `RAISE EXCEPTION` text; some logic (skip-to-next-bidder) still belongs in a transaction in the API because it is procedural. That split is intentional: invariants in the DB, workflow in the API.

See [DECISIONS.md](./DECISIONS.md) for Parts A–D, audit, and SSE.

## Layout

```
db/migrations/001_init.sql   schema, triggers, indexes
db/seed.sql                  demo users/tasks/bids
backend/src                  Fastify API
frontend/src                 React UI
```

## Deploy notes

- Frontend: Vercel/Netlify, set `VITE_API_URL` to the public API origin
- API + Postgres: Render, Railway, or Fly
- Keep a **single API instance** (or add Redis) so SSE stays consistent
- Run migrations, then `seed.sql`, before handing reviewers the URL
- Keep the URL live at least two weeks after submission
