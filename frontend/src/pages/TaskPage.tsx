import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, eventsUrl, type Bid, type Task } from "../api";
import { useSession } from "../session";

export function TaskPage() {
  const { id } = useParams();
  const { current, refresh, setNotice } = useSession();
  const [task, setTask] = useState<Task | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    const [t, b] = await Promise.all([
      api.task(id, current?.id ?? null),
      api.bids(id, current?.id ?? null),
    ]);
    setTask(t);
    setBids(b.bids);
  }

  useEffect(() => {
    load().catch((err: Error) => setNotice(err.message));
  }, [id, current?.id]);

  useEffect(() => {
    const source = new EventSource(eventsUrl());
    const bump = () => {
      load().catch(() => undefined);
    };
    source.addEventListener("bid.created", bump);
    source.addEventListener("task.updated", bump);
    source.addEventListener("task.assigned", bump);
    return () => source.close();
  }, [id, current?.id]);

  async function advance() {
    if (!id || !current) return;
    setBusy(true);
    try {
      await api.advanceStatus(id, current.id);
      await load();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    if (!id || !current) return;
    setBusy(true);
    try {
      await api.assign(id, current.id);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!task) return <div className="page">Loading…</div>;

  const remaining = current ? Number(current.remaining_capacity) : 0;
  const canBid =
    task.status === "open" && current && current.id !== task.created_by;

  return (
    <div className="page">
      <p>
        <Link to="/">← Board</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{task.title}</h1>
          <h2>
            {task.status.replaceAll("_", " ")} · posted by {task.created_by_name}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {task.status === "bidding_closed" && (
            <button className="btn" disabled={busy} onClick={assign}>
              Auto-assign lowest valid bid
            </button>
          )}
          {task.status !== "bidding_closed" && task.status !== "done" && (
            <button className="btn secondary" disabled={busy} onClick={advance}>
              Advance status
            </button>
          )}
        </div>
      </div>
      <div className="grid-2">
        <section className="detail">
          <p>{task.description}</p>
          <div className="meta">
            <span className="pill">complexity {task.complexity}</span>
            <span className="pill">
              deadline {new Date(task.deadline).toLocaleString()}
            </span>
            {task.assigned_to_name && (
              <span className="pill">
                assigned {task.assigned_to_name} ({Number(task.assigned_hours)}h)
              </span>
            )}
          </div>
          {canBid && current && (
            <BidForm
              taskId={task.id}
              remaining={remaining}
              userId={current.id}
              onPlaced={async () => {
                await Promise.all([load(), refresh()]);
              }}
            />
          )}
          {task.status === "open" && current?.id === task.created_by && (
            <p className="muted">You cannot bid on your own task.</p>
          )}
        </section>
        <section className="detail">
          <h2>Bids (lowest hours first)</h2>
          {bids.length === 0 && <p className="muted">No bids yet.</p>}
          {bids.map((bid) => (
            <div className="bid-row" key={bid.id}>
              <span>{bid.user_name}</span>
              <strong>{Number(bid.hours)}h</strong>
              <span className="muted">{bid.status}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function BidForm({
  taskId,
  remaining,
  userId,
  onPlaced,
}: {
  taskId: string;
  remaining: number;
  userId: string;
  onPlaced: () => Promise<void>;
}) {
  const { setNotice } = useSession();
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(hours);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive number of hours.");
      return;
    }
    if (value > remaining) {
      setError(`You only have ${remaining}h remaining this week.`);
      return;
    }
    try {
      setError(null);
      await api.placeBid(taskId, userId, value);
      setHours("");
      await onPlaced();
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      setNotice(message);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 20 }}>
      <h2>Place a bid</h2>
      <p className="muted">Remaining capacity: {remaining}h</p>
      <div className="field">
        <label htmlFor="hours">Hours offered</label>
        <input
          id="hours"
          type="number"
          min={0.25}
          step={0.25}
          max={remaining || undefined}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          required
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn" type="submit" disabled={remaining <= 0}>
        Submit bid
      </button>
    </form>
  );
}
