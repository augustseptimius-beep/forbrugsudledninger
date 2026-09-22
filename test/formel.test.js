// Formlen og regnestykket skal sige det samme.
//
// Regnearkseksporten lægger hvert nøgletals regnestykke ud som en formel, så
// den, der henter arket, kan sætte egne tal ind og se afvigelsen regne sig om.
// Formlen er derfor en ANDEN skrivemåde for det, val() gør - og to skrivemåder
// af samme regnestykke driver fra hinanden, så snart nogen retter den ene.
//
// Testene her kører begge over alle 98 kommuner og landet og fejler ved det
// første tal, der ikke er ens. Det er samme slags vagt som
// test/kildeangivelse.test.js: den holder to led sammen, som ellers ville
// kunne komme til at sige hver sit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DRIVERE } from "../web/beregning.js";
import { formelFelter } from "../web/eksport.js";

const data = JSON.parse(readFileSync(new URL("../web/data/data.json", import.meta.url)));
const alle = [...data.kommuner, data.land];

/** Regn formelstrengen ud i JavaScript. Feltnavne slås op i kommunen,
 *  `land.`-præfiksede i landet - præcis som eksportens oversættelse gør, når
 *  den vælger kolonne. */
function evaluer(formel, m, land) {
  const { kommune, land: landfelter } = formelFelter(formel);
  const navne = [...kommune, ...landfelter.map((f) => `land.${f}`)];
  const udtryk = formel.replace(/land\.([A-Za-z0-9_]+)|([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*)/g,
    (t) => `__[${JSON.stringify(t)}]`);
  const bord = {};
  for (const n of navne) bord[n] = n.startsWith("land.") ? land[n.slice(5)] : m[n];
  return Function("__", `return ${udtryk};`)(bord);
}

test("formel: hvert nøgletal har et regnestykke i regnearksform", () => {
  for (const d of DRIVERE) {
    assert.ok(typeof d.formel === "string" && d.formel.length > 0,
      `${d.navn} har ingen formel, og kan derfor ikke regnes i et regneark`);
  }
});

test("formel: formlen giver præcis det samme som val() i alle 98 kommuner", () => {
  // Bitidentisk, ikke omtrent. En formel, der rammer inden for en promille,
  // er en anden model - og så ville arket og siden svare forskelligt på det
  // samme spørgsmål.
  for (const d of DRIVERE) {
    for (const k of alle) {
      const motor = d.val(k, data.land);
      const formel = evaluer(d.formel, k, data.land);
      const a = Number.isFinite(motor) ? motor : null;
      const b = Number.isFinite(formel) ? formel : null;
      assert.equal(b, a, `${d.navn} i ${k.navn}: formlen giver ${b}, val() giver ${a}`);
    }
  }
});

test("formel: formlen læser præcis de felter, nøgletallet oplyser", () => {
  // Samme regel som kildeangivelsen. Læste formlen et felt, nøgletallet ikke
  // oplyser, ville arket regne på et tal uden kilde.
  for (const d of DRIVERE) {
    const { kommune, land } = formelFelter(d.formel);
    const brugt = [...new Set([...kommune, ...land])].sort();
    assert.deepEqual(brugt, [...d.felter].sort(),
      `${d.navn}: formlen og de oplyste felter er ikke de samme`);
  }
});

test("formel: kun landets fælles el-faktor henter tal fra landet", () => {
  // Et bart feltnavn er kommunens. Sneg der sig et `land.`-opslag ind i et
  // andet nøgletal, ville kommunens kolonne i arket stille regne på landets
  // tal, og afvigelsen ville blive nul uden at nogen kunne se hvorfor.
  const med = DRIVERE.filter((d) => formelFelter(d.formel).land.length > 0);
  assert.deepEqual(med.map((d) => d.navn), ["Husholdningernes CO2 fra energi"]);
  assert.deepEqual(formelFelter(med[0].formel).land.sort(),
    ["husholdning_el_co2_ton", "husholdning_el_tj"]);
});

test("formel: intet regnestykke bruger en funktion, et regneark ikke har", () => {
  // Formlerne skrives ordret ind i regnearket med feltnavnene skiftet ud med
  // celleadresser. Står der Math.min eller en ternær operator, kommer den med
  // ud i filen og gør den ulæselig for Excel.
  for (const d of DRIVERE) {
    assert.match(d.formel, /^[A-Za-zÀ-ÿ0-9_.\s()+\-*/]+$/,
      `${d.navn}: formlen indeholder tegn, et regneark ikke forstår`);
    assert.ok(!/Math\.|\?|:|\[|\]/.test(d.formel),
      `${d.navn}: formlen bruger JavaScript, ikke regneark`);
  }
});
