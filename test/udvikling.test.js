// Udviklingen over tid: motoren bag pilene.
//
// Det, testene holder fast, er fire ting.
//
//   At seneste punkt i en serie er tallet i tabellen - ellers kan pilen beskrive et
//   andet tal end det, læseren har foran sig (doughnut-projektet fandt det for
//   fjorten indikatorer, før en kontrol gjorde det).
//   At et tal, der mangler, er et hul og aldrig nul. I JavaScript er null nul,
//   så det kræver en test at holde ude.
//   At "rigtig" og "langsomt" skilles ad af medianen med fortegn, og at
//   forbehold ikke sætter målestokken for andre kommuner.
//   At kronebeløb sættes i samme prisniveau, før de sammenlignes.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRIVERE, beregnKommune, beregnUdvikling, beregnUdviklingFordeling, driverSerie, driverAar,
  driverTabel, endepunkter, aendring, klassificerUdvikling, samletUdvikling,
  N_ENDEPUNKT, MIN_AAR_FOR_GENNEMSNIT, UDVIKLING_RETNINGER,
} from "../web/beregning.js";
import { land, thisted } from "./fixtures.js";

const drv = (navn) => DRIVERE.find((d) => d.navn === navn);
const AAR = 2024;

/** En række på elleve led: de sidste tal, resten hul. */
const raekke = (...tal) => [...Array(11 - tal.length).fill(null), ...tal];

/** Trin: `foerste` i de fem ældste år, `sidste` i de seks nyeste. Middel af tre år i
 *  hver ende giver så præcis de to tal, og testen kan regne ændringen i hånden. */
const trin = (foerste, sidste) => [...Array(5).fill(foerste), ...Array(6).fill(sidste)];

/** En historik med de felter, testen bruger. felter: {felt: {land: [...], kode: [...]}}.
 *  Alle felter får samme periodeår, så nøgletallets år er givet. */
function historik(felter, { priser = null, aar = AAR } = {}) {
  const h = { vindue: 10, priser, felter: {}, mangler: [], land: {}, kommuner: {} };
  for (const [felt, pr] of Object.entries(felter)) {
    h.felter[felt] = { periode: String(aar), aar };
    for (const [omraade, tal] of Object.entries(pr)) {
      if (omraade === "land") h.land[felt] = tal;
      else (h.kommuner[omraade] ??= {})[felt] = tal;
    }
  }
  return h;
}

const mk = (kode, ekstra = {}) => ({ ...thisted, kode, navn: `K${kode}`, ...ekstra });

// ---------- Endepunkter ----------

test("endepunkter: en kort serie sammenligner første og sidste år direkte", () => {
  const ep = endepunkter([2020, 2021, 2022], [10, 11, 12]);
  assert.deepEqual([ep.start, ep.slut, ep.n, ep.midlet], [10, 12, 3, false]);
  assert.deepEqual([ep.startLabel, ep.slutLabel], ["2020", "2022"]);
});

test("endepunkter: fra seks punkter midles tre år i hver ende", () => {
  assert.equal(MIN_AAR_FOR_GENNEMSNIT, 6);
  assert.equal(N_ENDEPUNKT, 3);
  const aar = [2018, 2019, 2020, 2021, 2022, 2023];
  const ep = endepunkter(aar, [10, 20, 30, 40, 50, 60]);
  assert.equal(ep.start, 20);
  assert.equal(ep.slut, 50);
  assert.equal(ep.midlet, true);
  assert.deepEqual([ep.startLabel, ep.slutLabel], ["2018-2020", "2021-2023"]);
});

test("endepunkter: et år uden tal tælles ikke med", () => {
  const ep = endepunkter([2018, 2019, 2020, 2021], [10, null, 30, 40]);
  assert.equal(ep.n, 3);
  assert.equal(ep.start, 10);
  assert.equal(ep.startLabel, "2018");
});

test("endepunkter: ét punkt er ikke en udvikling", () => {
  assert.equal(endepunkter([2024], [5]), null);
  assert.equal(endepunkter([2023, 2024], [null, 5]), null);
  assert.equal(endepunkter([], []), null);
});

