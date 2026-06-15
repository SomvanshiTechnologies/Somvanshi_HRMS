import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";

/**
 * Single Axios instance for every API call in the app.
 * - attaches the access token
 * - transparently refreshes once on 401 (queueing concurrent failures)
 * - normalizes API error shape for UI consumption
 */
// Same-origin by default (CloudFront routes /api → backend). Set VITE_API_URL
// at build time to point the SPA at a separate API origin (e.g. api.domain.com).
const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // refresh token cookie
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { data } = await axios.post<{ data: { accessToken: string } }>(
    `${API_BASE}/auth/refresh`,
    {},
    { withCredentials: true }
  );
  const token = data.data.accessToken;
  useAuthStore.getState().setAccessToken(token);
  return token;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ error?: { code?: string; message?: string } }>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;

    const isAuthRoute = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");

    if (status === 401 && original && !original._retried && !isAuthRoute && code !== "INVALID_CREDENTIALS") {
      original._retried = true;
      try {
        refreshing ??= refreshAccessToken().finally(() => {
          refreshing = null;
        });
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().clear();
        if (!window.location.pathname.startsWith("/login")) {
          window.location.assign("/login?expired=1");
        }
      }
    }
    return Promise.reject(error);
  }
);

/** Extract a human-readable message from any API error. */
export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: { message?: string; details?: Array<{ path: string; message: string }> } }
      | undefined;
    if (data?.error?.details?.length) {
      return data.error.details.map((d) => `${d.path}: ${d.message}`).join("; ");
    }
    if (data?.error?.message) return data.error.message;
    if (err.code === "ERR_NETWORK") return "Cannot reach the SomHR server. Check your connection.";
  }
  return "Something went wrong. Please try again.";
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface ApiList<T> {
  success: boolean;
  data: T[];
  meta: PageMeta;
}
export interface ApiItem<T> {
  success: boolean;
  data: T;
  message?: string;
}
