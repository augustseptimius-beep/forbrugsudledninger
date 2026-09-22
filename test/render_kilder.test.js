import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderKilder, renderReferencer, renderForbehold, esc } from "../web/render.js";
import { beregnForbehold } from "../web/beregning.js";

const sources = JSON.parse(readFileSync(new URL("../web/data/sources.json", import.meta.url)));
const data = JSON.parse(readFileSync(new URL("../web/data/data.json", import.meta.url)));

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
    // Enhver reference skal kunne slås op ET BESTEMT sted. For en pagineret
    // rapport er det sidetallet; KL's kilde er en webartikel uden sider og
    // peger på sine afsnit i stedet. Et opfundet "s. 1" ville være værre end
    // ingen henvisning - se test_referencer_er_med_og_har_sidehenvisninger.
    const henvisning = r.sider ?? r.afsnit;
    assert.ok(henvisning, `${r.id} har hverken sider eller afsnit`);
    assert.ok(h.includes(henvisning.slice(0, 20)), `${r.id} mangler henvisning`);
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

// ---------------------------------------------------------------------------
// Forbeholdstabellen på metodesiden.
//
// Den afløste en håndskreven opremsning af de ramte kommuner. Pointen med
// skiftet er, at listen ikke kan komme bagud for data - så testen holder den
// op mod beregnForbehold() og ikke mod en forventet tekst.

test("forbehold: hver gruppe står med sine nøgletal, sine kommuner og sin ordlyd", () => {
  const grupper = beregnForbehold(data.kommuner, data.land);
  assert.ok(grupper.length > 0, "datasættet udløser ingen forbehold at vise");
  const h = renderForbehold(grupper);
  for (const g of grupper) {
    for (const navn of g.noegletal) assert.ok(h.includes(navn), `mangler nøgletallet ${navn}`);
    for (const navn of g.kommuner) assert.ok(h.includes(navn), `mangler kommunen ${navn}`);
    assert.ok(h.includes(esc(g.note)), "forbeholdets ordlyd skal stå, som kommunesiden viser den");
  }
});

test("forbehold: de tre virkninger står hver for sig, så læseren kan se forskel", () => {
  // At blande dem var netop fejlen: færgeforbeholdet var ment som "uden
  // retning", men virkede som "taget af siden". Tabellen skal vise forskellen.
  const h = renderForbehold(beregnForbehold(data.kommuner, data.land));
  assert.ok(h.includes("Nøgletallet tages af kommunens side"));
  assert.ok(h.includes("Nøgletallet står uden retning"));
  assert.ok(h.includes("Nøgletallet står med en bemærkning"));
});

test("forbehold: et datasæt uden forbehold giver en tom, men ærlig tabel", () => {
  assert.ok(renderForbehold([]).includes("ingen forbehold"));
});
