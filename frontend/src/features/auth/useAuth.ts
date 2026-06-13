import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuthStore, type Me } from "@/stores/auth";
import { disconnectSocket } from "@/lib/socket";

interface LoginResponse {
  data: {
    requiresTwoFactor: boolean;
    challengeToken?: string;
    accessToken?: string;
    user?: Me;
  };
}

export function useLogin() {
  const { setAccessToken, setUser } = useAuthStore.getState();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        ...input,
        deviceFingerprint: getDeviceFingerprint(),
        deviceName: navigator.platform || "Browser",
      });
      return data.data;
    },
    onSuccess: (result) => {
      if (!result.requiresTwoFactor && result.accessToken && result.user) {
        setAccessToken(result.accessToken);
        setUser(result.user);
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useTwoFactorLogin() {
  const { setAccessToken, setUser } = useAuthStore.getState();
  return useMutation({
    mutationFn: async (input: { challengeToken: string; code: string }) => {
      const { data } = await api.post<LoginResponse>("/auth/login/2fa", input);
      return data.data;
    },
    onSuccess: (result) => {
      if (result.accessToken && result.user) {
        setAccessToken(result.accessToken);
        setUser(result.user);
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      useAuthStore.getState().clear();
      disconnectSocket();
      queryClient.clear();
      navigate("/login");
    },
  });
}

/** Refresh /auth/me — keeps the permission set current after role changes. */
export function useMe(enabled = true) {
  const setUser = useAuthStore((s) => s.setUser);
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<{ data: Me }>("/auth/me");
      setUser(data.data);
      return data.data;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: { email: string }) => api.post("/auth/forgot-password", input),
    onSuccess: () => toast.success("If that email exists, a reset link has been sent."),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useResetPassword() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (input: { token: string; password: string }) => api.post("/auth/reset-password", input),
    onSuccess: () => {
      toast.success("Password updated. Please sign in.");
      navigate("/login");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

/** Stable per-browser fingerprint for device tracking. */
function getDeviceFingerprint(): string {
  const key = "somhr-device";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}
