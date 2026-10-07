# Design decisions (Parts A–D)

## A. The capacity race condition

Amina has 8h remaining. Task X’s lowest bid is Amina at 5h. Task Y’s lowest bid is Amina at 7h. Both are valid alone; together they are not.

**Approach:** each `POST /tasks/:id/assign` runs in a single database transaction:

1. `SELECT … FROM tasks WHERE id = $1 FOR UPDATE` so two assigns on the *same* task cannot both win.
2. Walk active bids in `hours ASC, created_at ASC`.
3. Apply capacity with an atomic row update:

```sql
UPDATE users
SET current_workload = current_workload + $hours
WHERE id = $userId
  AND current_workload + $hours <= max_capacity
RETURNING *;
```

Postgres locks the user row for the duration of that update. The second assign waits, then re-evaluates the `WHERE` clause against the new workload. If Amina no longer fits, `rowCount` is 0, her bid is marked `skipped_no_capacity`, and we try the next bidder.

The `users.current_workload <= max_capacity` check constraint is a backstop. Seeded demo: **Race A** and **Race B** on the board. An integration test in `backend/src/assign.race.test.ts` fires both assigns together and asserts Amina wins exactly one.

We did not use `SERIALIZABLE` for this path. Row-level locking plus a conditional update is enough, easier to reason about, and cheaper than serialization retries. `SERIALIZABLE` would still be a valid alternative if more tables were involved.

## B. The stale bid problem

Bids are a *proposal*, not a reservation. Capacity is reserved only at assignment time (when `current_workload` increases).

If Chen bid 3h and later only has 2h remaining, assign does **not** rewrite history. The bid stays in the log; it is skipped (`skipped_no_capacity`) and the next lowest bid is tried. Rejecting the bid retroactively would destroy auditability (“Chen did bid 3h when they had room”). Keeping a stale bid `active` forever would also be wrong once we have decided it cannot win.

Trade-off: a skipped bidder is not auto-revived if capacity frees up later. Re-opening bidding, or a manual re-assign from remaining `active` bids, would be the follow-up if this were a production tool. Seeded demo: **Stale bid: Chen no longer has capacity**.

## C. The dashboard query

`GET /dashboard/stats` is **one SQL statement** with four CTEs (`status_counts`, `avg_bid`, `top_users`, `unbid_overdue`) assembled by `jsonb_build_object`.

Why one query: the four metrics are small aggregates over the same modest tables; one round trip beats four sequential queries in this app. Why not a materialized view: the dataset is tiny and reviewers need live numbers after assign/bid. If this grew to millions of rows, we would split the overdue scan (needs an index on `deadline`, already present) or cache the payload for a few seconds.

## D. Audit log

**Database triggers** on `users`, `tasks`, and `bids` write `audit_log` rows (`INSERT` / `UPDATE` / `DELETE`) with `previous_value` and `new_value` as JSONB.

Actor: the API starts each transaction with `SELECT set_config('app.user_id', $actor, true)` so the trigger can read `current_setting('app.user_id')`. That keeps “who” accurate without duplicating audit writes in every route.

Why not application-only middleware: a missed `INSERT` in one handler would silently drop history; triggers fire for seed scripts and `psql` too. Why not logical decoding / an event bus: overkill for this size.

Trade-off: trigger-captured rows are whole-row JSON, not a field-level diff. That is verbose but complete. Application code still owns business meaning (status transitions, assign). The trigger owns “this row changed.”

## Real-time

**SSE** (`GET /events`) from the API process. Bids and task updates broadcast to open browsers without a page refresh.

Why SSE over WebSockets: one-way server push is all we need; SSE is HTTP, plays nicely with the existing CORS/proxy setup, and is simple on a single API instance. Why not polling: extra load and lag on an auction board.

Trade-off: broadcasts are in-memory. Multiple API replicas would not share events unless we added Redis pub/sub. Free-tier deploy is one instance, which matches this choice.

## Query access

Routes use **parameterized SQL** via `pg`, not an ORM. Constraints live in `db/migrations/001_init.sql` so the database, not the Node process, is the source of truth for bid rules and status direction.
