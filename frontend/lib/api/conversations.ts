import { api } from "@/lib/api/client";
import type {
  ConversationOut,
  ConversationType,
  MemberOut,
  MessageOut,
} from "@/lib/types";

export async function listConversations() {
  const { data } = await api.get<ConversationOut[]>("/conversations");
  return data;
}

export async function createConversation(payload: {
  type: ConversationType;
  member_ids: number[];
  name?: string;
}) {
  const { data } = await api.post<ConversationOut>("/conversations", payload);
  return data;
}

export async function getMessages(conversationId: number, beforeSeq?: number) {
  const { data } = await api.get<MessageOut[]>(
    `/conversations/${conversationId}/messages`,
    { params: beforeSeq ? { before_seq: beforeSeq } : {} }
  );
  return data;
}

export async function markRead(conversationId: number, upToSeq: number) {
  await api.post(`/conversations/${conversationId}/read`, { up_to_seq: upToSeq });
}

export async function getMembers(conversationId: number) {
  const { data } = await api.get<MemberOut[]>(
    `/conversations/${conversationId}/members`
  );
  return data;
}

export async function addMember(conversationId: number, userId: number) {
  await api.post(`/conversations/${conversationId}/members`, { user_id: userId });
}

export async function removeMember(conversationId: number, userId: number) {
  await api.delete(`/conversations/${conversationId}/members/${userId}`);
}

export async function updateConversation(
  conversationId: number,
  payload: { name?: string; avatar_url?: string; disappearing_seconds?: number }
) {
  const { data } = await api.patch<ConversationOut>(
    `/conversations/${conversationId}`,
    payload
  );
  return data;
}
