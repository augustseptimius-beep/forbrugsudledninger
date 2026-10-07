// Pilen, kolonnen, optællingen og grafen.
//
// To krav afgør, hvordan siden er bygget, og begge holdes fast her.
//
//   Grafen tegnes først ved hover. Kommunesiden rummer pilen og en nøgle, ikke en
//   eneste tegning. Så er der intet tegnet at holde ajour, når datasættet opdateres,
//   og siden bliver ikke tungere af, at der findes ti år af hvert nøgletal.
//   Retningen bæres af formen og af teksten, ikke af farven alene.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune, beregnUdvikling, DRIVERE } from "../web/beregning.js";
import {
  renderIndikatorer, renderKommune, renderUdviklingTip, udviklingsGraf, akseTicks,
} from "../web/render.js";
import { land, thisted } from "./fixtures.js";

const fil = (navn) => JSON.parse(readFileSync(new URL(`../web/data/${navn}`, import.meta.url)));
const concito = fil("concito.json");
const ens = fil("ens.json");
const sources = fil("sources.json");
const data = fil("data.json");
const hist = fil("historik.json");

const udvikling = beregnUdvikling(data.kommuner, data.land, hist);
const kommune = (navn) => data.kommuner.find((k) => k.navn === navn);
const side = (navn) => {
  const k = kommune(navn);
  return beregnKommune(k, data.land, udvikling.get(k.kode));
};
// En historik, hvor Klimaregnskabets felter kun har det nyeste punkt - som når datasættet
// bygges uden API-nøglen. Så kan testene af "uden tidsserie" køre, uanset hvad den
// committede historik rummer.
const histUdenKlima = (() => {
  const kopi = structuredClone(hist);
  const felter = Object.keys(kopi.felter).filter((f) => f.startsWith("husholdning_"));
  const klip = (raekker) => {
    for (const f of felter) if (raekker[f]) raekker[f] = raekker[f].map((v, i, a) => (i === a.length - 1 ? v : null));
  };
  klip(kopi.land);
  for (const k of Object.values(kopi.kommuner)) klip(k);
  return kopi;
})();
const udviklingUdenKlima = beregnUdvikling(data.kommuner, data.land, histUdenKlima);
const sideUdenKlima = (navn) => {
  const k = kommune(navn);
  return beregnKommune(k, data.land, udviklingUdenKlima.get(k.kode));
};
const html = (b) => renderIndikatorer(b, concito, ens, sources);
const raekke = (b, navn) => b.drivere.find((d) => d.navn === navn);

// ---------- Ingen graf på forhånd ----------

test("grafen tegnes ikke, når siden vises - kun pilen og en nøgle", () => {
  const h = html(side("Thisted"));
  // Grafens SVG har en viewBox på 288 og en beskrivelse med "hele landet". Ingen af delene
  // findes i siden, før nogen peger på en pil.
  assert.ok(!h.includes('viewBox="0 0 288'), "en graf ligger i siden på forhånd");
  assert.ok(!/aria-label="[^"]*og hele landet/.test(h));
  assert.ok(!h.includes("stroke-dasharray"), "landets stiplede linje er en graf-detalje");
  assert.ok(h.includes("data-graf="), "men pilene bærer en nøgle, grafen kan bygges af");
});

test("siden bliver ikke tungere af historikken: pilene fylder kilobyte, ikke hundreder", () => {
  const uden = renderIndikatorer(beregnKommune(kommune("Thisted"), data.land), concito, ens, sources);
  const med = html(side("Thisted"));
  assert.ok(med.length - uden.length < 40_000,
    `historikken føjer ${med.length - uden.length} tegn til siden`);
});

test("hver pil bærer en nøgle, der peger på et nøgletal på siden", () => {
  // tooltip.js beder om grafen med nøglen fra data-graf. Peger den på et nøgletal, der ikke
  // findes, står pilen der uden en graf, og ingen fejl siger det.
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land, udvikling.get(k.kode));
    const navne = new Set(b.drivere.map((d) => d.navn));
    const nogler = [...html(b).matchAll(/data-graf="([^"]*)"/g)]
      .map(([, n]) => n.replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
    for (const n of nogler) assert.ok(navne.has(n), `${k.navn}: data-graf="${n}" findes ikke`);
    assert.equal(new Set(nogler).size, nogler.length, `${k.navn}: en nøgle er brugt to gange`);
  }
});

