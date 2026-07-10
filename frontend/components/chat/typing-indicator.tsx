export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="my-0.5 flex items-center gap-1 rounded-2xl rounded-bl-md bg-bubble-incoming px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
