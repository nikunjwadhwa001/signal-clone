"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { useRealtimeStore } from "@/lib/stores/realtime-store";
import { cn, formatConversationTime } from "@/lib/utils";
import type { ConversationOut } from "@/lib/types";

export function ConversationItem({
  conversation,
  active,
}: {
  conversation: ConversationOut;
  active: boolean;
}) {
  const isGroup = conversation.type === "group";
  const name = isGroup ? conversation.name || "Group" : conversation.peer?.display_name || "Unknown";
  const avatarSeed = isGroup ? conversation.id : conversation.peer?.id || conversation.id;
  const online = useRealtimeStore((s) =>
    conversation.peer ? s.onlineUserIds.has(conversation.peer.id) : false
  );
  const typing = useRealtimeStore(
    (s) => (s.typingByConversation[conversation.id] || []).length > 0
  );

  const preview = conversation.last_message
    ? conversation.last_message.deleted_at
      ? "This message was deleted"
      : conversation.last_message.body
    : "No messages yet";

  return (
    <Link
      href={`/chat/${conversation.id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 transition hover:bg-bg-hover",
        active && "bg-bg-active hover:bg-bg-active"
      )}
    >
      <Avatar
        name={name}
        seed={avatarSeed}
        src={conversation.avatar_url || (isGroup ? null : conversation.peer?.avatar_url)}
        online={!isGroup ? online : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-medium text-text-primary">
            {name}
          </span>
          <span className="shrink-0 text-xs text-text-tertiary">
            {formatConversationTime(conversation.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-[13px]",
              typing ? "font-medium text-signal-blue" : "text-text-secondary"
            )}
          >
            {typing ? "typing…" : preview}
          </span>
          {conversation.unread_count > 0 && (
            <span className="ml-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-signal-blue px-1.5 text-[11px] font-semibold text-white">
              {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
