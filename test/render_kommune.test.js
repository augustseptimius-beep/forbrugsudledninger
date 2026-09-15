import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune, optaelSignaler, beregnFordeling, driverTabel } from "../web/beregning.js";
import { renderNationaltAftryk, renderIndikatorer, renderHuller,
         renderKategorioverblik, renderKommuneOverskrift, renderKommune,
         renderTaerskelfordeling, renderEnsKategorier, tal, pct } from "../web/render.js";
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
  const h = renderIndikatorer(bThisted, concito);
  const iTransport = h.indexOf("Transport");
  const iBolig = h.indexOf("Bolig og byggeri");
  assert.ok(iTransport >= 0 && iBolig > iTransport,
    "Energistyrelsens vægt sætter transport først og bolig og byggeri sidst");
});

test("indikatorer: tabellen gentager ikke den nationale vægt - den står i overblikket", () => {
  // Kun synlig tekst: begrundelsen bag "Biler pr. indbygger" nævner transportens
  // vægt i sit hover-forbehold, og det er en begrundelse, ikke en gentagelse.
  const h = renderIndikatorer(bThisted, concito).replace(/<[^>]*>/g, " ");
  assert.ok(!h.includes("1,84 ton"), "transportens vægt står allerede i overblikket");
  assert.ok(!h.includes("af aftrykket"));
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

test("kommunevisning: intet nøgletal på siden står som uafklaret", () => {
  // Et hovednøgletal, hvis retning ikke kan afgøres for kommunen, tages af siden
  // (se beregnKommune). Et hjælpetal har aldrig haft en retning at give - det
  // står for at forklare et andet tal - og får derfor intet mærkat. Testen
  // kører både på en kommune uden og en med et spærrende forbehold.
  const spaerret = beregnKommune({ ...thisted, affald_indberetning: "bekraeftet_fejl" }, land);
  for (const b of [bThisted, spaerret]) {
    const h = renderKommune(b, concito, ens);
    assert.ok(!h.includes("retningen kan ikke afgøres"), `${b.navn}: mærkatet står der stadig`);
    assert.ok(!/uafklaret/i.test(h), `${b.navn}: "uafklaret" står der stadig`);
  }
});

test("indikatorer: hjælpetal uden retning står i tabellen med begrundelse, men uden mærkat", () => {
  const h = renderIndikatorer(bThisted, concito);
  for (const navn of ["Befolkningsudvikling"]) {
    const i = h.indexOf(`>${navn}<`);
    assert.ok(i > -1, `${navn} skal stå i tabellen`);
    const raekke = h.slice(i, h.indexOf("</tr>", i));
    assert.ok(raekke.includes("data-tip="), `${navn}: begrundelsen skal stå ved ikonet`);
    assert.ok(!raekke.includes("rounded-full"), `${navn}: intet mærkat`);
  }
});

test("indikatorer: pendlingsafstand vises i km, ikke omregnet", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(h.includes("Gennemsnitlig pendlingsafstand"));
  assert.ok(h.includes("23,6"), "Thisteds faktiske km skal stå der");
  assert.ok(!h.includes("bil-km"), "der må ikke stå en omregnet bil-km-værdi");
});

// --- Hullerne ---

test("fødevarer: hullet står én gang, i overblikket, med Energistyrelsens tal", () => {
  // Afsnittet om hullerne gentog fødevarerne med CONCITO's 2,5 ton (20 %), mens
  // overblikket stod med Energistyrelsens 1,65 ton (17,0 %): to nationale tal for
  // samme kategori på samme side. Energistyrelsens er de nyeste og summerer til
  // hovedtallet, så de står alene.
  const h = renderKommune(bThisted, concito, ens);
  const foede = ens.kategorier.find((k) => k.navn === "Føde- og drikkevarer");
  assert.equal((h.match(/Ingen kommunal indikator/g) || []).length, 1);
  assert.ok(h.includes(`${tal(foede.ton, 2)} ton`), "Energistyrelsens tal skal stå");
  assert.ok(!h.includes("2,5 ton"), "CONCITO's fødevaretal må ikke stå ved siden af");
  assert.ok(!/femtedel/.test(h));
  assert.ok(!renderHuller(concito).includes("Fødevarer"));
});

test("huller: forklarer hvorfor der ikke beregnes et samlet tal", () => {
  const h = renderHuller(concito);
  assert.ok(h.includes("NIRAS"));
  for (const a of concito.niras_anbefalinger) {
    // Offentligt forbrug kræver ingen data - det har bare ingen kommunal
    // variation, og det står allerede i overblikkets række med samme kilde.
    if (a.omraade === "Offentligt forbrug og investeringer") {
      assert.ok(!h.includes(a.omraade), "står allerede i overblikket");
      continue;
    }
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

// Én kategoris række i overblikket: fra navnet til næste kategori.
const kategoriAfsnit = (h, navn) => {
  const start = h.indexOf(`>${navn}<`);
  const naeste = ens.kategorier.map((k) => h.indexOf(`>${k.navn}<`)).filter((i) => i > start);
  return h.slice(start, naeste.length ? Math.min(...naeste) : undefined);
};

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
  assert.ok(h.includes("landsgennemsnittet"), "landsgennemsnittet står stadig");
});

test("overblik: hjælpetal fylder ikke overblikket", () => {
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(!h.includes("Befolkningsudvikling"));
  assert.ok(!h.includes("Fritidshuse pr. helårsbolig"));
});

test("overblik: siger eksplicit at det ikke er en prioritering", () => {
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(h.includes("ikke en prioritering"));
});

test("indikatorer: alle nøgletal står i én tabel uden foldning", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(!h.includes("<details"), "fem klik for at se nitten rækker er ikke et overblik");
  const raekker = (h.match(/<tr/g) || []).length;
  const grupper = bThisted.grupper.length;
  assert.equal(raekker, bThisted.drivere.length + grupper + 1,
    "én række pr. nøgletal, én overskrift pr. kategori, plus tabelhovedet");
});

test("kommunevisning: den nationale vægt står én gang pr. kategori", () => {
  // Stod før både i overblikket og i tabellens gruppeoverskrifter, med hver sin
  // afrunding (1,84 ton og 1,8 ton).
  // Kun synlig tekst - et hover-forbehold må gerne henvise til vægten.
  const h = renderKommune(bThisted, concito, ens).replace(/<[^>]*>/g, " ");
  for (const k of ens.kategorier) {
    const antal = h.split(`${tal(k.ton, 2)} ton`).length - 1;
    assert.equal(antal, 1, `${k.navn}: ${antal} gange`);
  }
});

test("kommunevisning: forbeholdene står ikke gentaget", () => {
  const h = renderKommune(bThisted, concito, ens);
  const antal = (s) => h.split(s).length - 1;
  assert.equal(antal("ikke en prioritering"), 1);
  assert.ok(antal("vælger ikke kategori") <= 1);
  assert.ok(!h.includes("Hvad tallet er"), "boksen gentog bundforbeholdet");
});

test("overblik: linker til tabellen, hvor tallene står", () => {
  assert.ok(renderKategorioverblik(bThisted, ens).includes('href="#noegletal"'));
  assert.ok(renderIndikatorer(bThisted, concito).includes('id="noegletal"'));
});

// --- Signalmærkater ---

test("signalmærkat: farven er aldrig eneste bærer af betydning", () => {
  // Cirka 8 % af mænd er farveblinde. Tekst og symbol skal stå ved siden af.
  const h = renderIndikatorer(bThisted, concito);
  for (const tekst of ["peger mod højere udledning"]) {
    assert.ok(h.includes(tekst), `signalet "${tekst}" mangler sin tekst`);
  }
});

test("signalmærkat: hvert nøgletal bærer sin begrundelse", () => {
  const h = renderIndikatorer(bThisted, concito);
  // Befolkningsudviklingen er eksemplet på en retning, der ikke må gættes.
  assert.ok(h.includes("væksten peger ikke selv mod en højere eller lavere udledning"),
    "befolkningsudviklingens begrundelse skal stå ved ikonet");
});

test("indikatortabel: har en kolonne for hvad nøgletallet peger mod", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(h.includes("Peger mod"));
});

