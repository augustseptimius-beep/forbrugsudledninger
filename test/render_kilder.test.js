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

test("kilder: manuelle kilder er mærket som sådan", () => {
  const h = renderKilder(sources);
  assert.ok(h.toLowerCase().includes("manuel"), "en manuel kilde skal kunne skelnes fra en API-kilde");
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
