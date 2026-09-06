"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiRequest } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "AGENT" | "ADMIN";
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  authenticatedRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  setSession: (user: AuthUser, csrfToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const current = await apiRequest<{ user: AuthUser }>("/auth/me");
      const csrf = await apiRequest<{ csrfToken: string }>("/auth/csrf");
      return { user: current.user, csrfToken: csrf.csrfToken };
    }

    void loadSession()
      .then((session) => {
        if (!active) return;
        setUser(session.user);
        setCsrfToken(session.csrfToken);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setCsrfToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const setSession = useCallback(
    (authenticatedUser: AuthUser, token: string) => {
      setUser(authenticatedUser);
      setCsrfToken(token);
      setLoading(false);
    },
    [],
  );

  const logout = useCallback(async () => {
    let token = csrfToken;
    if (!token) {
      token = (await apiRequest<{ csrfToken: string }>("/auth/csrf")).csrfToken;
    }
    await apiRequest<{ status: string }>("/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": token },
      body: "{}",
    });
    setUser(null);
    setCsrfToken(null);
  }, [csrfToken]);

  const authenticatedRequest = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      let token = csrfToken;
      if (!token) {
        token = (await apiRequest<{ csrfToken: string }>("/auth/csrf"))
          .csrfToken;
        setCsrfToken(token);
      }
      const headers = new Headers(init.headers);
      headers.set("X-CSRF-Token", token);
      return apiRequest<T>(path, { ...init, headers });
    },
    [csrfToken],
  );

  const value = useMemo(
    () => ({ user, loading, authenticatedRequest, setSession, logout }),
    [authenticatedRequest, loading, logout, setSession, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