test("overblik: forklarer at værdi og udledningsretning ikke er det samme", () => {
  // En lav el-bilandel er en lav VÆRDI, men peger mod en høj UDLEDNING.
  // Uden den forklaring ser mærkatet ud som en fejl.
  const h = renderKategorioverblik(bThisted, ens);
  assert.ok(h.includes("færre elbiler er en lavere andel, men peger mod højere udledning"),
    "det konkrete eksempel skal stå der");
});

test("affald: kommune uden forbehold får sit retningsmærkat", () => {
  const k = { ...thisted, affald_indberetning: null };
  const t = driverTabel(k, land);
  const affald = t.find((d) => d.navn === "Husholdningsaffald");
  const genanv = t.find((d) => d.navn === "Genanvendelsesprocent");
  assert.notEqual(affald.signal, "uafklaret", "mere affald peger mod højere udledning");
  assert.notEqual(genanv.signal, "uafklaret", "mere genanvendelse peger mod lavere");
});

test("affald: kommune der deler indberetning får retningen holdt tilbage", () => {
  const k = { ...thisted, affald_indberetning: "bekraeftet_fejl" };
  const t = driverTabel(k, land);
  for (const navn of ["Husholdningsaffald", "Genanvendelsesprocent"]) {
    assert.equal(t.find((d) => d.navn === navn).signal, "uafklaret",
      `${navn}: tonnagen er byttet med en anden kommunes, retningen kan ikke bæres`);
  }
});

