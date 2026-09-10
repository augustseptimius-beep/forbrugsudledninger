import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune, optaelSignaler, beregnFordeling, driverTabel } from "../web/beregning.js";
import { renderNationaltAftryk, renderIndikatorer, renderHuller,
         renderKategorioverblik, renderKommuneOverskrift, renderKommune,
         renderTaerskelfordeling, renderEnsKategorier } from "../web/render.js";
import { land, thisted, greve } from "./fixtures.js";

const concito = JSON.parse(readFileSync(new URL("../web/data/concito.json", import.meta.url)));
const ens = JSON.parse(readFileSync(new URL("../web/data/ens.json", import.meta.url)));
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

test("indikatorer: grupperet efter Energistyrelsens gruppe med transport først", () => {
  const h = renderIndikatorer(bThisted, concito, ens);
  const iTransport = h.indexOf("Transport");
  const iBolig = h.indexOf("Bolig og byggeri");
  assert.ok(iTransport >= 0 && iBolig > iTransport,
    "Energistyrelsens vægt sætter transport først og bolig og byggeri sidst");
});

test("indikatorer: hver kategori bærer Energistyrelsens nationale vægt", () => {
  const h = renderIndikatorer(bThisted, concito, ens);
  const transport = ens.kategorier.find((k) => k.navn === "Transport");
  assert.ok(h.includes("1,84 ton"), "transportens ENS-vægt skal stå ved kategorien");
  assert.equal(transport.ton, 1.844);
});

test("indikatorer: manglende værdi vises som tankestreg", () => {
  const h = renderIndikatorer(bGreve, concito, ens);
  assert.ok(h.includes("–"));
});

