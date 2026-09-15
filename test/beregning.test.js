import { test } from "node:test";
import assert from "node:assert/strict";
import { afvigelse, byggeriPr1000, driverTabel, driverePrKategori, beregnKommune,
         niveauBaand, udledningsSignal, optaelSignaler, KATEGORI }
  from "../web/beregning.js";
import { land, thisted, greve } from "./fixtures.js";

const naer = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);
const find = (t, navn) => t.find((d) => d.navn === navn);

// --- afvigelse ---

test("afvigelse: fortegn følger retningen", () => {
  naer(afvigelse(90, 100), -0.1);
  naer(afvigelse(110, 100), 0.1);
  assert.equal(afvigelse(100, 100), 0);
});

test("afvigelse: manglende input giver null, ikke nul", () => {
  assert.equal(afvigelse(null, 100), null);
  assert.equal(afvigelse(100, null), null);
  assert.equal(afvigelse(100, 0), null, "division med nul må ikke give Infinity");
});

// --- byggeriPr1000 ---

test("byggeriPr1000: normaliserer mod folketal", () => {
  naer(byggeriPr1000({ byggeri: 103, folketal: 42572 }), 2.41945);
});

test("byggeriPr1000: manglende input giver null", () => {
  assert.equal(byggeriPr1000({ byggeri: null, folketal: 100 }), null);
  assert.equal(byggeriPr1000({ byggeri: 10, folketal: 0 }), null);
});

// --- driverTabel ---

test("driverTabel: befolkningsudvikling bruger DIFFERENCE, ikke relativ", () => {
  // To vækstrater er allerede procenter; en relativ afvigelse mellem dem
  // ville være procent af procent og dermed meningsløs.
  const d = find(driverTabel(thisted, land), "Befolkningsudvikling");
  assert.equal(d.type, "difference");
  naer(d.afvigelse, d.kommuneVaerdi - d.landVaerdi);
});

test("driverTabel: befolkningsudvikling er hjælpetal under Bolig og byggeri", () => {
  // Tallene er pr. borger, så væksten peger ikke selv nogen vej. Den står for at
  // forklare byggeaktiviteten: over alle 98 kommuner følger de to hinanden
  // (r = +0,60), ligesom fritidshuse forklarer husholdningstallene.
  const d = find(driverTabel(thisted, land), "Befolkningsudvikling");
  assert.equal(d.kategori, KATEGORI.BOLIG_BYGGERI);
  assert.equal(d.rolle, "hjaelper");
  assert.equal(d.signal, "uafklaret");
});

test("driverTabel: hver indikator hører til en kendt kategori", () => {
  const gyldige = new Set(Object.values(KATEGORI));
  for (const d of driverTabel(thisted, land)) {
    assert.ok(gyldige.has(d.kategori), `${d.navn} har ukendt kategori ${d.kategori}`);
  }
});

test("driverTabel: pendlingsafstand vises i km uden omregning", () => {
  const d = find(driverTabel(thisted, land), "Gennemsnitlig pendlingsafstand");
  assert.equal(d.enhed, "km");
  assert.equal(d.kommuneVaerdi, thisted.pendlingsafstand_km);
  assert.equal(d.kategori, KATEGORI.TRANSPORT);
});

// --- gruppering ---

test("driverePrKategori: transport står først", () => {
  const g = driverePrKategori(driverTabel(thisted, land));
  assert.equal(g[0].kategori, KATEGORI.TRANSPORT,
    "transport er CONCITO's største kategori og skal læses først");
});

test("driverePrKategori: hver indikator optræder præcis én gang", () => {
  const drivere = driverTabel(thisted, land);
  const grupperet = driverePrKategori(drivere).flatMap((g) => g.drivere);
  assert.equal(grupperet.length, drivere.length);
  assert.equal(new Set(grupperet.map((d) => d.navn)).size, drivere.length);
});

test("driverePrKategori: tomme kategorier udelades", () => {
  const g = driverePrKategori([{ navn: "x", kategori: KATEGORI.TRANSPORT }]);
  assert.equal(g.length, 1);
});