// ---------- Ændringen ----------

test("aendring: relativt i procent, og for andele også i procentpoint", () => {
  assert.equal(aendring(drv("Disponibel indkomst"), 200, 220).pct, 10);
  assert.equal(aendring(drv("Disponibel indkomst"), 200, 220).pp, null);
  const fossil = aendring(drv("Fossil-andel"), 0.5, 0.4);
  assert.ok(Math.abs(fossil.pp + 10) < 1e-9, "0,5 til 0,4 er ti procentpoint ned");
  assert.ok(Math.abs(fossil.pct + 20) < 1e-9);
  // Genanvendelsen står allerede i procent og skal ikke ganges med 100.
  assert.equal(aendring(drv("Genanvendelsesprocent"), 45, 50).pp, 5);
});

test("aendring: en vækstrate er en procent i forvejen, så ændringen står i procentpoint", () => {
  const v = aendring(drv("Befolkningsudvikling"), 0.004, 0.009);
  assert.ok(Math.abs(v.pp - 0.5) < 1e-9);
});

test("aendring: en relativ ændring fra nul er ikke defineret", () => {
  assert.equal(aendring(drv("Fossil-andel"), 0, 0.1).pct, null);
});

// ---------- Klassifikation ----------

test("klassifikation: uden tal, uændret, uden vurdering", () => {
  assert.equal(klassificerUdvikling(null, true, 5, false), "ingen");
  assert.equal(klassificerUdvikling(20, true, 5, true), "stagneret");
  assert.equal(klassificerUdvikling(20, null, 5, false), "kontekst");
  // Rækkefølgen er doughnuts: uændret kommer før uden vurdering.
  assert.equal(klassificerUdvikling(0.5, null, 5, true), "stagneret");
});

test("klassifikation: et nøgletal, der ønskes ned, er rigtigt, når det falder", () => {
  assert.equal(klassificerUdvikling(-20, false, -10, false), "rigtig");
  assert.equal(klassificerUdvikling(+20, false, -10, false), "forkert");
  assert.equal(klassificerUdvikling(+20, true, 10, false), "rigtig");
  assert.equal(klassificerUdvikling(-20, true, 10, false), "forkert");
});

test("klassifikation: rigtig vej, men langsommere end medianen, er langsomt", () => {
  assert.equal(klassificerUdvikling(-5, false, -20, false), "tempo");
  assert.equal(klassificerUdvikling(-20, false, -20, false), "rigtig", "lige med medianen er rigtig");
});

test("klassifikation: medianen sammenlignes med fortegn, ikke i størrelse", () => {
  // De fleste kommuner bevæger sig den forkerte vej (median +8 for et nøgletal, der
  // ønskes ned). En kommune, der falder 5 %, går den rigtige vej og er ikke langsom.
  // Med absolutte tal ville 5 < 8 have gjort den til "langsomt".
  assert.equal(klassificerUdvikling(-5, false, +8, false), "rigtig");
});

test("klassifikation: nul ændring er forkert, ikke rigtig", () => {
  assert.equal(klassificerUdvikling(0, false, -5, false), "forkert");
});

// ---------- Serien ----------

test("serie: nøgletallets år er det ældste af dets felters perioder", () => {
  const h = historik({ byggeri: { land: raekke(1, 2) }, folketal: { land: raekke(1, 2) } });
  h.felter.byggeri.aar = 2024;
  h.felter.folketal.aar = 2026;
  assert.equal(driverAar(drv("Byggeaktivitet"), h), 2024,
    "byggeri fra 2024 delt med folketallet i 2026 hører til 2024");
  h.felter.folketal.aar = 2020;
  assert.equal(driverAar(drv("Byggeaktivitet"), h), 2020);
});

test("serie: et nøgletal, hvis felt historikken ikke kender, har ingen serie", () => {
  const h = historik({ byggeri: { 1: raekke(1, 2), land: raekke(1, 2) } });
  assert.equal(driverSerie(drv("Byggeaktivitet"), h, 1), null, "folketal mangler");
  assert.equal(driverSerie(drv("Byggeaktivitet"), null, 1), null);
});