test("affald: usædvanligt udsving holder IKKE retningen tilbage, men oplyses", () => {
  // Et stort udsving er ikke et bevis for, at tallet er forkert - små øer
  // springer af naturlige grunde. Retningen vises, forbeholdet står ved siden af.
  const k = { ...thisted, affald_indberetning: "usikker_spring" };
  const t = driverTabel(k, land);
  const affald = t.find((d) => d.navn === "Husholdningsaffald");
  assert.notEqual(affald.signal, "uafklaret", "retningen vises");
  assert.match(affald.begrundelse, /udsving/i, "men udsvinget skal nævnes");
});

test("affald: forbeholdet gælder KUN affaldsnøgletallene", () => {
  const k = { ...thisted, affald_indberetning: "bekraeftet_fejl" };
  const t = driverTabel(k, land);
  // Et nøgletal med en afklaret retning: står det stadig med sin retning, kan
  // forbeholdet ikke have smittet. Et uafklaret nøgletal ville bestå uanset.
  const biler = t.find((d) => d.navn === "Biler pr. indbygger");
  assert.notEqual(biler.signal, "uafklaret",
    "en affaldsindberetningsfejl må ikke smitte af på andre nøgletal");
});

// --- Affaldstallenes kommunefordeling (DST-indberetningsfejl) ---

test("affald: forbeholdet følger kommunen, ikke nøgletallet", () => {
  // Tidligere stod begge affaldsnøgletal som uafklarede for ALLE 98 kommuner.
  // Det var for groft: DST's fejl rammer de kommuner, der deler indberetning
  // med hinanden, ikke de øvrige 85. Samme nøgletal, to kommuner, to udfald.
  const spaerret = driverTabel({ ...thisted, affald_indberetning: "bekraeftet_fejl" }, land);
  const ren = driverTabel({ ...thisted, affald_indberetning: null }, land);
  const find = (t, navn) => t.find((x) => x.navn === navn);
  for (const navn of ["Husholdningsaffald", "Genanvendelsesprocent"]) {
    assert.equal(find(spaerret, navn).signal, "uafklaret", `${navn} spærret`);
    assert.notEqual(find(ren, navn).signal, "uafklaret", `${navn} fri`);
  }
});

test("affald: forbeholdet forklarer fejlen og siger at tallet ikke er rettet", () => {
  const h = renderIndikatorer(beregnKommune(thisted, land), concito);
  assert.ok(h.includes("kommunefordelte affaldsmængder er mere usikre"),
    "DST's eget forbehold skal citeres");
  assert.ok(h.includes("ikke rettet her"),
    "det skal fremgå, at værktøjet ikke retter kildens tal");
});

test("affald: begge affaldstal står i tabellen som kontekst, men tæller ikke i overblikket", () => {
  // Husholdningsaffald og genanvendelsesprocent er kontekst, ikke mål for forbruget.
  // Målt 2026-09-15 over de 91 kommuner, hvor affaldet vises, fulgte affaldet ikke
  // indkomsten (r = -0,25) og pegede oftere den modsatte vej. I Forbrugsprodukter og
  // services er det derfor kun disponibel indkomst, der afgør retningen.
  const overblik = renderKategorioverblik(bThisted, ens);
  const tabel = renderIndikatorer(bThisted, concito);
  for (const navn of ["Husholdningsaffald", "Genanvendelsesprocent"]) {
    const d = bThisted.drivere.find((x) => x.navn === navn);
    assert.equal(d.rolle, "hjaelper", navn);
    assert.notEqual(d.signal, "uafklaret", `${navn}: retningen står stadig i tabellen`);
    assert.ok(tabel.includes(`>${navn}<`), `${navn} skal stå i tabellen`);
    assert.ok(!overblik.includes(navn), `${navn} må ikke stå i overblikket`);
  }
  // Meget affald (+29 %) flytter ikke mærkatet: indkomsten peger mod lavere.
  const meget = renderKategorioverblik(beregnKommune({ ...thisted, affald_kg: 700 }, land), ens);
  assert.ok(kategoriAfsnit(meget, "Forbrugsprodukter og services")
    .includes(">peger mod lavere udledning<"));
});

