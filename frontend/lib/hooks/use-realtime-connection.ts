"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketManager } from "@/lib/ws/socket-manager";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRealtimeStore } from "@/lib/stores/realtime-store";
import { queryKeys } from "@/lib/query-keys";
import type {
  ConversationOut,
  DisplayMessage,
  MessageOut,
} from "@/lib/types";

/**
 * Wires every inbound WebSocket event into the TanStack Query cache and the
 * ephemeral realtime store. Mount once near the app root once the user is
 * authenticated.
 */
export function useRealtimeConnection() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const setConnected = useRealtimeStore((s) => s.setConnected);
  const setPresence = useRealtimeStore((s) => s.setPresence);
  const setTyping = useRealtimeStore((s) => s.setTyping);

  useEffect(() => {
    if (!accessToken) return;

    const upsertMessage = (msg: MessageOut) => {
      const key = queryKeys.messages(msg.conversation_id);
      queryClient.setQueryData<DisplayMessage[]>(key, (old = []) => {
        const idx = old.findIndex(
          (m) => m.id === msg.id || m.client_id === msg.client_id
        );
        const withStatus: DisplayMessage = { ...msg, status: "sent" };
        if (idx === -1) return [...old, withStatus];
        const copy = [...old];
        copy[idx] = { ...withStatus, status: copy[idx].status === "read" ? "read" : "sent" };
        return copy;
      });
    };

    const bumpConversationPreview = (msg: MessageOut, incrementUnread: boolean) => {
      queryClient.setQueryData<ConversationOut[]>(
        queryKeys.conversations,
        (old = []) => {
          const idx = old.findIndex((c) => c.id === msg.conversation_id);
          if (idx === -1) return old;
          const convo = old[idx];
          const updated: ConversationOut = {
            ...convo,
            last_message_at: msg.created_at,
            last_seq: Math.max(convo.last_seq, msg.seq),
            last_message: {
              id: msg.id,
              seq: msg.seq,
              sender_id: msg.sender_id,
              content_type: msg.content_type,
              body: msg.body,
              created_at: msg.created_at,
              deleted_at: msg.deleted_at,
            },
            unread_count: incrementUnread
              ? convo.unread_count + 1
              : convo.unread_count,
          };
          const rest = old.filter((_, i) => i !== idx);
          return [updated, ...rest];
        }
      );
    };

    const offConnected = socketManager.on("_connected", () => setConnected(true));
    const offDisconnected = socketManager.on("_disconnected", () =>
      setConnected(false)
    );

    const offMessageNew = socketManager.on("message.new", (data) => {
      const msg: MessageOut = data.message;
      upsertMessage(msg);
      bumpConversationPreview(msg, msg.sender_id !== currentUserId);
    });

    const offAck = socketManager.on("message.ack", (data) => {
      const { client_id, id, seq, created_at } = data;
      queryClient.setQueriesData<DisplayMessage[]>(
        { queryKey: ["messages"] },
        (old) => {
          if (!old) return old;
          const idx = old.findIndex((m) => m.client_id === client_id);
          if (idx === -1) return old;
          const copy = [...old];
          copy[idx] = { ...copy[idx], id, seq, created_at, status: "sent" };
          return copy;
        }
      );
    });

    const offReceiptUpdate = socketManager.on("receipt.update", (data) => {
      const { message_id, receipts } = data;
      queryClient.setQueriesData<DisplayMessage[]>(
        { queryKey: ["messages"] },
        (old) => {
          if (!old) return old;
          const idx = old.findIndex((m) => m.id === message_id);
          if (idx === -1) return old;
          const copy = [...old];
          const r = receipts as { delivered_count: number; read_count: number; recipient_count: number };
          const status: DisplayMessage["status"] =
            r.recipient_count > 0 && r.read_count >= r.recipient_count
              ? "read"
              : r.delivered_count > 0
              ? "delivered"
              : copy[idx].status;
          copy[idx] = { ...copy[idx], receipts: r, status };
          return copy;
        }
      );
    });

    const offReactionUpdate = socketManager.on("reaction.update", (data) => {
      upsertMessage(data.message);
    });

    const offMessageDeleted = socketManager.on("message.deleted", (data) => {
      upsertMessage(data.message);
    });

    const offTyping = socketManager.on("typing", (data) => {
      setTyping(data.conversation_id, data.user_id, data.is_typing);
    });

    const offPresence = socketManager.on("presence", (data) => {
      setPresence(data.user_id, data.online);
    });

    socketManager.connect().catch(() => {});

    return () => {
      offConnected();
      offDisconnected();
      offMessageNew();
      offAck();
      offReceiptUpdate();
      offReactionUpdate();
      offMessageDeleted();
      offTyping();
      offPresence();
    };
  }, [accessToken, currentUserId, queryClient, setConnected, setPresence, setTyping]);
}