test("serie: er nøgletallets eget regnestykke kørt på hvert års felter", () => {
  const h = historik({
    biler: { 1: raekke(100, 200), land: raekke(1000, 1000) },
    folketal: { 1: raekke(400, 400), land: raekke(4000, 4000) },
  });
  const s = driverSerie(drv("Biler pr. indbygger"), h, 1);
  assert.equal(s.aar.length, 11);
  assert.equal(s.aar.at(-1), AAR);
  assert.equal(s.aar[0], AAR - 10, "ældste først");
  assert.deepEqual(s.kommune.slice(-2), [0.25, 0.5]);
  assert.deepEqual(s.land.slice(-2), [0.25, 0.25]);
});

test("serie: et manglende felt er et hul og aldrig nul", () => {
  // null / 400 er 0 i JavaScript. Et år, hvor bilerne mangler, må ikke stå som 0
  // biler pr. indbygger.
  const h = historik({
    biler: { 1: raekke(100, null, 200), land: raekke(1000, 1000, 1000) },
    folketal: { 1: raekke(400, 400, 400), land: raekke(4000, 4000, 4000) },
  });
  const s = driverSerie(drv("Biler pr. indbygger"), h, 1);
  assert.deepEqual(s.kommune.slice(-3), [0.25, null, 0.5]);
  assert.ok(s.kommune.every((v) => v !== 0), "intet punkt er nul");
  assert.deepEqual(s.kommune.slice(0, 8), Array(8).fill(null));
});

test("serie: et hul i nævneren er også et hul", () => {
  const h = historik({
    biler: { 1: raekke(100, 200), land: raekke(1000, 1000) },
    folketal: { 1: raekke(null, 400), land: raekke(4000, 4000) },
  });
  const s = driverSerie(drv("Biler pr. indbygger"), h, 1);
  assert.equal(s.kommune.at(-2), null);
  assert.equal(s.kommune.at(-1), 0.5);
});

test("serie: nøgletal, der bruger landets tal, bruger landets tal for samme år", () => {
  // Husholdningernes CO2 pr. bolig regnes med landets fælles el-faktor, som ændrer sig
  // fra år til år. Faktoren for 2023 må ikke bruges på 2024.
  const felt = (kommune, land) => ({ 1: kommune, land });
  const h = historik({
    husholdning_co2_ton: felt(raekke(1000, 1000), raekke(2000, 2000)),
    husholdning_el_co2_ton: felt(raekke(100, 100), raekke(400, 300)),
    husholdning_el_tj: felt(raekke(10, 10), raekke(20, 20)),
    boliger_parcel: felt(raekke(100, 100), raekke(200, 200)),
    boliger_raekke: felt(raekke(0, 0), raekke(0, 0)),
    boliger_etage: felt(raekke(0, 0), raekke(0, 0)),
    fritidshuse: felt(raekke(0, 0), raekke(0, 0)),
  });
  const s = driverSerie(drv("Husholdningernes CO2 fra energi"), h, 1);
  // (1000 - 100 + 10 * faktor) / 100. Faktor 2023: 400/20 = 20. Faktor 2024: 300/20 = 15.
  assert.equal(s.kommune.at(-2), (1000 - 100 + 10 * 20) / 100);
  assert.equal(s.kommune.at(-1), (1000 - 100 + 10 * 15) / 100);
});

test("serie: kronebeløb sættes i det seneste års prisniveau", () => {
  const priser = { kilde: "PRIS8", aar: { 2022: 100, 2023: 110, 2024: 120 } };
  const h = historik({ disp_indkomst: { 1: raekke(1000, 1100, 1200), land: raekke(2000, 2200, 2400) } },
    { priser });
  const s = driverSerie(drv("Disponibel indkomst"), h, 1);
  // Løbende beløb er 1000, 1100 og 1200: stigningen følger blot priserne. I 2024-priser
  // er det tre gange 1200 - ingen reel udvikling.
  assert.deepEqual(s.kommune.slice(-3), [1200, 1200, 1200]);
  assert.deepEqual(s.land.slice(-3), [2400, 2400, 2400]);
  assert.equal(s.faste, true);
  assert.equal(s.prisAar, 2024);
});

