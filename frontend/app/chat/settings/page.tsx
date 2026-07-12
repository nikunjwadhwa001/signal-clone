"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useThemeStore } from "@/lib/stores/theme-store";
import { updateMe } from "@/lib/api/users";
import { logout as logoutApi } from "@/lib/api/auth";
import { socketManager } from "@/lib/ws/socket-manager";

const COMING_SOON = [
  { icon: "🔒", label: "Privacy" },
  { icon: "🔔", label: "Notifications" },
  { icon: "🎨", label: "Appearance (beyond theme)" },
  { icon: "📞", label: "Voice / Video calls" },
  { icon: "🎬", label: "Stories" },
  { icon: "🖥️", label: "Linked devices" },
];

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user?.display_name || "");
  const [about, setAbout] = useState(user?.about || "");
  const [showSafetyNumber, setShowSafetyNumber] = useState(false);

  const saveProfile = useMutation({
    mutationFn: () => updateMe({ display_name: name, about }),
    onSuccess: (u) => {
      setUser(u);
      setEditingName(false);
    },
  });

  async function handleLogout() {
    if (refreshToken) await logoutApi(refreshToken).catch(() => {});
    // Otherwise the WebSocket stays open authenticated as this user — the
    // next login on this tab would silently reuse that stale connection,
    // since socketManager.connect() no-ops whenever a socket is already open.
    socketManager.disconnect();
    clear();
    queryClient.clear();
    router.push("/");
  }

  if (!user) return null;

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-bg-secondary">
      <div className="flex items-center gap-3 border-b border-border bg-bg-primary px-4 py-3">
        <button
          onClick={() => router.push("/chat")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-bg-hover md:hidden"
        >
          ‹
        </button>
        <h1 className="text-base font-semibold">Settings</h1>
      </div>

      <div className="mx-auto w-full max-w-lg p-6">
        <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl bg-bg-primary p-6">
          {/* Avatar upload is disabled: uploaded files live on the free-tier
              host's ephemeral disk and are wiped on every restart/redeploy,
              so uploads would silently disappear. Colored-initials avatars
              are the only option until persistent image storage is added. */}
          <Avatar name={user.display_name} seed={user.id} src={user.avatar_url} size={88} />

          {editingName ? (
            <div className="flex w-full flex-col gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-border bg-bg-primary px-3 py-2 text-center text-sm outline-none focus:border-signal-blue"
              />
              <input
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="About"
                className="rounded-lg border border-border bg-bg-primary px-3 py-2 text-center text-sm outline-none focus:border-signal-blue"
              />
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => saveProfile.mutate()}
                  className="rounded-full bg-signal-blue px-4 py-1.5 text-sm text-white"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="rounded-full bg-bg-tertiary px-4 py-1.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="text-center">
              <div className="text-lg font-semibold">{user.display_name}</div>
              <div className="text-sm text-text-tertiary">
                @{user.username} · {user.about || "Tap to add an about"}
              </div>
            </button>
          )}
        </div>

        <div className="mb-6 rounded-2xl bg-bg-primary p-4">
          <h2 className="mb-2 px-2 text-xs font-semibold uppercase text-text-tertiary">
            Appearance
          </h2>
          <div className="flex rounded-full bg-bg-tertiary p-1 text-sm">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 rounded-full py-1.5 capitalize transition ${
                  theme === t ? "bg-bg-primary shadow" : "text-text-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-bg-primary p-2">
          <button
            onClick={() => setShowSafetyNumber((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-bg-hover"
          >
            <span className="text-lg">🛡️</span>
            <div className="flex-1">
              <div className="text-sm font-medium">Safety number</div>
              <div className="text-xs text-text-tertiary">
                Verify your end-to-end encryption fingerprint
              </div>
            </div>
            <span className="text-text-tertiary">{showSafetyNumber ? "▲" : "▼"}</span>
          </button>
          {showSafetyNumber && (
            <div className="mx-3 mb-3 rounded-xl bg-bg-tertiary p-4">
              <p className="mb-2 text-xs text-text-secondary">
                🔒 Your messages are end-to-end encrypted. No one outside this
                chat, not even Signal, can read them. This fingerprint is
                simulated for this demo.
              </p>
              <p className="break-all font-mono text-sm leading-relaxed text-text-primary">
                {user.safety_number}
              </p>
            </div>
          )}
        </div>

        <div className="mb-6 rounded-2xl bg-bg-primary p-2">
          <h2 className="mb-1 px-3 pt-2 text-xs font-semibold uppercase text-text-tertiary">
            Coming soon
          </h2>
          {COMING_SOON.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-text-secondary"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1 text-sm">{item.label}</span>
              <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px]">
                Coming soon
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={handleLogout}
          className="w-full rounded-2xl bg-bg-primary px-4 py-3 text-center text-sm font-medium text-red-500 hover:bg-bg-hover"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