// ---------- Kolonnen og pilen ----------

test("kolonnen Udvikling står, når siden har en historik, og ellers ikke", () => {
  const med = html(side("Thisted"));
  assert.ok(med.includes(">Udvikling</th>"));
  const uden = renderIndikatorer(beregnKommune(kommune("Thisted"), data.land), concito, ens, sources);
  assert.ok(!uden.includes(">Udvikling</th>"), "uden historik hverken kolonne eller pile");
  assert.ok(!uden.includes("data-graf"));
  assert.ok(!uden.includes("Udvikling over tid"));
});

test("hver række har lige mange celler som tabellen har kolonner", () => {
  for (const [navn, kolonner] of [["Thisted", 6]]) {
    const h = html(side(navn));
    const tabeller = h.match(/<table[\s\S]*?<\/table>/g) ?? [];
    assert.ok(tabeller.length >= 6, "kategorierne har hver deres tabel");
    for (const tabel of tabeller) {
      assert.equal((tabel.match(/<th /g) ?? []).length, kolonner);
      const raekker = tabel.match(/<tr class="border-t[\s\S]*?<\/tr>/g) ?? [];
      assert.ok(raekker.length > 0);
      for (const r of raekker) assert.equal((r.match(/<td /g) ?? []).length, kolonner);
    }
  }
});

const enkelt = (retning, ekstra = {}) => {
  const d = { navn: "Fossil-andel", enhed: "pct.", type: "relativ", andel: "0-1", kategori: "Transport",
    rolle: "hoved", felter: [], signal: "højere", paavirkning: "hoejere",
    kommuneVaerdi: 0.8, landVaerdi: 0.78, afvigelse: 0.02, procentpoint: 2,
    udvikling: { retning, n: 9, op: false, start: 0.9, slut: 0.8, startLabel: "2018-2020",
      slutLabel: "2024-2026", pct: -11.1, pp: -10, landStart: 0.85, landSlut: 0.78,
      serie: { aar: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
        kommune: [0.9, 0.9, 0.9, 0.88, 0.86, 0.84, 0.82, 0.81, 0.8],
        land: [0.85, 0.85, 0.84, 0.83, 0.82, 0.81, 0.8, 0.79, 0.78], faste: false, prisAar: null } },
    ...ekstra };
  return { navn: "Thisted", drivere: [d], grupper: [{ kategori: "Transport", drivere: [d] }], udeladt: [] };
};
const cellen = (retning, ekstra) => html(enkelt(retning, ekstra));

test("hver retning har sin tekst og sin form, og farven bærer den ikke alene", () => {
  const forventet = {
    rigtig: ["rigtig retning", "text-emerald-600"],
    tempo: ["rigtig, langsomt", "text-amber-500"],
    stagneret: ["uændret", "text-gray-400"],
    forkert: ["forkert retning", "text-red-500"],
    kontekst: ["ingen vurdering", "text-gray-400"],
  };
  for (const [retning, [tekst, farve]] of Object.entries(forventet)) {
    const h = cellen(retning);
    assert.ok(h.includes(`>${tekst}</span>`), `${retning}: teksten "${tekst}" mangler`);
    assert.ok(h.includes(farve), `${retning}: farven ${farve} mangler`);
  }
  assert.ok(cellen("rigtig").includes("M6 10.5 L1.5 3 L10.5 3 Z"), "faldt: trekant ned");
  assert.ok(cellen("rigtig", { udvikling: { ...enkelt("rigtig").drivere[0].udvikling, op: true } })
    .includes("M6 1.5 L10.5 9 L1.5 9 Z"), "steg: trekant op");
  assert.ok(cellen("stagneret").includes('x1="1.5" y1="6" x2="10.5" y2="6"'), "uændret: vandret streg");
});

test("pilen følger værdiens retning, farven vurderingens", () => {
  // Fossilandelen faldt (pil ned) og det er godt (grøn). Samme retning i rødt ville være et
  // nøgletal, der faldt og var dårligt - men pilen ville stadig pege ned.
  const rigtig = cellen("rigtig");
  assert.ok(rigtig.includes("M6 10.5 L1.5 3 L10.5 3 Z") && rigtig.includes("text-emerald-600"));
  const forkert = cellen("forkert");
  assert.ok(forkert.includes("M6 10.5 L1.5 3 L10.5 3 Z") && forkert.includes("text-red-500"));
});

test("en stigning fra nul står uden procent i teksten, og aldrig som NaN eller uendelig", () => {
  // Fra nul er den relative ændring ikke defineret (pct er null). Teksten skal så nøjes med
  // procentpoint eller stå uden en ændring, og hverken tooltippen eller skærmlæserteksten må
  // vise et tal, der ikke findes.
  for (const andel of ["0-1", null]) {
    const b = enkelt("forkert", { andel });
    const d = b.drivere[0];
    d.udvikling = { ...d.udvikling, start: 0, slut: 0.2, pct: null, pp: andel ? 20 : null, op: true,
      serie: { ...d.udvikling.serie, kommune: [0, 0, 0, 0.05, 0.1, 0.15, 0.2, 0.2, 0.2] } };
    const tip = renderUdviklingTip(d, sources, "Thisted");
    const aria = html(b).match(/role="img"\s+aria-label="([^"]*)"/)[1];
    assert.ok(tip.includes("Forkert retning"), `${andel}: vurderingen mangler`);
    for (const tekst of [tip, aria]) {
      for (const daarligt of ["Infinity", "NaN", "null", "undefined"]) {
        assert.ok(!tekst.includes(daarligt), `${daarligt} (${andel})`);
      }
    }
  }
});