test("serie: det seneste punkt er nøgletallets nuværende værdi, uændret", () => {
  // Faktoren for det seneste år er præcis 1, så tabellens tal og seriens sidste punkt er
  // ét tal - også bitvis.
  const priser = { kilde: "PRIS8", aar: { 2023: 8077, 2024: 8188 } };
  const h = historik({ disp_indkomst: { 1: raekke(250000.7, 252934.123456789), land: raekke(1, 287682) } },
    { priser });
  const s = driverSerie(drv("Disponibel indkomst"), h, 1);
  assert.equal(s.kommune.at(-1), 252934.123456789);
  assert.equal(s.land.at(-1), 287682);
});

test("serie: et femårsgennemsnit sættes i prisniveauet i vinduets midte", () => {
  // Anlægsindkøbet er et middel af de fem år, der slutter i året, og hører til prisniveauet to
  // år før slutåret. Med slutårets priser ville det blive sat for sent, og ændringen mellem
  // to vinduer ville miste to års inflationsforskel.
  const d = drv("Kommunens anlægsindkøb");
  assert.equal(d.prisForskydning, 2);
  const priser = { kilde: "PRIS8", aar: { 2020: 100, 2021: 110, 2022: 121, 2023: 133, 2024: 146 } };
  const h = historik({ indkoeb_anlaeg_pr_indb: { 1: raekke(1000, 1100, 1210), land: raekke(1, 1, 1) } },
    { priser });
  const s = driverSerie(d, h, 1);
  // Nu er 2024, så priserne er fra 2022. Trin 0: 1210 * 121/121. Trin 1: 1100 * 121/110.
  // Trin 2: 1000 * 121/100. Alle tre er 1210: ingen reel udvikling.
  assert.deepEqual(s.kommune.slice(-3), [1210, 1210, 1210]);
  assert.equal(s.prisAar, 2022, "tooltippen siger, hvilke priser beløbet står i");
});

test("serie: uden prisindeks for et år er kronebeløbet et hul, ikke et løbende beløb", () => {
  const priser = { kilde: "PRIS8", aar: { 2024: 120 } };
  const h = historik({ disp_indkomst: { 1: raekke(1000, 1200), land: raekke(2000, 2400) } }, { priser });
  const s = driverSerie(drv("Disponibel indkomst"), h, 1);
  assert.equal(s.kommune.at(-2), null, "2023 har intet indeks, så beløbet kan ikke sættes i 2024-priser");
  assert.equal(s.kommune.at(-1), 1200);
  const uden = driverSerie(drv("Disponibel indkomst"),
    historik({ disp_indkomst: { 1: raekke(1, 2), land: raekke(1, 2) } }), 1);
  assert.deepEqual(uden.kommune.filter((v) => v != null), [], "helt uden priser er alle led huller");
});

test("serie: kun nøgletal i kroner er prisjusteret", () => {
  const priser = { kilde: "PRIS8", aar: { 2023: 100, 2024: 200 } };
  const h = historik({
    biler: { 1: raekke(100, 200), land: raekke(1000, 1000) },
    folketal: { 1: raekke(400, 400), land: raekke(4000, 4000) },
  }, { priser });
  const s = driverSerie(drv("Biler pr. indbygger"), h, 1);
  assert.deepEqual(s.kommune.slice(-2), [0.25, 0.5], "biler pr. indbygger er ikke kroner");
  assert.equal(s.faste, false);
});

test("hvert nøgletal i kroner er prisjusteret, og ingen andre er", () => {
  // Uden justeringen ville en stigning, der blot følger priserne, ligne en udvikling, og
  // alle 98 kommuner ville pege samme vej. Et nyt kronenøgletal må ikke glemme flaget.
  for (const d of DRIVERE) {
    assert.equal(d.faste === true, d.enhed.startsWith("kr."),
      `${d.navn} (${d.enhed}): faste skal følge enheden`);
  }
});

