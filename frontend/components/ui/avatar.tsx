import { avatarColor, cn, initials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  seed: number;
  src?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
}

export function Avatar({ name, seed, src, size = 44, online, className }: AvatarProps) {
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-full font-semibold text-white select-none"
          style={{
            width: size,
            height: size,
            background: avatarColor(seed),
            fontSize: size * 0.38,
          }}
        >
          {initials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={cn(
            "absolute right-0 bottom-0 rounded-full border-2 border-bg-primary",
            online ? "bg-green-500" : "bg-transparent"
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}
