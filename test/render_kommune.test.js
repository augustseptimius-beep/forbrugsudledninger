import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune, optaelSignaler } from "../web/beregning.js";
import { renderNationaltAftryk, renderIndikatorer, renderHuller, renderFund,
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

test("indikatorer: manglende værdi vises som tankestreg", () => {
  const h = renderIndikatorer(bGreve, concito);
  assert.ok(h.includes("–"));
});

test("indikatorer: bruger egen tooltip, ikke browserens title", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(!/\stitle="/.test(h));
  assert.ok(h.includes("data-tip="));
});

test("indikatorer: kontekst-nøgletal får intet peger-mod-mærkat", () => {
  // Kategorien siger allerede, at de ikke peger på en forbrugskategori.
  // Fire ekstra "uafklaret"-mærkater fik værktøjet til at se rådvildt ud.
  const h = renderIndikatorer(bThisted, concito);
  const antalUafklaret = (h.match(/>uafklaret</g) || []).length;
  assert.ok(antalUafklaret <= 3,
    `for mange uafklarede mærkater: ${antalUafklaret}`);
});

test("fund: kontekst-nøgletal står ikke under 'kan ikke afgøres'", () => {
  const h = renderFund(bThisted, concito);
  const spalte = h.split("Kan ikke afgøres")[1].split("</div>")[0];
  assert.ok(!spalte.includes("Befolkningstæthed"), "kontekst hører ikke til her");
  assert.ok(!spalte.includes("Nettoformue"));
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

test("kommunevisning: fundene står før tabellen", () => {
  // Konkrete fund først, detaljerne bagefter - ikke omvendt.
  const h = renderKommune(bThisted, concito);
  const iNavn = h.indexOf("Thisted");
  const iFund = h.indexOf("Det stikker ud");
  const iTabel = h.indexOf("Alle nøgletal");
  const iHuller = h.indexOf("Hvad værktøjet ikke kan vise");
  assert.ok(iNavn < iFund && iFund < iTabel && iTabel < iHuller,
    `rækkefølge forkert: ${[iNavn, iFund, iTabel, iHuller]}`);
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

// --- Fund øverst ---

test("fund: navngiver de nøgletal, der stikker ud", () => {
  // Det abstrakte "1 markant højere, 1 lavere" er væk. Et fund skal kunne
  // læses uden at folde noget ud.
  const h = renderFund(bThisted, concito);
  assert.ok(h.includes("Parcelhus-andel"), "det største udsving skal navngives");
  assert.ok(/[+-]\d+,\d\s*%/.test(h), "og bære sit tal");
});

test("fund: adskiller højere, lavere og uafklaret", () => {
  const h = renderFund(bThisted, concito);
  assert.ok(h.includes("Peger mod højere udledning"));
  assert.ok(h.includes("Peger mod lavere udledning"));
  assert.ok(h.includes("Kan ikke afgøres"));
});

test("fund: hvert nøgletal står med sin kategori", () => {
  const h = renderFund(bThisted, concito);
  assert.ok(h.includes("Boliger") || h.includes("Transport"),
    "kategorien skal stå ved nøgletallet");
});

test("fund: hjælpetal fylder ikke fundene", () => {
  // Lokal VE-dækning og fritidshuse har de største udsving og ville ellers
  // fortrænge det, de er sat i verden for at forklare.
  const h = renderFund(bThisted, concito);
  assert.ok(!h.includes("Lokal VE-dækning"));
  assert.ok(!h.includes("Fritidshuse pr. helårsbolig"));
});

test("fund: fødevarehullet står med sit nationale tal", () => {
  const h = renderFund(bThisted, concito);
  assert.ok(h.includes("2,5 ton"));
  assert.ok(h.includes("blindt"));
});

test("indikatorer: alle nøgletal står i én tabel uden foldning", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(!h.includes("<details"), "fem klik for at se nitten rækker er ikke et overblik");
  const raekker = (h.match(/<tr/g) || []).length;
  const grupper = bThisted.grupper.length;
  assert.equal(raekker, bThisted.drivere.length + grupper + 1,
    "én række pr. nøgletal, én overskrift pr. kategori, plus tabelhovedet");
});

test("indikatorer: hver kategorioverskrift bærer sin nationale vægt", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(h.includes("3,1 ton"), "transportens vægt");
  assert.ok(h.includes("1,6 ton"), "boligernes vægt");
});

// --- Signalmærkater ---

test("signalmærkat: farven er aldrig eneste bærer af betydning", () => {
  // Cirka 8 % af mænd er farveblinde. Tekst og symbol skal stå ved siden af.
  const h = renderIndikatorer(bThisted, concito);
  for (const tekst of ["højere", "uafklaret"]) {
    assert.ok(h.includes(`>${tekst}<`) || h.includes(`${tekst}</span>`),
      `signalet "${tekst}" mangler sin tekst`);
  }
});

test("signalmærkat: hvert nøgletal bærer sin begrundelse", () => {
  const h = renderIndikatorer(bThisted, concito);
  // Diesel er det vigtigste eksempel på en retning, der ikke må gættes.
  assert.ok(h.includes("dieselbil udleder typisk"),
    "diesel-andelens begrundelse skal stå ved mærkatet");
});

test("indikatortabel: har en kolonne for hvad nøgletallet peger mod", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(h.includes("Peger mod"));
});

test("fund: forklarer at et minustal kan pege mod højere udledning", () => {
  // Genanvendelsesprocent -22,4 % står under "peger mod højere". Det er
  // korrekt, men uforklaret ser det ud som en fejl.
  const h = renderFund(bThisted, concito);
  assert.ok(h.includes("Et minustal kan godt pege mod"));
});