test("et nøgletal uden tidsserie får et skraveret felt og en tekst, men ingen graf", () => {
  const h = cellen("ingen", { udvikling: { retning: "ingen", n: 0, serie: null } });
  assert.ok(h.includes(">ingen tidsserie</span>"));
  assert.ok(!h.includes("data-graf"));
  assert.ok(h.includes('data-tip="Ingen tidsserie for dette nøgletal"'), "forklaring ved hover");
  assert.ok(h.includes('x1="1" y1="11" x2="11" y2="1"'), "skraveret felt");
});

test("pilen kan nås fra tastaturet og har en tekst til skærmlæsere", () => {
  const h = cellen("forkert");
  assert.ok(h.includes('tabindex="0"'));
  const aria = h.match(/role="img"\s+aria-label="([^"]*)"/)[1];
  assert.ok(aria.includes("Forkert retning: udviklingen peger mod højere udledning"), aria);
  assert.ok(aria.includes("2018-2020 til 2024-2026"), aria);
  assert.ok(aria.includes("Thisted:"), aria);
  assert.ok(aria.includes("Hele landet:"), aria);
});

test("et tal, der mangler, står som tankestreg i pilens tekst og aldrig som nul", () => {
  const d = enkelt("rigtig").drivere[0];
  d.udvikling = { ...d.udvikling, landStart: null, landSlut: null };
  const b = enkelt("rigtig");
  b.drivere = [d];
  b.grupper = [{ kategori: "Transport", drivere: [d] }];
  const aria = html(b).match(/aria-label="(Udvikling [^"]*)"/)[1];
  assert.ok(!aria.includes("Hele landet"), "landet har intet tal, så det nævnes ikke");
  assert.ok(!/\b0[,.]0\b/.test(aria));
});

// ---------- Kategoriens optælling ----------

test("kategorien tæller udviklingen ved siden af den samlede retning", () => {
  const h = html(sideUdenKlima("Thisted"));
  assert.ok(h.includes("Udvikling over tid"));
  assert.match(h, /\d+ i rigtig retning/);
  assert.match(h, /\d+ i forkert retning/);
  assert.match(h, /\d+ uden tidsserie/);
});

test("optællingen tæller alle nøgletal i kategorien, undtagen hjælpetal", () => {
  const b = side("Thisted");
  for (const g of b.grupper) {
    const talte = g.drivere.filter((d) => d.rolle !== "hjaelper");
    const retninger = talte.map((d) => d.udvikling.retning);
    const rigtig = retninger.filter((r) => r === "rigtig" || r === "tempo").length;
    const forkert = retninger.filter((r) => r === "forkert").length;
    const afsnit = html({ ...b, grupper: [g], drivere: g.drivere });
    if (rigtig) assert.ok(afsnit.includes(`${rigtig} i rigtig retning`), `${g.kategori}: ${rigtig} rigtig`);
    if (forkert) assert.ok(afsnit.includes(`${forkert} i forkert retning`), `${g.kategori}: ${forkert} forkert`);
  }
});

