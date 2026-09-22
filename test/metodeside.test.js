// Metodesidens afledte tal skal stemme med datasættet.
//
// HVORFOR DENNE TEST FINDES.
//
// Kildetabellen på metodesiden holder sig selv i takt: den læser sources.json
// og viser den periode, der faktisk blev hentet. Prosaen gør ikke. Ved
// opdateringen til Klimaregnskabet 2024 rådnede fire tal i brødteksten stille -
// el-faktorens spænd, den fælles el-faktor, fødevareforbrugets korrelation med
// indkomsten og landets fossile andel - og de blev kun fundet, fordi nogen bad
// om et eftersyn. Metodesiden er projektets faglige kontrakt; et forkert tal
// dér er værre end et forkert tal hvor som helst andet.
//
// Testen er bygget efter samme mønster som
// test_den_committede_sources_json_er_i_takt_med_katalogets_indhold i
// pipelinen: den genberegner sandheden og holder det committede op imod den.
//
// RANGORDEN: RENDER FØR TEST, TEST FØR PROSA.
//
// En test er den næstbedste løsning. Den fanger et tal, der er løbet fra data,
// men den kræver stadig et menneske til at skrive det rigtige tal ind. Kan en
// oplysning i stedet REGNES af siden selv, hører den ikke hjemme her: de ramte
// kommuner bag hvert forbehold stod længe navngivet i prosaen ("de syv
// ejerkommuner bag Norfors og Reno Djurs (Allerød, ...)") og blev flyttet til
// renderForbehold(), fordi listen afgøres af årets egne tal. Tærskeltabellen og
// kildetabellen er flyttet samme vej tidligere. Overvej altid den vej først.
//
// HVAD DEN FANGER UD OVER FORKERTE TAL.
//
// Fraserne nedenfor fanger et tal, der er blevet forkert. De strukturelle
// vagter nederst fanger en oplysning, der aldrig kom med - siden nævnte fire
// hjælpetal, mens motoren havde fem - og en liste, der er sneget tilbage i
// prosaen, efter at den blev gjort datadrevet.
//
// HVAD DEN IKKE DÆKKER, OG HVORFOR IKKE.
//
// Kun tal, der kan genberegnes af data.json, ens.json og concito.json. Tre
// slags står udenfor med vilje:
//
//   Citater. CONCITO's 11 ton s. 8, Energistyrelsens 42 procent s. 3, NIRAS'
//   afsnitsnumre. De skal sige, hvad rapporten siger, ikke hvad data siger.
//   Fulgte de datasættet, var de ikke længere citater.
//
//   Historiske begrundelser. Tabellen over de fjernede koefficienter,
//   korrelationerne der retfærdiggjorde at tage nettoformue og boligpris af
//   siden, Brøndbys 0,52 mod 0,37 biler. De beskriver en beslutning truffet på
//   datidens tal, og flere af felterne findes ikke i data.json længere.
//   Opdaterede de sig, ville de misrepræsentere hvorfor beslutningen blev taget.
//
//   Tal, der kræver felter, data.json ikke rummer: alderssammensætning,
//   hovedkonto-opdeling, færgeandel, flerårige indkøbstal, regionale FU17-tal.
//   De er markeret med deres opgørelsesår i prosaen i stedet, så læseren kan se
//   hvornår de er målt. De drifter først, når PERIODER flyttes, og dér er der
//   alligevel et menneske inde over.
//
// TILFØJER DU ET AFLEDT TAL TIL METODESIDEN, så skriv det ind nedenfor. Gør du
// ikke, er det kun et spørgsmål om tid, før det siger noget andet end data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnFordeling, beregnForbehold, driverTabel,
         FORBEHOLD_VIRKNING } from "../web/beregning.js";

const data = JSON.parse(readFileSync(new URL("../web/data/data.json", import.meta.url)));
const ENS = JSON.parse(readFileSync(new URL("../web/data/ens.json", import.meta.url)));
const CONCITO = JSON.parse(readFileSync(new URL("../web/data/concito.json", import.meta.url)));
const raaHtml = readFileSync(new URL("../web/metode.html", import.meta.url), "utf8");

