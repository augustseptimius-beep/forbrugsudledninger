import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune } from "../web/beregning.js";
import { renderNationaltAftryk, renderIndikatorer, renderHuller,
         renderKommuneOverskrift, renderKommune } from "../web/render.js";
import { land, thisted, greve } from "./fixtures.js";

const concito = JSON.parse(readFileSync(new URL("../web/data/concito.json", import.meta.url)));
const bThisted = beregnKommune(thisted, land);
const bGreve = beregnKommune(greve, land);

// --- Det nationale grundlag ---

test("nationalt aftryk: viser kildens tal, ikke et beregnet", () => {
  const h = renderNationaltAftryk(concito);
  assert.ok(h.includes("11,0 ton"), "Energistyrelsens tal skal stå der");
  assert.ok(h.includes("2021"), "opgørelsesåret skal fremgå");
});

test("nationalt aftryk: hvert tal har en sidehenvisning", () => {
  const h = renderNationaltAftryk(concito);
  assert.ok(/s\.\s*8/.test(h), "det nationale tal skal henvise til s. 8");
  assert.ok(/s\.\s*16/.test(h), "kategorifordelingen skal henvise til s. 16");
});

test("nationalt aftryk: alle 15 kategorier vises", () => {
  const h = renderNationaltAftryk(concito);
  for (const k of concito.kategorier) {
    assert.ok(h.includes(k.navn), `mangler ${k.navn}`);
  }
});

test("nationalt aftryk: kildens uoverensstemmelser står i outputtet", () => {
  // CONCITO's egne tal summerer ikke. Det skal læseren kunne se.
  const h = renderNationaltAftryk(concito);
  assert.ok(h.includes("12,8"), "afvigelsen mellem kategorisum og nationalt tal skal vises");
});

test("nationalt aftryk: linker til kilden", () => {
  const h = renderNationaltAftryk(concito);
  assert.ok(h.includes("concito.dk"), "der skal være et link til rapporten");
});

// --- Kommunens indikatorer ---

test("indikatorer: grupperet efter CONCITO-kategori med transport først", () => {
  const h = renderIndikatorer(bThisted, concito);
  const iTransport = h.indexOf("Transport");
  const iBoliger = h.indexOf("Boliger");
  assert.ok(iTransport >= 0 && iBoliger > iTransport);
});

test("indikatorer: hver kategori bærer CONCITO's nationale tal", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(h.includes("3,1 ton"), "transportens nationale tal skal stå ved kategorien");
  assert.ok(h.includes("1,0 ton"), "kørsel i personlige transportmidler skal stå der");
});

test("indikatorer: alle 19 nøgletal vises", () => {
  const h = renderIndikatorer(bThisted, concito);
  const raekker = (h.match(/<tr/g) || []).length;
  const grupper = bThisted.grupper.length;
  assert.equal(raekker, bThisted.drivere.length + grupper,
    "én række pr. nøgletal plus én headerrække pr. kategori");
});

test("indikatorer: manglende værdi vises som tankestreg", () => {
  const h = renderIndikatorer(bGreve, concito);
  assert.ok(h.includes("–"));
});

test("indikatorer: bruger egen tooltip, ikke browserens title", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(!/\stitle="/.test(h));
  assert.ok(h.includes("tip-boks"));
});

test("indikatorer: pendlingsafstand vises i km, ikke omregnet", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(h.includes("Gennemsnitlig pendlingsafstand"));
  assert.ok(h.includes("23,6"), "Thisteds faktiske km skal stå der");
  assert.ok(!h.includes("bil-km"), "der må ikke stå en omregnet bil-km-værdi");
});

// --- Hullerne ---

test("huller: fødevarehullet står eksplicit", () => {
  const h = renderHuller(concito);
  assert.ok(h.includes("Fødevarer"));
  assert.ok(h.includes("2,5 ton"), "den nationale fødevareudledning skal stå der");
  assert.ok(h.includes("1,4 ton"), "oksekødets andel skal stå der");
});

test("huller: forklarer hvorfor der ikke beregnes et samlet tal", () => {
  const h = renderHuller(concito);
  assert.ok(h.includes("NIRAS"));
  for (const a of concito.niras_anbefalinger) {
    assert.ok(h.includes(a.omraade), `mangler NIRAS' anbefaling om ${a.omraade}`);
  }
  assert.ok(/s\.\s*20/.test(h), "transportanbefalingen skal have sidehenvisning");
});

// --- Samlet ---

test("kommunevisning: rækkefølge er kommune, nationalt, nøgletal, huller", () => {
  const h = renderKommune(bThisted, concito);
  const i1 = h.indexOf("Thisted");
  const i2 = h.indexOf("Danmarks forbrugsudledning");
  const i3 = h.indexOf("Disponibel indkomst");
  const i4 = h.indexOf("Hvad værktøjet ikke kan vise");
  assert.ok(i1 < i2 && i2 < i3 && i3 < i4, `rækkefølge forkert: ${[i1, i2, i3, i4]}`);
});

test("kommunevisning: intet output indeholder undefined, NaN eller null", () => {
  for (const b of [bThisted, bGreve]) {
    const h = renderKommune(b, concito);
    assert.ok(!h.includes("undefined"), `${b.navn}: undefined`);
    assert.ok(!h.includes("NaN"), `${b.navn}: NaN`);
    assert.ok(!/>\s*null\s*</.test(h), `${b.navn}: null`);
  }
});

test("kommunevisning: intet samlet aftryk i ton påstås", () => {
  const h = renderKommune(bThisted, concito);
  assert.ok(!/aftryk pr\. borger/i.test(h), "værktøjet beregner ikke et kommunalt aftryk");
  assert.ok(h.includes("lægger dem ikke sammen"), "det skal siges eksplicit");
});

test("kommunevisning: forbeholdet overlever embed-tilstand", () => {
  const h = renderKommune(bThisted, concito);
  const i = h.indexOf("Uofficielt værktøj");
  assert.ok(i > 0);
  const afsnit = h.slice(h.lastIndexOf("<section", i), i);
  assert.ok(!afsnit.includes("no-embed"));
});

test("overskrift: viser kommunekode og region", () => {
  const h = renderKommuneOverskrift(bThisted);
  assert.ok(h.includes("787") && h.includes("Nordjylland"));
});
