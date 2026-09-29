import { useMemo } from "react";
import { type Projekt, type Projektergebnis, deckenbuchStationen, formatStation, formatZahl, querprofil } from "@gbi/kern";
import { useGroesse } from "./useGroesse";

interface Props {
  projekt: Projekt;
  ergebnis: Projektergebnis;
  station: number;
  onStation: (s: number) => void;
}

const FARBE: Record<string, string> = {
  fahrbahn: "#334155",
  rinne: "#64748b",
  bordstein: "#b45309",
  gehweg: "#6b7280",
  radweg: "#be123c",
  parken: "#475569",
  bankett: "#15803d",
  gruen: "#15803d",
  mulde: "#2563eb",
  boeschung: "#15803d",
  achse: "#dc2626",
};

export function Querprofilansicht({ projekt, ergebnis, station, onStation }: Props) {
  const [box, groesse] = useGroesse<HTMLDivElement>();
  const { achse, gradiente, dgm } = ergebnis;
  const q = projekt.querschnitt;

  const stationen = useMemo(
    () => (achse && q ? deckenbuchStationen(achse, q, 10, gradiente).filter((s) => !gradiente || (s >= gradiente.stationAnfang && s <= gradiente.stationEnde)) : []),
    [achse, q, gradiente],
  );
  const qp = useMemo(() => (achse && gradiente && q ? querprofil(achse, gradiente, q, station, dgm) : null), [achse, gradiente, q, station, dgm]);

  if (!achse || !gradiente || !q) {
    return (
      <div className="plan">
        <div className="plan-titel">Querprofil</div>
        <p className="hinweis leer">Für Querprofile werden Achse, Gradiente und ein Regelquerschnitt (Reiter „RQ“) benötigt.</p>
      </div>
    );
  }

  const idx = stationen.findIndex((s) => s >= station - 1e-6);
  const gehe = (d: number) => {
    const i = Math.min(stationen.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + d));
    onStation(stationen[i]);
  };

  // Maßstab: unverzerrt, an die Fläche angepasst
  const rand = { l: 50, r: 20, o: 20, u: 105 };
  const alle = [...(qp?.punkte ?? []).map((p) => ({ a: p.abstand, h: p.hoehe })), ...(qp?.gelaende ?? []).map((p) => ({ a: p.abstand, h: p.hoehe }))];
  const aMin = Math.min(...alle.map((p) => p.a), -3) - 0.5;
  const aMax = Math.max(...alle.map((p) => p.a), 3) + 0.5;
  const hMin = Math.min(...alle.map((p) => p.h)) - 0.3;
  const hMax = Math.max(...alle.map((p) => p.h)) + 0.5;
  const b = Math.max(groesse.w - rand.l - rand.r, 10);
  const h = Math.max(groesse.h - rand.o - rand.u, 10);
  const m = Math.min(b / (aMax - aMin), h / (hMax - hMin));
  const x = (a: number) => rand.l + (a - aMin) * m + (b - (aMax - aMin) * m) / 2;
  const y = (z: number) => rand.o + (hMax - z) * m;
  const gelPfad = qp && qp.gelaende.length > 1 ? "M" + qp.gelaende.map((p) => `${x(p.abstand).toFixed(1)},${y(p.hoehe).toFixed(1)}`).join("L") : "";
  // Beschriftung nur, wo Platz ist (mind. 13 px Abstand); Achse und Böschung haben Vorrang
  const beschriftet: NonNullable<typeof qp>["punkte"] = [];
  if (qp) {
    const kandidaten = qp.punkte.filter((p) => p.art === "achse" || !(p.name.endsWith("innen") && !p.oben));
    const rang = (p: (typeof kandidaten)[number]) => (p.art === "achse" ? 0 : p.art === "boeschung" ? 1 : p.oben ? 2 : 3);
    for (const p of [...kandidaten].sort((a, b) => rang(a) - rang(b))) {
      if (beschriftet.every((b) => Math.abs(x(b.abstand) - x(p.abstand)) >= 13)) beschriftet.push(p);
    }
  }

  return (
    <div className="plan">
      <div className="plan-titel">
        Querprofil
        <span className="legende">
          Station {formatStation(station, 3)} · Achshöhe {formatZahl(qp?.hoehe ?? 0, 3)} m · unverzerrt
        </span>
        <button className="klein" onClick={() => gehe(-1)} disabled={idx <= 0}>
          ◀
        </button>
        <select className="klein" value={stationen.includes(station) ? station : ""} onChange={(e) => onStation(Number(e.target.value))}>
          {!stationen.includes(station) && <option value="">{formatStation(station, 3)}</option>}
          {stationen.map((s) => (
            <option key={s} value={s}>
              {formatStation(s, 3)}
            </option>
          ))}
        </select>
        <button className="klein" onClick={() => gehe(1)} disabled={idx >= stationen.length - 1}>
          ▶
        </button>
      </div>
      <div className="zeichenflaeche" ref={box}>
        {groesse.w > 0 && qp && (
          <svg className="zeichnung" width={groesse.w} height={groesse.h}>
            {gelPfad && <path d={gelPfad} className="gelaende-linie" />}
            <line x1={x(0)} x2={x(0)} y1={y(hMax)} y2={y(hMin)} className="achse-qp" />
            {qp.punkte.slice(1).map((p, i) => {
              const a = qp.punkte[i];
              return <line key={i} x1={x(a.abstand)} y1={y(a.hoehe)} x2={x(p.abstand)} y2={y(p.hoehe)} stroke={FARBE[p.art] ?? "#334155"} strokeWidth={p.art === "bordstein" ? 4 : p.art === "boeschung" ? 1.5 : 2.5} strokeDasharray={p.art === "boeschung" ? "5 3" : undefined} />;
            })}
            {beschriftet.map((p, i) => (
              <g key={i}>
                <line x1={x(p.abstand)} x2={x(p.abstand)} y1={y(p.hoehe)} y2={groesse.h - rand.u + 6} className="gitter" />
                <text x={x(p.abstand)} y={groesse.h - rand.u + 10} className="qp-text" transform={`rotate(90 ${x(p.abstand)} ${groesse.h - rand.u + 10})`}>
                  {formatZahl(p.hoehe, 3)} · {formatZahl(p.abstand, 2)}
                </text>
              </g>
            ))}
            {qp.punkte.map((p, i) => (
              <circle key={`k${i}`} cx={x(p.abstand)} cy={y(p.hoehe)} r={2.5} fill={FARBE[p.art] ?? "#334155"} />
            ))}
          </svg>
        )}
      </div>
      <div className="statuszeile">
        {qp && (
          <>
            {qp.punkte.length} Punkte · Auftrag {formatZahl(qp.auftrag, 2)} m² · Abtrag {formatZahl(qp.abtrag, 2)} m²
            {!dgm && " · ohne Gelände (kein DGM)"}
          </>
        )}
      </div>
    </div>
  );
}
