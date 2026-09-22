// Minimal XLSX-skriver. Ingen afhængigheder, ingen DOM, ingen I/O.
//
// HVORFOR EN EGEN SKRIVER OG IKKE ET BIBLIOTEK. Repoet har ingen bundler og
// ingen runtime-afhængigheder - siden er rene ES-moduler, der serveres, som de
// står. Et regnearksbibliotek ville betyde enten et CDN-kald på hver
// sidevisning eller et byggetrin, og begge dele ville koste mere end de 200
// linjer her. Vi bruger desuden en meget lille del af formatet: celler med tal,
// tekst, formler og et dusin stilarter.
//
// HVAD DEN KAN, OG HVAD DEN IKKE KAN. Den skriver et gyldigt OOXML-regneark
// med flere ark, kolonnebredder, frosne ruder, autofilter, talformater og
// formler. Den kan ikke diagrammer, billeder, betinget formatering eller
// pivottabeller, og den læser ikke filer. Får et ark brug for mere, hører det
// sandsynligvis ikke hjemme i en eksport, der skal kunne læses af mennesker.
//
// Zip-arkivet skrives UKOMPRIMERET (metode 0). Deflate ville kræve enten
// CompressionStream, som er asynkron og først findes i nyere browsere, eller en
// egen deflate-implementering. Et ark på et par hundrede kilobyte er ikke værd
// at betale nogen af delene for, og Excel, Numbers og LibreOffice læser lagrede
// poster uden at blinke.

// ---------- XML ----------

const XML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** Escaper XML og fjerner styretegn, som ikke må stå i et XML 1.0-dokument.
 *  Teksten kommer fra vores egne datafiler, men en tabulator eller et
 *  nul-tegn i en kildebeskrivelse ville gøre hele filen ulæselig. */
