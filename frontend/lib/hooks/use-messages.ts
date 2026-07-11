"use client";

import { useQuery } from "@tanstack/react-query";
import { getMessages } from "@/lib/api/conversations";
import { queryKeys } from "@/lib/query-keys";
import type { DisplayMessage, MessageStatus } from "@/lib/types";

function statusFromReceipts(receipts: DisplayMessage["receipts"]): MessageStatus {
  if (!receipts) return "sent";
  if (receipts.recipient_count > 0 && receipts.read_count >= receipts.recipient_count) {
    return "read";
  }
  if (receipts.delivered_count > 0) return "delivered";
  return "sent";
}

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? -1),
    queryFn: async () => {
      const msgs = await getMessages(conversationId as number);
      return msgs.map((m) => ({
        ...m,
        status: statusFromReceipts(m.receipts),
      })) as DisplayMessage[];
    },
    enabled: conversationId !== null,
  });
}
