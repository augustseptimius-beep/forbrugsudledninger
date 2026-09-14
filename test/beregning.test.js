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
  for (const f of ["affald_kg", "genanvendelse_pct", "elco2_g_kwh", "ve_daekning_pct"]) {
    assert.ok(r.manglende.includes(f), `${f} skulle være markeret som manglende`);
  }
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
  for (const navn of ["Befolkningsudvikling", "Fritidshuse pr. helårsbolig",
                      "Lokal VE-dækning af elforbrug"]) {
    assert.ok(find(r.drivere, navn), navn);
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

test("udledningsSignal: små udsving peger ingen vej", () => {
  assert.equal(udledningsSignal(0.05, "hoejere"), "på niveau");
  assert.equal(udledningsSignal(-0.09, "lavere"), "på niveau");
});

test("udledningsSignal: uafklaret påvirkning gættes aldrig", () => {
  // Lokal VE-dækning er eksemplet: et produktionsmål, hvis grønne strøm
  // allerede indgår i det fælles mix, så retningen kan ikke begrundes.
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
