export interface TagProps {
  className?: string;
  children: React.ReactNode;
}

export function Tag({ className = "", children }: TagProps) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 truncate rounded border border-border bg-surfaceSubtle px-1.5 py-0.5 text-[11px] font-medium leading-4 text-foreground/80 ${className}`}>
      {children}
    </span>
  );
}