// ---------- Udviklingen for alle kommuner ----------

/** Fem kommuner, hvis fossilandel går fra 80 % til hver sin slutværdi. Fossil-andel
 *  ønskes ned, så et fald er rigtigt. */
function femKommuner(slut = [56, 64, 72, 84, 48]) {
  const kommuner = slut.map((_, i) => mk(i + 1));
  const felter = {
    biler: { land: trin(1000, 1000) },
    biler_benzin: { land: trin(400, 400) },
    biler_diesel: { land: trin(400, 400) },
  };
  slut.forEach((s, i) => {
    felter.biler[i + 1] = trin(1000, 1000);
    felter.biler_benzin[i + 1] = trin(400, s * 5);
    felter.biler_diesel[i + 1] = trin(400, s * 5);
  });
  return { kommuner, h: historik(felter) };
}

const FOSSIL = "Fossil-andel";

test("udvikling: rigtig eller langsomt afgøres af medianen for kommunerne", () => {
  // Fossilandelen falder fra 80 % til 56, 64, 72, 84 og 48 %: ændringer på -30, -20, -10,
  // +5 og -40 %. Medianen er -20. Mod målet (ned) er det +30, +20, +10, -5 og +40.
  const { kommuner, h } = femKommuner();
  const u = beregnUdvikling(kommuner, land, h);
  const retning = (kode) => u.get(kode)[FOSSIL].retning;
  assert.equal(retning(1), "rigtig");
  assert.equal(retning(2), "rigtig", "lige med medianen er rigtig");
  assert.equal(retning(3), "tempo");
  assert.equal(retning(4), "forkert");
  assert.equal(retning(5), "rigtig");
  assert.ok(Math.abs(u.get(1)[FOSSIL].pct + 30) < 1e-9);
  assert.equal(u.get(1)[FOSSIL].startLabel, "2014-2016");
  assert.equal(u.get(1)[FOSSIL].slutLabel, "2022-2024");
});

test("udvikling: pilens retning er værdiens, farven er vurderingens", () => {
  const { kommuner, h } = femKommuner();
  const u = beregnUdvikling(kommuner, land, h);
  assert.equal(u.get(1)[FOSSIL].op, false, "fossilandelen faldt");
  assert.equal(u.get(4)[FOSSIL].op, true, "fossilandelen steg");
  assert.equal(u.get(1)[FOSSIL].retning, "rigtig", "et fald er godt");
  assert.equal(u.get(4)[FOSSIL].retning, "forkert", "en stigning er dårlig");
});

test("udvikling: de fleste går den forkerte vej, og den rigtige er ikke langsom", () => {
  // Fire kommuner stiger 10-40 %, én falder 5 %. Medianen er positiv (dårlig). Den ene, der
  // falder, går den rigtige vej og er ikke langsom, selv om 5 er mindre end medianen.
  const { kommuner, h } = femKommuner([88, 92, 96, 100, 76]);
  const u = beregnUdvikling(kommuner, land, h);
  assert.equal(u.get(5)[FOSSIL].retning, "rigtig");
  assert.equal(u.get(1)[FOSSIL].retning, "forkert");
});

test("udvikling: en ændring under en procent er stort set uændret", () => {
  const { kommuner, h } = femKommuner([80.4, 64, 72, 84, 48]);
  const u = beregnUdvikling(kommuner, land, h);
  assert.equal(u.get(1)[FOSSIL].retning, "stagneret");
});

