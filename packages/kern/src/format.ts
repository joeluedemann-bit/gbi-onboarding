/** Formatierung für Anzeige und Berichte (deutsche Schreibweise). */

/** Station im Format „0+125,000“. */
export function formatStation(station: number, stellen = 3): string {
  const vz = station < 0 ? "-" : "";
  const a = Math.abs(station);
  let km = Math.floor(a / 1000);
  let rest = a - km * 1000;
  if (Number(rest.toFixed(stellen)) >= 1000) {
    km += 1;
    rest = 0;
  }
  const [ganz, dez] = rest.toFixed(stellen).split(".");
  return `${vz}${km}+${ganz.padStart(3, "0")}${dez ? "," + dez : ""}`;
}

export function formatZahl(x: number, stellen = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "–";
  return x.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

export function formatProzent(s: number, stellen = 2): string {
  return `${formatZahl(s * 100, stellen)} %`;
}
