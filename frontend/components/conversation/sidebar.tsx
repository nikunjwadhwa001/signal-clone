"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useConversations } from "@/lib/hooks/use-conversations";
import { ConversationItem } from "@/components/conversation/conversation-item";
import { NewChatModal } from "@/components/conversation/new-chat-modal";
import { Avatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRealtimeStore } from "@/lib/stores/realtime-store";

export function Sidebar() {
  const { data: conversations = [], isLoading } = useConversations();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const connected = useRealtimeStore((s) => s.connected);
  const activeId = params?.id ? Number(params.id) : null;

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const q = query.toLowerCase();
    return conversations.filter((c) => {
      const name = c.type === "group" ? c.name : c.peer?.display_name;
      return (name || "").toLowerCase().includes(q);
    });
  }, [conversations, query]);

  function handleLogout() {
    clear();
    router.push("/");
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-bg-primary md:w-[380px]">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          onClick={() => router.push("/chat/settings")}
          className="flex items-center gap-2"
        >
          <Avatar
            name={user?.display_name || "Me"}
            seed={user?.id || 0}
            src={user?.avatar_url}
            size={36}
          />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setModalOpen(true)}
            title="New chat"
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:bg-bg-hover"
          >
            ✎
          </button>
          <button
            onClick={handleLogout}
            title="Log out"
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm text-text-secondary transition hover:bg-bg-hover"
          >
            ⏻
          </button>
        </div>
      </div>
      {!connected && (
        <div className="flex items-center justify-center gap-2 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Reconnecting…
        </div>
      )}

      <div className="px-4 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations"
          className="w-full rounded-full bg-bg-tertiary px-4 py-2 text-sm outline-none placeholder:text-text-tertiary"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="px-4 py-6 text-center text-sm text-text-tertiary">Loading…</p>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-text-tertiary">
            <span className="text-3xl">💬</span>
            <p className="text-sm">
              {query ? "No conversations match your search" : "No conversations yet"}
            </p>
            {!query && (
              <button
                onClick={() => setModalOpen(true)}
                className="mt-2 text-sm font-medium text-signal-blue hover:underline"
              >
                Start a new chat
              </button>
            )}
          </div>
        )}
        {filtered.map((c) => (
          <ConversationItem key={c.id} conversation={c} active={c.id === activeId} />
        ))}
      </div>

      <NewChatModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
