"use client";

import { useToastStore } from "@/lib/stores/toast-store";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`cursor-pointer rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
            t.variant === "error" ? "bg-red-500" : "bg-bg-tertiary text-text-primary"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
