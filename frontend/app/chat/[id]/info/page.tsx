"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import {
  addMember,
  getMembers,
  removeMember,
  updateConversation,
} from "@/lib/api/conversations";
import { searchUsers } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useConversations } from "@/lib/hooks/use-conversations";
import type { UserPublic } from "@/lib/types";

const DISAPPEARING_OPTIONS = [
  { label: "Off", seconds: 0 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "1 week", seconds: 604800 },
];

export default function GroupInfoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const conversationId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { data: conversations = [] } = useConversations();
  const conversation = conversations.find((c) => c.id === conversationId);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<UserPublic[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<{ userId: number; name: string; isSelf: boolean } | null>(null);

  const membersQuery = useQuery({
    queryKey: queryKeys.members(conversationId),
    queryFn: () => getMembers(conversationId),
  });

  const myRole = membersQuery.data?.find((m) => m.user.id === currentUserId)?.role;
  const isAdmin = myRole === "admin";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.members(conversationId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
  };

  const addMutation = useMutation({
    mutationFn: (userId: number) => addMember(conversationId, userId),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeMember(conversationId, userId),
    onSuccess: (_, userId) => {
      invalidate();
      setConfirmTarget(null);
      if (userId === currentUserId) router.push("/chat");
    },
  });
  const disappearingMutation = useMutation({
    mutationFn: (seconds: number) =>
      updateConversation(conversationId, { disappearing_seconds: seconds }),
    onSuccess: invalidate,
  });

  async function handleAddSearch(q: string) {
    setAddQuery(q);
    setAddResults(q.trim() ? await searchUsers(q) : []);
  }

  if (!conversation) return null;

  const existingIds = new Set(membersQuery.data?.map((m) => m.user.id) || []);

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-bg-secondary">
      <div className="flex items-center gap-3 border-b border-border bg-bg-primary px-4 py-3">
        <button
          onClick={() => router.push(`/chat/${conversationId}`)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-bg-hover"
        >
          ‹
        </button>
        <h1 className="text-base font-semibold">Group info</h1>
      </div>

      <div className="mx-auto w-full max-w-lg p-6">
        <div className="mb-6 flex flex-col items-center gap-2 rounded-2xl bg-bg-primary p-6">
          <Avatar name={conversation.name || "Group"} seed={conversation.id} src={conversation.avatar_url} size={88} />
          <div className="text-lg font-semibold">{conversation.name}</div>
          <div className="text-sm text-text-tertiary">
            {membersQuery.data?.length || 0} members
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-bg-primary p-4">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-text-tertiary">
            Disappearing messages
          </h2>
          <div className="flex flex-wrap gap-2">
            {DISAPPEARING_OPTIONS.map((opt) => (
              <button
                key={opt.seconds}
                disabled={!isAdmin}
                onClick={() => disappearingMutation.mutate(opt.seconds)}
                className={`rounded-full px-3 py-1.5 text-xs transition disabled:opacity-40 ${
                  conversation.disappearing_seconds === opt.seconds
                    ? "bg-signal-blue text-white"
                    : "bg-bg-tertiary text-text-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!isAdmin && (
            <p className="mt-2 text-xs text-text-tertiary">Only admins can change this.</p>
          )}
        </div>

        {isAdmin && (
          <div className="mb-6 rounded-2xl bg-bg-primary p-4">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-text-tertiary">
              Add member
            </h2>
            <input
              value={addQuery}
              onChange={(e) => handleAddSearch(e.target.value)}
              placeholder="Search by username or name"
              className="mb-2 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm outline-none focus:border-signal-blue"
            />
            <div className="flex flex-col gap-1">
              {addResults
                .filter((u) => !existingIds.has(u.id))
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      addMutation.mutate(u.id);
                      setAddQuery("");
                      setAddResults([]);
                    }}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-hover"
                  >
                    <Avatar name={u.display_name} seed={u.id} src={u.avatar_url} size={32} />
                    <span className="text-sm">{u.display_name}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-bg-primary p-2">
          <h2 className="mb-1 px-3 pt-2 text-xs font-semibold uppercase text-text-tertiary">
            Members
          </h2>
          {membersQuery.data?.map((m) => (
            <div key={m.user.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <Avatar name={m.user.display_name} seed={m.user.id} src={m.user.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.user.display_name} {m.user.id === currentUserId && "(You)"}
                </div>
                {m.role === "admin" && (
                  <div className="text-xs text-signal-blue">Admin</div>
                )}
              </div>
              {(isAdmin || m.user.id === currentUserId) && (
                <button
                  onClick={() =>
                    setConfirmTarget({
                      userId: m.user.id,
                      name: m.user.display_name,
                      isSelf: m.user.id === currentUserId,
                    })
                  }
                  className="rounded-full px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                >
                  {m.user.id === currentUserId ? "Leave" : "Remove"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Modal
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget?.isSelf ? `Leave “${conversation.name}”?` : `Remove ${confirmTarget?.name}?`}
      >
        <p className="mb-5 text-sm text-text-secondary">
          {confirmTarget?.isSelf
            ? "You will no longer be able to send or receive messages in this group."
            : "They will be removed from this group and won't be able to send or receive further messages."}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setConfirmTarget(null)}
            className="rounded-full px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            disabled={removeMutation.isPending}
            onClick={() => confirmTarget && removeMutation.mutate(confirmTarget.userId)}
            className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
          >
            {confirmTarget?.isSelf ? "Leave" : "Remove"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
