export type User = {
  id: string;
  name: string;
  email: string;
  hourly_rate: string;
  max_capacity: string;
  current_workload: string;
  remaining_capacity: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  complexity: number;
  status: string;
  created_by: string;
  created_by_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_hours: string | null;
  deadline: string;
  created_at: string;
  bid_count: number;
  lowest_bid: string | null;
};

export type Bid = {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  hours: string;
  status: string;
  created_at: string;
};

export type DashboardStats = {
  tasksByStatus: { status: string; count: number }[];
  avgBidByComplexity: {
    complexity: number;
    avgHours: string | number | null;
    bidCount: number;
  }[];
  topCompleters: { id: string; name: string; tasksCompleted: number }[];
  unbidOverdueTasks: {
    id: string;
    title: string;
    deadline: string;
    status: string;
  }[];
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function headers(userId: string | null, json = false): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (userId) h["X-User-Id"] = userId;
  return h;
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  users: (userId: string | null) =>
    fetch(`${API}/users`, { headers: headers(userId) }).then((r) =>
      parse<{ users: User[] }>(r)
    ),
  workload: (id: string, userId: string | null) =>
    fetch(`${API}/users/${id}/workload`, { headers: headers(userId) }).then(
      (r) => parse<User>(r)
    ),
  tasks: (userId: string | null) =>
    fetch(`${API}/tasks`, { headers: headers(userId) }).then((r) =>
      parse<{ tasks: Task[] }>(r)
    ),
  task: (id: string, userId: string | null) =>
    fetch(`${API}/tasks/${id}`, { headers: headers(userId) }).then((r) =>
      parse<Task>(r)
    ),
  bids: (id: string, userId: string | null) =>
    fetch(`${API}/tasks/${id}/bids`, { headers: headers(userId) }).then((r) =>
      parse<{ bids: Bid[] }>(r)
    ),
  createTask: (
    userId: string,
    body: {
      title: string;
      description: string;
      complexity: number;
      deadline: string;
    }
  ) =>
    fetch(`${API}/tasks`, {
      method: "POST",
      headers: headers(userId, true),
      body: JSON.stringify(body),
    }).then((r) => parse<Task>(r)),
  advanceStatus: (id: string, userId: string) =>
    fetch(`${API}/tasks/${id}/status`, {
      method: "PATCH",
      headers: headers(userId, true),
      body: JSON.stringify({}),
    }).then((r) => parse<Task>(r)),
  placeBid: (id: string, userId: string, hours: number) =>
    fetch(`${API}/tasks/${id}/bids`, {
      method: "POST",
      headers: headers(userId, true),
      body: JSON.stringify({ hours }),
    }).then((r) => parse<Bid>(r)),
  assign: (id: string, userId: string) =>
    fetch(`${API}/tasks/${id}/assign`, {
      method: "POST",
      headers: headers(userId),
    }).then((r) => parse<{ task: Task }>(r)),
  stats: (userId: string | null) =>
    fetch(`${API}/dashboard/stats`, { headers: headers(userId) }).then((r) =>
      parse<DashboardStats>(r)
    ),
};

export function eventsUrl(): string {
  return `${API}/events`;
}