test("udvikling: en andel, der flytter sig under et procentpoint, er uændret", () => {
  // 80 % til 79,5 % er 0,6 % relativt og 0,5 procentpoint: uændret på begge regnskaber.
  // 20 % til 19,4 % er 3 % relativt, men 0,6 procentpoint: uændret, når niveauet er over 10.
  const { kommuner, h } = femKommuner([79.5, 64, 72, 84, 48]);
  assert.equal(beregnUdvikling(kommuner, land, h).get(1)[FOSSIL].retning, "stagneret");
  const lav = femKommuner([19.4, 64, 72, 84, 48]);
  lav.h.kommuner[1].biler_benzin = trin(100, 97);
  lav.h.kommuner[1].biler_diesel = trin(100, 97);
  const u = beregnUdvikling(lav.kommuner, land, lav.h).get(1)[FOSSIL];
  assert.equal(u.retning, "stagneret", "0,6 procentpoint ved et niveau over 10 % er uændret");
});

test("udvikling: en lav andel, der flytter sig et procentpoint, er en ændring", () => {
  // 5 % til 4 %: én procentpoint, men niveauet er under 10, så den relative ændring på
  // -20 % er det, der tæller.
  const { kommuner, h } = femKommuner();
  h.kommuner[1].biler_benzin = trin(25, 20);
  h.kommuner[1].biler_diesel = trin(25, 20);
  h.kommuner[1].biler = trin(1000, 1000);
  const u = beregnUdvikling(kommuner, land, h).get(1)[FOSSIL];
  assert.notEqual(u.retning, "stagneret");
});

test("udvikling: en serie, der starter i nul, har en retning, men ingen procent", () => {
  // Kommune 4's fossilandel går fra 0 til 84 %. Den relative ændring fra nul er ikke
  // defineret, men retningen er: en stigning i en andel, der ønskes ned, er forkert. Før stod
  // nøgletallet som "ingen tidsserie", mens grafen lå lige ved siden af.
  const { kommuner, h } = femKommuner();
  h.kommuner[4].biler_benzin = trin(0, 420);
  h.kommuner[4].biler_diesel = trin(0, 420);
  const u = beregnUdvikling(kommuner, land, h);
  const fra = u.get(4)[FOSSIL];
  assert.equal(fra.retning, "forkert");
  assert.equal(fra.pct, null);
  assert.equal(fra.op, true);
  assert.ok(fra.serie && fra.n >= 2);
  // Den uendelige ændring sætter ikke medianen. De fire andre går -30, -20, -10 og -40 %,
  // og medianen er -25, så kommune 2 (-20) er langsom. Talt med som en stigning ville
  // medianen være -20, og kommune 2 var rigtig.
  assert.equal(u.get(1)[FOSSIL].retning, "rigtig");
  assert.equal(u.get(2)[FOSSIL].retning, "tempo");
  assert.equal(u.get(3)[FOSSIL].retning, "tempo");
  assert.equal(u.get(5)[FOSSIL].retning, "rigtig");
});

test("udvikling: en serie, der falder til nul, har en defineret ændring på -100 %", () => {
  const { kommuner, h } = femKommuner();
  h.kommuner[4].biler_benzin = trin(400, 0);
  h.kommuner[4].biler_diesel = trin(400, 0);
  const fra = beregnUdvikling(kommuner, land, h).get(4)[FOSSIL];
  assert.ok(Math.abs(fra.pct + 100) < 1e-9);
  assert.equal(fra.retning, "rigtig");
});

test("udvikling: en serie, der står i nul i begge ender, er uændret og ikke uden tidsserie", () => {
  const { kommuner, h } = femKommuner();
  h.kommuner[4].biler_benzin = trin(0, 0);
  h.kommuner[4].biler_diesel = trin(0, 0);
  const u = beregnUdvikling(kommuner, land, h).get(4)[FOSSIL];
  assert.equal(u.retning, "stagneret");
  assert.ok(u.serie && u.n >= 2);
});

test("udvikling: et nøgletal uden retning har en pil, men ingen vurdering", () => {
  const { kommuner, h } = femKommuner();
  // Befolkningsudvikling er uafklaret. Den har felter i historikken, men en vækstrate.
  h.felter.folketal = { periode: "2026K1", aar: 2026 };
  h.felter.folketal_forrige = { periode: "2025K1", aar: 2025 };
  kommuner.forEach((k, i) => {
    h.kommuner[k.kode].folketal = trin(1000, 1020);
    h.kommuner[k.kode].folketal_forrige = trin(1000, 1000);
  });
  h.land.folketal = trin(1000, 1010);
  h.land.folketal_forrige = trin(1000, 1000);
  const u = beregnUdvikling(kommuner, land, h).get(1)["Befolkningsudvikling"];
  assert.equal(u.retning, "kontekst");
  assert.equal(u.op, true);
});