/** Siden som ren tekst med samlet mellemrum, så en påstand kan findes uanset
 *  hvor linjeskiftene og taggene ligger. Uden det ville testen knække hver
 *  gang et afsnit blev ombrudt. */
const tekst = raaHtml
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&middot;/g, "·")
  .replace(/\s+/g, " ");

const K = data.kommuner;
const LAND = data.land;
const KWH_PR_TJ = 1e12 / 3.6e6;

/** Pearson-korrelation. Samme regnestykke som de øvrige tests bruger. */
function korr(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const t = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const nx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const ny = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return t / (nx * ny);
}

/** Dansk komma, og fortegnet med. Metodesiden skriver korrelationer med
 *  fortegn, så "0,97" alene ville ikke kunne findes. */
const medFortegn = (v, minus = "-") =>
  (v < 0 ? minus : "+") + Math.abs(v).toFixed(2).replace(".", ",");

const komma = (v, decimaler = 1) => v.toFixed(decimaler).replace(".", ",");

/** Små tal skrives med bogstaver i prosaen. Det er selve grunden til, at
 *  siden IKKE genererer sine tal: en sætning som "fire kommuner står på nul"
 *  skifter både ord og bøjning med værdien. Her er listen kort nok til at
 *  testen kan følge med. */
const TAL_ORD = ["nul", "én", "to", "tre", "fire", "fem", "seks", "syv", "otte", "ni", "ti"];

/** Regionens folketalsvægtede gennemsnit. Vægtet, ikke uvægtet: en region er
 *  sine borgere, ikke sine kommunegrænser, og uvægtet ville Læsø veje som
 *  Aarhus. Metodesidens regionsafsnit er regnet sådan. */
const regionSnit = (felt, filter = () => true) => {
  const valgte = K.filter(filter);
  return valgte.reduce((sum, k) => sum + k[felt] * k.folketal, 0)
    / valgte.reduce((sum, k) => sum + k.folketal, 0);
};

/** Afvigelse fra LANDSTALLET I DATASÆTTET, i procent.
 *
 *  Nulpunktet er det eneste rigtige her, og det var netop dét, der gik galt:
 *  tre tal i regionsafsnittet var regnet mod et folketalsvægtet gennemsnit af
 *  de 98 (288.135 kr.) i stedet for mod land-feltet (287.682 kr.), som er det
 *  landsgennemsnit, kommunesiderne viser. Forskellen er 0,1-0,2 pct.point - nok
 *  til at en læser, der slog Albertslund op, fik et andet tal end metodesiden
 *  lovede. Regn altid mod LAND. */
const afvPct = (v, landVaerdi) => ((v - landVaerdi) / landVaerdi) * 100;

const REGIONER = [...new Set(K.map((k) => k.region))];

const elFaktor = (k) =>
  k.husholdning_el_tj
    ? (k.husholdning_el_co2_ton * 1e6) / (k.husholdning_el_tj * KWH_PR_TJ)
    : null;

