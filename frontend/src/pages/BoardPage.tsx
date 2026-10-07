import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, eventsUrl, type Task } from "../api";
import { useSession } from "../session";

const COLUMNS = [
  "draft",
  "open",
  "bidding_closed",
  "assigned",
  "in_progress",
  "review",
  "done",
];

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
    const bump = () => {
      load().catch(() => undefined);
    };
    source.addEventListener("task.updated", bump);
    source.addEventListener("bid.created", bump);
    source.addEventListener("task.assigned", bump);
    return () => source.close();
  }, [current?.id]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Task board</h1>
          <h2>Grouped by lifecycle status</h2>
        </div>
        <button className="btn" onClick={() => setOpenForm((v) => !v)}>
          {openForm ? "Close" : "New task"}
        </button>
      </div>
      {openForm && current && (
        <CreateTask
          userId={current.id}
          onCreated={() => {
            setOpenForm(false);
            load().catch((err: Error) => setNotice(err.message));
          }}
        />
      )}
      <div className="board">
        {COLUMNS.map((status) => (
          <section className="column" key={status}>
            <header>
              <span>{status.replaceAll("_", " ")}</span>
              <span>{tasks.filter((t) => t.status === status).length}</span>
            </header>
            <div className="cards">
              {tasks
                .filter((t) => t.status === status)
                .map((task) => (
                  <Link className="card" key={task.id} to={`/tasks/${task.id}`}>
                    <h3>{task.title}</h3>
                    <div className="meta">
                      <span className="pill">C{task.complexity}</span>
                      <span className="pill">
                        {new Date(task.deadline).toLocaleDateString()}
                      </span>
                      <span className="pill">{task.bid_count} bids</span>
                      {task.lowest_bid && (
                        <span className="pill">low {Number(task.lowest_bid)}h</span>
                      )}
                    </div>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CreateTask({
  userId,
  onCreated,
}: {
  userId: string;
  onCreated: () => void;
}) {
  const { setNotice } = useSession();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    }
  }

  const defaultDeadline = new Date(Date.now() + 7 * 86400000)
    .toISOString()
    .slice(0, 16);

  return (
    <form className="panel" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required />
      </div>
      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={3} />
      </div>
      <div className="field">
        <label htmlFor="complexity">Complexity</label>
        <select id="complexity" name="complexity" defaultValue="3">
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="deadline">Deadline</label>
        <input
          id="deadline"
          name="deadline"
          type="datetime-local"
          defaultValue={defaultDeadline}
          required
        />
      </div>
      <button className="btn" type="submit">
        Create draft
      </button>
    </form>
  );
}
