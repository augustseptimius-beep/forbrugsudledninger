import { test } from "node:test";
import assert from "node:assert/strict";
import { beregnKommune } from "../web/beregning.js";
import { renderHovedtal, renderNedbrydning, renderDriverTabel, renderBoligpris, renderKommune }
  from "../web/render.js";
import { land, thisted, greve, konstanter } from "./fixtures.js";

// Produktionens konstanter: kun Nordjylland har et DTU-tal.
const prod = { ...konstanter, bilkm_afvigelse_region: { "Nordjylland": 0.178423236514523 } };

const bThisted = beregnKommune(thisted, land, prod);
const bGreve = beregnKommune(greve, land, prod);
const bUden = beregnKommune({ ...greve, disp_indkomst: null }, land, prod);

// ---------- Hovedtal ----------

test("hovedtal: viser interval og kommunenavn", () => {
  const h = renderHovedtal(bThisted);
  assert.ok(h.includes("Thisted"), "kommunenavn skal stå der");
  assert.ok(h.includes("9,4 - 9,9"), "intervallet skal stå der");
  assert.ok(h.includes("ton"), "enheden skal stå der");
});

test("hovedtal: utilstrækkeligt datagrundlag giver ingen tal", () => {
  const h = renderHovedtal(bUden);
  assert.ok(h.includes("Utilstrækkeligt datagrundlag"));
  assert.ok(!/\d,\d\s*-\s*\d,\d/.test(h), "der må ikke stå et interval");
});

test("hovedtal: uoplyst komponent giver synlig ufuldstændigheds-advarsel", () => {
  const h = renderHovedtal(bGreve);
  assert.ok(h.toLowerCase().includes("ufuldstændigt"), "skal sige at estimatet er ufuldstændigt");
  assert.ok(h.toLowerCase().includes("transport"), "skal nævne hvad der mangler");
});

test("hovedtal: fuldt oplyst kommune får ingen advarsel", () => {
  const h = renderHovedtal(bThisted);
  assert.ok(!h.toLowerCase().includes("ufuldstændigt"));
});

// ---------- Nedbrydning ----------

// Hjælper: træk netop den ene komponentrække ud, så assertions ikke kan
// bestå ved et tilfælde, fordi et andet tal et andet sted ser rigtigt ud.
function komponentRaekke(html, komponent) {
  const efter = html.split(`data-komponent="${komponent}"`)[1];
  assert.ok(efter, `fandt ingen række for ${komponent}`);
  return efter.split("</li>")[0];
}

test("nedbrydning: uoplyst transport står som ikke opgjort, ikke som nul", () => {
  const raekke = komponentRaekke(renderNedbrydning(bGreve, prod), "transport");
  assert.ok(raekke.toLowerCase().includes("ikke opgjort"));
  assert.ok(!raekke.includes("ton"), "en uoplyst komponent må slet ikke have et tal");
  assert.ok(!raekke.includes("<rect"), "og heller ikke en søjle med længde nul");
});

test("nedbrydning: oplyst transport har både tal og søjle", () => {
  const raekke = komponentRaekke(renderNedbrydning(bThisted, prod), "transport");
  assert.ok(raekke.includes("ton"));
  assert.ok(raekke.includes("<rect"));
  assert.ok(!raekke.toLowerCase().includes("ikke opgjort"));
});

test("nedbrydning: oplyst transport vises som tal", () => {
  const n = renderNedbrydning(bThisted, prod);
  assert.ok(!n.toLowerCase().includes("ikke opgjort"));
  assert.ok(n.includes("Transport"));
});

test("nedbrydning: alle fire komponenter er navngivet", () => {
  const n = renderNedbrydning(bThisted, prod);
  for (const navn of ["Anker", "Indkomst", "Transport", "Byggeri"]) {
    assert.ok(n.includes(navn), `mangler ${navn}`);
  }
});