export function xmlEsc(v) {
  if (v == null) return "";
  return String(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[&<>"']/g, (c) => XML_ESC[c]);
}

/** Kolonnenummer til bogstaver: 1 -> A, 27 -> AA. */
export function kolonneNavn(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = (n - 1 - r) / 26;
  }
  return s;
}

/** Celleadresse: (3, 2) -> "C2". */
export const celleNavn = (kol, raekke) => `${kolonneNavn(kol)}${raekke}`;

// ---------- Stilarter ----------
//
// Stilarterne er navngivne, så arkene beder om "overskrift" og ikke om
// indeks 4. Rækkefølgen i hver liste ER indekset i den færdige styles.xml, og
// Excel kræver at fyld 0 er "none" og fyld 1 er "gray125" - de to pladser er
// reserveret af formatet selv.

const TALFORMATER = [
  "#,##0.######",           // 164 rådata: mange decimaler, tusindtalsskilletegn
  "#,##0.###",              // 165 nøgletal
  '0.0" %"',                // 166 værdier der allerede står i procent (0-100)
  "0.0%",                   // 167 andele (0-1)
  "+0.0%;-0.0%;0.0%",       // 168 afvigelse med eksplicit fortegn
  "0.00",                   // 169 ton pr. indbygger
  "0",                      // 170 årstal og antal
];
const FORMAT_ID = 164;

const FONTE = [
  { },                                              // 0 normal
  { b: true },                                      // 1 fed
  { b: true, farve: "FFFFFFFF" },                   // 2 fed hvid (tabelhoved)
  { i: true, farve: "FF6B7280" },                   // 3 kursiv grå (noter)
  { b: true, str: 15 },                             // 4 titel
  { b: true, str: 12 },                             // 5 afsnitsoverskrift
  { farve: "FF6B7280", str: 10 },                   // 6 lille grå
  { farve: "FF1D4ED8", u: true },                   // 7 link
];

const FYLD = [
  null,                 // 0 none  (reserveret af formatet)
  null,                 // 1 gray125 (reserveret af formatet)
  "FF374151",           // 2 tabelhoved, mørk grå
  "FFFEF3C7",           // 3 indtastning, gul
  "FFECFDF5",           // 4 anvendt værdi, grøn
  "FFF3F4F6",           // 5 beregnet, lys grå
];

// 0 ingen kant, 1 tynd hele vejen rundt
const KANTER = [null, "alle"];

// navn -> [talformat, font, fyld, kant, ombryd, lodret, vandret]
const STILARTER = {
  normal:      [null, 0, 0, 0, false, null, null],
  titel:       [null, 4, 0, 0, false, null, null],
  afsnit:      [null, 5, 0, 0, false, null, null],
  fed:         [null, 1, 0, 0, false, null, null],
  overskrift:  [null, 2, 2, 0, true, "center", null],
  tekst:       [null, 0, 0, 0, true, "top", null],
  note:        [null, 3, 0, 0, true, "top", null],
  lille:       [null, 6, 0, 0, true, "top", null],
  link:        [null, 7, 0, 0, false, "top", null],
  raa:         ["#,##0.######", 0, 0, 0, false, "top", null],
  vaerdi:      ["#,##0.###", 0, 0, 0, false, "top", null],
  vaerdiPct:   ["0.0%", 0, 0, 0, false, "top", null],
  afvigelse:   ["+0.0%;-0.0%;0.0%", 1, 0, 0, false, "top", null],
  ton:         ["0.00", 0, 0, 0, false, "top", null],
  antal:       ["0", 0, 0, 0, false, "top", null],
  // Indtastningsceller: gul bund og kant, så de er til at få øje på uden at
  // skulle læse vejledningen først.
  indtast:     ["#,##0.######", 0, 3, 1, false, "top", null],
  indtastTekst: [null, 0, 3, 1, true, "top", null],
  // Anvendt værdi: den celle, resten af arket regner på.
  anvendt:     ["#,##0.######", 1, 4, 1, false, "top", null],
  beregnet:    ["#,##0.###", 0, 5, 0, false, "top", null],
  beregnetPct: ["0.0%", 0, 5, 0, false, "top", null],
  beregnetPct100: ['0.0" %"', 0, 5, 0, false, "top", null],
  signal:      [null, 1, 5, 0, false, "top", null],
  advarsel:    [null, 1, 3, 0, true, "top", null],
};

function stilarkXml() {
  const numFmts = TALFORMATER
    .map((k, i) => `<numFmt numFmtId="${FORMAT_ID + i}" formatCode="${xmlEsc(k)}"/>`).join("");
  const fonts = FONTE.map((f) =>
    `<font><sz val="${f.str ?? 11}"/><color rgb="${f.farve ?? "FF111827"}"/>`
    + `<name val="Calibri"/><family val="2"/>`
    + `${f.b ? "<b/>" : ""}${f.i ? "<i/>" : ""}${f.u ? "<u/>" : ""}</font>`).join("");
  const fills = FYLD.map((f, i) =>
    i === 0 ? '<fill><patternFill patternType="none"/></fill>'
    : i === 1 ? '<fill><patternFill patternType="gray125"/></fill>'
    : `<fill><patternFill patternType="solid"><fgColor rgb="${f}"/>`
      + '<bgColor indexed="64"/></patternFill></fill>').join("");
  const kant = '<left style="thin"><color rgb="FFD1D5DB"/></left>'
    + '<right style="thin"><color rgb="FFD1D5DB"/></right>'
    + '<top style="thin"><color rgb="FFD1D5DB"/></top>'
    + '<bottom style="thin"><color rgb="FFD1D5DB"/></bottom>';
  const borders = KANTER.map((b) => (b === "alle"
    ? `<border>${kant}<diagonal/></border>`
    : "<border><left/><right/><top/><bottom/><diagonal/></border>")).join("");

  const xfs = Object.values(STILARTER).map(([fmt, font, fyld, kantIdx, ombryd, lodret]) => {
    const fmtId = fmt == null ? 0 : FORMAT_ID + TALFORMATER.indexOf(fmt);
    const just = ombryd || lodret
      ? `<alignment${ombryd ? ' wrapText="1"' : ""}${lodret ? ` vertical="${lodret}"` : ""}/>`
      : "";
    return `<xf numFmtId="${fmtId}" fontId="${font}" fillId="${fyld}" borderId="${kantIdx}"`
      + ` xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"`
      + `${just ? ' applyAlignment="1"' : ""}>${just}</xf>`;
  }).join("");

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<numFmts count="${TALFORMATER.length}">${numFmts}</numFmts>`
    + `<fonts count="${FONTE.length}">${fonts}</fonts>`
    + `<fills count="${FYLD.length}">${fills}</fills>`
    + `<borders count="${KANTER.length}">${borders}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${Object.keys(STILARTER).length}">${xfs}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + "</styleSheet>";
}

const STIL_INDEKS = Object.fromEntries(Object.keys(STILARTER).map((n, i) => [n, i]));

/** Stilnavnene, så eksporten kan tjekkes mod dem i stedet for at stave forkert
 *  og få indeks 0 uden at opdage det. */
export const STILNAVNE = Object.keys(STILARTER);

// ---------- Celler og ark ----------

/** Normaliserer en celle til {v, f, stil, type}. En streng eller et tal kan
 *  skrives direkte; alt andet skrives som objekt.
 *
 *  EN TOM CELLE MED EN STIL BLIVER TIL EN CELLE. Det er ikke en detalje:
 *  indtastningscellerne er tomme, til nogen udfylder dem, og det er netop
 *  deres gule bund, der siger, at de er til at skrive i. Faldt de ud, fordi de
 *  var tomme, ville vejledningen love et gult felt, der ikke fandtes.
 *  En celle UDEN stil falder derimod ud, som den skal: manglende data må ikke
 *  ende som en tom celle, der ser formateret og dermed udfyldt ud. */
function normaliser(celle) {
  if (celle == null || celle === "") return null;
  if (typeof celle === "number") {
    return Number.isFinite(celle) ? { v: celle, type: "n", stil: "normal" } : null;
  }
  if (typeof celle === "string") return { v: celle, type: "s", stil: "normal" };
  const beder_om_stil = Object.hasOwn(celle, "stil");
  const stil = celle.stil ?? "normal";
  if (!(stil in STILARTER)) throw new Error(`ukendt stil: ${stil}`);
  if (celle.f != null) return { f: celle.f, stil, type: celle.type ?? "n" };
  const v = celle.v;
  const tom = () => (beder_om_stil ? { type: "tom", stil } : null);
  if (v == null || v === "") return tom();
  const type = celle.type ?? (typeof v === "number" ? "n" : "s");
  if (type === "n" && !Number.isFinite(v)) return tom();
  return { v, type, stil };
}

function celleXml(kol, raekke, celle) {
  const c = normaliser(celle);
  if (!c) return "";
  const adr = celleNavn(kol, raekke);
  const s = STIL_INDEKS[c.stil];
  // Formelceller skrives UDEN cachet værdi. Regnearket har fullCalcOnLoad,
  // så Excel og LibreOffice regner dem ud ved åbning. Skrev vi en cachet
  // værdi, ville den kunne komme til at stå og modsige formlen.
  if (c.f != null) return `<c r="${adr}" s="${s}"><f>${xmlEsc(c.f)}</f></c>`;
  if (c.type === "tom") return `<c r="${adr}" s="${s}"/>`;
  if (c.type === "n") return `<c r="${adr}" s="${s}"><v>${c.v}</v></c>`;
  return `<c r="${adr}" s="${s}" t="inlineStr"><is>`
    + `<t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
}

function arkXml(ark) {
  const raekker = ark.raekker.map((r, i) => {
    const nr = i + 1;
    const celler = (Array.isArray(r) ? r : r.celler)
      .map((c, j) => celleXml(j + 1, nr, c)).join("");
    const hoejde = Array.isArray(r) ? null : r.hoejde;
    const attr = hoejde ? ` ht="${hoejde}" customHeight="1"` : "";
    return `<row r="${nr}"${attr}>${celler}</row>`;
  }).join("");

  const cols = (ark.kolonner ?? []).map((k, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${k.bredde ?? 12}" customWidth="1"/>`).join("");

  // Frosne ruder: alt over `raekke` og til venstre for `kolonne` bliver stående.
  const f = ark.frys;
  const rude = f
    ? `<pane xSplit="${f.kolonne ?? 0}" ySplit="${f.raekke ?? 0}" `
      + `topLeftCell="${celleNavn((f.kolonne ?? 0) + 1, (f.raekke ?? 0) + 1)}" `
      + 'activePane="bottomRight" state="frozen"/>'
      + '<selection pane="bottomRight"/>'
    : "";

  const bredde = Math.max(1, ...ark.raekker.map((r) => (Array.isArray(r) ? r : r.celler).length));
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<dimension ref="A1:${celleNavn(bredde, Math.max(1, ark.raekker.length))}"/>`
    + `<sheetViews><sheetView workbookViewId="0"${ark.gitter === false ? ' showGridLines="0"' : ""}>`
    + `${rude}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + (cols ? `<cols>${cols}</cols>` : "")
    + `<sheetData>${raekker}</sheetData>`
    // autoFilter SKAL stå efter sheetData og før mergeCells - skemaet er
    // rækkefølgefølsomt, og Excel afviser filen uden en fejlbesked, der siger
    // hvorfor.
    + (ark.autofilter ? `<autoFilter ref="${xmlEsc(ark.autofilter)}"/>` : "")
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + "</worksheet>";
}

