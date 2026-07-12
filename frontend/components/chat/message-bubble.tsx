"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, formatMessageTime } from "@/lib/utils";
import { MessageStatusIcon } from "@/components/chat/message-status";
import { Modal } from "@/components/ui/modal";
import { react, deleteMessage } from "@/lib/api/messages";
import { queryKeys } from "@/lib/query-keys";
import type { ConversationOut, DisplayMessage } from "@/lib/types";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function MessageBubble({
  message,
  mine,
  senderName,
  onReply,
  repliedMessage,
}: {
  message: DisplayMessage;
  mine: boolean;
  senderName?: string;
  onReply: (message: DisplayMessage) => void;
  repliedMessage?: DisplayMessage;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();

  const reactMutation = useMutation({
    mutationFn: (emoji: string) => react(message.id, emoji),
    onSuccess: (updated) => {
      queryClient.setQueryData<DisplayMessage[]>(
        queryKeys.messages(message.conversation_id),
        (old = []) => old.map((m) => (m.id === updated.id ? { ...updated, status: m.status } : m))
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMessage(message.id),
    onSuccess: (updated) => {
      queryClient.setQueryData<DisplayMessage[]>(
        queryKeys.messages(message.conversation_id),
        (old = []) => old.map((m) => (m.id === updated.id ? { ...updated, status: m.status } : m))
      );
      // The WS event only reaches other members — patch our own sidebar
      // preview here since it excludes the sender.
      queryClient.setQueryData<ConversationOut[]>(
        queryKeys.conversations,
        (old = []) => {
          const idx = old.findIndex(
            (c) => c.id === updated.conversation_id && c.last_message?.id === updated.id
          );
          if (idx === -1) return old;
          const copy = [...old];
          copy[idx] = {
            ...copy[idx],
            last_message: {
              ...copy[idx].last_message!,
              body: updated.body,
              deleted_at: updated.deleted_at,
            },
          };
          return copy;
        }
      );
      setConfirmDelete(false);
    },
  });

  if (message.deleted_at) {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="my-1 max-w-[70%] rounded-2xl bg-bg-tertiary px-4 py-2 text-sm italic text-text-tertiary">
          This message was deleted
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("group flex", mine ? "justify-end" : "justify-start")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
    >
      <div className={cn("relative my-0.5 flex max-w-[70%] items-end gap-1.5", mine && "flex-row-reverse")}>
        <div
          className={cn(
            "relative rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug shadow-sm",
            mine
              ? "rounded-br-md bg-bubble-outgoing text-bubble-outgoing-text"
              : "rounded-bl-md bg-bubble-incoming text-bubble-incoming-text"
          )}
        >
          {senderName && !mine && (
            <div className="mb-0.5 text-xs font-semibold text-signal-blue">{senderName}</div>
          )}
          {repliedMessage && (
            <div
              className={cn(
                "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs opacity-80",
                mine ? "border-white/60 bg-white/10" : "border-signal-blue bg-black/5"
              )}
            >
              {repliedMessage.deleted_at ? "Deleted message" : repliedMessage.body}
            </div>
          )}
          <span className="whitespace-pre-wrap break-words">{message.body}</span>
          <span
            className={cn(
              "ml-2 inline-flex translate-y-0.5 items-center gap-1 text-[11px]",
              mine ? "text-white/75" : "text-text-tertiary"
            )}
          >
            {formatMessageTime(message.created_at)}
            {mine && <MessageStatusIcon status={message.status} />}
          </span>

          {message.reactions.length > 0 && (
            <div
              className={cn(
                "absolute -bottom-3 flex gap-0.5 rounded-full border border-border bg-bg-primary px-1.5 py-0.5 text-xs shadow",
                mine ? "right-2" : "left-2"
              )}
            >
              {message.reactions.map((r, i) => (
                <span key={i}>{r.emoji}</span>
              ))}
            </div>
          )}
        </div>

        {showActions && (
          <div className="relative flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-bg-hover"
              title="React"
            >
              🙂
            </button>
            <button
              onClick={() => onReply(message)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-bg-hover"
              title="Reply"
            >
              ↩
            </button>
            {mine && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-bg-hover"
                title="Delete"
              >
                🗑
              </button>
            )}
            {showEmojiPicker && (
              <div
                className={cn(
                  "absolute bottom-8 z-10 flex gap-1 rounded-full border border-border bg-bg-primary px-2 py-1 shadow-lg",
                  mine ? "right-0" : "left-0"
                )}
              >
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      reactMutation.mutate(emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="rounded-full p-1 text-base hover:bg-bg-hover"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete message?"
      >
        <p className="mb-5 text-sm text-text-secondary">
          This message will be deleted for everyone in this chat. This can't be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-full px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
