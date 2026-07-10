export default function ChatEmptyPage() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-bg-secondary text-center text-text-tertiary">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-bg-tertiary text-4xl">
        💬
      </div>
      <p className="text-lg font-medium text-text-secondary">Select a conversation</p>
      <p className="max-w-xs text-sm">
        Choose an existing conversation from the list, or start a new one.
      </p>
    </div>
  );
}
