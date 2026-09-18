import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune, optaelSignaler, beregnFordeling, driverTabel,
         samletRetning } from "../web/beregning.js";
import { renderNationaltAftryk, renderIndikatorer, renderHuller,
         renderKommuneOverskrift, renderKommune,
         renderTaerskelfordeling, renderEnsKategorier, tal, pct } from "../web/render.js";
import { land, thisted, greve } from "./fixtures.js";

const concito = JSON.parse(readFileSync(new URL("../web/data/concito.json", import.meta.url)));
const ens = JSON.parse(readFileSync(new URL("../web/data/ens.json", import.meta.url)));
const sources = JSON.parse(readFileSync(new URL("../web/data/sources.json", import.meta.url)));
const bThisted = beregnKommune(thisted, land);
const bGreve = beregnKommune(greve, land);

// Kommunesiden har ét nøgletalsafsnit. Kategorioverblikket lå tidligere som en
// egen sektion øverst og sagde med mærkater, hvad tabellen sagde igen med tal;
// vægt, beskrivelse, samlet retning og tal står nu samlet pr. kategori.
const noegletal = (b) => renderIndikatorer(b, concito, ens, sources);
const side = (b) => renderKommune(b, concito, ens, sources);

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
  const h = noegletal(bThisted);
  const iTransport = h.indexOf("Transport");
  const iBolig = h.indexOf("Bolig og byggeri");
  assert.ok(iTransport >= 0 && iBolig > iTransport,
    "Energistyrelsens vægt sætter transport først og bolig og byggeri sidst");
});

test("indikatorer: hver kategori viser sin nationale vægt én gang", () => {
  // Vægten stod før i et overblik for sig og måtte derfor ikke stå i tabellen.
  // Nu er de to ét afsnit, og vægten hører til i kategoriens overskrift - men
  // stadig kun ét sted. Kun synlig tekst: begrundelsen bag "Biler pr. indbygger"
  // nævner transportens vægt i sit hover-forbehold, og det er en begrundelse.
  const h = noegletal(bThisted).replace(/<[^>]*>/g, " ");
  for (const k of ens.kategorier) {
    assert.equal(h.split(`${tal(k.ton, 2)} ton`).length - 1, 1,
      `${k.navn}: vægten skal stå præcis én gang`);
    assert.ok(h.includes(`${tal(k.pct, 1)}`), `${k.navn}: andelen af aftrykket mangler`);
  }
  assert.ok(h.includes("af Danmarks forbrugsbaserede udledninger"),
    "andelen skal sige, hvad den er en andel af");
});

test("indikatorer: manglende værdi vises som tankestreg", () => {
  const h = noegletal(bGreve);
  assert.ok(h.includes("–"));
});

test("indikatorer: bruger egen tooltip, ikke browserens title", () => {
  const h = noegletal(bThisted);
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
    const h = side(b);
    assert.ok(!h.includes("retningen kan ikke afgøres"), `${b.navn}: mærkatet står der stadig`);
    assert.ok(!/uafklaret/i.test(h), `${b.navn}: "uafklaret" står der stadig`);
  }
});

test("indikatorer: hjælpetal uden retning står i tabellen med begrundelse, men uden mærkat", () => {
  const h = noegletal(bThisted);
  for (const navn of ["Befolkningsudvikling"]) {
    const i = h.indexOf(`>${navn}<`);
    assert.ok(i > -1, `${navn} skal stå i tabellen`);
    const raekke = h.slice(i, h.indexOf("</tr>", i));
    assert.ok(raekke.includes("data-tip="), `${navn}: begrundelsen skal stå ved ikonet`);
    assert.ok(!raekke.includes("rounded-full"), `${navn}: intet mærkat`);
  }
});

test("indikatorer: pendlingsafstand vises i km, ikke omregnet", () => {
  const h = noegletal(bThisted);
  assert.ok(h.includes("Gennemsnitlig pendlingsafstand"));
  assert.ok(h.includes("23,6"), "Thisteds faktiske km skal stå der");
  assert.ok(!h.includes("bil-km"), "der må ikke stå en omregnet bil-km-værdi");
});

// --- Hullerne ---