// Hvert punkt: hvad tallet er, hvordan det genberegnes, og den sætning det
// skal stå i. Sætningen er med, fordi et bart tal som "+0,97" optræder flere
// gange på siden om vidt forskellige ting.
const PAASTANDE = [
  {
    navn: "kommunens driftsindkøb gentager ikke indkomsten",
    // Metodesiden bruger typografisk minus i dette afsnit.
    frase: () => `(r = ${medFortegn(
      korr(K.map((k) => k.indkoeb_drift_pr_indb), K.map((k) => k.disp_indkomst)), "−")})`,
  },
  {
    navn: "fødevareforbruget gentager indkomsten",
    frase: () => `fødevareforbruget ligger på r = ${medFortegn(
      korr(K.map((k) => k.foedevare_forbrug_pr_indb), K.map((k) => k.disp_indkomst)))}`,
  },
  {
    navn: "husholdningsaffald følger ikke indkomsten",
    // Kun de kommuner, hvor nøgletallet faktisk vises. De, der deler
    // affaldsindberetning, er ude - derfor 91 og ikke 98.
    frase: () => {
      const vist = K.filter((k) => k.affald_kg != null
        && k.affald_indberetning !== "bekraeftet_fejl");
      const r = korr(vist.map((k) => k.affald_kg), vist.map((k) => k.disp_indkomst));
      return `(r = ${medFortegn(r)} over de ${vist.length} kommuner, hvor det vises)`;
    },
  },
  {
    navn: "kommuner hvis egen el-faktor er nul",
    frase: () => {
      const antal = K.map(elFaktor).filter((v) => v != null && v < 0.005).length;
      return `står ${TAL_ORD[antal] ?? antal} kommuner på nul`;
    },
  },
  {
    navn: "højeste kommunale el-faktor",
    frase: () => {
      const v = K.map((k) => ({ f: elFaktor(k), navn: k.navn })).filter((x) => x.f != null);
      const top = v.reduce((a, b) => (b.f > a.f ? b : a));
      return `${top.navn} ligger på ${Math.round(top.f)} g CO2e/kWh`;
    },
  },
  {
    navn: "landets fælles el-faktor",
    frase: () => {
      const f = (LAND.husholdning_el_co2_ton * 1e6) / (LAND.husholdning_el_tj * KWH_PR_TJ);
      return `over alle 98 kommuner, ${Math.round(f)} g CO2e/kWh`;
    },
  },
  {
    navn: "landets fossile andel, brugt som eksempel på procentpoint",
    frase: () => `landsgennemsnit på ${komma(LAND.husholdning_fossil_andel * 100)} %`,
  },
  {
    // Tærskeltabellens egen pointe: "meget højere" betyder ikke det samme fra
    // nøgletal til nøgletal. Tallet kommer fra beregnFordeling, altså fra
    // samme optælling som tabellen nederst på siden viser.
    navn: "hvor mange kommuner der ligger markant fra landet på fossil andel",
    frase: () => {
      const f = beregnFordeling(K, LAND)["Fossil andel af husholdningernes energi"];
      return `i ${f.markant} af landets ${f.n} kommuner`;
    },
  },
  {
    // Modstykket i samme sætning. Bliver boligarealet spredt nok til at én
    // kommune rammer over tærsklen, er ordet "ingen" forkert.
    navn: "boligarealet spreder sig ikke markant hos nogen",
    frase: () => {
      const f = beregnFordeling(K, LAND)["Gennemsnitligt boligareal"];
      return f.markant === 0
        ? "gennemsnitligt boligareal gør det i ingen"
        : `gennemsnitligt boligareal gør det i ${f.markant}`;
    },
  },
  {
    // Regionsafsnittets fire tal. De tre sidste var regnet mod et andet
    // nulpunkt end siden viser - se afvPct ovenfor.
    navn: "spændet mellem regionsgennemsnittene",
    frase: () => {
      const afv = REGIONER.map((r) =>
        afvPct(regionSnit("disp_indkomst", (k) => k.region === r), LAND.disp_indkomst));
      return `mellem regionsgennemsnittene er ${komma(Math.max(...afv) - Math.min(...afv))} pct.point`;
    },
  },
  {
    navn: "spændet inde i regionerne, i gennemsnit",
    frase: () => {
      const spaend = REGIONER.map((r) => {
        const inde = K.filter((k) => k.region === r)
          .map((k) => afvPct(k.disp_indkomst, LAND.disp_indkomst));
        return Math.max(...inde) - Math.min(...inde);
      });
      return `regionerne er ${komma(spaend.reduce((a, b) => a + b) / spaend.length)} pct.point i gennemsnit`;
    },
  },
  {
    navn: "spændet inde i Region Hovedstaden",
    frase: () => {
      const inde = K.filter((k) => k.region === "Hovedstaden")
        .map((k) => afvPct(k.disp_indkomst, LAND.disp_indkomst));
      return `og ${komma(Math.max(...inde) - Math.min(...inde))} i Region Hovedstaden`;
    },
  },
  {
    // Hele argumentet for ikke at bruge regionstal hviler på, at fortegnet
    // vender for Albertslund. Holder tallene ikke, falder afsnittet.
    navn: "Albertslunds egen indkomst mod landet",
    frase: () => {
      const a = K.find((k) => k.navn === "Albertslund");
      return `ligger ${komma(Math.abs(afvPct(a.disp_indkomst, LAND.disp_indkomst)))} pct. under landsgennemsnittet`;
    },
  },
  {
    navn: "Region Hovedstadens indkomst mod landet",
    frase: () => `mens regionens ligger ${komma(afvPct(
      regionSnit("disp_indkomst", (k) => k.region === "Hovedstaden"), LAND.disp_indkomst))} pct. over`,
  },
  {
    navn: "Albertslunds fødevareforbrug mod landet",
    frase: () => {
      const a = K.find((k) => k.navn === "Albertslund");
      return `Albertslund lander derfor ${komma(Math.abs(afvPct(
        a.foedevare_forbrug_pr_indb, LAND.foedevare_forbrug_pr_indb)))} pct. under`;
    },
  },
  {
    // Procentpoint-eksemplet stod tidligere med et opdigtet "37 %" og et
    // "+302 %", der ikke passede til nogen kommune. Nu er det den faktiske
    // yderkommune, og tallene skal være dem, siden ville vise.
    navn: "procentpoint-eksemplet er et tal fra datasættet",
    frase: () => {
      const top = K.map((k) => driverTabel(k, LAND)
        .find((d) => d.navn === "Fossil andel af husholdningernes energi"))
        .filter((d) => d.afvigelse != null)
        .reduce((a, b) => (b.afvigelse > a.afvigelse ? b : a));
      return `energi, ${komma(top.kommuneVaerdi * 100)} %, til "+${
        Math.round(top.afvigelse * 100)} %", hvilket lyder ekstremt for en forskel på ${
        Math.round(top.procentpoint)} procentpoint`;
    },
  },
  {
    // Bemærkningen om, at fossil-andel og el-andel siger det samme fra hver
    // sin ende, holder kun så længe restdrivmidlerne er forsvindende.
    navn: "øvrige drivmidler er forsvindende i hver kommune",
    frase: () => {
      const maks = Math.max(...K.map((k) =>
        ((k.biler - k.biler_benzin - k.biler_diesel - k.biler_el - k.biler_plugin) / k.biler) * 100));
      return maks < 0.1 ? "udgør under 0,1 pct." : `udgør op til ${komma(maks, 2)} pct.`;
    },
  },
  {
    navn: "Offentligt forbrugs vægt i det nationale aftryk",
    frase: () => `Offentligt forbrug vejer ${komma(
      ENS.kategorier.find((k) => k.navn === "Offentligt forbrug").pct)} procent`,
  },
  {
    navn: "fødevarernes vægt i det nationale aftryk",
    frase: () => `fødevarerne vejer ${Math.round(
      ENS.kategorier.find((k) => k.navn === "Føde- og drikkevarer").pct)} % af det nationale aftryk`,
  },
  {
    navn: "Energistyrelsens transporttal mod CONCITO's",
    frase: () => `Energistyrelsen transport til ${komma(
      ENS.kategorier.find((k) => k.navn === "Transport").ton)} ton, hvor CONCITO når ${
      komma(CONCITO.kategorier.find((k) => k.navn === "Transport").ton)}`,
  },
];

