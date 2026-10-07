import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { BoardPage } from "./pages/BoardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TaskPage } from "./pages/TaskPage";
import { useSession } from "./session";

type Toast = { id: number; message: string; type: "error" | "success" | "info" };

let _toastId = 0;

export function App() {
  const { users, current, setUserId, notice, setNotice } = useSession();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Convert session notice → auto-dismissing toast
  useEffect(() => {
    if (!notice) return;
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message: notice, type: "error" }]);
    setNotice(null);
    const t = setTimeout(() => dismiss(id), 5000);
    timers.current.set(id, t);
  }, [notice]);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }

  const remaining = current ? Number(current.remaining_capacity) : 0;
  const max = current ? Number(current.max_capacity) : 1;
  const fillPct = max > 0 ? Math.round((remaining / max) * 100) : 0;
  const isLow = fillPct <= 25;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">TB</div>
          <div className="brand-text">
            <strong>TaskBid</strong>
            <span>Internal task auction</span>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/" end>Board</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
        </nav>

        <div className="switcher">
          <span className="switcher-label">Acting as</span>
          <select
            id="user"
            value={current?.id ?? ""}
            onChange={(e) => setUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          {current && (
            <div className="capacity-chip">
              <div className="capacity-bar">
                <div
                  className={`capacity-fill${isLow ? " low" : ""}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              <span className="capacity-num">{remaining}h</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>/ {max}h</span>
            </div>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="toast-icon">
              {t.type === "error" ? "⚠️" : t.type === "success" ? "✅" : "ℹ️"}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
