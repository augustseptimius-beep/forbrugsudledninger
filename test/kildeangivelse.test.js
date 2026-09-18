// Kildeangivelsen på kommunesiden.
//
// Reglen, hele projektet hviler på, er at intet tal står uden kilde. Den var
// indtil nu holdt ét sted: metodesidens kildetabel. Men en kommuneside kan
// printes, lægges i en iframe eller sendes videre som PDF, og så står tallene
// uden afsender. Kilden står derfor ved hvert enkelt nøgletal.
//
// Angivelsen skrives ikke i hånden i render.js. Nøgletallet oplyser, hvilke
// felter i data.json det læser, og kildekataloget siger, hvem der ejer hvert
// felt. Testene her holder de to led sammen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune, driverTabel, DRIVERE } from "../web/beregning.js";
import { renderIndikatorer, kilderForDriver } from "../web/render.js";
import { land, thisted } from "./fixtures.js";

const hent = (fil) => JSON.parse(readFileSync(new URL(`../web/data/${fil}`, import.meta.url)));
const concito = hent("concito.json");
const ens = hent("ens.json");
const sources = hent("sources.json");

const tabel = driverTabel(thisted, land);
const h = renderIndikatorer(beregnKommune(thisted, land), concito, ens, sources);

test("kildeangivelse: hvert nøgletal på siden har mindst én kilde", () => {
  for (const d of tabel) {
    const { kilder } = kilderForDriver(d, sources);
    assert.ok(kilder.length > 0, `${d.navn} har ingen kilde`);
  }
});

test("kildeangivelse: kilden står i tabellen med tabel-id og årgang", () => {
  // Ikke bare "Danmarks Statistik". Læseren skal kunne slå den præcise tabel op.
  assert.ok(h.includes("Kilde: "), "der skal stå en kildelinje");
  assert.ok(h.includes("DST BIL54"), "bilerne skal nævne tabellen ved id");
  assert.ok(h.includes("2026M01"), "årgangen skal komme fra sources.json");
  const linjer = (h.match(/Kilde: /g) || []).length;
  const drivere = beregnKommune(thisted, land).drivere.length;
  assert.equal(linjer, drivere, "én kildelinje pr. nøgletal, hverken flere eller færre");
});

test("kildeangivelse: kilden linker til sit ophav", () => {
  for (const d of tabel) {
    for (const k of kilderForDriver(d, sources).kilder) {
      if (!k.url) continue;
      assert.ok(h.includes(k.url), `${d.navn}: link til ${k.id} mangler`);
    }
  }
});

test("kildeangivelse: et nøgletal med flere kilder nævner dem alle", () => {
  // Husholdningernes CO2 pr. bolig er Klimaregnskabets udledning fordelt på
  // Danmarks Statistiks boligtal. Nævnte siden kun den ene, ville nævneren i
  // regnestykket være usynlig.
  const d = tabel.find((x) => x.navn === "Husholdningernes CO2 fra energi");
  const ids = kilderForDriver(d, sources).kilder.map((k) => k.id);
  assert.deepEqual(ids.sort(),
    ["BOL101", "BOL101_FRITID", "KLIMAREGNSKABET_HUSHOLDNINGER"].sort());
});

test("kildeangivelse: fødevareforbruget nævner både data og metode", () => {
  // Tallet er FU17's regionskvotient ganget med kommunens disponible indkomst
  // fra INDKF111, efter fordelingsnøglen i Osei-Owusu et al. (2020). Står kun
  // FU17, ligner det et forbrugstal, Danmarks Statistik har for kommunen.
  const d = tabel.find((x) => x.navn === "Fødevareforbrug pr. indbygger");
  const { kilder, reference } = kilderForDriver(d, sources);
  assert.deepEqual(kilder.map((k) => k.id), ["FU17", "INDKF111"]);
  assert.equal(reference.id, "OSEI_OWUSU_2020");
  assert.ok(h.includes("metode: "), "metodekilden skal stå som metode, ikke som datakilde");
  assert.ok(h.includes("Osei-Owusu et al. (2020)"));
});

test("kildeangivelse: kilderne slås op, de skrives ikke i render.js", () => {
  // Uden kildekatalog ingen kildelinje - og dermed intet sted, hvor et
  // kildenavn kan komme til at stå og drive fra det, pipelinen faktisk hentede.
  const uden = renderIndikatorer(beregnKommune(thisted, land), concito, ens, null);
  assert.ok(!uden.includes("Kilde: "), "ingen kildelinje uden katalog");
  assert.ok(!/DST\s[A-Z]+\d/.test(uden), "et tabel-id står skrevet i render.js");
  assert.ok(!uden.includes("2026M01"), "en årgang fra kataloget står skrevet i render.js");
});

test("kildeangivelse: hvert nøgletal oplyser præcis de felter, det læser", () => {
  // Drift-vagten. Felterne er selve kildeangivelsen, og en ændring i et
  // regnestykke - et nøgletal, der begynder at dividere med folketallet - må
  // ikke kunne slippe igennem uden at kilden følger med.
  //
  // Opslagene spores med en proxy over både kommunen og landet, fordi et par
  // nøgletal læser landets tal med (den fælles el-faktor).
  const laest = new Set();
  const spor = (o) => new Proxy(o, {
    get(maal, noegle) {
      if (typeof noegle === "string") laest.add(noegle);
      return maal[noegle];
    },
  });

  for (const d of tabel) {
    const spec = DRIVERE.find((x) => x.navn === d.navn);
    assert.ok(spec, `${d.navn}: kunne ikke findes i motorens driverliste`);
    laest.clear();
    try {
      spec.val(spor(thisted), spor(land));
    } catch {
      // Et regnestykke, der falder over manglende data i fixturen, har alligevel
      // nået at slå de felter op, det bruger.
    }
    assert.deepEqual([...laest].sort(), [...d.felter].sort(),
      `${d.navn}: felter og faktiske opslag er ikke de samme`);
  }
});

test("kildeangivelse: intet nøgletal slipper igennem uden felter", () => {
  // Uden felter ingen kildelinje, og så står tallet på siden uden afsender.
  for (const d of DRIVERE) {
    assert.ok((d.felter ?? []).length > 0, `${d.navn} oplyser ingen felter`);
  }
  assert.equal(DRIVERE.length, tabel.length, "ét regnestykke pr. nøgletal");
});
