import { useState } from "react";

export function Zahl({ wert, onChange, stellen = 2, min }: { wert: number | undefined; onChange: (v: number | undefined) => void; stellen?: number; min?: number }) {
  const [text, setText] = useState<string | null>(null);
  const anzeige = text ?? (wert === undefined || Number.isNaN(wert) ? "" : String(Math.round(wert * 10 ** stellen) / 10 ** stellen));
  return (
    <input
      className="zahl"
      value={anzeige}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === null) return;
        const t = text.replace(",", ".").trim();
        const v = t === "" ? undefined : Number(t);
        if (v === undefined || (Number.isFinite(v) && (min === undefined || v >= min))) onChange(v);
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(null);
      }}
    />
  );
}