test("nedbrydning: utilstrækkeligt datagrundlag giver tom streng", () => {
  assert.equal(renderNedbrydning(bUden, prod), "");
});

// ---------- Driver-tabel ----------

test("drivertabel: har en række pr. driver", () => {
  const d = renderDriverTabel(bThisted);
  const raekker = (d.match(/<tr/g) || []).length;
  assert.equal(raekker, 18, "17 drivere plus én headerrække");
});

test("drivertabel: manglende driver vises som tankestreg", () => {
  const d = renderDriverTabel(bGreve); // Greve mangler affald og elco2
  assert.ok(d.includes("–"), "manglende værdi skal vises som tankestreg");
});

test("drivertabel: de to volatile drivere bærer forbehold ved tallet", () => {
  const d = renderDriverTabel(bThisted);
  assert.ok(d.includes("El-CO2"), "elco2-driveren skal være med");
  assert.ok(d.includes("Boligpris"), "boligpris-driveren skal være med");
  assert.ok(d.includes("Lokal VE-dækning"), "VE-dækningen skal stå ved siden af el-CO2");
  const forbehold = (d.match(/tip-boks/g) || []).length;
  assert.ok(forbehold >= 3, `forventede mindst 3 forbehold, fandt ${forbehold}`);
});

test("drivertabel: bruger egen tooltip, ikke browserens title", () => {
  const d = renderDriverTabel(bThisted);
  assert.ok(!/\stitle="/.test(d), "native title har 0,5-1 sek forsinkelse - brug .tip");
});

// ---------- Boligpris-følsomhed ----------

test("boligpris: Thisted har gyldigt mønster og får indhold", () => {
  assert.equal(bThisted.boligpris.vises, true);
  assert.ok(renderBoligpris(bThisted).length > 0);
});

test("boligpris: Greve har ugyldigt mønster og får tom streng", () => {
  assert.equal(bGreve.boligpris.vises, false);
  assert.equal(renderBoligpris(bGreve), "", "aldrig et tal uden gyldigt mønster");
});

// ---------- Samlet kommunevisning ----------

test("kommunevisning: indeholder alle sektioner i rigtig rækkefølge", () => {
  const k = renderKommune(bThisted, prod);
  const iHoved = k.indexOf("Thisted");
  const iNed = k.indexOf("Anker");
  const iDriv = k.indexOf("Disponibel indkomst");
  assert.ok(iHoved >= 0 && iNed > iHoved, "nedbrydning efter hovedtal");
  assert.ok(iDriv > iNed, "drivertabel efter nedbrydning - sammensætningen først");
});

test("kommunevisning: intet output indeholder undefined, NaN eller null", () => {
  for (const b of [bThisted, bGreve, bUden]) {
    const k = renderKommune(b, prod);
    assert.ok(!k.includes("undefined"), `${b.navn}: undefined lækket til output`);
    assert.ok(!k.includes("NaN"), `${b.navn}: NaN lækket til output`);
    assert.ok(!/>\s*null\s*</.test(k), `${b.navn}: null lækket til output`);
  }
});

test("kommunevisning: forbeholdet følger med, også når sidehovedet skjules", () => {
  // I embed-tilstand skjules header med den store ansvarsfraskrivelse. En
  // indlejret widget må ikke stå tilbage med et tal og intet forbehold.
  const k = renderKommune(bThisted, prod);
  const sektion = k.split("Uofficielt førsteordens-skøn")[1];
  assert.ok(sektion, "den kompakte fraskrivelse mangler");
  const foer = k.slice(0, k.indexOf("Uofficielt førsteordens-skøn"));
  const afsnit = k.slice(k.lastIndexOf("<section", k.indexOf("Uofficielt førsteordens-skøn")));
  assert.ok(!afsnit.slice(0, 200).includes("no-embed"),
    "fraskrivelsen må ikke være mærket no-embed - så forsvinder den i en iframe");
  assert.ok(foer.length > 0);
});