for (const p of PAASTANDE) {
  test(`metodesiden: ${p.navn}`, () => {
    const forventet = p.frase();
    assert.ok(tekst.includes(forventet),
      `metodesiden skal indeholde "${forventet}" - genberegnet fra web/data/data.json.\n`
      + "Står der et andet tal, er prosaen løbet fra datasættet. Ret teksten, "
      + "ikke testen.");
  });
}

test("metodesiden: hver påstand har en unik frase", () => {
  // En frase, der optræder to steder, beviser ikke at det rigtige sted er
  // opdateret. "+0,97" alene står både om fødevarer og om regionernes forbrug.
  for (const p of PAASTANDE) {
    const frase = p.frase();
    const antal = tekst.split(frase).length - 1;
    assert.equal(antal, 1,
      `"${frase}" står ${antal} gange - frasen skal pege på præcis ét sted`);
  }
});

// ---------------------------------------------------------------------------
// Strukturelle vagter.
//
// Fraserne ovenfor fanger et tal, der er blevet forkert. De fanger ikke en
// oplysning, der aldrig kom med. Metodesiden nævnte i lang tid fire hjælpetal,
// mens motoren havde fem - gennemsnitligt boligareal var et af dem, uden at
// nogen havde skrevet det ind. Den slags hul kan kun findes ved at holde siden
// op mod motorens egen liste.

