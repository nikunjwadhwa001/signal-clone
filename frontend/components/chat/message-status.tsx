import type { MessageStatus } from "@/lib/types";

/** Signal's actual indicator: a bare check (sent), two overlapping
 * hollow-circle checks (delivered), and two overlapping filled-circle
 * checks (read) — not a WhatsApp-style flat double tick. */
export function MessageStatusIcon({ status }: { status: MessageStatus }) {
  if (status === "sending") {
    return <span className="text-[11px] opacity-70">🕓</span>;
  }
  if (status === "failed") {
    return <span className="text-[11px] text-red-300">⚠ Failed</span>;
  }
  if (status === "sent") {
    return <BareCheck color="rgba(255,255,255,0.6)" />;
  }
  if (status === "delivered") {
    return (
      <DoubleCircledCheck
        ringColor="rgba(255,255,255,0.6)"
        fill="none"
        checkColor="rgba(255,255,255,0.6)"
      />
    );
  }
  return <DoubleCircledCheck ringColor="#ffffff" fill="#ffffff" checkColor="var(--signal-blue)" />;
}

function BareCheck({ color }: { color: string }) {
  return (
    <svg width="12" height="10" viewBox="0 0 16 13" fill="none">
      <path
        d="M2 7L6 11L14 1.5"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DoubleCircledCheck({
  ringColor,
  fill,
  checkColor,
}: {
  ringColor: string;
  fill: string;
  checkColor: string;
}) {
  return (
    <svg width="20" height="13" viewBox="0 0 21 14" fill="none">
      {/* back badge, peeking out to the left */}
      <circle cx="7" cy="7" r="6" stroke={ringColor} strokeWidth="1.3" fill={fill} />
      <path
        d="M4 7.2L6.1 9.3L10 4.8"
        stroke={checkColor}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* front badge, overlapping to the right */}
      <circle cx="14" cy="7" r="6" stroke={ringColor} strokeWidth="1.3" fill={fill} />
      <path
        d="M11 7.2L13.1 9.3L17 4.8"
        stroke={checkColor}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
