import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { api, type DashboardStats } from "../api";
import { useSession } from "../session";

const STATUS_COLORS: Record<string, string> = {
  draft:          "#6b7280",
  open:           "#3b82f6",
  bidding_closed: "#f59e0b",
  assigned:       "#8b5cf6",
  in_progress:    "#06b6d4",
  review:         "#f97316",
  done:           "#22c55e",
};

const STATUS_LABELS: Record<string, string> = {
  draft:          "Draft",
  open:           "Open",
  bidding_closed: "Bidding Closed",
  assigned:       "Assigned",
  in_progress:    "In Progress",
  review:         "Under Review",
  done:           "Done",
};

const MEDAL = ["🥇", "🥈", "🥉"];

type ChartEntry = { complexity: string; hours: number; bidCount: number };

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; payload: ChartEntry }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
      }}
    >
      <div style={{ color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{Number(payload[0].value).toFixed(1)}h avg</div>
      <div style={{ color: "var(--muted)", fontSize: 11 }}>
        {payload[0].payload.bidCount} bid{payload[0].payload.bidCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { current, setNotice } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api
      .stats(current?.id ?? null)
      .then(setStats)
      .catch((err: Error) => setNotice(err.message));
  }, [current?.id]);

  if (!stats)
    return (
      <div className="page">
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)" }}>
          Loading dashboard…
        </div>
      </div>
    );

  const chartData: ChartEntry[] = (stats.avgBidByComplexity ?? []).map((row) => ({
    complexity: `C${row.complexity}`,
    hours: row.avgHours == null ? 0 : Number(row.avgHours),
    bidCount: row.bidCount,
  }));

  const totalTasks  = (stats.tasksByStatus ?? []).reduce((s, r) => s + r.count, 0);
  const doneTasks   = (stats.tasksByStatus ?? []).find((r) => r.status === "done")?.count ?? 0;
  const openTasks   = (stats.tasksByStatus ?? []).find((r) => r.status === "open")?.count ?? 0;
  const overdueCount = stats.unbidOverdueTasks?.length ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-titles">
          <h1>Dashboard</h1>
          <p>Live aggregated stats — single SQL query from Postgres</p>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <p className="stat-card-label">Total Tasks</p>
          <div className="stat-card-value">{totalTasks}</div>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Completed</p>
          <div className="stat-card-value" style={{ color: "var(--success)" }}>{doneTasks}</div>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Open for Bids</p>
          <div className="stat-card-value" style={{ color: "#60a5fa" }}>{openTasks}</div>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Overdue (no bids)</p>
          <div
            className="stat-card-value"
            style={{ color: overdueCount > 0 ? "var(--danger)" : "var(--muted)" }}
          >
            {overdueCount}
          </div>
        </div>
      </div>

      <div className="stats">
        {/* Chart — avg bid hours by complexity */}
        <section className="panel">
          <div className="section-title">Average Bid Hours by Complexity</div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="#2a3045" vertical={false} />
                <XAxis dataKey="complexity" stroke="#8892a4" tick={{ fontSize: 12 }} />
                <YAxis stroke="#8892a4" tick={{ fontSize: 12 }} unit="h" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.complexity}
                      fill={entry.hours === 0 ? "#2a3045" : "#f59e0b"}
                      opacity={entry.bidCount === 0 ? 0.4 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0", textAlign: "center" }}>
            Dimmed bars = no bids placed at that complexity level yet
          </p>
        </section>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Tasks by status */}
          <section className="panel">
            <div className="section-title">Tasks by Status</div>
            <ul className="list">
              {(stats.tasksByStatus ?? []).map((row) => (
                <li key={row.status}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 8, height: 8,
                        borderRadius: "50%",
                        background: STATUS_COLORS[row.status] ?? "#6b7280",
                        flexShrink: 0,
                      }}
                    />
                    <span>{STATUS_LABELS[row.status] ?? row.status}</span>
                  </span>
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      color: row.count > 0 ? "var(--text)" : "var(--muted)",
                    }}
                  >
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Top 3 completers */}
          <section className="panel">
            <div className="section-title">Top 3 Completers</div>
            {(stats.topCompleters ?? []).length === 0 && (
              <p className="muted">No completed tasks yet.</p>
            )}
            <ul className="list">
              {(stats.topCompleters ?? []).map((u, i) => (
                <li key={u.id}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{MEDAL[i] ?? "🏅"}</span>
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                  </span>
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 13,
                      color: "var(--success)",
                      fontWeight: 700,
                    }}
                  >
                    {u.tasksCompleted} done
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Past deadline — zero bids */}
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-title">Past Deadline — Zero Bids</div>
        {(stats.unbidOverdueTasks ?? []).length === 0 ? (
          <p className="muted">None. All tasks with deadlines have at least one bid.</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>
              These tasks passed their deadline without receiving any bids.
            </p>
            {(stats.unbidOverdueTasks ?? []).map((t) => (
              <div key={t.id} className="overdue-row">
                <Link to={`/tasks/${t.id}`} className="overdue-link">{t.title}</Link>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`badge ${t.status}`}>
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                  <span className="overdue-date">
                    ⚠ {new Date(t.deadline).toLocaleDateString()}
                  </span>
                </span>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