test("metodesiden: hvert hjælpetal er nævnt ved navn", () => {
  // Et hjælpetal tæller ikke med i kategoriens samlede retning. Læseren, der
  // tæller rækkerne efter, får et andet resultat end mærkatet, hvis han ikke
  // ved hvilke der er undtaget. Så skal de stå der, alle sammen.
  const hjaelpere = driverTabel(K[0], LAND)
    .filter((d) => d.rolle === "hjaelper").map((d) => d.navn);
  assert.ok(hjaelpere.length > 0, "motoren har ingen hjælpetal - er rollen omdøbt?");
  for (const navn of hjaelpere) {
    // Siden skriver dem i løbende tekst, så forbogstavet kan være stort eller
    // småt afhængigt af hvor i sætningen navnet står.
    const fundet = tekst.includes(navn)
      || tekst.includes(navn.charAt(0).toLowerCase() + navn.slice(1));
    assert.ok(fundet,
      `"${navn}" er et hjælpetal, men står ikke på metodesiden. Skriv det ind i `
      + "listen over undtagne nøgletal - ellers kan optællingen bag den samlede "
      + "retning ikke tælles efter.");
  }
});

test("metodesiden: antallet af nøgletal under Offentligt forbrug passer", () => {
  const antal = driverTabel(K[0], LAND)
    .filter((d) => d.kategori === "Offentligt forbrug" && d.rolle !== "hjaelper").length;
  assert.equal(antal, 4,
    "siden siger, at kategorien har fire nøgletal. Ændres antallet, skal både "
    + "indkøbsafsnittet og færgeafsnittet rettes.");
  assert.ok(tekst.includes("Kategorien har derfor nu fire nøgletal"));
  assert.ok(tekst.includes("alle fire indkøbsnøgletal"));
});

test("metodesiden: forbeholdene har de tre virkninger, prosaen beskriver", () => {
  // Siden siger, at et forbehold "gør tre forskellige ting". Kommer der en
  // fjerde virkning til, eller falder en bort, holder sætningen ikke.
  assert.deepEqual(FORBEHOLD_VIRKNING, ["skjuler", "spaerrer", "note"]);
});

test("metodesiden: de ramte kommuner remses ikke op i prosaen", () => {
  // Affaldsforbeholdet afgøres af årets egne tal: retter et selskab sin
  // indberetning, falder det bort i pipelinen. En håndskreven liste over
  // ejerkredsen ville blive stående og lyve. Derfor står navnene kun i den
  // genererede forbeholdstabel.
  //
  // Grænsen er to: en enkelt kommune kan godt være nævnt som eksempel et andet
  // sted på siden, men en opremsning af hele kredsen er en liste, der rådner.
  const affald = beregnForbehold(K, LAND)
    .filter((g) => g.virkning === "skjuler" && g.noegletal.includes("Husholdningsaffald"));
  for (const g of affald) {
    const naevnt = g.kommuner.filter((navn) => tekst.includes(navn));
    assert.ok(naevnt.length <= 2,
      `metodesiden nævner ${naevnt.length} af de ${g.kommuner.length} kommuner bag `
      + `affaldsforbeholdet ved navn (${naevnt.join(", ")}). Listen afgøres af årets `
      + "data og hører i forbeholdstabellen, ikke i prosaen.");
  }
});
