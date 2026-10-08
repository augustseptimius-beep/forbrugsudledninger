// Metodesidens afsnit om udviklingen over tid.
//
// Samme rangorden som resten af metodesiden: render før test, test før prosa. Tabellen over,
// hvordan kommunerne fordeler sig, og over hvilke år hver serie dækker, regnes af siden selv.
// De tal, der står i prosaen, er motorens egne tærskler, og her holdes de fast, så en ændret
// tærskel ikke efterlader en side, der siger noget andet end koden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DRIVERE, N_ENDEPUNKT, MIN_AAR_FOR_GENNEMSNIT, TAERSKEL_UAENDRET_PCT, TAERSKEL_UAENDRET_PP,
  NIVEAU_FOR_PP_REGEL, TAERSKEL_UAENDRET_VAEKST_PP, beregnUdviklingFordeling,
} from "../web/beregning.js";
import { renderUdviklingFordeling } from "../web/render.js";

const fil = (navn) => new URL(`../web/data/${navn}`, import.meta.url);
const data = JSON.parse(readFileSync(fil("data.json")));
const hist = JSON.parse(readFileSync(fil("historik.json")));
const sources = JSON.parse(readFileSync(fil("sources.json")));
const raaHtml = readFileSync(new URL("../web/metode.html", import.meta.url), "utf8");
const tekst = raaHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const afsnit = tekst.slice(tekst.indexOf("Udviklingen over tid", tekst.indexOf("Hjælpetal")));

const fordeling = beregnUdviklingFordeling(data.kommuner, data.land, hist);

test("metodesiden: afsnittet om udviklingen findes, med en plads til den genererede tabel", () => {
  assert.ok(raaHtml.includes('<h3 id="udvikling"'));
  assert.ok(raaHtml.includes('id="udviklingsfordeling"'));
  // Pilens forklaring på kommunesiden linker hertil.
  assert.ok(raaHtml.includes('id="udvikling"'));
});

test("metodesiden: prosaens tal er motorens tærskler", () => {
  assert.equal(N_ENDEPUNKT, 3);
  assert.ok(afsnit.includes("Endepunkterne er middel af tre år"));
  assert.equal(MIN_AAR_FOR_GENNEMSNIT, 6);
  assert.ok(afsnit.includes("Har serien mindst seks år"));
  assert.equal(TAERSKEL_UAENDRET_PCT, 1);
  assert.ok(afsnit.includes("Uændret betyder under 1 procent"));
  assert.equal(TAERSKEL_UAENDRET_PP, 1);
  assert.equal(NIVEAU_FOR_PP_REGEL, 10);
  assert.ok(afsnit.includes("en ændring under 1 procentpoint også uændret, når niveauet er mindst 10 procent"));
  assert.equal(TAERSKEL_UAENDRET_VAEKST_PP, 0.1);
  assert.ok(afsnit.includes("en ændring under 0,1 procentpoint"));
  assert.equal(hist.vindue, 10);
  assert.ok(afsnit.includes("de seneste op til ti år"));
});

test("metodesiden: prisindekset står i kildekataloget under det navn, prosaen bruger", () => {
  assert.ok(sources.kilder.some((k) => k.id === "PRIS8"));
  assert.ok(afsnit.includes("forbrugerprisindeks (PRIS8)"));
});

test("metodesiden: retningsantagelserne, prosaen nævner, er dem motoren bruger", () => {
  // Siden siger, at indkomst, boligareal og biler peger mod højere udledning, når de stiger,
  // og at kommunens indkøb i kroner står uden retning. Skifter et af dem paavirkning, er
  // sætningen forkert.
  const paavirkning = (navn) => DRIVERE.find((d) => d.navn === navn).paavirkning;
  for (const navn of ["Disponibel indkomst", "Gennemsnitligt boligareal", "Biler pr. indbygger"]) {
    assert.equal(paavirkning(navn), "hoejere", navn);
  }
  for (const d of DRIVERE.filter((x) => x.navn.startsWith("Kommunens "))) {
    assert.equal(d.paavirkning, "uafklaret", d.navn);
  }
  assert.ok(afsnit.includes("Kommunens eget indkøb i kroner står derimod uden retning"));
  assert.ok(afsnit.includes("En stigende disponibel indkomst står som forkert retning"));
});

