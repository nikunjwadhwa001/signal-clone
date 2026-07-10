"use client";

import { use } from "react";
import { ChatPane } from "@/components/chat/chat-pane";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ChatPane conversationId={Number(id)} />;
}
