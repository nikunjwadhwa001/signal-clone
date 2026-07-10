"use client";

import { useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { socketManager } from "@/lib/ws/socket-manager";
import { sendMessageRest } from "@/lib/api/messages";
import { useAuthStore } from "@/lib/stores/auth-store";
import { queryKeys } from "@/lib/query-keys";
import type { DisplayMessage } from "@/lib/types";

/**
 * Sends over the socket when connected; falls back to REST when it's down.
 * Either path renders an optimistic bubble immediately, keyed by client_id,
 * so a retry after a flaky reconnect can never duplicate — the server's
 * UNIQUE(conversation_id, client_id) constraint makes a repeat client_id
 * idempotent, and the socket path replaces the pending row on message.ack.
 */
export function useSendMessage(conversationId: number) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return async (body: string, replyToId: number | null = null) => {
    if (!userId || !body.trim()) return;
    const clientId = uuidv4();
    const optimistic: DisplayMessage = {
      id: -Date.now(),
      conversation_id: conversationId,
      seq: -1,
      sender_id: userId,
      client_id: clientId,
      content_type: "text",
      body,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      edited_at: null,
      expires_at: null,
      deleted_at: null,
      reactions: [],
      receipts: null,
      status: "sending",
    };

    const key = queryKeys.messages(conversationId);
    queryClient.setQueryData<DisplayMessage[]>(key, (old = []) => [
      ...old,
      optimistic,
    ]);

    const markFailed = () =>
      queryClient.setQueryData<DisplayMessage[]>(key, (old = []) =>
        old.map((m) =>
          m.client_id === clientId ? { ...m, status: "failed" } : m
        )
      );

    if (socketManager.isConnected) {
      const ok = socketManager.send({
        type: "message.send",
        conversation_id: conversationId,
        client_id: clientId,
        body,
        reply_to_id: replyToId,
      });
      if (!ok) markFailed();
      return;
    }

    try {
      const msg = await sendMessageRest({
        conversation_id: conversationId,
        client_id: clientId,
        body,
        reply_to_id: replyToId,
      });
      queryClient.setQueryData<DisplayMessage[]>(key, (old = []) =>
        old.map((m) =>
          m.client_id === clientId ? { ...msg, status: "sent" } : m
        )
      );
    } catch {
      markFailed();
    }
  };
}
