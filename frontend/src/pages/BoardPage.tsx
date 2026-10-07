import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, eventsUrl, type Task } from "../api";
import { useSession } from "../session";

const COLUMNS: { key: string; label: string }[] = [
  { key: "draft",          label: "Draft" },
  { key: "open",           label: "Open" },
  { key: "bidding_closed", label: "Bidding Closed" },
  { key: "assigned",       label: "Assigned" },
  { key: "in_progress",    label: "In Progress" },
  { key: "review",         label: "Review" },
  { key: "done",           label: "Done" },
];

function isOverdue(deadline: string) {
  return new Date(deadline) < new Date();
}

export function BoardPage() {
  const { current, setNotice } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openForm, setOpenForm] = useState(false);

  async function load() {
    const data = await api.tasks(current?.id ?? null);
    setTasks(data.tasks);
  }

  useEffect(() => {
    load().catch((err: Error) => setNotice(err.message));
  }, [current?.id]);

  useEffect(() => {
    const source = new EventSource(eventsUrl());
    const bump = () => { load().catch(() => undefined); };
    source.addEventListener("task.updated", bump);
    source.addEventListener("bid.created", bump);
    source.addEventListener("task.assigned", bump);
    return () => source.close();
  }, [current?.id]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-titles">
          <h1>Task Board</h1>
          <p>Tasks grouped by lifecycle status — click any card to view details and bid</p>
        </div>
        {current && (
          <button className="btn" onClick={() => setOpenForm((v) => !v)}>
            {openForm ? "✕ Cancel" : "+ New Task"}
          </button>
        )}
      </div>

      {openForm && current && (
        <CreateTask
          userId={current.id}
          onCreated={() => {
            setOpenForm(false);
            load().catch((err: Error) => setNotice(err.message));
          }}
          onCancel={() => setOpenForm(false)}
        />
      )}

      <div className="board">
        {COLUMNS.map(({ key, label }) => {
          const col = tasks.filter((t) => t.status === key);
          return (
            <section className="column" key={key} data-status={key}>
              <div className="column-header">
                <span className="column-title">{label}</span>
                <span className="column-count">{col.length}</span>
              </div>
              <div className="cards">
                {col.length === 0 && (
                  <div className="empty-col">No tasks</div>
                )}
                {col.map((task) => {
                  const overdue = isOverdue(task.deadline);
                  return (
                    <Link className="card" key={task.id} to={`/tasks/${task.id}`}>
                      <div className="card-title">{task.title}</div>
                      <div className="card-meta">
                        <span className="pill">C{task.complexity}</span>
                        <span className={`pill${overdue ? " overdue" : ""}`}>
                          {overdue ? "⚠ " : ""}{new Date(task.deadline).toLocaleDateString()}
                        </span>
                        {task.bid_count > 0 && (
                          <span className="pill bids">
                            {task.bid_count} {task.bid_count === 1 ? "bid" : "bids"}
                          </span>
                        )}
                        {task.bid_count === 0 && key === "open" && (
                          <span className="pill">no bids</span>
                        )}
                        {task.lowest_bid && (
                          <span className="pill highlight">low {Number(task.lowest_bid)}h</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CreateTask({
  userId,
  onCreated,
  onCancel,
}: {
  userId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { setNotice } = useSession();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.createTask(userId, {
        title: String(form.get("title")),
        description: String(form.get("description")),
        complexity: Number(form.get("complexity")),
        deadline: new Date(String(form.get("deadline"))).toISOString(),
      });
      onCreated();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const defaultDeadline = new Date(Date.now() + 7 * 86400000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="section-title">Create New Task</div>
      <form onSubmit={onSubmit}>
        <div className="grid-2" style={{ gap: 12 }}>
          <div>
            <div className="field">
              <label htmlFor="title">Title *</label>
              <input id="title" name="title" placeholder="Short, clear task name" required />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea id="description" name="description" rows={3} placeholder="What needs to be done?" />
            </div>
          </div>
          <div>
            <div className="field">
              <label htmlFor="complexity">Complexity (1–5)</label>
              <select id="complexity" name="complexity" defaultValue="3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} — {["Very simple", "Simple", "Moderate", "Complex", "Very complex"][n - 1]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="deadline">Deadline *</label>
              <input
                id="deadline"
                name="deadline"
                type="datetime-local"
                defaultValue={defaultDeadline}
                required
              />
            </div>
            <div className="btn-group" style={{ marginTop: 8 }}>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create Draft"}
              </button>
              <button className="btn secondary" type="button" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
