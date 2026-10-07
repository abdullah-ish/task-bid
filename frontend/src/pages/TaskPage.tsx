import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, eventsUrl, type Bid, type Task } from "../api";
import { useSession } from "../session";

const STATUS_LABELS: Record<string, string> = {
  draft:          "Draft",
  open:           "Open for Bids",
  bidding_closed: "Bidding Closed",
  assigned:       "Assigned",
  in_progress:    "In Progress",
  review:         "Under Review",
  done:           "Done",
};

const ADVANCE_LABEL: Record<string, string> = {
  draft:       "Open for Bidding",
  open:        "Close Bidding",
  assigned:    "Start Work",
  in_progress: "Send to Review",
  review:      "Mark as Done",
};

const BID_STATUS_LABELS: Record<string, string> = {
  active:              "Active",
  won:                 "Won",
  skipped_no_capacity: "Skipped",
};

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
    const bump = () => { load().catch(() => undefined); };
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

  if (!task)
    return (
      <div className="page">
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)" }}>
          Loading task…
        </div>
      </div>
    );

  const isCreator = current?.id === task.created_by;
  const canBid = task.status === "open" && current && !isCreator;
  const canAdvance = task.status !== "bidding_closed" && task.status !== "done";
  const deadline = new Date(task.deadline);
  const overdue = deadline < new Date();

  return (
    <div className="page">
      <Link to="/" className="back-link">← Back to Board</Link>

      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 8 }}>
            <span className={`badge ${task.status}`}>
              {STATUS_LABELS[task.status] ?? task.status}
            </span>
          </div>
          <h1 className="task-title">{task.title}</h1>
          <p className="task-subtitle">
            Posted by <strong>{task.created_by_name}</strong>
          </p>
        </div>
        <div className="btn-group">
          {task.status === "bidding_closed" && (
            <button className="btn" disabled={busy} onClick={assign}>
              {busy ? "Assigning…" : "⚡ Auto-Assign Lowest Bid"}
            </button>
          )}
          {canAdvance && (
            <button className="btn secondary" disabled={busy} onClick={advance}>
              {busy ? "Advancing…" : (ADVANCE_LABEL[task.status] ?? "Advance Status")}
            </button>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* Left — task info + bid form */}
        <section className="detail">
          <div className="section-title">Task Details</div>

          <p className="task-description">
            {task.description || <span className="muted">No description provided.</span>}
          </p>

          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Complexity</span>
              <span className="info-value">
                {"★".repeat(task.complexity)}{"☆".repeat(5 - task.complexity)} ({task.complexity}/5)
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Deadline</span>
              <span className="info-value" style={{ color: overdue ? "var(--danger)" : undefined }}>
                {overdue ? "⚠ " : ""}{deadline.toLocaleString()}
              </span>
            </div>
            {task.assigned_to_name && (
              <div className="info-item">
                <span className="info-label">Assigned To</span>
                <span className="info-value">{task.assigned_to_name}</span>
              </div>
            )}
            {task.assigned_hours && (
              <div className="info-item">
                <span className="info-label">Agreed Hours</span>
                <span className="info-value">{Number(task.assigned_hours)}h</span>
              </div>
            )}
          </div>

          {task.assigned_to_name && (
            <div className="assigned-box">
              <strong>✓ Assigned</strong> — {task.assigned_to_name} will complete this task
              in {Number(task.assigned_hours)}h
            </div>
          )}

          {canBid && current && (
            <BidForm
              taskId={task.id}
              userId={current.id}
              onPlaced={async () => {
                await Promise.all([load(), refresh()]);
              }}
            />
          )}

          {task.status === "open" && isCreator && (
            <div
              className="bid-form"
              style={{ background: "rgba(107,114,128,0.05)", borderColor: "var(--line)", marginTop: 16 }}
            >
              <p className="muted" style={{ margin: 0 }}>
                You created this task and cannot place a bid on it.
              </p>
            </div>
          )}
        </section>

        {/* Right — bids */}
        <section className="detail">
          <div className="section-title">
            Bids{bids.length > 0
              ? ` — ${bids.length} bid${bids.length > 1 ? "s" : ""}, lowest hours first`
              : " — None yet"}
          </div>
          {bids.length === 0 && (
            <p className="muted">No bids have been placed yet.</p>
          )}
          {bids.map((bid) => {
            const isWon = bid.status === "won";
            const isSkipped = bid.status === "skipped_no_capacity";
            const rowClass = `bid-row${isWon ? " bid-won" : isSkipped ? " bid-skipped" : ""}`;
            const tagClass = isWon ? "won" : isSkipped ? "skipped" : "active";
            return (
              <div className={rowClass} key={bid.id}>
                <div>
                  <div className="bid-name" style={{ fontWeight: 500, fontSize: 13 }}>
                    {bid.user_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {new Date(bid.created_at).toLocaleString()}
                  </div>
                </div>
                <span className="bid-hours">{Number(bid.hours)}h</span>
                <span className={`bid-status-tag ${tagClass}`}>
                  {BID_STATUS_LABELS[bid.status] ?? bid.status}
                </span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function BidForm({
  taskId,
  userId,
  onPlaced,
}: {
  taskId: string;
  userId: string;
  onPlaced: () => Promise<void>;
}) {
  const { setNotice, refresh } = useSession();
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [displayRemaining, setDisplayRemaining] = useState<number | null>(null);

  // Load remaining capacity on mount
  useEffect(() => {
    api
      .workload(userId, userId)
      .then((u) => setDisplayRemaining(Number(u.remaining_capacity)))
      .catch(() => undefined);
  }, [userId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Re-fetch fresh capacity at submit time — handles the edge case where capacity
      // changed between page load and form submit (explicitly required by the spec).
      const latestUser = await api.workload(userId, userId);
      const latestRemaining = Number(latestUser.remaining_capacity);
      setDisplayRemaining(latestRemaining);

      const value = Number(hours);
      if (!Number.isFinite(value) || value <= 0) {
        setError("Enter a positive number of hours.");
        return;
      }
      if (value > latestRemaining) {
        setError(
          `Your capacity changed. You now have ${latestRemaining}h remaining — reduce your bid.`
        );
        return;
      }

      await api.placeBid(taskId, userId, value);
      setHours("");
      await onPlaced();
      refresh().catch(() => undefined);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  const remaining = displayRemaining ?? 0;
  const hoursNum = Number(hours);
  const overBid =
    hours !== "" && Number.isFinite(hoursNum) && hoursNum > remaining && remaining > 0;

  return (
    <div className="bid-form">
      <h3>Place a Bid</h3>
      <p className="capacity-hint">
        Your remaining weekly capacity:{" "}
        <strong style={{ color: remaining <= 0 ? "var(--danger)" : "var(--accent-2)" }}>
          {displayRemaining === null ? "…" : `${remaining}h`}
        </strong>
        {remaining <= 0 && displayRemaining !== null && " — no available capacity"}
      </p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="hours">Hours offered</label>
          <input
            id="hours"
            type="number"
            min={0.25}
            step={0.25}
            max={remaining > 0 ? remaining : undefined}
            value={hours}
            onChange={(e) => { setHours(e.target.value); setError(null); }}
            placeholder={remaining > 0 ? `Max ${remaining}h` : "No capacity available"}
            required
            disabled={remaining <= 0 && displayRemaining !== null}
          />
        </div>
        {overBid && (
          <p className="error">
            You only have {remaining}h available — bid cannot exceed this.
          </p>
        )}
        {error && !overBid && <p className="error">{error}</p>}
        <button
          className="btn"
          type="submit"
          disabled={(remaining <= 0 && displayRemaining !== null) || loading || overBid}
        >
          {loading ? "Submitting…" : "Submit Bid"}
        </button>
      </form>
    </div>
  );
}