test("indikatorer: bruger egen tooltip, ikke browserens title", () => {
  const h = renderIndikatorer(bThisted, concito, ens);
  assert.ok(!/\stitle="/.test(h));
  assert.ok(h.includes("data-tip="));
});

test("indikatorer: kontekst-nøgletal får intet peger-mod-mærkat", () => {
  // Kategorien siger allerede, at de ikke peger på en forbrugskategori.
  // Fire ekstra "uafklaret"-mærkater fik værktøjet til at se rådvildt ud.
  //
  // Testen tæller MEKANISMEN, ikke et øjebliksbillede: den tidligere udgave
  // låste antallet til højst 3, og den fejlede, da affaldsnøgletallene
  // retmæssigt blev uafklarede. Antallet af mærkater skal følge antallet af
  // ikke-kontekst-drivere med uafklaret retning - hverken mere eller mindre.
  const h = renderIndikatorer(bThisted, concito, ens);
  // Tæl selve MÆRKATET, ikke enhver forekomst af sætningen: Nettoformues
  // begrundelsestekst indeholder tilfældigvis samme formulering.
  const vist = (h.match(/>\?<\/span>retningen kan ikke afgøres/g) || []).length;
  const forventet = bThisted.drivere.filter(
    (d) => d.signal === "uafklaret").length;
  assert.equal(vist, forventet, "hver uafklaret driver skal have præcis ét mærkat");
  assert.ok(bThisted.drivere.filter((d) => d.kategori === "Kontekst")
    .every((d) => d.signal === "kontekst"),
    "kontekst-drivere må aldrig få signalet uafklaret");
});

test("indikatorer: pendlingsafstand vises i km, ikke omregnet", () => {
  const h = renderIndikatorer(bThisted, concito, ens);
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
  assert.ok(/s\.\s*6/.test(h), "transportanbefalingens tilgængelighedsbegrænsning skal henvise til s. 6, afsnit 1.4");
});

// --- Samlet ---

test("kommunevisning: overblikket står før den fulde tabel", () => {
  // Overblikket først, detaljerne bagefter - ikke omvendt.
  const h = renderKommune(bThisted, concito, ens);
  const iNavn = h.indexOf("Thisted");
  const iOverblik = h.indexOf("Forbrugskategorier i");
  const iTabel = h.indexOf("Alle nøgletal");
  const iHuller = h.indexOf("Hvad værktøjet ikke kan vise");
  assert.ok(iNavn < iOverblik && iOverblik < iTabel && iTabel < iHuller,
    `rækkefølge forkert: ${[iNavn, iOverblik, iTabel, iHuller]}`);
});

test("kommunevisning: intet output indeholder undefined, NaN eller null", () => {
  for (const b of [bThisted, bGreve]) {
    const h = renderKommune(b, concito, ens);
    assert.ok(!h.includes("undefined"), `${b.navn}: undefined`);
    assert.ok(!h.includes("NaN"), `${b.navn}: NaN`);
    assert.ok(!/>\s*null\s*</.test(h), `${b.navn}: null`);
  }
});

test("kommunevisning: intet samlet aftryk i ton påstås", () => {
  const h = renderKommune(bThisted, concito, ens);
  assert.ok(!/aftryk pr\. borger/i.test(h), "værktøjet beregner ikke et kommunalt aftryk");
  assert.ok(h.includes("lægger dem ikke sammen"), "det skal siges eksplicit");
});

test("kommunevisning: bundforbeholdet overlever embed-tilstand", () => {
  const h = renderKommune(bThisted, concito, ens);
  const i = h.lastIndexOf("Uofficielt værktøj");
  assert.ok(i > 0);
  const afsnit = h.slice(h.lastIndexOf("<section", i), i);
  assert.ok(!afsnit.includes("no-embed"));
});

test("kommunevisning: et kompakt forbehold står ØVERST i embed-tilstand", () => {
  // Sidehovedets banner bærer .no-embed og forsvinder i en iframe. Uden dette
  // møder en læser på en fremmed side tallene uden at vide, hvem der står bag,
  // indtil de har scrollet forbi hele tabellen.
  const h = renderKommune(bThisted, concito, ens);
  const iEmbed = h.indexOf("kun-embed");
  const iNavn = h.indexOf("Thisted");
  assert.ok(iEmbed >= 0, "der skal være et embed-only forbehold");
  assert.ok(iEmbed < iNavn, "det skal stå før kommunens navn, ikke efter tabellen");

  const afsnit = h.slice(iEmbed, h.indexOf("</section>", iEmbed));
  assert.ok(!afsnit.includes("no-embed"),
    "forbeholdet må ikke selv være skjult i embed - det er hele pointen");
  assert.ok(afsnit.includes("ikke en myndighedsopgørelse"),
    "den vigtigste kalibrerende sætning skal med");
  assert.ok(afsnit.includes('target="_blank"'),
    "metodelinket skal ud af iframen, ikke ind i værtssidens ramme");
});

test("overskrift: viser kommunekode og region", () => {
  const h = renderKommuneOverskrift(bThisted);
  assert.ok(h.includes("787") && h.includes("Nordjylland"));
});

// --- Kategorioverblik ---

test("overblik: alle Energistyrelsens kategorier står med, også dem uden nøgletal", () => {
  // Fødevarer og Offentligt forbrug udgør knap 30 % af aftrykket og har nul
  // kommunale nøgletal. Et overblik, der kun viser det, vi kan måle, ville
  // pege koordinatoren mod de forkerte kategorier.
  const h = renderKategorioverblik(bThisted, ens);
  for (const k of ens.kategorier) {
    assert.ok(h.includes(k.navn), `mangler kategorien ${k.navn}`);
  }
});

test("overblik: kategorier uden nøgletal siger det tydeligt", () => {
  const h = renderKategorioverblik(bThisted, ens);
  const i = h.indexOf("Føde- og drikkevarer");
  const afsnit = h.slice(i, i + 900);
  assert.ok(afsnit.includes("Ingen kommunal indikator"),
    "blindheden skal stå med ord, ikke kun mangle et tal");
});

test("overblik: rækkefølgen følger Energistyrelsens vægt, med restposter sidst", () => {
  const h = renderKategorioverblik(bThisted, ens);
  const vist = ens.kategorier
    .map((k) => ({ ...k, i: h.indexOf(k.navn) }))
    .sort((a, b) => a.i - b.i);
  const rigtig = [...ens.kategorier].sort((a, b) =>
    (a.restpost ? 1 : 0) - (b.restpost ? 1 : 0) || b.ton - a.ton);
  assert.deepEqual(vist.map((k) => k.navn), rigtig.map((k) => k.navn));
  assert.equal(vist[vist.length - 1].restpost, true,
    "restposten står sidst, selv om den vejer mest");
  assert.equal(vist[0].navn, "Transport",
    "den tungeste kategori, en kommune kan handle på, står først");
});

test("overblik: mærkatet siger 'peger mod', ikke om værdien er høj", () => {
  // El- og plugin-hybridandel er en LAV værdi (18,4 % mod landets 23,5 %), men
  // peger mod HØJERE udledning. Den skelnen forsvandt, da ordet var "markant".
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(h.includes("peger mod højere udledning"));
  const d = bThisted.drivere.find((x) => x.navn === "El- og plugin-hybridandel");
  assert.ok(d.kommuneVaerdi < d.landVaerdi, "værdien er lavere end landets");
  assert.equal(d.signal, "højere", "men den peger mod højere udledning");
});

test("overblik: sammenligner kun med landsgennemsnittet, ikke med andre kommuner", () => {
  // To tidligere forsøg står som skiltet her: "markant hos 62 af 98" krævede at
  // læseren kendte en skjult tærskel, og spændet ("8 ud af 10 kommuner: X - Y")
  // lagde en tredje talstørrelse oven i kommunens egen værdi og landets. Begge
  // er væk. Tilbage står den ene sammenligning, en kommuneside kan bære.
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(!h.includes("markant hos"), "den gamle optælling er væk");
  assert.ok(!/\d+\s*ud af\s*\d+\s*kommuner/i.test(h), "spændet er væk");
  assert.ok(!/spænd/i.test(h), "ingen omtale af et spænd overhovedet");
  assert.ok(h.includes("landet"), "landsgennemsnittet står stadig");
});

test("overblik: hjælpetal fylder ikke overblikket", () => {
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(!h.includes("Lokal VE-dækning"));
  assert.ok(!h.includes("Fritidshuse pr. helårsbolig"));
});

test("overblik: kontekst-nøgletal hører ikke til i en forbrugskategori", () => {
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(!h.includes("Nettoformue"));
  assert.ok(!h.includes("Gini-koefficient"));
});

test("overblik: siger eksplicit at det ikke er en prioritering", () => {
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(h.includes("ikke en prioritering"));
});

test("indikatorer: alle nøgletal står i én tabel uden foldning", () => {
  const h = renderIndikatorer(bThisted, concito, ens);
  assert.ok(!h.includes("<details"), "fem klik for at se nitten rækker er ikke et overblik");
  const raekker = (h.match(/<tr/g) || []).length;
  const grupper = bThisted.grupper.length;
  assert.equal(raekker, bThisted.drivere.length + grupper + 1,
    "én række pr. nøgletal, én overskrift pr. kategori, plus tabelhovedet");
});

test("indikatorer: hver kategorioverskrift bærer sin nationale vægt", () => {
  const h = renderIndikatorer(bThisted, concito, ens);
  assert.ok(h.includes("1,84 ton"), "transportens vægt");
  assert.ok(h.includes("0,48 ton"), "bolig og byggeris vægt");
});

// --- Signalmærkater ---

test("signalmærkat: farven er aldrig eneste bærer af betydning", () => {
  // Cirka 8 % af mænd er farveblinde. Tekst og symbol skal stå ved siden af.
  const h = renderIndikatorer(bThisted, concito, ens);
  for (const tekst of ["peger mod højere udledning", "retningen kan ikke afgøres"]) {
    assert.ok(h.includes(tekst), `signalet "${tekst}" mangler sin tekst`);
  }
});

test("signalmærkat: hvert nøgletal bærer sin begrundelse", () => {
  const h = renderIndikatorer(bThisted, concito, ens);
  // Diesel er det vigtigste eksempel på en retning, der ikke må gættes.
  assert.ok(h.includes("dieselbil udleder typisk"),
    "diesel-andelens begrundelse skal stå ved mærkatet");
});

test("indikatortabel: har en kolonne for hvad nøgletallet peger mod", () => {
  const h = renderIndikatorer(bThisted, concito, ens);
  assert.ok(h.includes("Peger mod"));
});

test("overblik: forklarer at værdi og udledningsretning ikke er det samme", () => {
  // En lav el-bilandel er en lav VÆRDI, men peger mod en høj UDLEDNING.
  // Uden den forklaring ser mærkatet ud som en fejl.
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(h.includes("Hvad det peger mod"), "forklaringen skal stå i overblikket");
  assert.ok(h.includes("færre elbiler er en lavere andel, men peger mod højere udledning"),
    "det konkrete eksempel skal stå der");
});

// --- Affaldstallenes kommunefordeling (DST-indberetningsfejl) ---

test("affald: begge affaldsnøgletal står som uafklarede, ikke med en retning", () => {
  // DST's kommunefordeling af husholdningsaffald for 2023 er påvist upålidelig:
  // kommuner, der deler et affaldsselskab, har fået hinandens restaffald bogført.
  // Hørsholm indberettede 29 ton dagrenovation for 24.715 indbyggere. Retningen
  // kan ikke bæres, når vi ikke kan udpege de ramte kommuner.
  const t = driverTabel(thisted, land);
  for (const navn of ["Husholdningsaffald", "Genanvendelsesprocent"]) {
    const d = t.find((x) => x.navn === navn);
    assert.equal(d.paavirkning, "uafklaret", `${navn} må ikke påstå en retning`);
    assert.equal(d.signal, "uafklaret");
  }
});

test("affald: forbeholdet forklarer fejlen og siger at tallet ikke er rettet", () => {
  const h = renderIndikatorer(beregnKommune(thisted, land), concito);
  assert.ok(h.includes("kommunefordelte affaldsmængder er mere usikre"),
    "DST's eget forbehold skal citeres");
  assert.ok(h.includes("ikke rettet her"),
    "det skal fremgå, at værktøjet ikke retter kildens tal");
});

// --- Fordelingskontekst: gør 'markant' læseligt ---

const alle = [thisted, greve];
const fordeling = beregnFordeling(alle, land);

test("fordeling: båndene summerer til n for hvert nøgletal", () => {
  for (const [navn, f] of Object.entries(fordeling)) {
    if (!f) continue;
    assert.equal(f.paaNiveau + f.mellem + f.markant, f.n,
      `${navn}: båndene skal dække præcis de kommuner, der har en afvigelse`);
  }
});

test("fordeling: nøgletal uden afvigelse giver null, ikke et objekt med nuller", () => {
  // Gini har type "ingen" og har derfor ingen fordeling at vise.
  assert.equal(fordeling["Gini-koefficient"], null);
});

test("fordeling: n tæller kommuner MED en afvigelse, ikke antal kommuner", () => {
  // Greve mangler elco2 i fixturen. Et hardkodet "af 98" ville påstå en
  // dækning, værktøjet ikke har.
  const f = fordeling["El-CO2 pr. kWh"];
  assert.ok(f == null || f.n < alle.length,
    "nøgletal med manglende værdier skal have et lavere n");
});

test("fordeling: hverken placering, percentil, yderpunkter eller spænd vises", () => {
  // Den fulde udgave kører på alle 98 kommuner i alle98.test.js. Denne bliver
  // stående som den hurtige vagt i selve render-testen, og er udvidet med det
  // spænd-ordforråd, der netop er fjernet, så det ikke kan snige sig ind igen.
  const h = renderKommune(beregnKommune(thisted, land), concito, ens);
  assert.ok(!/\bnr\.\s*\d+\s*af\b/.test(h), "ingen placering");
  assert.ok(!/percentil/i.test(h), "ingen percentil i kommunevisningen");
  assert.ok(!/(laveste|højeste|lavest|højest) i landet/i.test(h), "ingen yderpunkter");
  assert.ok(!/\d+\s*ud af\s*\d+\s*kommuner/i.test(h), "intet spænd");
  assert.ok(!/spænd/i.test(h), "ingen omtale af et spænd overhovedet");
});

test("fordeling: tabellen får ikke flere rækker af den nye kontekst", () => {
  const b = beregnKommune(thisted, land);
  const h = renderIndikatorer(b, concito, ens);
  const raekker = (h.match(/<tr/g) || []).length;
  assert.equal(raekker, b.drivere.length + b.grupper.length + 1,
    "al ny tekst skal ind i eksisterende celler");
});

test("procentpoint: andele viser både relativ procent og procentpoint", () => {
  const b = beregnKommune(thisted, land);
  const d = b.drivere.find((x) => x.navn === "Parcelhus-andel");
  assert.ok(d.procentpoint != null, "andele skal bære procentpoint");
  // Den relative afvigelse skal være UÆNDRET - procentpoint er et visningsfelt.
  assert.ok(Math.abs(d.afvigelse - (d.kommuneVaerdi - d.landVaerdi) / d.landVaerdi) < 1e-9);
  const h = renderIndikatorer(b, concito, ens);
  assert.ok(h.includes("procentpoint"), "procentpoint skal stå i tabellen");
});

test("procentpoint: nøgletal der ikke er andele får ingen procentpoint", () => {
  const t = driverTabel(thisted, land);
  for (const navn of ["Disponibel indkomst", "Biler pr. indbygger",
                      "Fritidshuse pr. helårsbolig", "Gini-koefficient"]) {
    assert.equal(t.find((x) => x.navn === navn).procentpoint, null,
      `${navn} er ikke en andel af en helhed`);
  }
});

test("tærskelfordeling: metodetabellen genereres og udelader nøgletal uden afvigelse", () => {
  const h = renderTaerskelfordeling(fordeling);
  assert.ok(h.includes("Markant"), "tabellen skal have en markant-kolonne");
  assert.ok(h.includes("Parcelhus-andel"));
  assert.ok(!h.includes("Gini-koefficient"), "nøgletal uden afvigelse hører ikke til");
  assert.ok(!h.includes("undefined") && !h.includes("NaN"));
});

test("overblik: den nationale vægt må ikke kunne læses som kommunens eget tal", () => {
  // "Transport 1,84 ton pr. indbygger" på en kommuneside læses ellers som
  // kommunens eget transportaftryk - et tal, værktøjet slet ikke kan opgøre.
  // Både tallet og søjlen er nationale og ens på alle 98 sider.
  const h = renderKategorioverblik(bThisted, ens);
  const i = h.indexOf("Transport");
  const raekke = h.slice(i, i + 600);
  assert.ok(/Nationalt[\s\S]{0,80}ton/.test(raekke),
    "vægten skal være mærket som national");
  assert.ok(h.includes("ens på alle 98 kommunesider"),
    "introen skal sige, at venstre kolonne ikke handler om kommunen");
});

test("overblik: venstre kolonne er byte-identisk for to forskellige kommuner", () => {
  // Den maskinelle udgave af påstanden ovenfor.
  const venstre = (b) => (renderKategorioverblik(b, ens)
    .match(/Nationalt[\s\S]*?af aftrykket/g) || []).map((s) => s.replace(/\s+/g, " "));
  assert.deepEqual(venstre(bThisted), venstre(bGreve));
  assert.ok(venstre(bThisted).length === ens.kategorier.length);
});

test("overblik: hvert tal bærer sin enhed", () => {
  // "14,1" uden enhed er ikke et tal, en læser kan bruge. Procenter har
  // allerede tegnet fra driverVaerdi og skal ikke have "pct." bagefter.
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(/23,6\s*km/.test(h), "pendlingsafstand skal stå med km");
  assert.ok(/0,56\s*biler\/pers\./.test(h), "biler pr. indbygger skal have sin enhed");
  assert.ok(!h.includes("% pct."), "procenter må ikke få enheden hæftet på igen");
});

test("overblik: hvert nøgletal har en over/under-markør, hvor formen bærer signalet", () => {
  // Cirka 8 % af mænd er farveblinde, så retningen må ikke kun ligge i farven.
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(h.includes("over landsgennemsnittet"), "pil op skal have tilgængeligt navn");
  assert.ok(h.includes("under landsgennemsnittet"), "pil ned skal have tilgængeligt navn");
});

test("overblik: hver kategori får en samlet konklusion", () => {
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(/peger mod (højere|lavere) udledning end landsgennemsnittet/.test(h)
    || h.includes("trækker i hver sin retning"),
    "der skal stå en konklusion, ikke kun en optælling");
});

test("overblik: konklusionen påstår aldrig noget om kategorien som helhed", () => {
  // Værktøjet har intet mål for kategorien og kan ikke veje nøgletal mod
  // hinanden. Konklusionen må derfor kun sige, hvad NØGLETALLENE peger mod.
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(!/[Kk]ategorien ligger/.test(h));
  assert.ok(!/Transport ligger (over|under)/.test(h));
  assert.ok(h.includes("talt, ikke vejet mod hinanden"),
    "forbeholdet om optælling frem for vægtning skal stå");
});

test("overblik: ingen rå HTML-entiteter slipper ud i teksten", () => {
  // esc() ramte engang selve entiteten, fordi den blev sat ind før escaping,
  // så der stod "&middot;" med bogstaver midt i konklusionen.
  for (const b of [bThisted, bGreve]) {
    const h = renderKategorioverblik(b, ens);
    assert.ok(!h.includes("&amp;middot;"), `${b.navn}: rå &middot;`);
    assert.ok(!h.includes("&amp;nbsp;"), `${b.navn}: rå &nbsp;`);
  }
});