test("forklaringen af udviklingen står under tabellerne, når der er en historik", () => {
  const h = html(side("Thisted"));
  assert.ok(h.includes("Udvikling.") && h.includes('href="metode.html#udvikling"'));
  const uden = renderIndikatorer(beregnKommune(kommune("Thisted"), data.land), concito, ens, sources);
  assert.ok(!uden.includes('href="metode.html#udvikling"'));
});

// ---------- Akser ----------

test("akseværdier er runde tal, der dækker værdierne, med højst fem tal", () => {
  for (const [min, max] of [[0.9987, 0.8764], [235981, 283692], [0.19, 0.2], [1.28, 1.31], [12.4, 96.3],
    [-0.003, 0.009], [4.31, 2.42], [5, 5], [0, 100]]) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const { ticks } = akseTicks(lo, hi);
    assert.ok(ticks[0] <= lo + 1e-9 && ticks.at(-1) >= hi - 1e-9, `${lo}-${hi}: ${ticks} dækker ikke`);
    assert.ok(ticks.length >= 2 && ticks.length <= 5, `${lo}-${hi}: ${ticks.length} akseværdier`);
    for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] > ticks[i - 1]);
  }
});

test("akseværdier: trinnene er 1, 2, 2,5 og 5 gange en tierpotens", () => {
  assert.deepEqual(akseTicks(0, 100).ticks, [0, 25, 50, 75, 100]);
  assert.deepEqual(akseTicks(3, 9).ticks, [2, 4, 6, 8, 10]);
  assert.deepEqual(akseTicks(235981, 283692).ticks, [220000, 240000, 260000, 280000, 300000]);
  assert.deepEqual(akseTicks(0.0012, 0.0031).ticks, [0.001, 0.002, 0.003, 0.004]);
});

test("akseværdier: en flad serie får en akse, der kan tegnes", () => {
  const { ticks } = akseTicks(5, 5);
  assert.ok(ticks.length >= 2 && ticks[0] < 5 && ticks.at(-1) > 5);
});

// ---------- Grafen ----------

const tegn = (navn) => {
  const b = side("Thisted");
  const d = raekke(b, navn);
  return { d, tip: renderUdviklingTip(d, sources, "Thisted"), b };
};

test("grafen har to linjer, to slutpunkter, akser og første og sidste år", () => {
  const { d, tip } = tegn("Fossil-andel");
  const s = d.udvikling.serie;
  assert.match(tip, /<svg viewBox="0 0 288 108"/);
  assert.equal((tip.match(/<path[^>]*stroke="#2a78d6"/g) ?? []).length, 1, "kommunens linje");
  assert.equal((tip.match(/<path[^>]*stroke="#6b7280"/g) ?? []).length, 1, "landets linje");
  assert.ok(tip.includes('stroke-dasharray="4 3"'), "landet er stiplet, så farven ikke er eneste forskel");
  assert.equal((tip.match(/r="4"/g) ?? []).length, 2, "et slutpunkt pr. serie");
  assert.ok(tip.includes(`>${s.aar.find((_, i) => s.kommune[i] != null)}</text>`), "første år");
  assert.ok(tip.includes(`>${s.aar.at(-1)}</text>`), "sidste år");
});

test("slutpunkterne har en ring i fladens farve, så de kan ses, hvor linjerne krydser", () => {
  const { tip } = tegn("Fossil-andel");
  assert.equal((tip.match(/fill="#2a78d6" stroke="#ffffff" stroke-width="2"/g) ?? []).length, 1);
  assert.equal((tip.match(/fill="#6b7280" stroke="#ffffff" stroke-width="2"/g) ?? []).length, 1);
});

