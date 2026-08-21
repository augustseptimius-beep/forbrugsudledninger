import { test } from "node:test";
import assert from "node:assert/strict";
import { afvigelse, indkomsteffekt, byggeriPr1000, byggeeffekt, transporteffekt, estimat, boligprisFolsomhed, driverTabel, beregnKommune } from "../web/beregning.js";
import { land, thisted, greve, konstanter } from "./fixtures.js";

const naer = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);

test("afvigelse: Thisteds indkomst ligger 12,08 % under land", () => {
  naer(afvigelse(thisted.disp_indkomst, land.disp_indkomst), -0.120786);
});

test("afvigelse: manglende værdi giver null", () => {
  assert.equal(afvigelse(null, 100), null);
  assert.equal(afvigelse(100, null), null);
});

test("indkomsteffekt: Thisted (under land) er negativ, matcher v5", () => {
  const dev = afvigelse(thisted.disp_indkomst, land.disp_indkomst);
  const e = indkomsteffekt(dev, konstanter);
  naer(e.low, -0.3624);   // anker × dev × 0,30
  naer(e.high, -0.6039);  // anker × dev × 0,50
});

test("indkomsteffekt: Greve (over land) er POSITIV — fanger fortegnsfejl", () => {
  const dev = afvigelse(greve.disp_indkomst, land.disp_indkomst);
  const e = indkomsteffekt(dev, konstanter);
  assert.ok(e.low > 0, "en naiv -ABS()-port ville give negativ her");
  naer(e.low, 0.1967);
  naer(e.high, 0.3279);
});

test("byggeriPr1000: Thisted og land", () => {
  naer(byggeriPr1000(land), 4.30928, 1e-3);
  naer(byggeriPr1000(thisted), 2.41943, 1e-3);
});

test("byggeeffekt: Thisted (lav aktivitet) giver reduktion 0 til -0,2 ton (v5)", () => {
  const dev = afvigelse(byggeriPr1000(thisted), byggeriPr1000(land));
  const e = byggeeffekt(dev, konstanter);
  naer(e.low, 0.0);     // byggeandel.low = 0
  naer(e.high, -0.2);   // kalibreret til v5's høje ende
});

test("byggeeffekt: Greve (høj aktivitet) giver TILLÆG — fortegn vender korrekt", () => {
  const dev = afvigelse(byggeriPr1000(greve), byggeriPr1000(land));
  const e = byggeeffekt(dev, konstanter);
  assert.ok(e.high > 0, "byggetung kommune skal give positivt bidrag");
  naer(e.high, 0.5119);
});

test("transporteffekt: Thisted (Nordjylland +17,84 %) matcher v5", () => {
  const e = transporteffekt("Nordjylland", konstanter);
  naer(e.low, 0.2141);
  naer(e.high, 0.2676);
});

test("transporteffekt: ukendt region giver null", () => {
  assert.equal(transporteffekt("Atlantis", konstanter), null);
});

test("estimat: Thisted reproducerer v5 EKSAKT (9,4102–9,9053 ton)", () => {
  const r = estimat(thisted, land, konstanter);
  assert.equal(r.utilstraekkeligt, false);
  naer(r.aftryk.low, 9.4102, 1e-3);
  naer(r.aftryk.high, 9.9053, 1e-3);
});

test("estimat: Greve ligger over ankeret (rigere + bygger mere)", () => {
  const r = estimat(greve, land, konstanter);
  assert.ok(r.aftryk.low > 10, `Greve low ${r.aftryk.low} skal være > 10`);
  assert.ok(r.aftryk.high > 10);
});

test("boligpris: Thisted (billig bolig + lav indkomst) vises, halverer effekten", () => {
  const f = boligprisFolsomhed(thisted, land, konstanter);
  assert.equal(f.vises, true);
  naer(f.justeret.low, -0.1993);
  naer(f.justeret.high, -0.3322);
});

