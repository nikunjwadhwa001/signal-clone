export interface UserPublic {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  about: string;
  last_seen_at: string | null;
}

export interface UserMe extends UserPublic {
  phone: string | null;
  safety_number: string;
}

export type ConversationType = "direct" | "group";
export type MemberRole = "admin" | "member";

export interface MemberOut {
  user: UserPublic;
  role: MemberRole;
}

export interface MessagePreview {
  id: number;
  seq: number;
  sender_id: number;
  content_type: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
}

export interface ConversationOut {
  id: number;
  type: ConversationType;
  name: string | null;
  avatar_url: string | null;
  disappearing_seconds: number;
  last_message_at: string | null;
  last_seq: number;
  unread_count: number;
  members: MemberOut[];
  last_message: MessagePreview | null;
  peer: UserPublic | null;
}

export interface ReactionOut {
  user_id: number;
  emoji: string;
}

export interface ReceiptSummary {
  delivered_count: number;
  read_count: number;
  recipient_count: number;
}

export interface MessageOut {
  id: number;
  conversation_id: number;
  seq: number;
  sender_id: number;
  client_id: string;
  content_type: string;
  body: string;
  reply_to_id: number | null;
  created_at: string;
  edited_at: string | null;
  expires_at: string | null;
  deleted_at: string | null;
  reactions: ReactionOut[];
  receipts: ReceiptSummary | null;
}

/** Client-side send status; "sending"/"failed" never touch the server. */
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface DisplayMessage extends MessageOut {
  status: MessageStatus;
}
