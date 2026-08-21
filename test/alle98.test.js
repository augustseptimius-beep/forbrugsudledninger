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
  let uoplyste = 0;
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land, data.konstanter);
    if (!b.estimat.uoplyst?.includes("transport")) continue;
    uoplyste++;
    const html = renderKommune(b, data.konstanter);
    const raekke = html.split('data-komponent="transport"')[1].split("</li>")[0];
    assert.ok(raekke.toLowerCase().includes("ikke opgjort"), `${k.navn}: transport uden markering`);
    assert.ok(!raekke.includes("ton"), `${k.navn}: uoplyst transport har fået et tal`);
  }
  // Kun Nordjylland har et DTU-tal, så langt de fleste kommuner skal ramme her.
  assert.ok(uoplyste > 70, `forventede mange uoplyste, fandt ${uoplyste}`);
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
