"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useConversations } from "@/lib/hooks/use-conversations";
import { useMessages } from "@/lib/hooks/use-messages";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Composer } from "@/components/chat/composer";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { Avatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRealtimeStore } from "@/lib/stores/realtime-store";
import { socketManager } from "@/lib/ws/socket-manager";
import { markRead } from "@/lib/api/conversations";
import { queryKeys } from "@/lib/query-keys";
import type { DisplayMessage } from "@/lib/types";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export function ChatPane({ conversationId }: { conversationId: number }) {
  const router = useRouter();
  const { data: conversations = [] } = useConversations();
  const { data: messages = [], isLoading } = useMessages(conversationId);
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const typingUserIds = useRealtimeStore(
    (s) => s.typingByConversation[conversationId] || []
  );
  const pruneExpiredTyping = useRealtimeStore((s) => s.pruneExpiredTyping);

  const conversation = conversations.find((c) => c.id === conversationId);

  useEffect(() => {
    const interval = setInterval(() => pruneExpiredTyping(conversationId), 2000);
    return () => clearInterval(interval);
  }, [conversationId, pruneExpiredTyping]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark read whenever new messages arrive while this conversation is open.
  useEffect(() => {
    if (!conversation || messages.length === 0) return;
    const maxSeq = Math.max(...messages.map((m) => m.seq));
    if (maxSeq <= 0 || maxSeq <= (conversation.unread_count === 0 ? maxSeq : -1)) {
      // fallthrough; always attempt below, cheap no-op server side
    }
    const sent = socketManager.send({
      type: "receipt.read",
      conversation_id: conversationId,
      up_to_seq: maxSeq,
    });
    if (!sent) markRead(conversationId, maxSeq).catch(() => {});
    queryClient.setQueryData(queryKeys.conversations, (old: any) =>
      (old || []).map((c: any) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      )
    );
  }, [messages, conversationId, conversation, queryClient]);

  const grouped = useMemo(() => {
    const byDay: { label: string; items: DisplayMessage[] }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.created_at);
      const last = byDay[byDay.length - 1];
      if (last && last.label === label) last.items.push(m);
      else byDay.push({ label, items: [m] });
    }
    return byDay;
  }, [messages]);

  const messageById = useMemo(() => {
    const map = new Map<number, DisplayMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  if (!conversation) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-text-tertiary">
        Loading conversation…
      </div>
    );
  }

  const isGroup = conversation.type === "group";
  const name = isGroup ? conversation.name || "Group" : conversation.peer?.display_name || "Unknown";
  const avatarSeed = isGroup ? conversation.id : conversation.peer?.id || conversation.id;
  const online = useRealtimeStore.getState().onlineUserIds.has(conversation.peer?.id || -1);
  const subtitle = isGroup
    ? `${conversation.members.length} members`
    : online
    ? "Online"
    : "Offline";

  const someoneTyping = typingUserIds.length > 0;

  return (
    <div className="flex h-full flex-1 flex-col bg-bg-secondary">
      <div className="flex items-center gap-3 border-b border-border bg-bg-primary px-4 py-2.5">
        <button
          onClick={() => router.push("/chat")}
          className="mr-1 flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-bg-hover md:hidden"
          aria-label="Back"
        >
          ‹
        </button>
        <button
          onClick={() => router.push(isGroup ? `/chat/${conversationId}/info` : "#")}
          className="flex items-center gap-3"
        >
          <Avatar name={name} seed={avatarSeed} src={conversation.avatar_url || (isGroup ? null : conversation.peer?.avatar_url)} size={38} />
          <div className="text-left">
            <div className="text-sm font-semibold">{name}</div>
            <div className="text-xs text-text-tertiary">{subtitle}</div>
          </div>
        </button>
        <div className="ml-auto flex items-center gap-1 text-text-secondary">
          {isGroup && (
            <button
              onClick={() => router.push(`/chat/${conversationId}/info`)}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-bg-hover"
              title="Group info"
            >
              ⓘ
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading && (
          <p className="py-8 text-center text-sm text-text-tertiary">Loading messages…</p>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-tertiary">
            <span className="text-3xl">👋</span>
            <p className="text-sm">Say hello to start the conversation</p>
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.label}>
            <div className="my-3 flex justify-center">
              <span className="rounded-full bg-bg-tertiary px-3 py-1 text-xs text-text-tertiary">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {group.items.map((m) => (
                <MessageBubble
                  key={m.client_id}
                  message={m}
                  mine={m.sender_id === userId}
                  senderName={
                    isGroup && m.sender_id !== userId
                      ? conversation.members.find((mem) => mem.user.id === m.sender_id)?.user
                          .display_name
                      : undefined
                  }
                  onReply={setReplyTo}
                  repliedMessage={m.reply_to_id ? messageById.get(m.reply_to_id) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
        {someoneTyping && (
          <div className="mt-2">
            <TypingIndicator />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer conversationId={conversationId} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
    </div>
  );
}
