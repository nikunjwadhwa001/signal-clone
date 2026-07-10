import { create } from "zustand";

interface TypingEntry {
  userId: number;
  expiresAt: number;
}

interface RealtimeState {
  onlineUserIds: Set<number>;
  typingByConversation: Record<number, TypingEntry[]>;
  connected: boolean;
  setConnected: (connected: boolean) => void;
  setPresence: (userId: number, online: boolean) => void;
  setTyping: (conversationId: number, userId: number, isTyping: boolean) => void;
  pruneExpiredTyping: (conversationId: number) => void;
}

/** Ephemeral socket-derived state only: presence and typing. Server data
 * (messages, conversations) lives in TanStack Query, kept separate so a
 * typing blip never triggers a message-list re-render and vice versa. */
export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  onlineUserIds: new Set(),
  typingByConversation: {},
  connected: false,
  setConnected: (connected) => set({ connected }),
  setPresence: (userId, online) =>
    set((state) => {
      const next = new Set(state.onlineUserIds);
      if (online) next.add(userId);
      else next.delete(userId);
      return { onlineUserIds: next };
    }),
  setTyping: (conversationId, userId, isTyping) =>
    set((state) => {
      const existing = state.typingByConversation[conversationId] || [];
      const withoutUser = existing.filter((e) => e.userId !== userId);
      const next = isTyping
        ? [...withoutUser, { userId, expiresAt: Date.now() + 6000 }]
        : withoutUser;
      return {
        typingByConversation: {
          ...state.typingByConversation,
          [conversationId]: next,
        },
      };
    }),
  pruneExpiredTyping: (conversationId) =>
    set((state) => {
      const existing = state.typingByConversation[conversationId] || [];
      const now = Date.now();
      const next = existing.filter((e) => e.expiresAt > now);
      if (next.length === existing.length) return state;
      return {
        typingByConversation: {
          ...state.typingByConversation,
          [conversationId]: next,
        },
      };
    }),
}));
