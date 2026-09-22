// Selve filformatet.
//
// Eksporten skriver xlsx-filen i hånden, fordi repoet ingen bundler har og
// ingen runtime-afhængigheder vil have. Det er en fin pris at betale, lige til
// den dag en tegnsætning eller en forkert længde gør filen ulæselig for Excel
// uden at nogen opdager det - fejlbeskeden dér er "filen kan ikke åbnes", og
// den peger ingen steder hen.
//
// Testene her pakker arkivet ud igen og læser delene efter: at hver post har
// den CRC og den længde, kataloget lover, at hver XML-del er velformet, og at
// formelcellerne står uden cachet værdi, så regnearket faktisk regner ved
// åbning frem for at vise et tal, formlen ikke længere giver.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bygXlsx, kolonneNavn, celleNavn, xmlEsc, STILNAVNE } from "../web/xlsx.js";

// ---------- En lille zip-læser ----------

function laesZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find slutkataloget bagfra. Kommentarfeltet er tomt, så det står til sidst.
  let slut = bytes.length - 22;
  while (slut >= 0 && dv.getUint32(slut, true) !== 0x06054b50) slut--;
  assert.ok(slut >= 0, "arkivet har intet slutkatalog");
  const antal = dv.getUint16(slut + 10, true);
  let p = dv.getUint32(slut + 16, true);

  const filer = new Map();
  for (let i = 0; i < antal; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50, "katalogposten er ikke en katalogpost");
    const crc = dv.getUint32(p + 16, true);
    const komprimeret = dv.getUint32(p + 20, true);
    const raa = dv.getUint32(p + 24, true);
    const navnLaengde = dv.getUint16(p + 28, true);
    const forskydning = dv.getUint32(p + 42, true);
    const navn = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + navnLaengde));
    assert.equal(komprimeret, raa, `${navn} er mærket komprimeret`);

    assert.equal(dv.getUint32(forskydning, true), 0x04034b50, `${navn}: forkert filhoved`);
    assert.equal(dv.getUint16(forskydning + 8, true), 0, `${navn}: metoden er ikke "lagret"`);
    const lokaltNavn = dv.getUint16(forskydning + 26, true);
    const ekstra = dv.getUint16(forskydning + 28, true);
    const start = forskydning + 30 + lokaltNavn + ekstra;
    const data = bytes.subarray(start, start + raa);
    assert.equal(data.length, raa, `${navn}: for kort`);
    assert.equal(crc32(data), crc, `${navn}: CRC passer ikke`);
    filer.set(navn, new TextDecoder().decode(data));
    p += 46 + navnLaengde + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return filer;
}

function crc32(bytes) {
  let c;
  const t = [];
  for (let i = 0; i < 256; i++) {
    c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  let ud = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) ud = t[(ud ^ bytes[i]) & 0xff] ^ (ud >>> 8);
  return (ud ^ 0xffffffff) >>> 0;
}

/** Velformet XML: tags går op, og der står ingen bar < eller & i teksten.
 *  Node har ingen XML-læser indbygget, og en fuld parser ville være en
 *  afhængighed mere - men netop de to fejl er dem, en escaping-brist giver. */