test("forklaringen bruger linjenøgler, og tallene står først, navnet bagefter", () => {
  const { d, tip } = tegn("Fossil-andel");
  const u = d.udvikling;
  assert.ok(tip.includes("Thisted") && tip.includes("Hele landet"));
  assert.equal((tip.match(/<line x1="1" x2="17"/g) ?? []).length, 2, "en kort streg pr. serie");
  assert.ok(tip.includes("&rarr;"), "fra og til");
  assert.ok(tip.includes("procentpoint"), "en andel står i procentpoint");
  assert.ok(u.midlet && tip.includes("middel af tre år i hver ende"), "endepunkterne er middel af tre år");
});

test("tallene i grafens forklaring formateres som tallene i tabellen", () => {
  const b = side("Thisted");
  const d = raekke(b, "Disponibel indkomst");
  const tip = renderUdviklingTip(d, sources, "Thisted");
  // Kroner uden decimaler og med tusindtalspunktum, som i tabellen.
  assert.match(tip, /\d{3}\.\d{3} &rarr; \d{3}\.\d{3}/);
});

test("kroner står i det seneste års priser, og kilden til prisindekset nævnes", () => {
  const { tip } = tegn("Disponibel indkomst");
  assert.match(tip, /Kroner i 2024-priser \(forbrugerprisindeks, DST PRIS8\)/);
  assert.ok(!tegn("Biler pr. indbygger").tip.includes("priser"), "biler er ikke kroner");
});

test("et femårsgennemsnit står i priserne fra vinduets midte", () => {
  const { tip } = tegn("Kommunens anlægsindkøb");
  const slutaar = 2025;
  assert.ok(tip.includes(`Kroner i ${slutaar - 2}-priser`), tip.match(/Kroner i [^ ]+/)?.[0]);
});

test("kilderne står ved grafen, som ved nøgletallet", () => {
  const { tip } = tegn("Biler pr. indbygger");
  assert.ok(tip.includes("DST BIL54") && tip.includes("DST FOLK1A"));
});

test("hvad læseren skal vide om et nøgletals udvikling står ved grafen", () => {
  const { tip } = tegn("Genanvendelsesprocent");
  assert.ok(tip.includes("skiftet definition"), "definitionen af genanvendelse er skiftet");
  const kroner = tegn("Kommunens anlægsindkøb").tip;
  assert.ok(kroner.includes("gennemsnit over fem regnskabsår"));
});

test("vurderingen står med form og tekst i grafens forklaring", () => {
  const { d, tip } = tegn("Fossil-andel");
  const tekst = { rigtig: "Rigtig retning: udviklingen peger mod lavere udledning",
    tempo: "Rigtig retning, men langsommere end i de fleste kommuner",
    forkert: "Forkert retning: udviklingen peger mod højere udledning",
    stagneret: "Stort set uændret" }[d.udvikling.retning];
  assert.ok(tip.includes(tekst), d.udvikling.retning);
  assert.ok(tip.includes("<svg width=\"12\" height=\"12\" viewBox=\"0 0 12 12\""), "pilens ikon står ved teksten");
});

test("et nøgletal uden serie giver ingen graf", () => {
  const b = sideUdenKlima("Thisted");
  const d = raekke(b, "Husholdningernes CO2 fra energi");
  assert.equal(d.udvikling.retning, "ingen");
  assert.equal(renderUdviklingTip(d, sources, "Thisted"), "");
  assert.equal(renderUdviklingTip(undefined, sources, "Thisted"), "");
});

test("et hul i serien afbryder linjen, og et enkelt punkt bliver til en prik", () => {
  const d = raekke(side("Thisted"), "Fossil-andel");
  const serie = { aar: [2018, 2019, 2020, 2021, 2022, 2023], faste: false, prisAar: null,
    kommune: [0.9, 0.88, null, 0.84, null, 0.8], land: [0.9, 0.89, 0.88, 0.87, 0.86, 0.85] };
  const svg = udviklingsGraf(d, serie, "Thisted");
  const kommunelinjer = svg.match(/<path d="([^"]*)"\s+fill="none" stroke="#2a78d6"/g) ?? [];
  assert.equal(kommunelinjer.length, 1, "første stykke: 2018-2019");
  assert.equal((svg.match(/r="2.5" fill="#2a78d6"/g) ?? []).length, 2,
    "2021 og 2023 står hver for sig og bliver til prikker");
  assert.ok(!svg.includes("NaN") && !svg.includes("undefined"));
});

