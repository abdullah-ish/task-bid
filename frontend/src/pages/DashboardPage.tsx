import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type DashboardStats } from "../api";
import { useSession } from "../session";

export function DashboardPage() {
  const { current, setNotice } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api
      .stats(current?.id ?? null)
      .then(setStats)
      .catch((err: Error) => setNotice(err.message));
  }, [current?.id, setNotice]);

  if (!stats) return <div className="page">Loading…</div>;

  const chartData = (stats.avgBidByComplexity ?? []).map((row) => ({
    complexity: `C${row.complexity}`,
    hours: row.avgHours == null ? 0 : Number(row.avgHours),
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <h2>Single-query aggregates from Postgres</h2>
        </div>
      </div>
      <div className="stats">
        <section className="panel">
          <h2>Average bid hours by complexity</h2>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#343b4a" vertical={false} />
                <XAxis dataKey="complexity" stroke="#9aa3b5" />
                <YAxis stroke="#9aa3b5" />
                <Tooltip />
                <Bar dataKey="hours" fill="#e2b15a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <h2>Tasks by status</h2>
          <ul className="list">
            {(stats.tasksByStatus ?? []).map((row) => (
              <li key={row.status}>
                {row.status.replaceAll("_", " ")} — <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
          <h2>Top completers</h2>
          <ul className="list">
            {(stats.topCompleters ?? []).length === 0 && (
              <li className="muted">No completed tasks yet.</li>
            )}
            {(stats.topCompleters ?? []).map((u) => (
              <li key={u.id}>
                {u.name} — {u.tasksCompleted}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Past deadline, zero bids</h2>
        {(stats.unbidOverdueTasks ?? []).length === 0 && (
          <p className="muted">None.</p>
        )}
        <ul className="list">
          {(stats.unbidOverdueTasks ?? []).map((t) => (
            <li key={t.id}>
              {t.title} — {new Date(t.deadline).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