// Arknavne må højst fylde 31 tegn, og Excel afviser : \ / ? * [ ].
const ULOVLIGT_I_ARKNAVN = /[:\\/?*[\]]/g;
function arknavn(navn) {
  return String(navn).replace(ULOVLIGT_I_ARKNAVN, " ").slice(0, 31);
}

// ---------- Zip ----------

let CRC_TABEL = null;
function crcTabel() {
  if (CRC_TABEL) return CRC_TABEL;
  CRC_TABEL = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABEL[i] = c >>> 0;
  }
  return CRC_TABEL;
}

function crc32(bytes) {
  const t = crcTabel();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS' dato- og tidsformat fra 1980. Zip har aldrig lært noget andet. */
function dosStempel(dato) {
  const aar = Math.max(1980, dato.getFullYear());
  return {
    tid: (dato.getHours() << 11) | (dato.getMinutes() << 5) | (dato.getSeconds() >> 1),
    dato: ((aar - 1980) << 9) | ((dato.getMonth() + 1) << 5) | dato.getDate(),
  };
}

class Byte {
  constructor() { this.dele = []; this.laengde = 0; }
  raa(bytes) { this.dele.push(bytes); this.laengde += bytes.length; }
  u16(v) { this.raa(new Uint8Array([v & 0xff, (v >>> 8) & 0xff])); }
  u32(v) {
    this.raa(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
  }
  ud() {
    const ud = new Uint8Array(this.laengde);
    let i = 0;
    for (const d of this.dele) { ud.set(d, i); i += d.length; }
    return ud;
  }
}

/** Zip-arkiv med lagrede (ukomprimerede) poster. */
function zip(filer, dato) {
  const { tid, dato: dagen } = dosStempel(dato);
  const ud = new Byte();
  const katalog = [];
  for (const { navn, data } of filer) {
    const navnBytes = new TextEncoder().encode(navn);
    const crc = crc32(data);
    katalog.push({ navn: navnBytes, crc, stoerrelse: data.length, forskydning: ud.laengde });
    ud.u32(0x04034b50); ud.u16(20); ud.u16(0); ud.u16(0);
    ud.u16(tid); ud.u16(dagen);
    ud.u32(crc); ud.u32(data.length); ud.u32(data.length);
    ud.u16(navnBytes.length); ud.u16(0);
    ud.raa(navnBytes); ud.raa(data);
  }
  const katalogStart = ud.laengde;
  for (const p of katalog) {
    ud.u32(0x02014b50); ud.u16(20); ud.u16(20); ud.u16(0); ud.u16(0);
    ud.u16(tid); ud.u16(dagen);
    ud.u32(p.crc); ud.u32(p.stoerrelse); ud.u32(p.stoerrelse);
    ud.u16(p.navn.length); ud.u16(0); ud.u16(0); ud.u16(0); ud.u16(0);
    ud.u32(0); ud.u32(p.forskydning);
    ud.raa(p.navn);
  }
  const katalogLaengde = ud.laengde - katalogStart;
  ud.u32(0x06054b50); ud.u16(0); ud.u16(0);
  ud.u16(katalog.length); ud.u16(katalog.length);
  ud.u32(katalogLaengde); ud.u32(katalogStart); ud.u16(0);
  return ud.ud();
}

// ---------- Samlingen ----------

const NS_PAKKE = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_DOK = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Byg en xlsx-fil af en liste ark. Returnerer bytes, ikke en fil - hvordan de
 *  havner hos brugeren, er DOM-lagets sag. */
export function bygXlsx(ark, dato = new Date()) {
  if (!Array.isArray(ark) || ark.length === 0) throw new Error("ingen ark at skrive");
  const navne = ark.map((a) => arknavn(a.navn));
  if (new Set(navne).size !== navne.length) throw new Error("to ark har samme navn");

  const sheets = navne
    .map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ` xmlns:r="${NS_DOK}">`
    + `<sheets>${sheets}</sheets>`
    // fullCalcOnLoad: formlerne står uden cachet værdi og regnes ved åbning.
    + '<calcPr calcId="0" fullCalcOnLoad="1"/>'
    + "</workbook>";

  const arkRels = ark
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_DOK}/worksheet"`
      + ` Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<Relationships xmlns="${NS_PAKKE}">${arkRels}`
    + `<Relationship Id="rId${ark.length + 1}" Type="${NS_DOK}/styles" Target="styles.xml"/>`
    + "</Relationships>";

  const overrides = ark.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd`
    + '.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("");
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package'
    + '.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats'
    + '-officedocument.spreadsheetml.sheet.main+xml"/>'
    + overrides
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats'
    + '-officedocument.spreadsheetml.styles+xml"/></Types>';

  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<Relationships xmlns="${NS_PAKKE}"><Relationship Id="rId1"`
    + ` Type="${NS_DOK}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const koder = new TextEncoder();
  const filer = [
    { navn: "[Content_Types].xml", data: koder.encode(contentTypes) },
    { navn: "_rels/.rels", data: koder.encode(rels) },
    { navn: "xl/workbook.xml", data: koder.encode(workbook) },
    { navn: "xl/_rels/workbook.xml.rels", data: koder.encode(workbookRels) },
    { navn: "xl/styles.xml", data: koder.encode(stilarkXml()) },
    ...ark.map((a, i) => ({
      navn: `xl/worksheets/sheet${i + 1}.xml`, data: koder.encode(arkXml(a)),
    })),
  ];
  return zip(filer, dato);
}
