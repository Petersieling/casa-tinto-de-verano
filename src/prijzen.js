// Prijslijst 2026/2027. Deze lijst wordt gebruikt door de website én door de server.
// "van" en "tot" zijn [maand, dag], beide inclusief. Prijzen zijn per week.
export const PERIODES = [
  { naam: "Januari – februari", prijs: 845, van: [1, 1], tot: [2, 29] },
  { naam: "Maart", prijs: 895, van: [3, 1], tot: [3, 31] },
  { naam: "April", prijs: 945, van: [4, 1], tot: [4, 30] },
  { naam: "Mei", prijs: 995, van: [5, 1], tot: [5, 31] },
  { naam: "Juni", prijs: 1150, van: [6, 1], tot: [6, 30] },
  { naam: "Juli", prijs: 1400, piek: true, van: [7, 1], tot: [7, 31] },
  { naam: "Augustus", prijs: 1500, piek: true, van: [8, 1], tot: [8, 31] },
  { naam: "September", prijs: 1150, van: [9, 1], tot: [9, 30] },
  { naam: "Oktober", prijs: 950, van: [10, 1], tot: [10, 31] },
  { naam: "November – half december", prijs: 845, van: [11, 1], tot: [12, 14] },
  { naam: "Kerst & Oud en Nieuw", prijs: 1145, piek: true, van: [12, 15], tot: [12, 31] }
];
export const SCHOONMAAK = 150;
export const BORG = 300;
export const MIN_NACHTEN = 10;
export const MAX_PERSONEN = 4;
export const KWH_PER_WEEK = 85;
export const AANBETALING = 0.30;     // deel van huur en eindschoonmaak dat bij boeking wordt betaald
export const RESTANT_DAGEN = 56;     // restant en borg uiterlijk 8 weken voor aankomst, gelijk aan de annuleringsgrens
export const ANNULEER_DAGEN = 56;    // tot 8 weken voor aankomst is alleen de aanbetaling verschuldigd
export const BORG_TERUG_DAGEN = 14;  // borg terug binnen 2 weken na vertrek
export const KWH_PRIJS = 0.35; // euro per kWh boven het inbegrepen verbruik

const DAG = 864e5;
export const naarTijd = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const naarIso = (t) => new Date(t).toISOString().slice(0, 10);
export const isDatum = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && naarIso(naarTijd(s)) === s;
export const nachten = (aankomst, vertrek) => Math.round((naarTijd(vertrek) - naarTijd(aankomst)) / DAG);

// Weekprijs die geldt voor de nacht die op deze datum begint.
export function weekprijs(iso) {
  const sleutel = +iso.slice(5, 7) * 100 + +iso.slice(8, 10);
  const p = PERIODES.find((p) => sleutel >= p.van[0] * 100 + p.van[1] && sleutel <= p.tot[0] * 100 + p.tot[1]);
  return p ? p.prijs : 0;
}

// Huur voor een verblijf: per nacht een zevende van de weekprijs van die periode, afgerond op hele euro's.
export function huurprijs(aankomst, vertrek) {
  let som = 0;
  for (let t = naarTijd(aankomst), eind = naarTijd(vertrek); t < eind; t += DAG) som += weekprijs(naarIso(t)) / 7;
  return Math.round(som);
}

// Inbegrepen elektriciteit voor een verblijf, naar rato van het aantal nachten.
export const kwhInbegrepen = (aantalNachten) => Math.round(aantalNachten / 7 * KWH_PER_WEEK);
