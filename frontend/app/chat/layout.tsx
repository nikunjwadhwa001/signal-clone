"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRealtimeConnection } from "@/lib/hooks/use-realtime-connection";
import { Sidebar } from "@/components/conversation/sidebar";
import { cn } from "@/lib/utils";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  useRealtimeConnection();

  useEffect(() => {
    if (!accessToken) router.replace("/");
  }, [accessToken, router]);

  if (!accessToken) return null;

  // Mobile: sidebar and detail pane (conversation, settings, group info) are
  // mutually exclusive full-screen views, switched by route.
  const hasDetailView = pathname !== "/chat";

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className={cn("w-full md:w-auto", hasDetailView && "hidden md:block")}>
        <Sidebar />
      </div>
      <div className={cn("flex-1", !hasDetailView && "hidden md:flex")}>
        {children}
      </div>
    </div>
  );
}