function tjekXml(xml, navn) {
  const uden = xml.replace(/<\?[^>]*\?>/g, "");
  const stak = [];
  const tag = /<(\/?)([A-Za-z_:][\w:.-]*)((?:[^<>"]|"[^"]*")*?)(\/?)>/g;
  let sidste = 0;
  let m;
  while ((m = tag.exec(uden))) {
    const tekst = uden.slice(sidste, m.index);
    assert.ok(!/[<]/.test(tekst), `${navn}: bart < i teksten`);
    assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(tekst), `${navn}: bart & i teksten`);
    sidste = tag.lastIndex;
    if (m[4] === "/") continue;
    if (m[1] === "/") {
      assert.equal(stak.pop(), m[2], `${navn}: ${m[2]} lukker det forkerte tag`);
    } else stak.push(m[2]);
  }
  assert.equal(stak.length, 0, `${navn}: ${stak.join(", ")} blev aldrig lukket`);
  assert.ok(sidste > 0, `${navn}: ingen tags overhovedet`);
}

const enkelt = () => [{
  navn: "Prøve",
  kolonner: [{ bredde: 20 }, { bredde: 12 }],
  frys: { raekke: 1, kolonne: 1 },
  autofilter: "A1:B3",
  raekker: [
    ["Navn", "Tal"],
    [{ v: "Ærø & Læsø <mest>", stil: "tekst" }, { v: 1.5, stil: "vaerdi" }],
    [{ v: "x", stil: "fed" }, { f: 'IF(B2="","",B2*2)', stil: "beregnet" }],
  ],
}];

// ---------- Arkivet ----------

test("xlsx: arkivet kan pakkes ud igen, post for post", () => {
  const filer = laesZip(bygXlsx(enkelt(), new Date("2026-09-22T10:00:00Z")));
  assert.deepEqual([...filer.keys()].sort(), [
    "[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels",
    "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml",
  ].sort());
});

test("xlsx: hver del er velformet XML", () => {
  const filer = laesZip(bygXlsx(enkelt(), new Date("2026-09-22T10:00:00Z")));
  for (const [navn, indhold] of filer) tjekXml(indhold, navn);
});

test("xlsx: æ, ø, å og tegn, XML ikke tåler, overlever turen", () => {
  const filer = laesZip(bygXlsx(enkelt(), new Date("2026-09-22T10:00:00Z")));
  const ark = filer.get("xl/worksheets/sheet1.xml");
  assert.ok(ark.includes("Ærø &amp; Læsø &lt;mest&gt;"), "teksten er ikke escapet rigtigt");
  assert.ok(!ark.includes("Læsø <mest>"), "et bart < slap igennem");
});

test("xlsx: en formelcelle står uden cachet værdi", () => {
  // fullCalcOnLoad beder regnearket regne ved åbning. Skrev vi en cachet
  // værdi ved siden af formlen, ville et ark, hvor nogen har rettet sine egne
  // tal, kunne vise det gamle resultat, til man trykkede genberegn.
  const filer = laesZip(bygXlsx(enkelt(), new Date("2026-09-22T10:00:00Z")));
  const celle = filer.get("xl/worksheets/sheet1.xml").match(/<c r="B3"[^>]*>.*?<\/c>/)[0];
  assert.ok(celle.includes("<f>"), "formlen mangler");
  assert.ok(!celle.includes("<v>"), "formelcellen bærer en cachet værdi");
  assert.ok(filer.get("xl/workbook.xml").includes('fullCalcOnLoad="1"'));
});

test("xlsx: kolonnebredder, frosne ruder og autofilter kommer med", () => {
  const ark = laesZip(bygXlsx(enkelt())).get("xl/worksheets/sheet1.xml");
  assert.ok(ark.includes('width="20"'));
  assert.ok(ark.includes('state="frozen"'));
  assert.ok(ark.includes('<autoFilter ref="A1:B3"/>'));
  // Rækkefølgen er skemaets, ikke vores: autoFilter skal stå EFTER sheetData.
  assert.ok(ark.indexOf("</sheetData>") < ark.indexOf("<autoFilter"),
    "autoFilter står før sheetData, og så afviser Excel filen");
});

test("xlsx: hvert ark får sin egen del og sin egen relation", () => {
  const ark = [
    { navn: "Et", raekker: [["a"]] },
    { navn: "To", raekker: [["b"]] },
    { navn: "Tre", raekker: [["c"]] },
  ];
  const filer = laesZip(bygXlsx(ark));
  for (let i = 1; i <= 3; i++) {
    assert.ok(filer.has(`xl/worksheets/sheet${i}.xml`), `ark ${i} mangler`);
    assert.ok(filer.get("xl/_rels/workbook.xml.rels").includes(`sheet${i}.xml`));
    assert.ok(filer.get("[Content_Types].xml").includes(`sheet${i}.xml`));
  }
  assert.ok(filer.get("xl/workbook.xml").includes('name="Tre"'));
});

// ---------- Værn ----------

test("xlsx: to ark med samme navn er en fejl, ikke en fil Excel afviser", () => {
  assert.throws(() => bygXlsx([{ navn: "Et", raekker: [["a"]] },
    { navn: "Et", raekker: [["b"]] }]), /samme navn/);
});

test("xlsx: et arknavn klippes til de 31 tegn, formatet tillader", () => {
  const langt = "Et arknavn der er alt for langt til at stå i en fane";
  const filer = laesZip(bygXlsx([{ navn: langt, raekker: [["a"]] }]));
  assert.ok(filer.get("xl/workbook.xml").includes(`name="${xmlEsc(langt.slice(0, 31))}"`));
});

test("xlsx: en ukendt stil er en fejl, ikke en celle uden formatering", () => {
  assert.throws(() => bygXlsx([{ navn: "Et", raekker: [[{ v: 1, stil: "findes-ikke" }]] }]),
    /ukendt stil/);
  assert.ok(STILNAVNE.includes("indtast"), "indtastningsstilen mangler");
});

test("xlsx: en tom eller ikke-endelig værdi bliver til ingen celle", () => {
  // Manglende data må aldrig vises som nul - heller ikke som et tomt nul.
  const ark = laesZip(bygXlsx([{ navn: "Et",
    raekker: [[{ v: null }, { v: "" }, { v: NaN }, { v: Infinity }, { v: 0 }]] }]))
    .get("xl/worksheets/sheet1.xml");
  assert.equal((ark.match(/<c /g) ?? []).length, 1, "kun nulcellen skulle overleve");
  assert.ok(ark.includes('r="E1"'), "et ægte nul skal stadig stå");
});

test("xlsx: celleadresser regnes rigtigt forbi Z", () => {
  assert.equal(kolonneNavn(1), "A");
  assert.equal(kolonneNavn(26), "Z");
  assert.equal(kolonneNavn(27), "AA");
  assert.equal(kolonneNavn(52), "AZ");
  assert.equal(celleNavn(3, 12), "C12");
});