// --- Nøgletal, hvis retning ikke kan afgøres for kommunen, vises ikke ---

const bSpaerret = beregnKommune({ ...thisted, affald_indberetning: "bekraeftet_fejl" }, land);

test("udeladt: nøgletallet har ingen række, men nævnes under tabellen med begrundelsen", () => {
  // Et hul skal forklares, ikke gemmes. Uden noten ville en koordinator lede
  // efter affaldstallene uden at kunne se, om de mangler eller er glemt.
  const h = renderIndikatorer(bSpaerret, concito);
  const slut = h.indexOf("</table>");
  const tabel = h.slice(0, slut);
  const under = h.slice(slut);
  for (const navn of ["Husholdningsaffald", "Genanvendelsesprocent"]) {
    assert.ok(!tabel.includes(`>${navn}<`), `${navn} må ikke have en række`);
    assert.ok(under.includes(navn), `${navn} skal nævnes under tabellen`);
  }
  assert.ok(under.includes("deler affaldsindberetning"), "begrundelsen skal stå");
  assert.equal((under.match(/deler affaldsindberetning/g) || []).length, 1,
    "to nøgletal med samme begrundelse deler én note");
});

test("udeladt: ingen note, når intet er taget af siden", () => {
  const h = renderIndikatorer(bThisted, concito);
  assert.ok(!h.includes("Vises ikke for"));
});

test("udeladt: overblikket tæller ikke nøgletallet med", () => {
  const h = renderKategorioverblik(bSpaerret, ens);
  assert.ok(!h.includes("Husholdningsaffald"));
  assert.ok(!h.includes("Genanvendelsesprocent"));
});

// --- Fritidshuse: husholdningstallene er fordelt på samtlige boliger ---

// Thisted har 20.218 helårsboliger i fixturen.
const medHusholdning = (fritidshuse) => ({
  ...thisted, fritidshuse, husholdning_co2_ton: 19000, husholdning_energi_tj: 900,
  husholdning_fossil_andel: 0.05, husholdning_el_tj: 100, husholdning_el_co2_ton: 2000,
});
const landHusholdning = {
  ...land, fritidshuse: 224795, husholdning_co2_ton: 3343924,
  husholdning_energi_tj: 155250, husholdning_fossil_andel: 0.098,
  husholdning_el_tj: 30000, husholdning_el_co2_ton: 900000,
};

test("fritidshuse: flere fritidshuse end helårsboliger holder retningen tilbage pr. bolig", () => {
  // Et fritidshus bruger mindre energi end en helårsbolig, så fordelingen på
  // samtlige boliger trækker gennemsnittet ned med en størrelse, der ikke kan
  // opgøres. Et "lavere" ville da være fordelingens, ikke kommunens.
  const t = driverTabel(medHusholdning(25000), landHusholdning);
  for (const navn of ["Husholdningernes CO2 fra energi", "Husholdningernes energiforbrug"]) {
    const d = t.find((x) => x.navn === navn);
    assert.equal(d.signal, "uafklaret", `${navn}: gennemsnittet er trukket ned`);
    assert.match(d.begrundelse, /flere fritidshuse end helårsboliger/);
  }
});

test("fritidshuse: under grænsen står retningen som normalt", () => {
  const d = driverTabel(medHusholdning(3000), landHusholdning)
    .find((x) => x.navn === "Husholdningernes CO2 fra energi");
  assert.notEqual(d.signal, "uafklaret");
  assert.notEqual(d.signal, "ukendt", "testen må ikke bestå, fordi tallet mangler");
  assert.doesNotMatch(d.begrundelse, /flere fritidshuse end helårsboliger/);
});

test("fritidshuse: den fossile andel rammes ikke - den er ikke fordelt på boliger", () => {
  const d = driverTabel(medHusholdning(25000), landHusholdning)
    .find((x) => x.navn === "Fossil andel af husholdningernes energi");
  assert.notEqual(d.signal, "uafklaret");
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
  // Greve mangler affaldstallene i fixturen og har alene ingen fordeling at vise.
  assert.equal(beregnFordeling([greve], land)["Husholdningsaffald"], null);
});