test("metodesiden: anlægsindkøbet er det ene nøgletal, der prisjusteres efter vinduets midte", () => {
  const forskudte = DRIVERE.filter((d) => d.prisForskydning).map((d) => d.navn);
  assert.deepEqual(forskudte, ["Kommunens anlægsindkøb"]);
  assert.ok(afsnit.includes("Anlægsindkøbet er et femårsgennemsnit"));
});

test("metodesiden: tabellen har en række pr. nøgletal og præcis de kolonner, prosaen nævner", () => {
  const h = renderUdviklingFordeling(fordeling);
  for (const kolonne of ["Nøgletal", "Periode", "Rigtig", "Langsomt", "Uændret", "Forkert",
    "Uden vurdering", "Uden tidsserie", "Median"]) {
    assert.ok(h.includes(`>${kolonne}</th>`), kolonne);
  }
  assert.equal((h.match(/<tr class="border-t/g) ?? []).length, DRIVERE.length);
  for (const d of DRIVERE) assert.ok(h.includes(d.navn), d.navn);
});

test("metodesiden: hver kommune står på præcis én retning pr. nøgletal", () => {
  for (const f of fordeling) {
    const sum = f.rigtig + f.tempo + f.stagneret + f.forkert + f.kontekst + f.ingen + f.skjult;
    assert.equal(sum, data.kommuner.length, f.navn);
  }
});

test("metodesiden: nøgletallene i kroner er mærket, og ingen andre", () => {
  const h = renderUdviklingFordeling(fordeling);
  const maerkede = [...h.matchAll(/<td class="py-2 pr-3 text-sm text-gray-900">([^<]*)<span[^>]*>faste priser<\/span>/g)]
    .map(([, navn]) => navn.replace(/&#39;/g, "'"));
  assert.deepEqual(maerkede.sort(), DRIVERE.filter((d) => d.faste).map((d) => d.navn).sort());
});

test("metodesiden: perioden er landets, og en yngre kilde giver en kortere serie", () => {
  const biler = fordeling.find((f) => f.navn === "Biler pr. indbygger");
  const indkomst = fordeling.find((f) => f.navn === "Disponibel indkomst");
  assert.ok(indkomst.n > biler.n, "BIL54 er yngre end INDKP101");
  assert.equal(indkomst.aarTil, hist.felter.disp_indkomst.aar);
  assert.equal(indkomst.aarFra, indkomst.aarTil - hist.vindue);
  assert.equal(biler.n, biler.aarTil - biler.aarFra + 1, "bilerne har ingen huller");
});

test("metodesiden: nøgletal uden historik står med alle kommuner under uden tidsserie", () => {
  for (const felt of hist.mangler) {
    for (const d of DRIVERE.filter((x) => x.felter.includes(felt))) {
      const f = fordeling.find((x) => x.navn === d.navn);
      assert.equal(f.ingen + f.skjult, data.kommuner.length, `${d.navn} mangler ${felt}`);
    }
  }
});

test("metodesiden: uden historik siger tabellen det og regner ikke", () => {
  const h = renderUdviklingFordeling(null);
  assert.ok(h.includes("Historikken er ikke hentet"));
  assert.ok(!h.includes("<table"));
});

test("metodesiden: tabellen navngiver ingen kommune", () => {
  const h = renderUdviklingFordeling(fordeling);
  for (const k of data.kommuner) {
    // Enkelte kommunenavne er også ord ("Læsø" ikke, men fx "Lolland"): kun hele ord tæller.
    assert.ok(!new RegExp(`>[^<]*\\b${k.navn}\\b[^<]*<`).test(h), `${k.navn} er navngivet`);
  }
});

test("metodesiden: kommunesidens forklaring linker til afsnittet", () => {
  assert.match(raaHtml, /<h3 id="udvikling"/);
});