// --- beregnKommune ---

test("beregnKommune: bærer navn, kode og region videre", () => {
  const r = beregnKommune(thisted, land);
  assert.equal(r.navn, "Thisted");
  assert.equal(r.kode, 787);
  assert.equal(r.region, "Nordjylland");
});

test("beregnKommune: lister manglende felter", () => {
  const r = beregnKommune(greve, land);
  for (const f of ["affald_kg", "genanvendelse_pct"]) {
    assert.ok(r.manglende.includes(f), `${f} skulle være markeret som manglende`);
  }
});

// --- Husholdningernes energi: strøm er fælles, fjernvarme er lokal ---

const medEnergi = (m, felter) => ({
  ...m, fritidshuse: 0, husholdning_energi_tj: 1000, husholdning_fossil_andel: 0.1, ...felter,
});
const landEnergi = medEnergi(land, {
  husholdning_co2_ton: 3000000, husholdning_el_tj: 30000, husholdning_el_co2_ton: 900000,
  husholdning_fjernvarme_tj: 70000, husholdning_fjernvarme_co2_ton: 1500000,
});
const vaerdi = (k, navn) => {
  const d = driverTabel(k, landEnergi).find((x) => x.navn === navn);
  assert.ok(d, `${navn} skal være et nøgletal`);
  return d;
};

test("husholdningernes CO2: strømmen regnes med landets fælles faktor, ikke kommunens egen", () => {
  // Klimaregnskabet giver hver kommune sin egen el-faktor ud fra den el, der
  // produceres i kommunen. Strøm deles på det fælles net, så en vindmølle gør
  // ikke kommunens eget forbrug renere. To kommuner med samme elforbrug og samme
  // øvrige udledning skal derfor stå ens, uanset hvor ren deres lokale el er.
  const vind = medEnergi(thisted, { husholdning_el_tj: 100, husholdning_co2_ton: 5000,
    husholdning_el_co2_ton: 0 });
  const kul = medEnergi(thisted, { husholdning_el_tj: 100, husholdning_co2_ton: 8000,
    husholdning_el_co2_ton: 3000 });
  const navn = "Husholdningernes CO2 fra energi";
  naer(vaerdi(vind, navn).kommuneVaerdi, vaerdi(kul, navn).kommuneVaerdi);
});

test("husholdningernes CO2: landstallet er det samme med den fælles el-faktor", () => {
  // Faktoren er landets egen el-udledning delt med landets elforbrug, så den
  // flytter udledning mellem kommuner uden at ændre summen.
  const boliger = land.boliger_parcel + land.boliger_raekke + land.boliger_etage;
  naer(vaerdi(thisted, "Husholdningernes CO2 fra energi").landVaerdi,
    landEnergi.husholdning_co2_ton / boliger);
});

test("fjernvarmens CO2 pr. kWh: tons pr. TJ regnes om til gram pr. kWh", () => {
  // 1 TJ er 277.778 kWh, så 1 ton pr. TJ er 3,6 g pr. kWh.
  const k = medEnergi(thisted, { husholdning_fjernvarme_tj: 1, husholdning_fjernvarme_co2_ton: 1 });
  const d = vaerdi(k, "Fjernvarmens CO2 pr. kWh");
  naer(d.kommuneVaerdi, 3.6);
  assert.equal(d.kategori, KATEGORI.ENERGI);
  assert.equal(d.rolle, "hoved");
  assert.equal(d.paavirkning, "hoejere");
});

test("fjernvarmens CO2 pr. kWh: uden fjernvarme står der en streg, ikke nul", () => {
  const k = medEnergi(thisted, { husholdning_fjernvarme_tj: 0, husholdning_fjernvarme_co2_ton: 0 });
  const d = vaerdi(k, "Fjernvarmens CO2 pr. kWh");
  assert.equal(d.kommuneVaerdi, null);
  assert.equal(d.signal, "ukendt");
});

