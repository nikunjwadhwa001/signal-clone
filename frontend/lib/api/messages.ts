import { api } from "@/lib/api/client";
import type { MessageOut } from "@/lib/types";

export async function sendMessageRest(payload: {
  conversation_id: number;
  client_id: string;
  body: string;
  content_type?: string;
  reply_to_id?: number | null;
}) {
  const { data } = await api.post<MessageOut>("/messages", payload);
  return data;
}

export async function react(messageId: number, emoji: string) {
  const { data } = await api.post<MessageOut>(`/messages/${messageId}/reactions`, {
    emoji,
  });
  return data;
}

export async function deleteMessage(messageId: number) {
  const { data } = await api.delete<MessageOut>(`/messages/${messageId}`);
  return data;
}

export async function uploadAttachment(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/attachments", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data as { id: number; url: string; filename: string; mime: string; size_bytes: number };
}