test("fordeling: n tæller kommuner MED en afvigelse, ikke antal kommuner", () => {
  // Greve mangler affaldstallene i fixturen. Et hardkodet "af 98" ville påstå
  // en dækning, værktøjet ikke har.
  const f = fordeling["Husholdningsaffald"];
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
  const h = renderIndikatorer(b, concito);
  const raekker = (h.match(/<tr/g) || []).length;
  assert.equal(raekker, b.drivere.length + b.grupper.length + 1,
    "al ny tekst skal ind i eksisterende celler");
});

test("procentpoint: andele viser både relativ procent og procentpoint", () => {
  const b = beregnKommune(thisted, land);
  const d = b.drivere.find((x) => x.navn === "Fossil-andel");
  assert.ok(d.procentpoint != null, "andele skal bære procentpoint");
  // Den relative afvigelse skal være UÆNDRET - procentpoint er et visningsfelt.
  assert.ok(Math.abs(d.afvigelse - (d.kommuneVaerdi - d.landVaerdi) / d.landVaerdi) < 1e-9);
  const h = renderIndikatorer(b, concito);
  assert.ok(h.includes("procentpoint"), "procentpoint skal stå i tabellen");
});

test("procentpoint: nøgletal der ikke er andele får ingen procentpoint", () => {
  const t = driverTabel(thisted, land);
  for (const navn of ["Disponibel indkomst", "Biler pr. indbygger",
                      "Fritidshuse pr. helårsbolig"]) {
    assert.equal(t.find((x) => x.navn === navn).procentpoint, null,
      `${navn} er ikke en andel af en helhed`);
  }
});

test("tærskelfordeling: metodetabellen genereres og udelader nøgletal uden afvigelse", () => {
  const h = renderTaerskelfordeling(fordeling);
  assert.ok(h.includes("Markant"), "tabellen skal have en markant-kolonne");
  assert.ok(h.includes("Fossil-andel"));
  assert.ok(!h.includes("Husholdningernes CO2 fra energi"),
    "nøgletal uden afvigelse hører ikke til");
  assert.ok(!h.includes("undefined") && !h.includes("NaN"));
});

test("overblik: ethvert nøgletal med en retning når overblikket", () => {
  // Overblikket finder nøgletallene ved at matche på Energistyrelsens
  // kategorinavne. Et nøgletal i en kategori, der ikke findes dér, bliver
  // stille væk fra overblikket, mens det står i tabellen. Sådan faldt
  // disponibel indkomst ud i sin egen kategori "På tværs af kategorier".
  // Kun hjælpetal må stå uden for. Kontekst-kategorien er væk: dens nøgletal
  // gentog andre nøgletal og er taget af siden.
  const navne = new Set(ens.kategorier.map((k) => k.navn));
  const udenfor = bThisted.drivere.filter((d) =>
    d.rolle !== "hjaelper" && !navne.has(d.kategori));
  assert.deepEqual(udenfor.map((d) => d.navn), []);
});

test("overblik: disponibel indkomst tæller under Forbrugsprodukter og services", () => {
  // CONCITO (2023) s. 27 og NIRAS (2024) s. 27 kobler indkomsten til mængden
  // af varer og tjenesteydelser. Se begrundelsen i beregning.js.
  const h = renderKategorioverblik(bThisted, ens);
  const start = h.indexOf("Forbrugsprodukter og services");
  const slut = h.indexOf("Offentligt forbrug", start);
  assert.ok(start > -1 && slut > start);
  assert.ok(h.slice(start, slut).includes("Disponibel indkomst"));
});

test("overblik: et lille udsving står som 'peger lidt' og flytter ikke konklusionen", () => {
  // Tæller, vejer ikke: talte et udsving på 6 % med i konklusionen, ville det stå
  // lige med et på 40 %. Greves transport har ét nøgletal på 10 % eller mere, der
  // peger mod lavere udledning, og et lille, der peger den anden vej.
  const afsnit = kategoriAfsnit(renderKategorioverblik(bGreve, ens), "Transport");
  assert.ok(afsnit.includes("peger lidt mod højere udledning"), "det lille udsving står som lidt");
  assert.ok(afsnit.includes(">peger mod lavere udledning<"), "konklusionen tæller kun det store");
  assert.ok(!afsnit.includes("hver sin retning"));
});

