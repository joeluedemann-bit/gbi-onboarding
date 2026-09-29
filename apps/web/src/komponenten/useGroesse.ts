import { useEffect, useRef, useState } from "react";

/** Beobachtet die Größe eines Elements (für Zeichnungen, die ihren Maßstab selbst bestimmen). */
export function useGroesse<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [groesse, setGroesse] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const beobachter = new ResizeObserver(([eintrag]) => {
      const { width, height } = eintrag.contentRect;
      setGroesse({ w: Math.round(width), h: Math.round(height) });
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);
  return [ref, groesse] as const;
}