test("fødevarer: står med ét nationalt tal og har nu et kommunalt nøgletal", () => {
  // Afsnittet om hullerne gentog fødevarerne med CONCITO's 2,5 ton (20 %), mens
  // overblikket stod med Energistyrelsens 1,65 ton (17,0 %): to nationale tal for
  // samme kategori på samme side. Energistyrelsens er de nyeste og summerer til
  // hovedtallet, så de står alene.
  //
  // Kategorien stod også som blind med "Ingen kommunal indikator". Det passer
  // ikke længere: Osei-Owusu et al. (2020) fordeler fødevareforbruget på alle 98
  // kommuner. Sætningen må ikke blive stående nogen steder på siden.
  const h = side(bThisted);
  const foede = ens.kategorier.find((k) => k.navn === "Føde- og drikkevarer");
  assert.ok(!h.includes("Ingen kommunal indikator"),
    "fødevarerne har et nøgletal og er ikke længere en blind kategori");
  assert.ok(h.includes("Fødevareforbrug pr. indbygger"), "nøgletallet skal stå");
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

test("kommunevisning: ét nøgletalsafsnit, ikke et overblik og en tabel", () => {
  // Overblikket sagde med mærkater, hvad tabellen sagde igen med tal, og
  // læseren skulle holde de to steder op mod hinanden for at se, hvad et
  // mærkat byggede på. Det er nu ét afsnit.
  const h = side(bThisted);
  assert.ok(!h.includes("Forbrugskategorier i"), "det gamle overblik er væk");
  assert.equal((h.match(/id="noegletal"/g) || []).length, 1, "ét afsnit med nøgletal");
  const iNavn = h.indexOf("Thisted");
  const iTabel = h.indexOf("Alle nøgletal for");
  const iHuller = h.indexOf("Hvad værktøjet ikke kan vise");
  assert.ok(iNavn < iTabel && iTabel < iHuller,
    `rækkefølge forkert: ${[iNavn, iTabel, iHuller]}`);
});

test("kommunevisning: intet output indeholder undefined, NaN eller null", () => {
  for (const b of [bThisted, bGreve]) {
    const h = side(b);
    assert.ok(!h.includes("undefined"), `${b.navn}: undefined`);
    assert.ok(!h.includes("NaN"), `${b.navn}: NaN`);
    assert.ok(!/>\s*null\s*</.test(h), `${b.navn}: null`);
  }
});

test("kommunevisning: intet samlet aftryk i ton påstås", () => {
  const h = side(bThisted);
  assert.ok(!/aftryk pr\. borger/i.test(h), "værktøjet beregner ikke et kommunalt aftryk");
  assert.ok(h.includes("lægger dem ikke sammen"), "det skal siges eksplicit");
});

test("kommunevisning: bundforbeholdet overlever embed-tilstand", () => {
  const h = side(bThisted);
  const i = h.lastIndexOf("Uofficielt værktøj");
  assert.ok(i > 0);
  const afsnit = h.slice(h.lastIndexOf("<section", i), i);
  assert.ok(!afsnit.includes("no-embed"));
});

test("kommunevisning: et kompakt forbehold står ØVERST i embed-tilstand", () => {
  // Sidehovedets banner bærer .no-embed og forsvinder i en iframe. Uden dette
  // møder en læser på en fremmed side tallene uden at vide, hvem der står bag,
  // indtil de har scrollet forbi hele tabellen.
  const h = side(bThisted);
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

// --- Kategoriafsnittene ---

// Ét kategoriafsnit: hele kategoriens eget kort.
//
// Sliced tidligere fra kategorinavnet til det næste navn. Det holdt ikke, da
// kategorierne blev foldbare: <details> og <summary> åbner FØR overskriften, så
// hvert udsnit fik den næste kategoris foldning med og så foldbar ud, også når
// det var en kategori uden nøgletal.
const kategoriAfsnit = (h, navn) => {
  const kort = h.split('<section class="kategori-print').slice(1);
  const fundet = kort.find((s) => s.includes(`>${navn}<`));
  assert.ok(fundet, `kategorien ${navn} findes ikke i outputtet`);
  // Det sidste kort løber ellers videre ned i den lille skrift under afsnittene.
  const fodnote = fundet.indexOf('<p class="mt-5 border-t');
  return fodnote === -1 ? fundet : fundet.slice(0, fodnote);
};

test("nøgletal: alle Energistyrelsens kategorier står med, også dem uden nøgletal", () => {
  // Fødevarer og Offentligt forbrug udgør knap 30 % af aftrykket og har nul
  // kommunale nøgletal. Et overblik, der kun viser det, vi kan måle, ville
  // pege koordinatoren mod de forkerte kategorier.
  const h = noegletal(bThisted);
  for (const k of ens.kategorier) {
    assert.ok(h.includes(k.navn), `mangler kategorien ${k.navn}`);
  }
});

test("nøgletal: hver kategori har en beskrivelse og sin andel af aftrykket", () => {
  // En kategori uden beskrivelse er et navn, læseren selv skal tolke, og uden
  // andelen ved man ikke, om man ser på 4,9 eller 21,2 % af aftrykket.
  // Beskrivelsen er Energistyrelsens egen note, så kategorien ikke kan betyde
  // én ting på metodesiden og en anden her.
  const h = noegletal(bThisted);
  for (const k of ens.kategorier) {
    const afsnit = kategoriAfsnit(h, k.navn);
    assert.ok(k.note, `${k.navn}: kilden mangler en beskrivelse i ens.json`);
    assert.ok(afsnit.includes(k.note.slice(0, 40)), `${k.navn}: beskrivelsen mangler`);
    assert.ok(afsnit.includes(`${tal(k.pct, 1)}&nbsp;%`), `${k.navn}: andelen mangler`);
    assert.ok(afsnit.includes("af Danmarks forbrugsbaserede udledninger"),
      `${k.navn}: andelen skal sige, hvad den er en andel af`);
  }
});

test("nøgletal: andelene er Energistyrelsens og summerer til hele aftrykket", () => {
  // Andelen må ikke være regnet her. Summen er kildens egen og går op på
  // afrundingen nær - det er selve grunden til at bruge Energistyrelsens
  // kategorier frem for CONCITO's, hvis 15 varegrupper ikke summerer til
  // deres eget hovedtal.
  const sum = ens.kategorier.reduce((a, k) => a + k.ton, 0);
  assert.ok(Math.abs(sum - ens.nationalt_aftryk.ton) < 0.01,
    `kategorierne summerer til ${sum}, ikke ${ens.nationalt_aftryk.ton}`);
  const h = noegletal(bThisted);
  assert.ok(h.includes(`Energistyrelsen ${ens.nationalt_aftryk.aar}`),
    "afsnittet skal navngive kilden til vægtene");
});

test("samlet retning: står ved hver kategori med nøgletal, og kun der", () => {
  const h = noegletal(bThisted);
  for (const k of ens.kategorier) {
    const afsnit = kategoriAfsnit(h, k.navn);
    const harNoegletal = bThisted.drivere.some((d) => d.kategori === k.navn);
    assert.equal(afsnit.includes("Samlet retning"), harNoegletal,
      `${k.navn}: samlet retning skal stå netop når der er nøgletal at tælle`);
  }
});

test("nøgletal: kategorier uden nøgletal siger det tydeligt", () => {
  // Eksemplet var først fødevarerne, så Offentligt forbrug. Begge har nu
  // nøgletal - Offentligt forbrug fik dem, da kommunens eget indkøb viste sig
  // at variere og ligge offentligt fremme i DST REGK11. Tilbage står Øvrige
  // investeringer, som varierer givetvis; der findes bare ingen kilde, der
  // fordeler dem. Ordlyden skal sige netop det og ikke "ingen variation".
  const h = noegletal(bThisted);
  const oevrige = kategoriAfsnit(h, "Øvrige investeringer");
  assert.ok(oevrige.includes("Intet kommunalt nøgletal"),
    "investeringerne varierer - der mangler en kilde, ikke variation");
  assert.ok(!oevrige.includes("Ingen kommunal variation"),
    "en kategori uden kilde er ikke en kategori uden variation");
});

test("nøgletal: Offentligt forbrug er ikke længere blind", () => {
  // Kategorien vejer 11,9 % af det nationale aftryk og stod uden ét eneste
  // kommunalt tal, med henvisning til NIRAS (2024) s. 29. Den henvisning var
  // en overfortolkning: NIRAS beskriver, hvordan offentligt forbrug FORDELES
  // i en aftryksmodel, ikke at kommunernes indkøb er ens.
  const afsnit = kategoriAfsnit(noegletal(bThisted), "Offentligt forbrug");
  assert.ok(!afsnit.includes("Ingen kommunal variation"),
    "påstanden om ingen variation skal være væk");
  assert.ok(afsnit.includes("Kommunens driftsindkøb"),
    "kategorien skal have kommunens eget indkøb som nøgletal");
});

test("nøgletal: fødevarerne viser en retning, og dubletten står i begrundelsen", () => {
  // Nøgletallet gentager disponibel indkomst (r = +0,94). Det er accepteret,
  // men det skal stå, hvor læseren ser det, ikke kun i kildekoden.
  const h = noegletal(bThisted);
  assert.ok(!kategoriAfsnit(h, "Føde- og drikkevarer").includes("Ingen kommunal"),
    "kategorien har et nøgletal");
  const d = bThisted.drivere.find((x) => x.navn === "Fødevareforbrug pr. indbygger");
  assert.equal(d.kategori, "Føde- og drikkevarer");
  assert.equal(d.signal, "lavere", "Thisted ligger 11,2 % under landet");
  assert.match(d.begrundelse, /gentager/,
    "dubletten mod indkomsten skal stå i begrundelsen");
});

test("nøgletal: rækkefølgen følger Energistyrelsens vægt, med restposter sidst", () => {
  const h = noegletal(bThisted);
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

test("nøgletal: mærkatet siger 'peger mod', ikke om værdien er høj", () => {
  // El- og plugin-hybridandel er en LAV værdi (18,4 % mod landets 23,5 %), men
  // peger mod HØJERE udledning. Den skelnen forsvandt, da ordet var "markant".
  const h = noegletal(bThisted);
  assert.ok(h.includes("peger mod højere udledning"));
  const d = bThisted.drivere.find((x) => x.navn === "El- og plugin-hybridandel");
  assert.ok(d.kommuneVaerdi < d.landVaerdi, "værdien er lavere end landets");
  assert.equal(d.signal, "højere", "men den peger mod højere udledning");
});

test("nøgletal: sammenligner kun med landsgennemsnittet, ikke med andre kommuner", () => {
  // To tidligere forsøg står som skiltet her: "markant hos 62 af 98" krævede at
  // læseren kendte en skjult tærskel, og spændet ("8 ud af 10 kommuner: X - Y")
  // lagde en tredje talstørrelse oven i kommunens egen værdi og landets. Begge
  // er væk. Tilbage står den ene sammenligning, en kommuneside kan bære.
  const h = noegletal(bThisted);
  assert.ok(!h.includes("markant hos"), "den gamle optælling er væk");
  assert.ok(!/\d+\s*ud af\s*\d+\s*kommuner/i.test(h), "spændet er væk");
  assert.ok(!/spænd/i.test(h), "ingen omtale af et spænd overhovedet");
  assert.ok(h.includes("landsgennemsnittet"), "landsgennemsnittet står stadig");
});

test("samlet retning: hjælpetal står i tabellen, men tæller ikke med", () => {
  // Hjælpetallene forklarer et andet nøgletal. Talte de med, ville de to
  // affaldstal udgøre flertallet over det ene nøgletal, Forbrugsprodukter har.
  // De er mærket i selve tabellen, så optællingen kan tælles efter i rækkerne.
  const h = noegletal(bThisted);
  for (const navn of ["Befolkningsudvikling", "Fritidshuse pr. helårsbolig",
                      "Husholdningsaffald", "Genanvendelsesprocent"]) {
    const d = bThisted.drivere.find((x) => x.navn === navn);
    if (!d) continue;
    assert.equal(d.rolle, "hjaelper", `${navn} skal være et hjælpetal`);
    const i = h.indexOf(`>${navn}<`);
    assert.ok(i > -1, `${navn} skal stå i tabellen`);
    assert.ok(h.slice(i, h.indexOf("</tr>", i)).includes("forklarende"),
      `${navn} skal være mærket som forklarende`);
  }
  for (const g of bThisted.grupper) {
    const s = samletRetning(g.drivere);
    assert.equal(s.talte + s.udenData, g.drivere.filter((d) => d.rolle !== "hjaelper").length,
      `${g.kategori}: kun hovednøgletal tælles`);
  }
});

test("nøgletal: siger eksplicit at det ikke er en prioritering", () => {
  const h = noegletal(bThisted);
  assert.ok(h.includes("ikke en prioritering"));
});

test("foldning: hver kategori med nøgletal kan foldes ud og ind", () => {
  // Nøgletallene stod en periode alle fremme, fordi fem klik for at se nitten
  // rækker ikke er et overblik. Med en kildeangivelse under hvert nøgletal er
  // tabellerne dobbelt så høje, og de syv kategorier kan ikke længere ses på én
  // skærm. Sammenfatningen står fremme; tallene og kilderne er det, der foldes.
  const h = noegletal(bThisted);
  assert.equal((h.match(/<details/g) || []).length, bThisted.grupper.length,
    "én foldning pr. kategori med nøgletal");
  assert.equal((h.match(/<summary/g) || []).length, bThisted.grupper.length);
  assert.equal((h.match(/Vis nøgletal og kilder/g) || []).length, bThisted.grupper.length,
    "hver foldning skal sige, hvad der ligger bag den");
  assert.ok(h.includes("Skjul nøgletal og kilder"), "og hvordan man lukker den igen");
  // Antallet stod tidligere i knappen ("Vis 7 nøgletal med kilder") og modsagde
  // den samlede retning lige ovenfor ("3 af 5 nøgletal"), fordi hjælpetallene
  // ligger bag folden uden at tælle med i retningen.
  assert.ok(!/Vis \d+ nøgletal/.test(h), "knappen må ikke sætte sit eget tal på nøgletallene");
});

test("foldning: afsnittene er lukkede fra start", () => {
  // Formålet med foldningen er det korte overblik over alle syv kategorier.
  // Åbnede de alle ved indlæsning, ville siden se ud præcis som før.
  const h = noegletal(bThisted);
  assert.ok(!/<details[^>]*\sopen/.test(h), "ingen kategori er åben fra start");
  assert.ok(h.includes('id="fold-alle"'), "der skal være en knap, der folder alle ud");
  assert.ok(h.includes("Fold alle ud"));
});

test("foldning: indholdet renderes, det skjules kun", () => {
  // Rækkerne skal stå i HTML'en, også når afsnittet er lukket: print-reglen
  // folder alt ud på papir, og en udskrift skal indeholde det hele. Bygges
  // tabellen først ved klik, står der tomme kategorier på udskriften.
  const h = noegletal(bThisted);
  const raekker = (h.match(/<tr/g) || []).length;
  assert.equal(raekker, bThisted.drivere.length + bThisted.grupper.length,
    "én række pr. nøgletal plus ét tabelhoved pr. kategori med nøgletal");
  for (const d of bThisted.drivere) {
    assert.ok(h.includes(`>${d.navn}<`), `${d.navn} mangler i HTML'en`);
  }
});

test("foldning: en kategori uden nøgletal foldes ikke", () => {
  // En pil, der åbner ind til ingenting, er værre end ingen pil.
  const h = noegletal(bThisted);
  for (const navn of ["Øvrige investeringer"]) {
    const afsnit = kategoriAfsnit(h, navn);
    assert.ok(!afsnit.includes("<details"), `${navn} har intet at folde ud`);
    assert.ok(!afsnit.includes("Vis "), `${navn} må ikke love nøgletal, der ikke findes`);
  }
});

test("foldning: sammenfatningen står fremme, tallene ligger bag folden", () => {
  // Det, en lukket side viser, er vægt, beskrivelse og samlet retning. Ligger
  // et af dem inde i tabellen, er overblikket væk, når alt er foldet ind.
  const h = noegletal(bThisted);
  for (const g of bThisted.grupper) {
    const afsnit = kategoriAfsnit(h, g.kategori);
    const sammenfat = afsnit.slice(0, afsnit.indexOf("</summary>"));
    assert.ok(sammenfat.includes("Samlet retning"), `${g.kategori}: retningen skal stå fremme`);
    assert.ok(sammenfat.includes("af Danmarks forbrugsbaserede udledninger"),
      `${g.kategori}: andelen skal stå fremme`);
    assert.ok(!sammenfat.includes("Kilde: "), `${g.kategori}: kilderne hører bag folden`);
    assert.ok(!sammenfat.includes("<table"), `${g.kategori}: tabellen hører bag folden`);
  }
});

test("kommunevisning: den nationale vægt står én gang pr. kategori", () => {
  // Stod før både i overblikket og i tabellens gruppeoverskrifter, med hver sin
  // afrunding (1,84 ton og 1,8 ton).
  // Kun synlig tekst - et hover-forbehold må gerne henvise til vægten.
  const h = side(bThisted).replace(/<[^>]*>/g, " ");
  for (const k of ens.kategorier) {
    const antal = h.split(`${tal(k.ton, 2)} ton`).length - 1;
    assert.equal(antal, 1, `${k.navn}: ${antal} gange`);
  }
});

test("kommunevisning: forbeholdene står ikke gentaget", () => {
  const h = side(bThisted);
  const antal = (s) => h.split(s).length - 1;
  assert.equal(antal("ikke en prioritering"), 1);
  assert.ok(antal("vælger ikke kategori") <= 1);
  assert.ok(!h.includes("Hvad tallet er"), "boksen gentog bundforbeholdet");
});

test("nøgletal: afsnittet henviser ikke til sig selv", () => {
  // Overblikket linkede ned til tabellen. Der er ikke længere to steder at gå
  // imellem, og et link til afsnittet selv ville sende læseren ingen steder.
  const h = noegletal(bThisted);
  assert.ok(h.includes('id="noegletal"'), "ankeret bliver stående til dybe links");
  assert.ok(!h.includes('href="#noegletal"'), "ingen henvisning til afsnittet selv");
});

// --- Signalmærkater ---

test("signalmærkat: farven er aldrig eneste bærer af betydning", () => {
  // Cirka 8 % af mænd er farveblinde. Tekst og symbol skal stå ved siden af.
  const h = noegletal(bThisted);
  for (const tekst of ["peger mod højere udledning"]) {
    assert.ok(h.includes(tekst), `signalet "${tekst}" mangler sin tekst`);
  }
});

test("signalmærkat: hvert nøgletal bærer sin begrundelse", () => {
  const h = noegletal(bThisted);
  // Befolkningsudviklingen er eksemplet på en retning, der ikke må gættes.
  assert.ok(h.includes("væksten peger ikke selv mod en højere eller lavere udledning"),
    "befolkningsudviklingens begrundelse skal stå ved ikonet");
});

test("indikatortabel: har en kolonne for hvad nøgletallet peger mod", () => {
  const h = noegletal(bThisted);
  assert.ok(h.includes("Peger mod"));
});

test("nøgletal: forklarer at værdi og udledningsretning ikke er det samme", () => {
  // En lav el-bilandel er en lav VÆRDI, men peger mod en høj UDLEDNING.
  // Uden den forklaring ser mærkatet ud som en fejl.
  const h = noegletal(bThisted);
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
  const h = noegletal(beregnKommune(thisted, land));
  assert.ok(h.includes("kommunefordelte affaldsmængder er mere usikre"),
    "DST's eget forbehold skal citeres");
  assert.ok(h.includes("ikke rettet her"),
    "det skal fremgå, at værktøjet ikke retter kildens tal");
});

test("affald: begge affaldstal står i tabellen som kontekst, men tæller ikke med", () => {
  // Husholdningsaffald og genanvendelsesprocent er kontekst, ikke mål for forbruget.
  // Målt 2026-09-15 over de 91 kommuner, hvor affaldet vises, fulgte affaldet ikke
  // indkomsten (r = -0,25) og pegede oftere den modsatte vej. I Forbrugsprodukter og
  // services er det derfor kun disponibel indkomst, der afgør den samlede retning.
  const h = noegletal(bThisted);
  for (const navn of ["Husholdningsaffald", "Genanvendelsesprocent"]) {
    const d = bThisted.drivere.find((x) => x.navn === navn);
    assert.equal(d.rolle, "hjaelper", navn);
    assert.notEqual(d.signal, "uafklaret", `${navn}: retningen står stadig i tabellen`);
    assert.ok(h.includes(`>${navn}<`), `${navn} skal stå i tabellen`);
  }
  // Meget affald (+29 %) flytter ikke den samlede retning: indkomsten peger mod lavere.
  const meget = noegletal(beregnKommune({ ...thisted, affald_kg: 700 }, land));
  const afsnit = kategoriAfsnit(meget, "Forbrugsprodukter og services");
  assert.ok(afsnit.includes(">peger mod lavere udledning<"));
  assert.ok(afsnit.includes("kategoriens ene nøgletal"),
    "optællingen skal vise, at kun ét nøgletal tæller med");
});

// --- Nøgletal, hvis retning ikke kan afgøres for kommunen, vises ikke ---

const bSpaerret = beregnKommune({ ...thisted, affald_indberetning: "bekraeftet_fejl" }, land);

test("udeladt: nøgletallet har ingen række, men nævnes under tabellen med begrundelsen", () => {
  // Et hul skal forklares, ikke gemmes. Uden noten ville en koordinator lede
  // efter affaldstallene uden at kunne se, om de mangler eller er glemt.
  const h = noegletal(bSpaerret);
  const slut = h.lastIndexOf("</table>");
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
  const h = noegletal(bThisted);
  assert.ok(!h.includes("Vises ikke for"));
});

test("udeladt: den samlede retning tæller ikke nøgletallet med", () => {
  // De to affaldstal er taget af siden hos kommuner, der deler indberetning.
  // De er hjælpetal og talte alligevel ikke med, men optællingen må heller ikke
  // få dem med som "uden data": de er ikke ukendte, de er holdt tilbage.
  const produkter = bSpaerret.grupper.find((g) => g.kategori === "Forbrugsprodukter og services");
  const s = samletRetning(produkter.drivere);
  assert.equal(s.talte, 1, "kun disponibel indkomst tæller");
  assert.equal(s.udenData, 0, "de spærrede nøgletal er ikke 'uden data'");
  const afsnit = kategoriAfsnit(noegletal(bSpaerret), "Forbrugsprodukter og services");
  assert.ok(!afsnit.includes(">Husholdningsaffald<"), "nøgletallet har ingen række");
  assert.ok(!afsnit.includes("uden data"), "det spærrede tal må ikke tælles som manglende data");
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
  const h = side(beregnKommune(thisted, land));
  assert.ok(!/\bnr\.\s*\d+\s*af\b/.test(h), "ingen placering");
  assert.ok(!/percentil/i.test(h), "ingen percentil i kommunevisningen");
  assert.ok(!/(laveste|højeste|lavest|højest) i landet/i.test(h), "ingen yderpunkter");
  assert.ok(!/\d+\s*ud af\s*\d+\s*kommuner/i.test(h), "intet spænd");
  assert.ok(!/spænd/i.test(h), "ingen omtale af et spænd overhovedet");
});

test("fordeling: tabellen får ikke flere rækker af den nye kontekst", () => {
  const b = beregnKommune(thisted, land);
  const h = noegletal(b);
  const raekker = (h.match(/<tr/g) || []).length;
  assert.equal(raekker, b.drivere.length + b.grupper.length,
    "al ny tekst skal ind i eksisterende celler");
});

test("procentpoint: andele viser både relativ procent og procentpoint", () => {
  const b = beregnKommune(thisted, land);
  const d = b.drivere.find((x) => x.navn === "Fossil-andel");
  assert.ok(d.procentpoint != null, "andele skal bære procentpoint");
  // Den relative afvigelse skal være UÆNDRET - procentpoint er et visningsfelt.
  assert.ok(Math.abs(d.afvigelse - (d.kommuneVaerdi - d.landVaerdi) / d.landVaerdi) < 1e-9);
  const h = noegletal(b);
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

test("nøgletal: ethvert nøgletal med en retning når sit kategoriafsnit", () => {
  // Afsnittene findes ved at matche på Energistyrelsens kategorinavne. Et
  // nøgletal i en kategori, der ikke findes dér, ville falde helt ud af siden. Sådan faldt
  // disponibel indkomst ud i sin egen kategori "På tværs af kategorier".
  // Kun hjælpetal må stå uden for. Kontekst-kategorien er væk: dens nøgletal
  // gentog andre nøgletal og er taget af siden.
  const navne = new Set(ens.kategorier.map((k) => k.navn));
  const udenfor = bThisted.drivere.filter((d) =>
    d.rolle !== "hjaelper" && !navne.has(d.kategori));
  assert.deepEqual(udenfor.map((d) => d.navn), []);
});

test("nøgletal: disponibel indkomst tæller under Forbrugsprodukter og services", () => {
  // CONCITO (2023) s. 27 og NIRAS (2024) s. 27 kobler indkomsten til mængden
  // af varer og tjenesteydelser. Se begrundelsen i beregning.js.
  const afsnit = kategoriAfsnit(noegletal(bThisted), "Forbrugsprodukter og services");
  assert.ok(afsnit.includes("Disponibel indkomst"));
});

test("samlet retning: alle nøgletal vejer lige, også de små udsving", () => {
  // SKIFTET. Mærkatet talte før kun de nøgletal, der afveg 10 % eller mere, og
  // et lille udsving flyttede ingenting. Nu tæller hvert nøgletal ét: at veje de
  // store tungere ville kræve at vide, hvor meget hvert nøgletal betyder for
  // udledningen, og det tal findes ikke i kilderne.
  //
  // Greves transport: el- og plugin-hybridandelen afviger 27,6 % og peger mod
  // lavere, fossil-andel og pendling peger lidt samme vej, biler lidt modsat.
  // Tre af fire peger mod lavere - det er optællingen, mærkatet viser.
  const afsnit = kategoriAfsnit(noegletal(bGreve), "Transport");
  assert.ok(afsnit.includes("peger lidt mod højere udledning"),
    "det enkelte nøgletal siger stadig, at udsvinget er lille");
  assert.ok(afsnit.includes(">peger mod lavere udledning<"), "den samlede retning");
  assert.ok(afsnit.includes("3 af 4 nøgletal"), "optællingen skal stå, så den kan tælles efter");
  assert.ok(!afsnit.includes("hver sin retning"));

  const s = samletRetning(bGreve.grupper.find((g) => g.kategori === "Transport").drivere);
  assert.deepEqual([s.op, s.ned, s.talte], [1, 3, 4]);
});

test("samlet retning: står lige mange nøgletal i hver retning, siger mærkatet det", () => {
  // Med færre biler og kortere pendling deler Thisteds transport sig to mod to.
  // Mærkatet må ikke vælge en vej, og optællingen skal vise hvorfor.
  const b = beregnKommune({ ...thisted, biler: 20000, pendlingsafstand_km: 20 }, land);
  const afsnit = kategoriAfsnit(noegletal(b), "Transport");
  assert.ok(afsnit.includes(">trækker i hver sin retning<"), "ingen samlet vej");
  assert.ok(afsnit.includes("2 mod 2 nøgletal"), "optællingen skal stå");
});

test("tabel: hovednøgletallene står før hjælpetallene", () => {
  // Rækkefølgen skal svare til optællingen i mærkatet ovenfor: det, der tæller
  // med, står samlet først, og de forklarende tal står efter.
  for (const g of bThisted.grupper) {
    const afsnit = kategoriAfsnit(noegletal(bThisted), g.kategori);
    const plads = (navn) => afsnit.indexOf(`>${navn}<`);
    const hoved = g.drivere.filter((d) => d.rolle !== "hjaelper").map((d) => plads(d.navn));
    const hjaelp = g.drivere.filter((d) => d.rolle === "hjaelper").map((d) => plads(d.navn));
    if (hoved.length === 0 || hjaelp.length === 0) continue;
    assert.ok(Math.max(...hoved) < Math.min(...hjaelp),
      `${g.kategori}: et hjælpetal står før et nøgletal, der tæller med`);
  }
});

test("samlet retning: nøgletal uden data tælles for sig, ikke som nul", () => {
  // Thisteds fixtur mangler husholdningstallene. De står med tankestreg i
  // tabellen og må ikke forsvinde tavst ud af optællingen ovenfor.
  const afsnit = kategoriAfsnit(noegletal(bThisted), "Energi og forsyning");
  assert.ok(afsnit.includes("Husholdningernes CO2 fra energi"));
  assert.ok(afsnit.includes("ingen data"), "rækken siger det med ord");
  assert.ok(afsnit.includes("4 uden data"), "optællingen siger, hvor mange der ikke tæller med");
});

test("nøgletal: den nationale vægt må ikke kunne læses som kommunens eget tal", () => {
  // "Transport 1,84 ton pr. indbygger" på en kommuneside læses ellers som
  // kommunens eget transportaftryk - et tal, værktøjet slet ikke kan opgøre.
  // Både tallet og søjlen er nationale og ens på alle 98 sider.
  const h = noegletal(bThisted);
  const afsnit = kategoriAfsnit(h, "Transport");
  assert.ok(/nationalt[\s\S]{0,80}ton/i.test(afsnit),
    "vægten skal være mærket som national");
  assert.ok(h.includes("ens på alle 98 kommunesider"),
    "introen skal sige, at overskrifterne ikke handler om kommunen");
});

test("nøgletal: kategoriernes overskrifter er byte-identiske for to kommuner", () => {
  // Den maskinelle udgave af påstanden ovenfor: vægt, andel og beskrivelse er
  // nationale og må ikke variere med kommunen. Kun tallene i tabellen gør.
  const nationalt = (b) => (noegletal(b)
    .match(/<h3[\s\S]*?<\/p>/g) || []).map((s) => s.replace(/\s+/g, " "));
  assert.deepEqual(nationalt(bThisted), nationalt(bGreve));
  assert.equal(nationalt(bThisted).length, ens.kategorier.length,
    "én overskrift pr. kategori");
});

test("tabel: hvert nøgletal bærer sin enhed", () => {
  // "14,1" uden enhed er ikke et tal, en læser kan bruge. Enhederne står i
  // tabellen, fordi tallene gør.
  const h = noegletal(bThisted);
  for (const d of bThisted.drivere) {
    assert.ok(h.includes(`>${d.enhed}<`), `${d.navn}: mangler enheden ${d.enhed}`);
  }
});

test("nøgletal: hver værdi står præcis ét sted på siden", () => {
  // Overblikket gentog før hele tabellen som kort: kommunens værdi, landets og
  // forskellen for hvert nøgletal. Det var grunden til at lægge de to sammen,
  // og sammenlægningen må ikke selv genindføre dubletten.
  const h = side(bThisted);
  const forskelle = bThisted.drivere
    .filter((d) => d.afvigelse != null && d.afvigelse !== 0 && d.type !== "difference")
    .map((d) => pct(d.afvigelse));
  assert.ok(forskelle.length > 5, "testen skal have noget at måle på");
  for (const f of forskelle) {
    assert.equal(h.split(f).length - 1, 1, `${f} står mere end ét sted`);
  }
});

test("samlet retning: mærkatet er kort, og regnestykket står under det", () => {
  // Mærkatet siger retningen med to-tre ord, og optællingen står på linjen
  // under. Stod tallene inde i mærkatet, skulle læseren læse en hel sætning for
  // at se, hvilken vej kategorien trak.
  const h = noegletal(bThisted);
  const forventet = {
    "Transport": ["peger mod højere udledning", "alle 4 nøgletal"],
    "Forbrugsprodukter og services": ["peger mod lavere udledning", "kategoriens ene nøgletal"],
    "Energi og forsyning": ["peger mod lavere udledning", "kategoriens ene nøgletal"],
    "Bolig og byggeri": ["peger mod lavere udledning", "kategoriens ene nøgletal"],
  };
  for (const [kategori, [maerkat, taelling]] of Object.entries(forventet)) {
    const afsnit = kategoriAfsnit(h, kategori);
    assert.ok(afsnit.includes(`>${maerkat}<`), `${kategori}: ${maerkat}`);
    assert.ok(afsnit.includes(taelling), `${kategori}: optællingen "${taelling}" mangler`);
  }
  assert.ok(!/afviger 10 % eller mere, peger/.test(h), "den gamle sætning er væk");
  assert.ok(!/nøgletal peger mod højere udledning og/.test(h));
});

test("samlet retning: påstår aldrig noget om kategorien som helhed", () => {
  // Værktøjet har intet mål for kategorien og kan ikke veje nøgletal mod
  // hinanden. Den samlede retning må derfor kun sige, hvad NØGLETALLENE peger
  // mod - og skrive lige ud, at den tæller frem for at veje.
  const h = noegletal(bThisted);
  assert.ok(!/[Kk]ategorien ligger/.test(h));
  assert.ok(!/Transport ligger (over|under)/.test(h));
  assert.ok(h.includes("talt, ikke vejet mod hinanden"),
    "forbeholdet om optælling frem for vægtning skal stå");
  assert.ok(h.includes("Hvert nøgletal tæller ét"),
    "den lige vægtning skal stå med ord, ikke kun i koden");
  assert.ok(/ikke at kategorien som\s+helhed ligger over eller under/.test(h),
    "forbeholdet mod at læse mærkatet som et mål for kategorien skal stå");
});

test("nøgletal: ingen rå HTML-entiteter slipper ud i teksten", () => {
  // esc() ramte engang selve entiteten, fordi den blev sat ind før escaping,
  // så der stod "&middot;" med bogstaver midt i konklusionen.
  for (const b of [bThisted, bGreve]) {
    const h = noegletal(b);
    assert.ok(!h.includes("&amp;middot;"), `${b.navn}: rå &middot;`);
    assert.ok(!h.includes("&amp;nbsp;"), `${b.navn}: rå &nbsp;`);
  }
});

test("enheder: beløb pr. år siger det, så tallet ikke læses som månedligt", () => {
  // 19.738 kr. er ikke åbenlyst forkert som månedstal, bare urealistisk, og så
  // tvivler læseren på tallet i stedet for på enheden. Beløb, der er årlige,
  // skal sige det.
  const h = side(bThisted);
  for (const enhed of ["kr./år", "kr./indb./år"]) {
    assert.ok(h.includes(enhed), `enheden ${enhed} mangler i tabellen`);
  }
  const beloeb = bThisted.drivere.filter((d) => d.enhed.startsWith("kr"));
  assert.ok(beloeb.length >= 2, "der skal være mindst to beløbsnøgletal");
  for (const d of beloeb) {
    assert.ok(d.enhed.endsWith("/år"),
      `${d.navn} har enheden "${d.enhed}" uden tidsangivelse`);
  }
});
