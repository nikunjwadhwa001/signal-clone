import { api } from "@/lib/api/client";

export async function register(payload: {
  username: string;
  phone?: string;
  display_name: string;
  password: string;
}) {
  const { data } = await api.post("/auth/register", payload);
  return data as { username: string; otp_hint: string };
}

export async function login(username: string, password: string) {
  const { data } = await api.post("/auth/login", { username, password });
  return data as { username: string; otp_hint: string };
}

export async function verify(username: string, otp: string) {
  const { data } = await api.post("/auth/verify", { username, otp });
  return data as { access_token: string; refresh_token: string };
}

export async function logout(refreshToken: string) {
  await api.post("/auth/logout", { refresh_token: refreshToken });
}

export async function getWsTicket() {
  const { data } = await api.post("/auth/ws-ticket");
  return data.ticket as string;
}