test("boligpris: Greve (dyr bolig + høj indkomst) undertrykkes — ingen falsk symmetri", () => {
  const f = boligprisFolsomhed(greve, land, konstanter);
  assert.equal(f.vises, false);
  // Når følsomheden ikke vises, må der ikke lækkes et vildledende tal til en consumer.
  assert.equal(f.justeret, null);
  assert.equal(f.reeltGab, null);
});

const findDriver = (tabel, navn) => tabel.find((d) => d.navn === navn);

test("driverTabel: parcelhus-andel og diesel-andel matcher v5", () => {
  const t = driverTabel(thisted, land);
  naer(findDriver(t, "Parcelhus-andel").afvigelse, 0.65508, 1e-4);
  naer(findDriver(t, "Diesel-andel").afvigelse, 0.52526, 1e-4);
});

test("driverTabel: befolkningsudvikling bruger DIFFERENCE, ikke relativ", () => {
  const t = driverTabel(thisted, land);
  naer(findDriver(t, "Befolkningsudvikling").afvigelse, -0.0084358, 1e-5);
});

test("driverTabel: manglende driver (Greve affald) giver afvigelse null", () => {
  const t = driverTabel(greve, land);
  assert.equal(findDriver(t, "Husholdningsaffald").afvigelse, null);
});

test("beregnKommune: manglende kerneinput (indkomst) → utilstrækkeligt, intet aftryk", () => {
  const udenIndkomst = { ...thisted, disp_indkomst: null };
  const r = beregnKommune(udenIndkomst, land, konstanter);
  assert.equal(r.estimat.utilstraekkeligt, true);
  assert.equal(r.estimat.aftryk, null);
  assert.ok(r.manglende.includes("disp_indkomst"));
});

test("beregnKommune: manglende enkeltdriver (Greve affald) → estimat beregnes stadig", () => {
  const r = beregnKommune(greve, land, konstanter);
  assert.equal(r.estimat.utilstraekkeligt, false);
  assert.ok(r.manglende.includes("affald_kg"));
});

// --- §6: uoplyste komponenter må ikke degradere til nul ---
// Fixturens konstanter har en neutral 0-stub for Sjælland, som ville skjule
// forskellen mellem "målt til nul" og "ikke opgjort". Produktionen har kun
// Nordjylland, så det er den situation, der skal testes.
const kunNordjylland = {
  ...konstanter,
  bilkm_afvigelse_region: { "Nordjylland": 0.178423236514523 },
};

test("uoplyst: region uden DTU-tal giver null-komponent, ikke nul", () => {
  const r = beregnKommune(greve, land, kunNordjylland);
  assert.equal(r.estimat.komponenter.transporteffekt, null);
  assert.deepEqual(r.estimat.uoplyst, ["transport"]);
});

test("uoplyst: region med DTU-tal giver tom uoplyst-liste", () => {
  const r = beregnKommune(thisted, land, kunNordjylland);
  assert.deepEqual(r.estimat.uoplyst, []);
  assert.ok(r.estimat.komponenter.transporteffekt !== null);
});

test("uoplyst: intervallet er aritmetisk uændret af markeringen", () => {
  const medStub = {
    ...konstanter,
    bilkm_afvigelse_region: { "Nordjylland": 0.178423236514523, "Sjælland": 0 },
  };
  const a = beregnKommune(greve, land, kunNordjylland).estimat.aftryk;
  const b = beregnKommune(greve, land, medStub).estimat.aftryk;
  assert.equal(a.low, b.low);
  assert.equal(a.high, b.high);
});

test("uoplyst: utilstrækkeligt datagrundlag har også feltet", () => {
  const uden = { ...greve, disp_indkomst: null };
  const r = beregnKommune(uden, land, kunNordjylland);
  assert.equal(r.estimat.utilstraekkeligt, true);
  assert.deepEqual(r.estimat.uoplyst, []);
});
