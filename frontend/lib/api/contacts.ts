import { api } from "@/lib/api/client";
import type { UserPublic } from "@/lib/types";

export async function listContacts() {
  const { data } = await api.get<UserPublic[]>("/contacts");
  return data;
}

export async function addContact(contactUserId: number, nickname?: string) {
  const { data } = await api.post<UserPublic>("/contacts", {
    contact_user_id: contactUserId,
    nickname,
  });
  return data;
}

export async function deleteContact(contactUserId: number) {
  await api.delete(`/contacts/${contactUserId}`);
}
