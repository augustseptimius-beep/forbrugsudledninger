// En lille regnemotor til testbrug.
//
// HVORFOR DEN FINDES. Regnearkseksporten lægger regnestykket ud som FORMLER,
// så den, der henter arket, kan sætte sine egne tal ind. En test, der kun
// kigger på formelstrengene, kan se, at der står noget - ikke at det regner
// rigtigt. Motoren her regner arket igennem, så testene kan holde hver enkelt
// celle op mod beregning.js og fange den dag, en formel kommer til at sige
// noget andet end motoren.
//
// Den kan præcis den delmængde af Excel, eksporten selv bruger, og ikke en
// linje mere. Møder den en funktion, eksporten ikke skriver, kaster den -
// bedre end at gætte og stille svare forkert.
//
// TOMME CELLER ER "", IKKE NUL. Det er hele pointen i eksportens værn: en
// tom celle må aldrig blive til et nul, der ligner en måling. Regnestykker på
// "" kaster #VALUE!, som IFERROR fanger, præcis som i Excel.

const ER_FEJL = Symbol("fejl");
const fejl = (kode) => Object.assign(new Error(kode), { [ER_FEJL]: true });

// ---------- Tokenisering ----------

const TOKEN = new RegExp([
  '"(?:[^"]|"")*"',                                   // streng
  "(?:[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*!)?\\$?[A-Z]+\\$?[0-9]+", // celle, evt. med ark
  "[0-9]+(?:\\.[0-9]+)?",                             // tal
  "[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*",                    // funktionsnavn
  "<=|>=|<>|[-+*/&(),:<>=]",                          // operatorer
].join("|"), "gy");

function del(formel) {
  const ud = [];
  TOKEN.lastIndex = 0;
  let i = 0;
  while (i < formel.length) {
    if (formel[i] === " ") { i++; continue; }
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(formel);
    if (!m) throw new Error(`kan ikke læse formlen ved "${formel.slice(i, i + 20)}"`);
    ud.push(m[0]);
    i = TOKEN.lastIndex;
  }
  return ud;
}

// ---------- Arkbog ----------

const kolonneTal = (bogstaver) =>
  [...bogstaver].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);

const ADRESSE = /^(?:(.+)!)?\$?([A-Z]+)\$?([0-9]+)$/;

/** Byg en opslagsbar arkbog af eksportens arkmodel. */
export function lavArkbog(ark) {
  const ark_ = new Map();
  for (const a of ark) {
    const celler = new Map();
    a.raekker.forEach((r, i) => {
      const liste = Array.isArray(r) ? r : r.celler;
      liste.forEach((c, j) => {
        if (c == null || c === "") return;
        const adr = `${kolonneNavn(j + 1)}${i + 1}`;
        celler.set(adr, typeof c === "object" ? c : { v: c });
      });
    });
    ark_.set(a.navn, celler);
  }
  return { ark: ark_, memo: new Map() };
}

function kolonneNavn(n) {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
  return s;
}

/** Værdien af én celle. Formler regnes ud og huskes. */
export function vaerdi(bog, arknavn, adresse) {
  const m = ADRESSE.exec(adresse);
  if (!m) throw new Error(`ugyldig adresse: ${adresse}`);
  const hvilket = m[1] ?? arknavn;
  const adr = `${m[2]}${m[3]}`;
  const noegle = `${hvilket}!${adr}`;
  if (bog.memo.has(noegle)) return bog.memo.get(noegle);
  const celler = bog.ark.get(hvilket);
  if (!celler) throw new Error(`ukendt ark: ${hvilket}`);
  const celle = celler.get(adr);
  if (celle == null) return "";
  if (celle.f == null) { bog.memo.set(noegle, celle.v); return celle.v; }
  // Cyklusværn: en formel, der peger på sig selv, ville ellers løbe løbsk.
  bog.memo.set(noegle, fejl("#CYKLUS!"));
  const ud = beregn(bog, hvilket, celle.f);
  bog.memo.set(noegle, ud);
  return ud;
}

