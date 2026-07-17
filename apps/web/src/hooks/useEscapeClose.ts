import { useEffect, useRef } from "react";

const escapeLayers: symbol[] = [];

export function useEscapeClose(onClose: () => void, enabled = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const layer = Symbol("escape-layer");
    escapeLayers.push(layer);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || escapeLayers.at(-1) !== layer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const index = escapeLayers.lastIndexOf(layer);
      if (index >= 0) escapeLayers.splice(index, 1);
    };
  }, [enabled]);
}
