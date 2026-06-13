import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MeEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  photoUrl: string | null;
  status: string;
  designation: { title: string } | null;
  department: { id: string; name: string } | null;
}

export interface Me {
  id: string;
  email: string;
  status: string;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  roles: { name: string; displayName: string }[];
  employee: MeEmployee | null;
  /** Effective permission codes from the backend — the ONLY source of UI authorization. */
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  user: Me | null;
  setAccessToken: (token: string) => void;
  setUser: (user: Me) => void;
  clear: () => void;
}

/**
 * Access token persisted in localStorage so the session is shared across
 * tabs; the refresh token is an httpOnly cookie managed by the backend.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, user: null }),
    }),
    {
      name: "somhr-auth",
      storage: {
        // localStorage so the session is shared across tabs (a new tab is
        // instantly authenticated). The refresh token stays an httpOnly cookie.
        getItem: (name) => {
          const raw = localStorage.getItem(name);
          return raw ? JSON.parse(raw) : null;
        },
        setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
