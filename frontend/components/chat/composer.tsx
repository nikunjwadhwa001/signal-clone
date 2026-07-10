"use client";

import { useEffect, useRef, useState } from "react";
import { socketManager } from "@/lib/ws/socket-manager";
import { useSendMessage } from "@/lib/hooks/use-send-message";
import type { DisplayMessage } from "@/lib/types";

export function Composer({
  conversationId,
  replyTo,
  onCancelReply,
}: {
  conversationId: number;
  replyTo: DisplayMessage | null;
  onCancelReply: () => void;
}) {
  const [text, setText] = useState("");
  const sendMessage = useSendMessage(conversationId);
  const lastTypingSentAt = useRef(0);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId]);

  function handleChange(value: string) {
    setText(value);
    // Debounce typing.start to at most once per 3s; always schedule a
    // typing.stop a few seconds after the last keystroke.
    const now = Date.now();
    if (value.trim() && now - lastTypingSentAt.current > 3000) {
      socketManager.send({ type: "typing.start", conversation_id: conversationId });
      lastTypingSentAt.current = now;
    }
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => {
      socketManager.send({ type: "typing.stop", conversation_id: conversationId });
      lastTypingSentAt.current = 0;
    }, 3000);
  }

  function handleSend() {
    const body = text.trim();
    if (!body) return;
    sendMessage(body, replyTo?.id ?? null);
    setText("");
    onCancelReply();
    socketManager.send({ type: "typing.stop", conversation_id: conversationId });
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-bg-primary px-4 py-3">
      {replyTo && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2 text-sm">
          <div className="min-w-0 truncate">
            <span className="font-medium text-signal-blue">Replying to </span>
            <span className="text-text-secondary">{replyTo.body}</span>
          </div>
          <button onClick={onCancelReply} className="ml-2 text-text-tertiary hover:text-text-primary">
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-bg-secondary px-4 py-2.5 text-sm outline-none focus:border-signal-blue"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal-blue text-white transition hover:bg-signal-blue-dark disabled:opacity-40"
          aria-label="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
