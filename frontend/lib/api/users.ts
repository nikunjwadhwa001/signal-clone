import { api } from "@/lib/api/client";
import type { UserMe, UserPublic } from "@/lib/types";

export async function getMe() {
  const { data } = await api.get<UserMe>("/me");
  return data;
}

export async function updateMe(payload: Partial<Pick<UserMe, "display_name" | "avatar_url" | "about">>) {
  const { data } = await api.patch<UserMe>("/me", payload);
  return data;
}

export async function searchUsers(q: string) {
  if (!q.trim()) return [];
  const { data } = await api.get<UserPublic[]>("/users/search", { params: { q } });
  return data;
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UserMe>("/me/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
