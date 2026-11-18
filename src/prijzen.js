// Prijslijst 2026/2027. Deze lijst wordt gebruikt door de website én door de server.
// "van" en "tot" zijn [maand, dag], beide inclusief. Prijzen zijn per week.
export const PERIODES = [
  { naam: "Januari – februari", prijs: 650, van: [1, 1], tot: [2, 29] },
  { naam: "Maart", prijs: 750, van: [3, 1], tot: [3, 31] },
  { naam: "April", prijs: 850, van: [4, 1], tot: [4, 30] },
  { naam: "Mei", prijs: 895, van: [5, 1], tot: [5, 31] },
  { naam: "Juni", prijs: 1045, van: [6, 1], tot: [6, 30] },
  { naam: "Juli", prijs: 1295, piek: true, van: [7, 1], tot: [7, 31] },
  { naam: "Augustus", prijs: 1295, piek: true, van: [8, 1], tot: [8, 31] },
  { naam: "September", prijs: 1045, van: [9, 1], tot: [9, 30] },
  { naam: "Oktober", prijs: 850, van: [10, 1], tot: [10, 31] },
  { naam: "November – half december", prijs: 650, van: [11, 1], tot: [12, 14] },
  { naam: "Kerst & Oud en Nieuw", prijs: 1095, piek: true, van: [12, 15], tot: [12, 31] }
];
// Schoolvakanties: de site rekent ze elk jaar zelf uit met vaste regels, zodat er niets bijgehouden hoeft te worden.
// Wijkt een officiële vakantie af, zet de juiste data dan in VAKANTIE_CORRECTIES (per jaar en per soort).
export const VAKANTIE_PRIJZEN = { voorjaar: 750, pasen: 950, mei: 995, herfstNL: 950, herfstBE: 750 };
export const VAKANTIE_NAMEN = { voorjaar: "Krokus- en voorjaarsvakantie", pasen: "Pasen en paasvakantie", mei: "Meivakantie", herfstNL: "Herfstvakantie Nederland", herfstBE: "Herfstvakantie België" };
export const VAKANTIE_CORRECTIES = {
  // voorbeeld: 2029: { herfstNL: ["2029-10-13", "2029-10-28"] }
};
export const SCHOONMAAK = 150;
export const BORG = 300;
export const MIN_NACHTEN = 10;
export const MAX_PERSONEN = 4;
export const KWH_PER_WEEK = 120;      // inbegrepen elektriciteit per week, het hele jaar
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

// ---- Schoolvakanties uitrekenen ----
const plus = (iso, dagen) => naarIso(naarTijd(iso) + dagen * DAG);
const weekdag = (iso) => (new Date(naarTijd(iso)).getUTCDay() + 6) % 7; // maandag 0 ... zondag 6
function pasen(jaar) { // Gregoriaanse paasdatum (Meeus/Jones/Butcher)
  const a = jaar % 19, b = Math.floor(jaar / 100), c = jaar % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31), dag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}
function maandagVanWeek(jaar, week) { // maandag van ISO-week
  const vier = `${jaar}-01-04`;
  return plus(plus(vier, -weekdag(vier)), (week - 1) * 7);
}
const cache = {};
export function vakantiesVoor(jaar) {
  if (cache[jaar]) return cache[jaar];
  const p = pasen(jaar), koningsdag = `${jaar}-04-27`, novEen = `${jaar}-11-01`;
  const perioden = {
    voorjaar: [plus(maandagVanWeek(jaar, 6), -2), plus(maandagVanWeek(jaar, 8), 6)],   // za voor week 6 t/m zo week 8
    pasen: [plus(p, -8), plus(p, 14)],                                                  // za voor Palmzondag t/m 2 weken na Pasen
    mei: [plus(koningsdag, -((weekdag(koningsdag) + 2) % 7)), null],                    // za op of voor Koningsdag, 2 weken
    herfstNL: [plus(maandagVanWeek(jaar, 42), -2), plus(maandagVanWeek(jaar, 43), 6)], // za voor week 42 t/m zo week 43
    herfstBE: [plus(novEen, -weekdag(novEen)), plus(novEen, 6 - weekdag(novEen))]       // de week (ma t/m zo) met 1 november
  };
  perioden.mei[1] = plus(perioden.mei[0], 15);
  Object.assign(perioden, VAKANTIE_CORRECTIES[jaar] || {});
  return (cache[jaar] = Object.entries(perioden).map(([soort, [van, tot]]) => ({ soort, naam: VAKANTIE_NAMEN[soort], prijs: VAKANTIE_PRIJZEN[soort], van, tot })));
}

// Weekprijs die geldt voor de nacht die op deze datum begint.
export function weekprijs(iso) {
  const vak = vakantiesVoor(+iso.slice(0, 4)).filter((v) => iso >= v.van && iso <= v.tot);
  if (vak.length) return Math.max(...vak.map((v) => v.prijs)); // overlappen twee vakanties, dan telt de hoogste
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

// Inbegrepen elektriciteit per week voor de nacht die op deze datum begint (nu het hele jaar gelijk).
export const kwhPerWeek = (iso) => KWH_PER_WEEK;

// Inbegrepen elektriciteit voor een verblijf: per nacht een zevende van de weekhoeveelheid.
export function kwhInbegrepen(aankomst, vertrek) {
  if (typeof aankomst === "number") return Math.round(aankomst / 7 * KWH_PER_WEEK); // oude aanroep met alleen het aantal nachten
  let som = 0;
  for (let t = naarTijd(aankomst), eind = naarTijd(vertrek); t < eind; t += DAG) som += kwhPerWeek(naarIso(t)) / 7;
  return Math.round(som);
}
