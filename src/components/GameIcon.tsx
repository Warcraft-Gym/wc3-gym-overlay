import { useState } from "react";
import { cn } from "../lib/cn";

function initialsFromIconKey(icon?: string): string {
  if (!icon) return "??";
  return icon
    .split("-")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * A step's unit/building icon, loaded from the API's `iconUrl`. Falls back
 * to a lettered chip derived from the `icon` manifest key (e.g. "hu-peasant"
 * → "HP") when there's no `iconUrl` or the image fails to load — the overlay
 * doesn't ship the icon manifest, so it can't recover the real title.
 */
export function GameIcon({
  iconUrl,
  icon,
  size = 24,
  className,
}: {
  iconUrl?: string;
  icon?: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!iconUrl || broken) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.34 }}
        className={cn(
          "grid shrink-0 place-items-center rounded border border-line-strong bg-surface-2 font-display font-bold text-gold",
          className,
        )}
      >
        {initialsFromIconKey(icon)}
      </span>
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn("shrink-0 rounded border border-line-strong bg-surface-2 object-cover", className)}
    />
  );
}
