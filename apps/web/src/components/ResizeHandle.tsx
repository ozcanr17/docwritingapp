import { useCallback } from "react";

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
  side: "left" | "right";
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
}

export function ResizeHandle({ onResize, side, ariaLabel, value, min, max }: ResizeHandleProps) {
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const factor = side === "left" ? 1 : -1;
      const move = (e: PointerEvent) => onResize((e.clientX - startX) * factor);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [onResize, side],
  );

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(side === "left" ? -16 : 16);
        if (e.key === "ArrowRight") onResize(side === "left" ? 16 : -16);
      }}
      className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary"
    />
  );
}