test("el-CO2 pr. kWh og lokal VE-dækning er ikke nøgletal", () => {
  // Uden Energinets lokale VE-kredit viste el-CO2 kun prisområdet (DK1 64-69,
  // DK2 41-43 g/kWh), og VE-dækningen måler produktion, ikke forbrug.
  const navne = driverTabel(thisted, land).map((d) => d.navn);
  assert.ok(!navne.includes("El-CO2 pr. kWh"));
  assert.ok(!navne.includes("Lokal VE-dækning af elforbrug"));
});

test("beregnKommune: intet felt i modellen hedder aftryk eller estimat", () => {
  // Værktøjet beregner ikke et kommunalt aftryk. Dukker feltet op igen, er
  // der sneget en ukildebelagt koefficient ind.
  const r = beregnKommune(thisted, land);
  assert.ok(!("estimat" in r));
  assert.ok(!("aftryk" in r));
});

// --- Nøgletal, hvis retning ikke kan afgøres for kommunen ---

const AFFALD = ["Husholdningsaffald", "Genanvendelsesprocent"];

test("beregnKommune: et nøgletal, hvis retning ikke kan afgøres for kommunen, vises ikke", () => {
  const r = beregnKommune({ ...thisted, affald_indberetning: "bekraeftet_fejl" }, land);
  const igrupper = r.grupper.flatMap((g) => g.drivere).map((d) => d.navn);
  for (const navn of AFFALD) {
    assert.ok(!find(r.drivere, navn), `${navn} står stadig blandt nøgletallene`);
    assert.ok(!igrupper.includes(navn), `${navn} står stadig i en kategori`);
    assert.ok(r.udeladt.some((u) => u.navn === navn), `${navn} skal stå som udeladt`);
  }
});

test("beregnKommune: et udeladt nøgletal bærer forbeholdets begrundelse", () => {
  const r = beregnKommune({ ...thisted, affald_indberetning: "bekraeftet_fejl" }, land);
  const u = r.udeladt.find((x) => x.navn === "Husholdningsaffald");
  assert.match(u.note, /deler affaldsindberetning/);
});

test("beregnKommune: reglen følger kommunen - uden forbehold står nøgletallet", () => {
  const r = beregnKommune({ ...thisted, affald_indberetning: null }, land);
  for (const navn of AFFALD) assert.ok(find(r.drivere, navn), navn);
  assert.deepEqual(r.udeladt, []);
});

test("beregnKommune: hjælpetal bliver stående, selv om de ingen retning har", () => {
  // De står for at forklare et andet nøgletal og har aldrig en retning. Ramte
  // reglen dem, forsvandt de fra alle 98 kommunesider.
  const r = beregnKommune(thisted, land);
  for (const navn of ["Befolkningsudvikling", "Fritidshuse pr. helårsbolig"]) {
    assert.ok(find(r.drivere, navn), navn);
  }
});

test("beregnKommune: et spærrende forbehold tager også et hjælpetal af siden", () => {
  // Affaldstallene er hjælpetal, men hos kommuner, der deler affaldsindberetning,
  // er tallene selv forkerte. Hjælpetal er undtaget, fordi de af natur ingen
  // retning har - ikke når et forbehold har spærret den.
  const r = beregnKommune({ ...thisted, affald_indberetning: "bekraeftet_fejl" }, land);
  for (const navn of AFFALD) {
    assert.equal(find(beregnKommune(thisted, land).drivere, navn).rolle, "hjaelper", navn);
    assert.ok(!find(r.drivere, navn), `${navn} står stadig på siden`);
    assert.ok(r.udeladt.some((u) => u.navn === navn), navn);
  }
});

test("beregnKommune: manglende data er ikke det samme som en retning, der ikke kan afgøres", () => {
  // Greve mangler affaldstallene i fixturen. De skal stå med tankestreg, ikke
  // forsvinde.
  const r = beregnKommune(greve, land);
  assert.equal(find(r.drivere, "Husholdningsaffald").signal, "ukendt");
  assert.ok(!r.udeladt.some((u) => u.navn === "Husholdningsaffald"));
});

