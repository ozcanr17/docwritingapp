export type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-10 w-10 text-sm",
};

const swatches: Array<[number, number]> = [
  [212, 44],
  [262, 46],
  [152, 31],
  [24, 41],
  [338, 44],
  [190, 34],
  [46, 32],
  [288, 46],
];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const last = parts.length > 1 ? parts.at(-1)?.charAt(0) ?? "" : "";
  return `${first}${last}`.toLocaleUpperCase();
}

function swatchFor(name: string): [number, number] {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  return swatches[hash % swatches.length] ?? [212, 44];
}

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  const [hue, lightness] = swatchFor(name);
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: `hsl(${hue} 55% ${lightness}%)` }}
    >
      {initialsOf(name)}
    </span>
  );
}

export interface AvatarGroupProps {
  names: string[];
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export function AvatarGroup({ names, max = 4, size = "sm", className = "" }: AvatarGroupProps) {
  const visible = names.slice(0, max);
  const remaining = names.length - visible.length;
  return (
    <span className={`inline-flex items-center -space-x-1.5 ${className}`}>
      {visible.map((name) => (
        <Avatar key={name} name={name} size={size} className="ring-2 ring-surface" />
      ))}
      {remaining > 0 && (
        <span className={`inline-flex items-center justify-center rounded-full bg-muted font-semibold text-mutedForeground ring-2 ring-surface ${sizeClasses[size]}`}>
          +{remaining}
        </span>
      )}
    </span>
  );
}
