/** Renders a system message (group created/added/removed) from the current
 * viewer's perspective — "You added X" / "Nikunj added You, Aryan" / "You were
 * removed by Nikunj" — instead of the same third-person text for everyone,
 * since the backend stores one structured event, not pre-baked text. */
export function renderSystemMessage(
  contentType: string,
  body: string,
  currentUserId: number | undefined
): string {
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    return body; // legacy plain-text system messages
  }

  if (contentType === "system.created") {
    const { actor_id, actor_name, group_name } = data;
    return actor_id === currentUserId
      ? `You created the group “${group_name}”`
      : `${actor_name} created the group “${group_name}”`;
  }

  if (contentType === "system.added") {
    const { actor_id, actor_name, target_ids, target_names } = data as {
      actor_id: number;
      actor_name: string;
      target_ids: number[];
      target_names: string[];
    };
    const names = target_names.map((name, i) =>
      target_ids[i] === currentUserId ? "You" : name
    );
    const list = names.join(", ");
    if (actor_id === currentUserId) return `You added ${list}`;
    if (target_ids.includes(currentUserId ?? -1)) {
      return target_ids.length === 1
        ? `You were added by ${actor_name}`
        : `${actor_name} added ${list}`;
    }
    return `${actor_name} added ${list}`;
  }

  if (contentType === "system.removed") {
    const { actor_id, actor_name, target_id, target_name, self_leave } = data;
    if (self_leave) {
      return target_id === currentUserId ? "You left the group" : `${target_name} left the group`;
    }
    if (target_id === currentUserId) return `You were removed by ${actor_name}`;
    if (actor_id === currentUserId) return `You removed ${target_name}`;
    return `${actor_name} removed ${target_name}`;
  }

  return body;
}
