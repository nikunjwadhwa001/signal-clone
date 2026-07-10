export const queryKeys = {
  me: ["me"] as const,
  conversations: ["conversations"] as const,
  messages: (conversationId: number) => ["messages", conversationId] as const,
  members: (conversationId: number) => ["members", conversationId] as const,
  search: (q: string) => ["users", "search", q] as const,
};
