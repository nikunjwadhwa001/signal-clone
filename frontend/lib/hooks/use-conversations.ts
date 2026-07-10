"use client";

import { useQuery } from "@tanstack/react-query";
import { listConversations } from "@/lib/api/conversations";
import { queryKeys } from "@/lib/query-keys";

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: listConversations,
  });
}
