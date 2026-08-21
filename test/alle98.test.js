import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune } from "../web/beregning.js";
import { renderKommune } from "../web/render.js";

// Kører mod det ægte datasæt, ikke mod fixtures. Fanger felter, der findes
// for én kommune, men mangler for en anden.
const data = JSON.parse(readFileSync(new URL("../web/data/data.json", import.meta.url)));
const concito = JSON.parse(readFileSync(new URL("../web/data/concito.json", import.meta.url)));

test("datasættet indeholder alle 98 kommuner", () => {
  assert.equal(data.kommuner.length, 98);
});

test("datasættet indeholder ingen beregningskoefficienter", () => {
  // Der er ingen model at parametrisere længere.
  assert.ok(!("konstanter" in data));
});

test("alle 98 kommuner kan renderes uden at kaste", () => {
  for (const k of data.kommuner) {
    const html = renderKommune(beregnKommune(k, data.land), concito);
    assert.ok(html.length > 2000, `${k.navn}: mistænkeligt kort output`);
  }
});

test("intet kommuneoutput lækker undefined, NaN eller null", () => {
  for (const k of data.kommuner) {
    const html = renderKommune(beregnKommune(k, data.land), concito);
    assert.ok(!html.includes("undefined"), `${k.navn}: undefined i output`);
    assert.ok(!html.includes("NaN"), `${k.navn}: NaN i output`);
    assert.ok(!/>\s*null\s*</.test(html), `${k.navn}: null i output`);
  }
});

test("alle kommuner har pendlingsafstand i km", () => {
  const uden = data.kommuner.filter((k) => k.pendlingsafstand_km == null);
  assert.deepEqual(uden.map((k) => k.navn), []);
});

test("el-CO2 og VE-dækning følges ad", () => {
  for (const k of data.kommuner) {
    const harEl = k.elco2_g_kwh != null;
    const harVe = k.ve_daekning_pct != null;
    assert.equal(harEl, harVe, `${k.navn}: kun det ene felt er udfyldt`);
  }
});

test("høj lokal VE-dækning giver lav el-CO2", () => {
  // Kernemekanismen i Energinets lokationsbaserede metode.
  const k = data.kommuner.filter((x) => x.elco2_g_kwh != null && x.ve_daekning_pct != null);
  if (k.length < 10) return;
  const halv = Math.floor(k.length / 2);
  const efterVE = [...k].sort((a, b) => b.ve_daekning_pct - a.ve_daekning_pct);
  const gns = (l) => l.reduce((s, x) => s + x.elco2_g_kwh, 0) / l.length;
  assert.ok(gns(efterVE.slice(0, halv)) < gns(efterVE.slice(-halv)));
});

test("hver kommunes nøgletal er grupperet under en kategori", () => {
  for (const k of data.kommuner.slice(0, 5)) {
    const b = beregnKommune(k, data.land);
    const igrupper = b.grupper.flatMap((g) => g.drivere).length;
    assert.equal(igrupper, b.drivere.length, `${k.navn}: nøgletal faldt ud af grupperingen`);
  }
});