test("en flad serie tegnes uden at dele med nul", () => {
  const d = raekke(side("Thisted"), "Fossil-andel");
  const serie = { aar: [2020, 2021, 2022], faste: false, prisAar: null,
    kommune: [0.5, 0.5, 0.5], land: [0.5, 0.5, 0.5] };
  const svg = udviklingsGraf(d, serie, "Thisted");
  assert.ok(svg.startsWith("<svg") && !svg.includes("NaN") && !svg.includes("Infinity"));
});

test("en serie med under to år giver ingen graf", () => {
  const d = raekke(side("Thisted"), "Fossil-andel");
  assert.equal(udviklingsGraf(d, { aar: [2024], kommune: [0.5], land: [0.5] }, "Thisted"), "");
  assert.equal(udviklingsGraf(d, { aar: [2023, 2024], kommune: [null, null], land: [null, null] }, "Thisted"), "");
});

test("tekst fra fremmede kilder kommer ikke ind i grafen som HTML", () => {
  const d = raekke(side("Thisted"), "Fossil-andel");
  const tip = renderUdviklingTip(d, sources, '<img src=x onerror=alert(1)>"');
  assert.ok(!tip.includes("<img"), "kommunenavnet skal escapes");
  assert.ok(tip.includes("&lt;img"));
});

test("grafen har en tekst til skærmlæsere", () => {
  const { tip } = tegn("Fossil-andel");
  assert.match(tip, /<svg[^>]*role="img"[^>]*aria-label="Thisted og hele landet, \d{4} til \d{4}"/);
  assert.match(tip, /<title>Thisted og hele landet/);
});

// ---------- Hele datasættet ----------

test("alle 98 kommunesider kan bygges med udvikling, og hver graf kan tegnes", () => {
  let grafer = 0;
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land, udvikling.get(k.kode));
    const h = renderKommune(b, concito, ens, sources);
    assert.ok(h.includes("Udvikling"), k.navn);
    assert.ok(!h.includes("NaN") && !h.includes("undefined"), `${k.navn}: NaN eller undefined i siden`);
    for (const d of b.drivere) {
      const tip = renderUdviklingTip(d, sources, k.navn);
      if (d.udvikling?.serie && d.udvikling.n >= 2) {
        assert.ok(tip.startsWith("<div"), `${k.navn} ${d.navn}: ingen graf`);
        assert.ok(!/NaN|undefined|Infinity/.test(tip), `${k.navn} ${d.navn}: ${tip.match(/.{20}(NaN|undefined|Infinity).{20}/)}`);
        grafer++;
      } else {
        assert.equal(tip, "");
      }
    }
  }
  assert.ok(grafer > 98 * 10, `kun ${grafer} grafer`);
});

test("et nøgletal, der er taget af siden, har hverken pil eller graf", () => {
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land, udvikling.get(k.kode));
    const h = html(b);
    for (const u of b.udeladt) {
      assert.ok(!h.includes(`data-graf="${u.navn}"`), `${k.navn}: ${u.navn} er taget af siden`);
    }
  }
});

test("et nøgletal, hvis retning er spærret, står med en pil uden vurdering", () => {
  const b = side("Læsø");
  const spaerrede = b.drivere.filter((d) => d.spaerret);
  assert.ok(spaerrede.length > 0, "Læsø har færgeforbeholdet");
  for (const d of spaerrede) {
    assert.equal(d.udvikling.retning === "kontekst" || d.udvikling.retning === "stagneret"
      || d.udvikling.retning === "ingen", true, `${d.navn}: ${d.udvikling.retning}`);
  }
});

test("en række, hvis felter historikken ikke har, siger ingen tidsserie", () => {
  // Klimaregnskabets felter kræver en API-nøgle og kan mangle. Det gør ikke rækkerne til nul.
  for (const felt of hist.mangler) {
    const berorte = DRIVERE.filter((d) => d.felter.includes(felt));
    const b = side("Thisted");
    for (const d of berorte) {
      const raekkeD = b.drivere.find((r) => r.navn === d.navn);
      if (raekkeD) assert.equal(raekkeD.udvikling.retning, "ingen", `${d.navn} mangler ${felt}`);
    }
  }
});
