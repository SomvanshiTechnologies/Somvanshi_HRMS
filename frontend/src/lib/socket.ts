import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/stores/auth";

let socket: Socket | null = null;

/** Authenticated Socket.IO connection (proxied via Vite/Nginx). */
export function getSocket(): Socket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (!socket) {
    // same-origin by default; VITE_SOCKET_URL targets a separate API origin
    socket = io(import.meta.env.VITE_SOCKET_URL || "/", {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
