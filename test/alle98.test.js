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

// --- Husholdningernes energi og udledning (Klimaregnskabet.dk) ---

test("husholdningstallene findes for alle 98 kommuner", () => {
  const uden = data.kommuner.filter((k) => k.husholdning_co2_ton == null);
  assert.deepEqual(uden.map((k) => k.navn), []);
});

test("fritidshuse er hentet, så husholdningstallene kan fordeles retvisende", () => {
  const uden = data.kommuner.filter((k) => k.fritidshuse == null);
  assert.deepEqual(uden.map((k) => k.navn), []);
});

test("landets husholdningstal er summen af kommunernes", () => {
  // Ikke et selvstændigt opslag - så tæller og nævner dækker samme område.
  const sum = data.kommuner.reduce((s, k) => s + k.husholdning_co2_ton, 0);
  assert.ok(Math.abs(sum - data.land.husholdning_co2_ton) < 1,
    `${sum} mod ${data.land.husholdning_co2_ton}`);
});

test("husholdningernes CO2 pr. bolig følger IKKE fritidshustætheden", () => {
  // Kernen i hvorfor tallet fordeles på boliger og ikke på indbyggere. Gør
  // det det alligevel, er nævneren forkert igen.
  const r = data.kommuner.map((k) => {
    const helaar = k.boliger_parcel + k.boliger_raekke + k.boliger_etage;
    return {
      fritidsandel: k.fritidshuse / helaar,
      prBolig: k.husholdning_co2_ton / (helaar + k.fritidshuse),
      prIndb: k.husholdning_co2_ton / k.folketal,
    };
  });
  const korr = (xs, ys) => {
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    const t = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const n1 = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
    const n2 = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
    return t / (n1 * n2);
  };
  const f = r.map((x) => x.fritidsandel);
  const prBolig = Math.abs(korr(f, r.map((x) => x.prBolig)));
  const prIndb = Math.abs(korr(f, r.map((x) => x.prIndb)));
  assert.ok(prBolig < prIndb,
    `fordeling på boliger skal svække sommerhus-sammenhængen (${prBolig.toFixed(2)} mod ${prIndb.toFixed(2)})`);
  assert.ok(prBolig < 0.4, `for stærk sammenhæng tilbage: ${prBolig.toFixed(2)}`);
});

test("fossil andel af husholdningernes energi ligger mellem 0 og 1", () => {
  for (const k of data.kommuner) {
    if (k.husholdning_fossil_andel == null) continue;
    assert.ok(k.husholdning_fossil_andel >= 0 && k.husholdning_fossil_andel <= 1,
      `${k.navn}: ${k.husholdning_fossil_andel}`);
  }
});

test("landsværdierne er de beregnede, ikke de håndaflæste sikkerhedsnet", () => {
  // Falder landet tilbage til EL_CO2_MANUAL's 51,8 mens kommunerne bruger de
  // beregnede tal, regnes hver eneste afvigelse mod et forkert gennemsnit.
  assert.notEqual(data.land.elco2_g_kwh, 51.8, "landet bruger stadig sikkerhedsnettet");
  assert.ok(data.land.ve_daekning_pct != null, "landets VE-dækning mangler");
  const vaerdier = data.kommuner.map((k) => k.elco2_g_kwh).filter((v) => v != null);
  assert.ok(data.land.elco2_g_kwh > Math.min(...vaerdier));
  assert.ok(data.land.elco2_g_kwh < Math.max(...vaerdier));
});
