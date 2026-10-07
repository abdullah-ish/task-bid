import { NavLink, Route, Routes } from "react-router-dom";
import { BoardPage } from "./pages/BoardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TaskPage } from "./pages/TaskPage";
import { useSession } from "./session";

export function App() {
  const { users, current, setUserId, notice, setNotice } = useSession();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>TASKBID</strong>
          <span>Internal task auction</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Board
          </NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
        </nav>
        <div className="switcher">
          <label className="muted" htmlFor="user">
            Acting as
          </label>
          <select
            id="user"
            value={current?.id ?? ""}
            onChange={(e) => setUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {current && (
            <span className="capacity">
              {Number(current.remaining_capacity)}h left / {Number(current.max_capacity)}h
            </span>
          )}
        </div>
      </header>
      {notice && (
        <p className="notice" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </div>
  );
}