test("udvikling: uden serie er retningen ingen, og der er ingen serie at tegne", () => {
  const { kommuner, h } = femKommuner();
  delete h.kommuner[3];
  const u = beregnUdvikling(kommuner, land, h).get(3);
  assert.equal(u[FOSSIL].retning, "ingen");
  assert.equal(u[FOSSIL].n, 0);
  for (const d of DRIVERE.filter((x) => x.navn !== FOSSIL)) {
    assert.equal(u[d.navn].retning, "ingen", `${d.navn} har ingen felter i historikken`);
  }
});

test("udvikling: uden historik er der ingenting at regne", () => {
  assert.equal(beregnUdvikling([mk(1)], land, null), null);
  assert.equal(beregnUdvikling([mk(1)], land, {}), null);
});

test("udvikling: alle retninger er en af de kendte", () => {
  const { kommuner, h } = femKommuner();
  for (const pr of beregnUdvikling(kommuner, land, h).values()) {
    for (const u of Object.values(pr)) assert.ok(UDVIKLING_RETNINGER.includes(u.retning), u.retning);
  }
});

// ---------- Forbehold ----------

test("udvikling: en kommune, hvis nøgletal er spærret, står uden vurdering", () => {
  const { kommuner, h } = femKommuner();
  // Færgeforbeholdet spærrer retningen på indkøbsnøgletallene.
  const faerge = mk(1, { indkoeb_forbehold: "faergedrift" });
  const felter = {
    indkoeb_drift_pr_indb: { land: trin(17000, 17054) },
  };
  for (const k of [faerge, ...kommuner.slice(1)]) felter.indkoeb_drift_pr_indb[k.kode] = trin(15000, 20000);
  const hh = historik(felter, { priser: { kilde: "PRIS8", aar: Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [2014 + i, 100])) } });
  const u = beregnUdvikling([faerge, ...kommuner.slice(1)], land, hh);
  const d = "Kommunens driftsindkøb";
  assert.equal(u.get(1)[d].retning, "kontekst", "retningen er holdt tilbage");
  assert.ok(u.get(1)[d].serie, "men tallene står, og grafen kan tegnes");
  assert.equal(u.get(2)[d].retning, "forkert", "de øvrige får deres vurdering");
});

test("udvikling: spærrede og skjulte kommuner sætter ikke målestokken for de andre", () => {
  // Tre kommuner falder 10, 20 og 30 %. To spærrede kommuner falder 80 %. Er de med, er
  // medianen -30 og kommune med -10 er "langsomt". Uden dem er medianen -20.
  const rene = [mk(1), mk(2), mk(3)];
  const spaerrede = [mk(4, { indkoeb_forbehold: "faergedrift" }), mk(5, { indkoeb_forbehold: "faergedrift" })];
  const alle = [...rene, ...spaerrede];
  const felt = { land: trin(1000, 1000) };
  const slut = [900, 800, 700, 200, 200];
  alle.forEach((k, i) => { felt[k.kode] = trin(1000, slut[i]); });
  const priser = { kilde: "PRIS8", aar: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [2014 + i, 1])) };
  const u = beregnUdvikling(alle, land, historik({ indkoeb_drift_pr_indb: felt }, { priser }));
  const d = "Kommunens driftsindkøb";
  // Driftsindkøb ønskes ned. -10 % er +10 mod målet; medianen af de rene er +20.
  assert.equal(u.get(1)[d].retning, "tempo");
  assert.equal(u.get(2)[d].retning, "rigtig");
});

