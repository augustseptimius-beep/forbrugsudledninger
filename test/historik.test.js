// Historikfilen mod resten af datasættet.
//
// web/data/historik.json rummer tallene bag udviklingspilene, og den er committet
// ved siden af data.json. De to skal genberegnes sammen: opdateres data.json uden
// historikken, peger pilen på et tal, siden ikke længere viser. Testene her er
// vagten, og de kører ved udgivelsen, så en uoverensstemmelse stopper den.
//
// Samme mønster som testene af metodesidens tal og af kildeangivelsen: filen
// genberegnes ikke her, men holdes op mod det, den skal være i takt med.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { DRIVERE, driverAar, driverSerie, driverTabel } from "../web/beregning.js";

const fil = (navn) => new URL(`../web/data/${navn}`, import.meta.url);
const data = JSON.parse(readFileSync(fil("data.json")));
const sources = JSON.parse(readFileSync(fil("sources.json")));
const h = JSON.parse(readFileSync(fil("historik.json")));

const KOMMUNER = data.kommuner;
const LAND = data.land;
const FELTER = Object.keys(h.felter);
const alleFelter = (drivere) => [...new Set(drivere.flatMap((d) => d.felter))];

test("historikken: vinduet er ti år, og hver række har elleve led", () => {
  assert.equal(h.vindue, 10);
  for (const [omraade, raekker] of [["land", h.land], ...Object.entries(h.kommuner)]) {
    for (const felt of FELTER) {
      assert.ok(Array.isArray(raekker[felt]), `${omraade} mangler ${felt}`);
      assert.equal(raekker[felt].length, h.vindue + 1, `${omraade} ${felt}`);
    }
  }
});

test("historikken: alle 98 kommuner og landet er med, og ingen andre", () => {
  assert.deepEqual(Object.keys(h.kommuner).sort(), KOMMUNER.map((k) => String(k.kode)).sort());
  assert.equal(Object.keys(h.kommuner).length, 98);
});

test("historikken: hvert tal er et endeligt tal eller null, aldrig andet", () => {
  for (const raekker of [h.land, ...Object.values(h.kommuner)]) {
    for (const [felt, raekke] of Object.entries(raekker)) {
      for (const v of raekke) {
        assert.ok(v === null || (typeof v === "number" && Number.isFinite(v)), `${felt}: ${v}`);
      }
    }
  }
});

test("historikken: den rummer alle de felter, et nøgletal læser", () => {
  const laest = alleFelter(DRIVERE);
  const mangler = laest.filter((f) => !FELTER.includes(f));
  assert.deepEqual(mangler, [], "felter, et nøgletal læser, men historikken ikke har");
});

test("historikken: hver række ender på den værdi, data.json har - så pil og tal er ét tal", () => {
  // Det er hele kontrakten. Historikken hentes med de samme funktioner som data.json, og
  // pipelinen stopper, hvis de afviger. Her holdes den committede fil op mod den
  // committede data.json, så en af dem ikke kan opdateres alene.
  const afvigelser = [];
  const tjek = (omraade, raekker, post) => {
    for (const felt of FELTER) {
      const facit = post[felt] ?? null;
      const nu = raekker[felt].at(-1);
      if (nu !== facit) afvigelser.push(`${omraade} ${felt}: historik ${nu}, data.json ${facit}`);
    }
  };
  tjek("land", h.land, LAND);
  for (const k of KOMMUNER) tjek(String(k.kode), h.kommuner[String(k.kode)], k);
  assert.deepEqual(afvigelser.slice(0, 5), [],
    `${afvigelser.length} felter er ude af takt. Kør pipeline/historik.py, eller pipeline/build.py.`);
});

