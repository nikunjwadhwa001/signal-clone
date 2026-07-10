import type { MessageStatus } from "@/lib/types";

/** Signal's single-check / double-check / blue-check status indicator. */
export function MessageStatusIcon({ status }: { status: MessageStatus }) {
  if (status === "sending") {
    return <span className="text-[11px] opacity-70">🕓</span>;
  }
  if (status === "failed") {
    return <span className="text-[11px] text-red-300">⚠ Failed</span>;
  }
  if (status === "sent") {
    return <Check color="rgba(255,255,255,0.75)" />;
  }
  if (status === "delivered") {
    return <DoubleCheck color="rgba(255,255,255,0.75)" />;
  }
  return <DoubleCheck color="#7fd1ff" />; // read
}

function Check({ color }: { color: string }) {
  return (
    <svg width="14" height="10" viewBox="0 0 16 11" fill="none">
      <path
        d="M1 5.5L5.5 10L15 1"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DoubleCheck({ color }: { color: string }) {
  return (
    <svg width="18" height="10" viewBox="0 0 20 11" fill="none">
      <path
        d="M1 5.5L5.5 10L15 1"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 5.5L10.5 10L20 1"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
