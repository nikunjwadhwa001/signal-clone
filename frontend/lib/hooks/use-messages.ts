"use client";

import { useQuery } from "@tanstack/react-query";
import { getMessages } from "@/lib/api/conversations";
import { queryKeys } from "@/lib/query-keys";
import type { DisplayMessage } from "@/lib/types";

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? -1),
    queryFn: async () => {
      const msgs = await getMessages(conversationId as number);
      return msgs.map((m) => ({ ...m, status: "sent" as const })) as DisplayMessage[];
    },
    enabled: conversationId !== null,
  });
}
