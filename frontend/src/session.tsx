import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, eventsUrl, type User } from "./api";

type Session = {
  users: User[];
  current: User | null;
  setUserId: (id: string) => void;
  refresh: () => Promise<void>;
  notice: string | null;
  setNotice: (msg: string | null) => void;
};

const Ctx = createContext<Session | null>(null);
const STORAGE_KEY = "taskbid.userId";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserIdState] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? ""
  );
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await api.users(userId || null);
    setUsers(data.users);
  }, [userId]);

  const setUserId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setUserIdState(id);
  }, []);

  useEffect(() => {
    refresh().catch((err: Error) => setNotice(err.message));
  }, [refresh]);

  useEffect(() => {
    const source = new EventSource(eventsUrl());
    const bump = () => {
      refresh().catch(() => undefined);
    };
    source.addEventListener("bid.created", bump);
    source.addEventListener("task.updated", bump);
    source.addEventListener("task.assigned", bump);
    source.addEventListener("user.updated", bump);
    return () => source.close();
  }, [refresh]);

  const current = users.find((u) => u.id === userId) ?? users[0] ?? null;

  useEffect(() => {
    if (!userId && current) setUserId(current.id);
  }, [userId, current, setUserId]);

  const value = useMemo(
    () => ({ users, current, setUserId, refresh, notice, setNotice }),
    [users, current, setUserId, refresh, notice]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("session missing");
  return ctx;
}
