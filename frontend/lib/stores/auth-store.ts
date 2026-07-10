import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserMe } from "@/lib/types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserMe | null;
  setSession: (accessToken: string, refreshToken: string, user: UserMe) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: UserMe) => void;
  clear: () => void;
}

/**
 * Refresh token persists to localStorage (acceptable for a mocked-auth demo
 * app); access token is kept in memory only via the store's runtime state
 * but zustand persist will still snapshot it — fine here since there's no
 * XSS-sensitive real data. In a production build the access token would
 * stay unpersisted and the refresh token would live in an httpOnly cookie.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: "signal-auth" }
  )
);