// --- Signal og optælling ---

test("niveauBaand: beskriver størrelse uden at vurdere", () => {
  assert.equal(niveauBaand(0.05), "på niveau");
  assert.equal(niveauBaand(-0.05), "på niveau");
  assert.equal(niveauBaand(0.20), "over");
  assert.equal(niveauBaand(-0.20), "under");
  assert.equal(niveauBaand(0.50), "markant over");
  assert.equal(niveauBaand(-0.50), "markant under");
  assert.equal(niveauBaand(null), "ukendt");
});

test("udledningsSignal: retningen afhænger af nøgletallets påvirkning", () => {
  // Flere biler end landet peger mod højere udledning.
  assert.equal(udledningsSignal(0.5, "hoejere"), "markant højere");
  // Færre elbiler end landet peger også mod højere - modsat fortegn, samme svar.
  assert.equal(udledningsSignal(-0.5, "lavere"), "markant højere");
  assert.equal(udledningsSignal(0.5, "lavere"), "markant lavere");
  assert.equal(udledningsSignal(-0.5, "hoejere"), "markant lavere");
});

test("udledningsSignal: små udsving peger lidt - retningen står stadig", () => {
  // Under 10 % er der stadig en retning, og enhver kan se, om tallet ligger over
  // eller under landet. Mærkatet siger derfor "lidt" frem for ingenting.
  assert.equal(udledningsSignal(0.05, "hoejere"), "lidt højere");
  assert.equal(udledningsSignal(-0.02, "hoejere"), "lidt lavere");
  assert.equal(udledningsSignal(-0.09, "lavere"), "lidt højere");
});

test("udledningsSignal: kun en afvigelse, der vises som 0,0 %, peger ingen vej", () => {
  assert.equal(udledningsSignal(0, "hoejere"), "på niveau");
  assert.equal(udledningsSignal(0.0004, "hoejere"), "på niveau");
  assert.equal(udledningsSignal(-0.0006, "hoejere"), "lidt lavere");
});

test("udledningsSignal: uafklaret påvirkning gættes aldrig", () => {
  // Befolkningsudviklingen er eksemplet: tallene er pr. borger, så væksten
  // peger ikke selv nogen vej.
  assert.equal(udledningsSignal(0.9, "uafklaret"), "uafklaret");
  assert.equal(udledningsSignal(0.9, undefined), "uafklaret");
  assert.equal(udledningsSignal(null, "hoejere"), "ukendt");
});

test("optaelSignaler: summerne kolliderer ikke med optællingen", () => {
  // Tidligere hed både optællingen af 'lavere' og summen af de to lavere
  // signaler det samme, så summen overskrev optællingen og kategorien viste
  // nøgletal, der ikke fandtes.
  const drivere = [
    { signal: "markant lavere", rolle: "hoved" },
    { signal: "markant lavere", rolle: "hoved" },
    { signal: "højere", rolle: "hoved" },
  ];
  const t = optaelSignaler(drivere);
  assert.equal(t.pr_signal["lavere"], 0, "der er ingen almindeligt 'lavere'");
  assert.equal(t.pr_signal["markant lavere"], 2);
  assert.equal(t.sumLavere, 2);
});

test("optaelSignaler: optællingen summerer til antallet af nøgletal", () => {
  const b = beregnKommune(thisted, land);
  for (const g of b.grupper) {
    const t = optaelSignaler(g.drivere);
    const uden = g.drivere.filter((d) => d.rolle !== "hjaelper").length;
    const sum = Object.values(t.pr_signal).reduce((a, x) => a + x, 0);
    assert.equal(sum, uden, `${g.kategori}: ${sum} talt, ${uden} nøgletal`);
  }
});

test("optaelSignaler: hjælpetal tælles ikke med", () => {
  const t = optaelSignaler([
    { signal: "højere", rolle: "hoved" },
    { signal: "markant højere", rolle: "hjaelper" },
  ]);
  assert.equal(t.ialt, 1);
});
