import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune } from "../web/beregning.js";
import { renderKommune } from "../web/render.js";

// Kører mod det ægte datasæt, ikke mod fixtures. Fanger felter, der findes
// for Thisted, men mangler for fx Læsø - præcis den slags, mocked tests ikke
// kan se, og som blev fundet to gange under datapipelinens levende kørsel.
const data = JSON.parse(readFileSync(new URL("../web/data/data.json", import.meta.url)));

test("datasættet indeholder alle 98 kommuner", () => {
  assert.equal(data.kommuner.length, 98);
});

test("alle 98 kommuner kan beregnes og renderes uden at kaste", () => {
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land, data.konstanter);
    const html = renderKommune(b, data.konstanter);
    assert.ok(html.length > 500, `${k.navn}: mistænkeligt kort output`);
  }
});

test("intet kommuneoutput lækker undefined, NaN eller null", () => {
  for (const k of data.kommuner) {
    const html = renderKommune(beregnKommune(k, data.land, data.konstanter), data.konstanter);
    assert.ok(!html.includes("undefined"), `${k.navn}: undefined i output`);
    assert.ok(!html.includes("NaN"), `${k.navn}: NaN i output`);
    assert.ok(!/>\s*null\s*</.test(html), `${k.navn}: null i output`);
  }
});

test("uoplyst transport vises aldrig som et tal", () => {
  // Assertionen gælder MEKANISMEN, ikke hvor mange kommuner der p.t. mangler
  // data. En tidligere version krævede over 70 uoplyste kommuner og brød
  // sammen, da hullet blev lukket - en test, der fejler når verden bliver
  // bedre, tester det forkerte.
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land, data.konstanter);
    if (!b.estimat.uoplyst?.includes("transport")) continue;
    const html = renderKommune(b, data.konstanter);
    const raekke = html.split('data-komponent="transport"')[1].split("</li>")[0];
    assert.ok(raekke.toLowerCase().includes("ikke opgjort"), `${k.navn}: transport uden markering`);
    assert.ok(!raekke.includes("ton"), `${k.navn}: uoplyst transport har fået et tal`);
  }
});

test("hver kommunes region har en bil-km-afvigelse", () => {
  // Fanger, at en region falder ud af konstanterne ved en årlig opdatering,
  // og at transporten dermed stille ville blive uoplyst igen.
  const kendte = Object.keys(data.konstanter.bilkm_afvigelse_region);
  const regioner = [...new Set(data.kommuner.map((k) => k.region))];
  const mangler = regioner.filter((r) => !kendte.includes(r));
  assert.deepEqual(mangler, [], `regioner uden bil-km-afvigelse: ${mangler}`);
});

test("bil-km-afvigelserne er kalibreret til DTU's ankerværdi", () => {
  // Nordjylland er det eneste direkte målte punkt og skal ramme DTU's tal
  // præcist, ellers er kalibreringen skredet.
  const nord = data.konstanter.bilkm_afvigelse_region["Nordjylland"];
  assert.ok(Math.abs(nord - 0.178423236514523) < 1e-9,
    `Nordjylland skal være DTU's værdi eksakt, var ${nord}`);
});

test("kommuner med fuldt kerneinput får et estimat i en troværdig størrelsesorden", () => {
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land, data.konstanter);
    if (b.estimat.utilstraekkeligt) continue;
    const { low, high } = b.estimat.aftryk;
    assert.ok(low <= high, `${k.navn}: interval vendt om`);
    assert.ok(low > 5 && high < 20, `${k.navn}: ${low}-${high} ton ligger uden for det plausible`);
  }
});

// --- El-CO2 og VE-dækning: mekanismen, ikke øjebliksbilledet ---
// Assertionerne herunder er skrevet til at overleve en årlig opdatering.
// De hænger på sammenhænge, der skal gælde uanset hvilket år der hentes,
// ikke på konkrete værdier, der ændrer sig når nettet bliver renere.

const medEl = () => data.kommuner.filter((k) => k.elco2_g_kwh != null && k.ve_daekning_pct != null);

test("el-CO2 følger med VE-dækning for de kommuner, der har begge tal", () => {
  const k = medEl();
  if (k.length < 10) return; // datasæt uden el-data - intet at teste
  assert.equal(k.length, data.kommuner.length,
    "de to felter kommer fra samme kilde og skal være udfyldt samlet");
});

test("el-CO2 kan ikke være negativ", () => {
  // Fortrængningen må aldrig overstige forbruget. Et negativt tal ville
  // betyde, at overskudsproduktion blev krediteret som negativ udledning.
  for (const k of medEl()) {
    assert.ok(k.elco2_g_kwh >= 0, `${k.navn}: ${k.elco2_g_kwh} g/kWh`);
  }
});

test("høj lokal VE-dækning giver lav el-CO2", () => {
  // Kernemekanismen i Energinets lokationsbaserede metode. Vender fortegnet
  // om, er fortrængningen regnet forkert vej.
  const k = medEl();
  if (k.length < 10) return;
  const halvdel = Math.floor(k.length / 2);
  const efterVE = [...k].sort((a, b) => b.ve_daekning_pct - a.ve_daekning_pct);
  const gns = (liste) => liste.reduce((s, x) => s + x.elco2_g_kwh, 0) / liste.length;
  const groenneste = gns(efterVE.slice(0, halvdel));
  const mindstGroenne = gns(efterVE.slice(-halvdel));
  assert.ok(groenneste < mindstGroenne,
    `kommuner med høj VE-dækning skal have lavere el-CO2 (${groenneste.toFixed(1)} vs ${mindstGroenne.toFixed(1)})`);
});

test("landsværdien ligger inden for kommunernes spænd", () => {
  const k = medEl();
  if (k.length < 10 || data.land.elco2_g_kwh == null) return;
  const vaerdier = k.map((x) => x.elco2_g_kwh);
  assert.ok(data.land.elco2_g_kwh >= Math.min(...vaerdier), "landsværdi under alle kommuner");
  assert.ok(data.land.elco2_g_kwh <= Math.max(...vaerdier), "landsværdi over alle kommuner");
});

test("VE-dækning er en procent, ikke en andel", () => {
  // Forveksles 0-100 med 0-1, bliver driverkolonnen forkert med faktor 100.
  const k = medEl();
  if (k.length < 10) return;
  assert.ok(k.some((x) => x.ve_daekning_pct > 1.5),
    "mindst én kommune skal ligge over 1,5 - ellers er tallet en andel, ikke en procent");
  for (const x of k) {
    assert.ok(x.ve_daekning_pct >= 0, `${x.navn}: negativ VE-dækning`);
  }
});
