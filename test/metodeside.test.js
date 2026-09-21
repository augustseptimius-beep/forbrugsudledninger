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
// HVAD DEN IKKE DÆKKER, OG HVORFOR IKKE.
//
// Kun tal, der kan genberegnes af data.json alene. Tre slags står udenfor med
// vilje:
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
import { beregnFordeling } from "../web/beregning.js";

const data = JSON.parse(readFileSync(new URL("../web/data/data.json", import.meta.url)));
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