test("overblik: peger alle nøgletal kun lidt, siger mærkatet det", () => {
  const b = beregnKommune({ ...thisted, disp_indkomst: 280000, genanvendelse_pct: 56 }, land);
  const afsnit = kategoriAfsnit(renderKategorioverblik(b, ens), "Forbrugsprodukter og services");
  assert.ok(afsnit.includes(">peger kun lidt<"), "mærkatet skal sige lidt");
});

test("overblik: nøgletal, der tæller, står først, og hver retning samlet", () => {
  // Greves transport: el- og plugin-hybridandelen afviger 27,6 % og tæller. Af de
  // små udsving peger biler op (+4,7 %), fossil-andel og pendling ned (-8,5 og -8,4 %).
  const afsnit = kategoriAfsnit(renderKategorioverblik(bGreve, ens), "Transport");
  const i = (navn) => afsnit.indexOf(navn);
  assert.ok(i("El- og plugin-hybridandel") > -1);
  assert.ok(i("El- og plugin-hybridandel") < i("Biler pr. indbygger"));
  assert.ok(i("Biler pr. indbygger") < i("Fossil-andel"), "det, der peger op, står samlet før det, der peger ned");
  assert.ok(i("Fossil-andel") < i("Gennemsnitlig pendlingsafstand"), "største udsving først");
});

test("overblik: nøgletal uden data nævnes med ordene 'ingen data'", () => {
  // Thisteds fixtur mangler husholdningstallene. De må ikke forsvinde tavst fra
  // overblikket, når de står med tankestreg i tabellen.
  const afsnit = kategoriAfsnit(renderKategorioverblik(bThisted, ens), "Energi og forsyning");
  assert.ok(afsnit.includes("Husholdningernes CO2 fra energi"));
  assert.ok(afsnit.includes("ingen data"));
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

test("tabel: hvert nøgletal bærer sin enhed", () => {
  // "14,1" uden enhed er ikke et tal, en læser kan bruge. Enhederne står i
  // tabellen, fordi tallene gør.
  const h = renderIndikatorer(bThisted, concito);
  for (const d of bThisted.drivere) {
    assert.ok(h.includes(`>${d.enhed}<`), `${d.navn}: mangler enheden ${d.enhed}`);
  }
});

test("overblik: viser ingen nøgletalsværdier - de står kun i tabellen", () => {
  // Overblikket gentog før hele tabellen som kort: kommunens værdi, landets og
  // forskellen for hvert nøgletal. Nu siger det kun, hvilken vej hvert nøgletal
  // peger. Tallene står én gang, i tabellen.
  const overblik = renderKategorioverblik(bThisted, ens);
  const tabel = renderIndikatorer(bThisted, concito);
  const forskelle = bThisted.drivere
    .filter((d) => d.afvigelse != null && d.afvigelse !== 0 && d.type !== "difference")
    .map((d) => pct(d.afvigelse));
  assert.ok(forskelle.length > 5, "testen skal have noget at måle på");
  for (const f of forskelle) {
    assert.ok(!overblik.includes(f), `overblikket gentager ${f}`);
    assert.ok(tabel.includes(f), `tabellen mangler ${f}`);
  }
  assert.ok(!/landet\s/.test(overblik), "ingen landsværdi i overblikket");
});

test("overblik: konklusionen er et kort mærkat, ikke en sætning", () => {
  // Tæller, vejer ikke. Mærkatet siger, hvilken vej de nøgletal, der afviger
  // 10 % eller mere, peger - aldrig at kategorien som helhed ligger højt.
  const h = renderKategorioverblik(bThisted, ens);
  const forventet = {
    "Transport": "peger mod højere udledning",
    "Forbrugsprodukter og services": "peger mod lavere udledning",
    "Energi og forsyning": "peger mod lavere udledning",
    "Bolig og byggeri": "peger mod lavere udledning",
  };
  for (const [kategori, maerkat] of Object.entries(forventet)) {
    assert.ok(kategoriAfsnit(h, kategori).includes(`>${maerkat}<`), `${kategori}: ${maerkat}`);
  }
  // Med kort pendling (-34 %) trækker transportens nøgletal hver sin vej.
  const modsat = renderKategorioverblik(
    beregnKommune({ ...thisted, pendlingsafstand_km: 15 }, land), ens);
  assert.ok(kategoriAfsnit(modsat, "Transport").includes(">trækker i hver sin retning<"));
  assert.ok(!/afviger 10 % eller mere, peger/.test(h), "den gamle sætning er væk");
  assert.ok(!/nøgletal peger mod højere udledning og/.test(h));
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
