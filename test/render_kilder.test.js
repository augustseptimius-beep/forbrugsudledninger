import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderKilder, renderReferencer } from "../web/render.js";

const sources = JSON.parse(readFileSync(new URL("../web/data/sources.json", import.meta.url)));

test("kilder: hver kilde får en række med id, udbyder og periode", () => {
  const h = renderKilder(sources);
  for (const k of sources.kilder) {
    assert.ok(h.includes(k.id), `mangler ${k.id}`);
    assert.ok(h.includes(k.udbyder), `mangler udbyder for ${k.id}`);
  }
  assert.ok(h.includes("2026K1"), "perioden skal komme fra sources.json");
});

test("kilder: hver kilde bærer sin hentemetode", () => {
  const h = renderKilder(sources);
  const maerkater = h.match(/>(API|Manuel)</g) || [];
  assert.equal(maerkater.length, sources.kilder.length);
});

test("kilder: hver kilde linker til sit ophav", () => {
  const h = renderKilder(sources);
  for (const k of sources.kilder) {
    if (!k.url) continue;
    assert.ok(h.includes(k.url), `${k.id} mangler link`);
  }
});

test("kilder: forbehold vises som egen tooltip, ikke som browser-title", () => {
  // Teksten ligger i data-tip; selve boksen tegnes af tooltip.js i body, så
  // den ikke klippes af tabellens overflow.
  const h = renderKilder(sources);
  assert.ok(h.includes("data-tip="));
  assert.ok(h.includes("aria-label="), "teksten skal også nå skærmlæsere");
  assert.ok(!/\stitle="/.test(h), "browserens title har 0,5-1 sek forsinkelse");
});

test("referencer: begge rapporter med sidehenvisninger", () => {
  const h = renderReferencer(sources);
  assert.ok(h.includes("CONCITO"));
  assert.ok(h.includes("NIRAS"));
  for (const r of sources.referencer) {
    assert.ok(h.includes(r.url), `${r.id} mangler link`);
    assert.ok(h.includes(r.sider.slice(0, 20)), `${r.id} mangler sidehenvisninger`);
  }
});

test("referencer: der er ingen antagelser tilbage at vise", () => {
  // Værktøjet indeholder ingen koefficienter, så sources.json må ikke have
  // en antagelses-liste. Dukker den op igen, er princippet brudt.
  assert.ok(!("antagelser" in sources));
});

test("kilder: hvert felt i data.json har præcis én kilde", () => {
  const felter = sources.kilder.flatMap((k) => k.felter);
  assert.equal(new Set(felter).size, felter.length, "et felt har to kilder");
});
