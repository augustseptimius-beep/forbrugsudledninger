import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderKilder, renderAntagelser } from "../web/render.js";

const sources = JSON.parse(readFileSync(new URL("../web/data/sources.json", import.meta.url)));
const data = JSON.parse(readFileSync(new URL("../web/data/data.json", import.meta.url)));

test("kilder: hver kilde får en række med id, udbyder og periode", () => {
  const h = renderKilder(sources);
  for (const k of sources.kilder) {
    assert.ok(h.includes(k.id), `mangler ${k.id}`);
    assert.ok(h.includes(k.udbyder), `mangler udbyder for ${k.id}`);
  }
  assert.ok(h.includes("2026K1"), "perioden skal komme fra sources.json, ikke fra en håndskrevet tekst");
});

test("kilder: hver kilde bærer sin hentemetode", () => {
  // Testede tidligere, at der FANDTES en manuel kilde, og fejlede da den
  // sidste blev automatiseret. Nu testes mekanismen: hver kilde skal vise,
  // hvordan den er hentet, uanset hvilke metoder der er i brug.
  const h = renderKilder(sources);
  const maerkater = h.match(/>(API|Manuel)</g) || [];
  assert.equal(maerkater.length, sources.kilder.length,
    "hver kilde skal have præcis ét hentemetode-mærkat");
  for (const k of sources.kilder) {
    assert.ok(["api", "manuel"].includes(k.metode), `${k.id} har ukendt metode ${k.metode}`);
  }
});

test("kilder: forbehold vises som tooltip, ikke som browser-title", () => {
  const h = renderKilder(sources);
  assert.ok(h.includes("tip-boks"));
  assert.ok(!/\stitle="/.test(h));
});

test("antagelser: viser de faktiske værdier fra konstanterne", () => {
  const h = renderAntagelser(sources, data.konstanter);
  assert.ok(h.includes("10,0"), "ankeret skal vises med sin faktiske værdi");
  assert.ok(h.includes("0,30") && h.includes("0,50"), "elasticitetens spænd skal vises");
  assert.ok(h.includes("45"), "boligudgift-modregningen skal vises");
});

test("antagelser: hver antagelse har en kilde og et forbehold", () => {
  const h = renderAntagelser(sources, data.konstanter);
  for (const a of sources.antagelser) {
    assert.ok(h.includes(a.navn), `mangler ${a.id}`);
  }
  assert.ok(h.includes("DTU"), "transport-proxyens ophav skal fremgå");
});

test("antagelser: intet output lækker undefined eller NaN", () => {
  const h = renderAntagelser(sources, data.konstanter) + renderKilder(sources);
  assert.ok(!h.includes("undefined"));
  assert.ok(!h.includes("NaN"));
});

test("antagelser: hver antagelse har en udfyldt værdi, ikke en tankestreg", () => {
  // En ny antagelse i sources.py uden tilsvarende værdi-opslag i render.js
  // ville stå med streg på metodesiden - synlig kun for den, der kigger.
  const h = renderAntagelser(sources, data.konstanter);
  for (const a of sources.antagelser) {
    const efter = h.split(a.navn)[1] ?? "";
    const vaerdicelle = efter.split("</div>")[0];
    assert.ok(!vaerdicelle.includes("–"),
      `${a.id} mangler en værdi-visning i render.js' vaerdier-opslag`);
  }
});

test("antagelser: transportregionerne fordeles på deres faktiske ophav", () => {
  const h = renderAntagelser(sources, data.konstanter);
  const dtu = h.split("Transportvaneundersøgelsen")[1].split("</div>")[0];
  assert.ok(dtu.includes("Nordjylland"), "DTU skal vise sin egen målte region");
  assert.ok(!dtu.includes("Sjælland"), "DTU har ikke målt Sjælland");
});