test("udvikling: et nøgletal, der er taget af siden, har ingen række at sætte pilen på", () => {
  const skjult = mk(1, { affald_indberetning: "bekraeftet_fejl" });
  const felter = { affald_kg: { 1: trin(500, 400), land: trin(543, 543) } };
  const u = beregnUdvikling([skjult, mk(2)], land, historik(felter));
  const b = beregnKommune(skjult, land, u.get(1));
  assert.ok(!b.drivere.some((d) => d.navn === "Husholdningsaffald"), "taget af siden");
  assert.ok(b.udeladt.some((d) => d.navn === "Husholdningsaffald"));
});

// ---------- På kommunens side ----------

test("beregnKommune: uden udvikling står rækkerne som før", () => {
  const b = beregnKommune(thisted, land);
  assert.ok(b.drivere.every((d) => !("udvikling" in d)));
});

test("beregnKommune: med udvikling får hver række sin, eller null", () => {
  const { kommuner, h } = femKommuner();
  const u = beregnUdvikling(kommuner, land, h);
  const b = beregnKommune(kommuner[0], land, u.get(1));
  assert.ok(b.drivere.every((d) => "udvikling" in d));
  assert.equal(b.drivere.find((d) => d.navn === FOSSIL).udvikling.retning, "rigtig");
  const uden = beregnKommune(kommuner[0], land, null);
  assert.ok(uden.drivere.every((d) => d.udvikling === null));
});

test("samletUdvikling: tæller, vejer ikke, og hjælpetal tæller ikke med", () => {
  const raekker = [
    { rolle: "hoved", udvikling: { retning: "rigtig" } },
    { rolle: "hoved", udvikling: { retning: "tempo" } },
    { rolle: "hoved", udvikling: { retning: "forkert" } },
    { rolle: "hoved", udvikling: { retning: "stagneret" } },
    { rolle: "hoved", udvikling: { retning: "kontekst" } },
    { rolle: "hoved", udvikling: { retning: "ingen" } },
    { rolle: "hoved", udvikling: null },
    { rolle: "hjaelper", udvikling: { retning: "forkert" } },
  ];
  assert.deepEqual(samletUdvikling(raekker), {
    rigtig: 2, langsomt: 1, forkert: 1, uaendret: 1, udenVurdering: 1, udenTidsserie: 2, talte: 7,
  });
});

test("beregnUdviklingFordeling: hvert nøgletal for sig, ingen kommune navngivet", () => {
  const { kommuner, h } = femKommuner();
  const f = beregnUdviklingFordeling(kommuner, land, h);
  assert.equal(f.length, DRIVERE.length);
  const fossil = f.find((x) => x.navn === FOSSIL);
  assert.equal(fossil.rigtig + fossil.tempo + fossil.forkert + fossil.stagneret + fossil.kontekst
    + fossil.ingen + fossil.skjult, 5, "hver kommune er talt én gang");
  assert.equal(fossil.rigtig, 3);
  assert.equal(fossil.tempo, 1);
  assert.equal(fossil.forkert, 1);
  assert.deepEqual([fossil.aarFra, fossil.aarTil], [2014, 2024]);
  assert.ok(Math.abs(fossil.median + 20) < 1e-9);
  assert.ok(!JSON.stringify(f).includes("K1"), "ingen kommune er navngivet");
});

test("driverTabel og serie giver samme tal for det seneste år", () => {
  // Historikkens seneste punkt er det, siden viser. Her med en fixtur; den samme kontrol
  // køres mod hele det committede datasæt i historik.test.js.
  const kommune = mk(1);
  const fossil = driverTabel(kommune, land).find((d) => d.navn === FOSSIL);
  const h = historik({
    biler: { 1: raekke(kommune.biler), land: raekke(land.biler) },
    biler_benzin: { 1: raekke(kommune.biler_benzin), land: raekke(land.biler_benzin) },
    biler_diesel: { 1: raekke(kommune.biler_diesel), land: raekke(land.biler_diesel) },
  });
  const s = driverSerie(drv(FOSSIL), h, 1);
  assert.equal(s.kommune.at(-1), fossil.kommuneVaerdi);
  assert.equal(s.land.at(-1), fossil.landVaerdi);
});