function omraade(bog, arknavn, fra, til) {
  const a = ADRESSE.exec(fra);
  const b = ADRESSE.exec(til);
  const hvilket = a[1] ?? arknavn;
  const k1 = kolonneTal(a[2]); const k2 = kolonneTal(b[2]);
  const r1 = Number(a[3]); const r2 = Number(b[3]);
  const ud = [];
  for (let k = Math.min(k1, k2); k <= Math.max(k1, k2); k++) {
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      ud.push(vaerdi(bog, hvilket, `${hvilket}!${kolonneNavn(k)}${r}`));
    }
  }
  return ud;
}

// ---------- Funktioner ----------

/** Excels kriterier: tekst med joker, eller et tal. Sammenligning er
 *  ufølsom over for store og små bogstaver, som i Excel. */
function passer(v, kriterium) {
  if (typeof kriterium === "number") return Number(v) === kriterium;
  const k = String(kriterium);
  if (/[*?]/.test(k)) {
    const m = new RegExp(`^${k.replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
    return typeof v === "string" && m.test(v);
  }
  if (typeof v === "number" && k !== "" && !Number.isNaN(Number(k))) return v === Number(k);
  return String(v).toLowerCase() === k.toLowerCase();
}

const tael = (par) => {
  const raekker = par[0][0].length;
  let antal = 0;
  for (let i = 0; i < raekker; i++) {
    if (par.every(([omr, krit]) => passer(omr[i], krit))) antal++;
  }
  return antal;
};

const FUNKTIONER = {
  IF: (bog, arknavn, args) => (sandt(args[0]()) ? args[1]() : (args[2] ? args[2]() : false)),
  IFERROR: (bog, arknavn, args) => {
    try {
      const v = args[0]();
      return v instanceof Error ? args[1]() : v;
    } catch (e) { if (e[ER_FEJL]) return args[1](); throw e; }
  },
  OR: (bog, arknavn, args) => args.some((a) => sandt(a())),
  AND: (bog, arknavn, args) => args.every((a) => sandt(a())),
  ABS: (bog, arknavn, args) => Math.abs(tal(args[0]())),
  COUNTA: (bog, arknavn, args) => args[0]("omraade").filter((v) => v !== "").length,
  COUNTIF: (bog, arknavn, args) => tael([[args[0]("omraade"), args[1]()]]),
  COUNTIFS: (bog, arknavn, args) => {
    const par = [];
    for (let i = 0; i < args.length; i += 2) par.push([args[i]("omraade"), args[i + 1]()]);
    return tael(par);
  },
  // HYPERLINK viser sin anden parameter. Testene ser på teksten, ikke på målet.
  HYPERLINK: (bog, arknavn, args) => (args.length > 1 ? args[1]() : args[0]()),
};

const sandt = (v) => v === true || (typeof v === "number" && v !== 0);

function tal(v) {
  if (typeof v === "number") return v;
  if (v === "" || v == null) throw fejl("#VALUE!");
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw fejl("#VALUE!");
  return n;
}

// ---------- Parser ----------
//
// Almindelig rekursiv nedstigning. Hvert niveau er én forrang: sammenligning
// løsest, så tekstsammenføjning, så plus og minus, så gange og dividere.

function beregn(bog, arknavn, formel) {
  const t = del(formel);
  let i = 0;
  const kig = () => t[i];
  const tag = (forventet) => {
    const v = t[i++];
    if (forventet && v !== forventet) throw new Error(`forventede ${forventet}, fik ${v}`);
    return v;
  };

  function primaer(tilstand) {
    const v = tag();
    if (v === "(") { const ud = sammenlign(); tag(")"); return ud; }
    if (v === "-") { const ud = primaer(); return () => -tal(ud()); }
    if (v === "+") return primaer();
    if (v[0] === '"') { const s = v.slice(1, -1).replace(/""/g, '"'); return () => s; }
    if (/^[0-9]/.test(v)) { const n = Number(v); return () => n; }
    if (kig() === "(") {
      const navn = v.toUpperCase();
      const fn = FUNKTIONER[navn];
      if (!fn) throw new Error(`ukendt funktion: ${navn}`);
      tag("(");
      const args = [];
      if (kig() !== ")") {
        args.push(sammenlign());
        while (kig() === ",") { tag(","); args.push(sammenlign()); }
      }
      tag(")");
      return () => fn(bog, arknavn, args);
    }
    if (kig() === ":") {
      tag(":");
      const til = tag();
      return (som) => {
        const liste = omraade(bog, arknavn, v, til);
        // Et område brugt som enkeltværdi giver sin første celle. Kun
        // tælle-funktionerne beder om hele listen.
        return som === "omraade" ? liste : liste[0];
      };
    }
    if (ADRESSE.test(v)) return () => vaerdi(bog, arknavn, v);
    throw new Error(`kan ikke læse "${v}" i ${formel}`);
  }

  function gange() {
    let venstre = primaer();
    while (kig() === "*" || kig() === "/") {
      const op = tag();
      const hoejre = primaer();
      const v = venstre;
      venstre = () => {
        const a = tal(v()); const b = tal(hoejre());
        if (op === "/" && b === 0) throw fejl("#DIV/0!");
        return op === "*" ? a * b : a / b;
      };
    }
    return venstre;
  }

  function plus() {
    let venstre = gange();
    while (kig() === "+" || kig() === "-") {
      const op = tag();
      const hoejre = gange();
      const v = venstre;
      venstre = () => (op === "+" ? tal(v()) + tal(hoejre()) : tal(v()) - tal(hoejre()));
    }
    return venstre;
  }

  function sammenfoej() {
    let venstre = plus();
    while (kig() === "&") {
      tag("&");
      const hoejre = plus();
      const v = venstre;
      venstre = () => `${tekst(v())}${tekst(hoejre())}`;
    }
    return venstre;
  }

  function sammenlign() {
    let venstre = sammenfoej();
    while (["=", "<>", "<", ">", "<=", ">="].includes(kig())) {
      const op = tag();
      const hoejre = sammenfoej();
      const v = venstre;
      venstre = () => lig(op, v(), hoejre());
    }
    return venstre;
  }

  const ud = sammenlign();
  if (i !== t.length) throw new Error(`overskydende tegn i ${formel}`);
  return ud();
}

const tekst = (v) => (v === "" || v == null ? "" : String(v));

function lig(op, a, b) {
  // Excel sammenligner tal med tal og tekst med tekst; en tom celle mod ""
  // er sand, og det er netop den test, eksportens værn bygger på.
  const beggeTal = typeof a === "number" && typeof b === "number";
  const x = beggeTal ? a : tekst(a).toLowerCase();
  const y = beggeTal ? b : tekst(b).toLowerCase();
  switch (op) {
    case "=": return x === y;
    case "<>": return x !== y;
    case "<": return x < y;
    case ">": return x > y;
    case "<=": return x <= y;
    default: return x >= y;
  }
}

/** Hele arket som et opslag adresse -> værdi. Bruges af testene til at
 *  sammenligne en hel kolonne på én gang. */
export function beregnArk(ark, arknavn) {
  const bog = lavArkbog(ark);
  const a = ark.find((x) => x.navn === arknavn);
  const ud = new Map();
  a.raekker.forEach((r, i) => {
    const liste = Array.isArray(r) ? r : r.celler;
    liste.forEach((c, j) => {
      if (c == null || c === "") return;
      const adr = `${kolonneNavn(j + 1)}${i + 1}`;
      ud.set(adr, vaerdi(bog, arknavn, `${arknavn}!${adr}`));
    });
  });
  return ud;
}
