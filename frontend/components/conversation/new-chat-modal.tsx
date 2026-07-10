"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { searchUsers } from "@/lib/api/users";
import { createConversation } from "@/lib/api/conversations";
import { queryKeys } from "@/lib/query-keys";
import type { UserPublic } from "@/lib/types";

export function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserPublic[]>([]);
  const [selected, setSelected] = useState<UserPublic[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSearch(q: string) {
    setQuery(q);
    setResults(q.trim() ? await searchUsers(q) : []);
  }

  function toggleSelect(user: UserPublic) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    );
  }

  async function startDirect(user: UserPublic) {
    setLoading(true);
    try {
      const convo = await createConversation({ type: "direct", member_ids: [user.id] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      onClose();
      router.push(`/chat/${convo.id}`);
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    if (!groupName.trim() || selected.length === 0) return;
    setLoading(true);
    try {
      const convo = await createConversation({
        type: "group",
        name: groupName.trim(),
        member_ids: selected.map((u) => u.id),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      onClose();
      router.push(`/chat/${convo.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New message">
      <div className="mb-4 flex rounded-full bg-bg-tertiary p-1 text-sm">
        <button
          onClick={() => setTab("direct")}
          className={`flex-1 rounded-full py-1.5 transition ${
            tab === "direct" ? "bg-bg-primary shadow" : "text-text-secondary"
          }`}
        >
          Direct message
        </button>
        <button
          onClick={() => setTab("group")}
          className={`flex-1 rounded-full py-1.5 transition ${
            tab === "group" ? "bg-bg-primary shadow" : "text-text-secondary"
          }`}
        >
          New group
        </button>
      </div>

      {tab === "group" && (
        <input
          placeholder="Group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm outline-none focus:border-signal-blue"
        />
      )}

      <input
        placeholder="Search by username or name"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm outline-none focus:border-signal-blue"
      />

      {tab === "group" && selected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {selected.map((u) => (
            <button
              key={u.id}
              onClick={() => toggleSelect(u)}
              className="flex items-center gap-1 rounded-full bg-bg-active px-2.5 py-1 text-xs text-signal-blue"
            >
              {u.display_name} ✕
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {results.map((u) => {
          const isSelected = selected.some((s) => s.id === u.id);
          return (
            <button
              key={u.id}
              disabled={loading}
              onClick={() => (tab === "direct" ? startDirect(u) : toggleSelect(u))}
              className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-bg-hover disabled:opacity-50"
            >
              <Avatar name={u.display_name} seed={u.id} src={u.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{u.display_name}</div>
                <div className="truncate text-xs text-text-tertiary">@{u.username}</div>
              </div>
              {tab === "group" && (
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                    isSelected ? "border-signal-blue bg-signal-blue" : "border-border"
                  }`}
                />
              )}
            </button>
          );
        })}
        {query && results.length === 0 && (
          <p className="py-4 text-center text-sm text-text-tertiary">No users found</p>
        )}
      </div>

      {tab === "group" && (
        <button
          disabled={loading || !groupName.trim() || selected.length === 0}
          onClick={createGroup}
          className="mt-4 w-full rounded-full bg-signal-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-signal-blue-dark disabled:opacity-50"
        >
          Create group
        </button>
      )}
    </Modal>
  );
}