test("historikken: hvert nøgletals seneste punkt er tallet i tabellen, bitvis", () => {
  // Nøgletallets regnestykke kørt på det seneste års felter er det tal, kommunesiden
  // viser. Kontrollen dækker alle nøgletal for alle 98 kommuner og landet.
  const afvigelser = [];
  for (const k of KOMMUNER) {
    const raekker = driverTabel(k, LAND);
    DRIVERE.forEach((d, i) => {
      const serie = driverSerie(d, h, k.kode);
      assert.ok(serie, `${k.navn}: ${d.navn} har ingen serie`);
      const række = raekker[i];
      if (serie.kommune.at(-1) !== række.kommuneVaerdi) {
        afvigelser.push(`${k.navn} ${d.navn}: serie ${serie.kommune.at(-1)}, tabel ${række.kommuneVaerdi}`);
      }
      if (serie.land.at(-1) !== række.landVaerdi) {
        afvigelser.push(`${k.navn} ${d.navn} land: serie ${serie.land.at(-1)}, tabel ${række.landVaerdi}`);
      }
    });
  }
  assert.deepEqual(afvigelser.slice(0, 5), [], `${afvigelser.length} afvigelser`);
});

test("historikken: feltets periode er den, kildekataloget oplyser", () => {
  // Metodesiden viser kildens periode. Har historikken en anden for det samme felt, siger
  // siden én årgang og grafen en anden.
  const ejer = {};
  for (const k of sources.kilder) for (const felt of k.felter) ejer[felt] = k;
  for (const felt of FELTER) {
    const { periode, aar } = h.felter[felt];
    assert.equal(aar, Number(periode.slice(0, 4)), `${felt}: aar og periode passer ikke`);
    if (felt === "folketal_forrige") {
      // Samme tabel som folketal, men året før: samme kvartal, ét år tilbage.
      assert.equal(periode, `${Number(h.felter.folketal.periode.slice(0, 4)) - 1}${h.felter.folketal.periode.slice(4)}`);
      continue;
    }
    assert.ok(ejer[felt], `${felt} har ingen kilde i sources.json`);
    assert.equal(periode, ejer[felt].periode, `${felt}: historikkens periode er ${periode}, ${ejer[felt].id} siger ${ejer[felt].periode}`);
  }
});

test("historikken: mangler siger præcis, hvilke felter der ingen serie har", () => {
  const harSerie = (felt) => [h.land, ...Object.values(h.kommuner)]
    .some((r) => r[felt].filter((v) => v !== null).length >= 2);
  for (const felt of FELTER) {
    assert.equal(h.mangler.includes(felt), !harSerie(felt),
      `${felt}: står ${h.mangler.includes(felt) ? "i" : "ikke i"} mangler, men ${harSerie(felt) ? "har" : "har ikke"} en serie`);
  }
});

test("historikken: et tal, der ikke kan være nul, er aldrig nul", () => {
  // Et hul, der er endt som nul, ville stå som en måling: nul indbyggere, nul biler.
  const aldrigNul = ["folketal", "folketal_forrige", "biler", "disp_indkomst", "boligareal",
    "opv_boliger_ialt", "pendlingsafstand_km"];
  for (const felt of aldrigNul) {
    for (const [omraade, raekker] of [["land", h.land], ...Object.entries(h.kommuner)]) {
      for (const v of raekker[felt]) {
        assert.ok(v === null || v > 0, `${omraade} ${felt} står som ${v}`);
      }
    }
  }
});

test("historikken: prisindekset dækker hvert år, et kronenøgletal kan komme til at bruge", () => {
  assert.equal(h.priser.kilde, "PRIS8");
  for (const d of DRIVERE.filter((x) => x.faste)) {
    // Et gennemsnit over flere år hører til prisniveauet i vinduets midte.
    const nu = driverAar(d, h) - (d.prisForskydning ?? 0);
    for (let trin = 0; trin <= h.vindue; trin++) {
      const indeks = h.priser.aar[String(nu - trin)];
      assert.ok(Number.isFinite(indeks) && indeks > 0,
        `${d.navn}: intet prisindeks for ${nu - trin}`);
    }
  }
});

test("historikken: prisindeksets nyeste år er det, kildekataloget oplyser", () => {
  const pris = sources.kilder.find((k) => k.id === "PRIS8");
  assert.ok(pris, "PRIS8 står ikke i kildekataloget");
  assert.equal(Math.max(...Object.keys(h.priser.aar).map(Number)), Number(pris.periode));
});

test("historikken: filen er et par hundrede kilobyte, ikke megabyte", () => {
  // Filen hentes ved hver kommuneside. Vokser den ti gange, er noget galt.
  assert.ok(statSync(fil("historik.json")).size < 1_000_000);
});
