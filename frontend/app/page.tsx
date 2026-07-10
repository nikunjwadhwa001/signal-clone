"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { AuthFlow } from "@/components/auth/auth-flow";

export default function Home() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (accessToken) router.replace("/chat");
  }, [accessToken, router]);

  if (accessToken) return null;
  return <AuthFlow />;
}
