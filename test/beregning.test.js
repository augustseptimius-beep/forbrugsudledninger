import { test } from "node:test";
import assert from "node:assert/strict";
import { afvigelse, byggeriPr1000, driverTabel, driverePrKategori, beregnKommune, KATEGORI }
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

test("driverTabel: Gini er kontekst uden afvigelse", () => {
  const d = find(driverTabel(thisted, land), "Gini-koefficient");
  assert.equal(d.type, "ingen");
  assert.equal(d.afvigelse, null);
  assert.equal(d.retning, "kontekst");
});

test("driverTabel: hver indikator hører til en CONCITO-kategori", () => {
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
