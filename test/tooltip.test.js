// Tooltippen ved udviklingspilen: grafen bygges først, når nogen peger på den.
//
// tooltip.js er DOM-kode, og projektet har ingen jsdom. Testen erstatter document og window
// med de få dele, modulet bruger, og kører de rigtige lyttere. Det, der holdes fast, er at
// grafen ikke bygges ved installation eller ved sidevisning, kun ved hover, fokus og tryk -
// og at den bygges forfra hver gang, så intet gemmes, der kan komme bagud for datasættet.
import { test } from "node:test";
import assert from "node:assert/strict";

function lavElement(tag) {
  const e = {
    tag, id: "", className: "", innerHTML: "", textContent: "", style: {},
    attrs: {},
    setAttribute(n, v) { this.attrs[n] = v; },
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    getBoundingClientRect() {
      return { left: this.left ?? 0, top: this.top ?? 0, width: this.width ?? 300,
        height: this.height ?? 260, bottom: (this.top ?? 0) + (this.height ?? 260) };
    },
    classList: {
      add(k) { if (!e.className.split(" ").includes(k)) e.className += ` ${k}`; },
      remove(k) { e.className = e.className.split(" ").filter((x) => x !== k).join(" "); },
      contains(k) { return e.className.split(" ").includes(k); },
    },
  };
  return e;
}

const lyttere = new Map();
const lyt = (mål) => (type, fn) => {
  if (!lyttere.has(mål)) lyttere.set(mål, {});
  (lyttere.get(mål)[type] ??= []).push(fn);
};
const udsend = (mål, type, e = {}) => (lyttere.get(mål)?.[type] ?? []).forEach((fn) => fn(e));

const vindue = { innerWidth: 1000, innerHeight: 800, addEventListener: lyt("window") };
const rod = { addEventListener: lyt("rod") };
const dokument = {
  body: { children: [], appendChild(e) { this.children.push(e); } },
  createElement: lavElement,
  addEventListener: lyt("dokument"),
};
globalThis.window = vindue;
globalThis.document = dokument;

const { installerTooltips, saetGrafKilde } = await import("../web/tooltip.js");
installerTooltips(rod);

const boks = () => dokument.body.children.find((e) => e.id === "tip-boks");
const skjult = () => boks().classList.contains("hidden");

/** En pil på skærmen. */
function pil(attrs, plads = {}) {
  const t = lavElement("span");
  Object.assign(t.attrs, attrs);
  Object.assign(t, { left: 500, top: 400, width: 12, height: 12 }, plads);
  return t;
}
/** En pointer-hændelse på pilen. Mus som standard; `ekstra` kan sætte pointerType og relatedTarget. */
const paa = (t, ekstra = {}) => ({
  target: { closest: (vaelger) => (/data-tip|data-graf/.test(vaelger) ? t : null) },
  pointerType: "mouse", ...ekstra,
});
const beroering = (t, ekstra = {}) => paa(t, { pointerType: "touch", ...ekstra });
const ved_siden_af = (pointerType) => ({ target: { closest: () => null }, pointerType });

test("grafen bygges ikke, når tooltippen installeres eller graf-kilden meldes", () => {
  let kald = 0;
  saetGrafKilde(() => { kald++; return "<svg></svg>"; });
  assert.equal(kald, 0);
  assert.equal(boks(), undefined, "ingen boks findes, før nogen har peget på noget");
});

test("hover på en pil bygger grafen og viser den i en lys boks", () => {
  const nogler = [];
  saetGrafKilde((nogle) => { nogler.push(nogle); return `<div>graf for ${nogle}</div>`; });
  udsend("rod", "pointerover", paa(pil({ "data-graf": "Fossil-andel" })));
  assert.deepEqual(nogler, ["Fossil-andel"], "nøglen fra pilens data-graf");
  assert.equal(boks().innerHTML, "<div>graf for Fossil-andel</div>");
  assert.ok(!skjult());
  assert.ok(boks().className.includes("bg-white"), "grafen står på en hvid flade");
  assert.ok(!boks().className.includes("bg-gray-900"));
});

test("hver hover bygger grafen forfra, og intet gemmes", () => {
  let kald = 0;
  saetGrafKilde(() => { kald++; return `<div>${kald}</div>`; });
  const t = pil({ "data-graf": "x" });
  udsend("rod", "pointerover", paa(t));
  udsend("rod", "pointerout", paa(t));
  udsend("rod", "pointerover", paa(t));
  assert.equal(kald, 2, "en gemt tegning kunne blive stående med sidste års tal");
  assert.equal(boks().innerHTML, "<div>2</div>");
});

test("tastaturfokus viser det samme som hover", () => {
  saetGrafKilde((n) => `<div>${n}</div>`);
  udsend("rod", "focusin", paa(pil({ "data-graf": "Biler pr. indbygger" })));
  assert.equal(boks().innerHTML, "<div>Biler pr. indbygger</div>");
  assert.ok(!skjult());
  udsend("rod", "focusout", paa(pil({ "data-graf": "x" })));
  assert.ok(skjult());
});

test("mus ud, Escape, scroll og resize skjuler boksen", () => {
  saetGrafKilde((n) => `<div>${n}</div>`);
  const t = pil({ "data-graf": "x" });
  for (const skjul of [
    () => udsend("rod", "pointerout", paa(t)),
    () => udsend("dokument", "keydown", { key: "Escape" }),
    () => udsend("window", "scroll"),
    () => udsend("window", "resize"),
  ]) {
    udsend("rod", "pointerover", paa(t));
    assert.ok(!skjult());
    skjul();
    assert.ok(skjult());
  }
});

test("et tryk viser grafen på en berøringsskærm, og et tryk ved siden af skjuler den", () => {
  saetGrafKilde((n) => `<div>${n}</div>`);
  udsend("rod", "pointerup", beroering(pil({ "data-graf": "Fossil-andel" })));
  assert.ok(!skjult());
  assert.equal(boks().innerHTML, "<div>Fossil-andel</div>");
  udsend("rod", "pointerup", ved_siden_af("touch"));
  assert.ok(skjult());
});

test("berøring har ingen hover: pointerover og pointerout fra en finger gør intet", () => {
  saetGrafKilde((n) => `<div>${n}</div>`);
  const t = pil({ "data-graf": "x" });
  udsend("rod", "pointerover", beroering(t));
  assert.ok(boks() === undefined || skjult(), "en finger viser ikke boksen ved at røre");
  udsend("rod", "pointerup", beroering(t));
  assert.ok(!skjult());
  // Efter et tryk sender en berøringsskærm et pointerout (og et mouseout), før fingeren er
  // løftet helt fra siden. Det må ikke skjule boksen, som lige blev vist.
  udsend("rod", "pointerout", beroering(t));
  assert.ok(!skjult(), "pointerout fra en finger skjuler ikke boksen");
});

test("mus-hændelser lyttes der ikke på: et mouseout efter et tryk skjuler ikke boksen", () => {
  saetGrafKilde((n) => `<div>${n}</div>`);
  const t = pil({ "data-graf": "x" });
  udsend("rod", "pointerup", beroering(t));
  assert.ok(!skjult());
  udsend("rod", "mouseout", paa(t));
  udsend("rod", "mouseover", paa(t));
  udsend("rod", "click", ved_siden_af("mouse"));
  assert.ok(!skjult(), "kun pointer-hændelser, tastaturfokus, Escape, scroll og resize styrer boksen");
});

test("et tryk med musen på en pil ændrer ikke boksen: hover har allerede vist den", () => {
  let kald = 0;
  saetGrafKilde(() => { kald++; return "<div>graf</div>"; });
  const t = pil({ "data-graf": "x" });
  udsend("rod", "pointerover", paa(t));
  udsend("rod", "pointerup", paa(t));
  assert.equal(kald, 1);
  assert.ok(!skjult());
});

test("musen fra pilens ikon til dens tekst forlader ikke pilen, og boksen bygges ikke forfra", () => {
  let kald = 0;
  saetGrafKilde(() => { kald++; return `<div>${kald}</div>`; });
  const t = pil({ "data-graf": "x" });
  const barn = { closest: (v) => (/data-tip|data-graf/.test(v) ? t : null) };
  t.contains = (x) => x === t || x === barn;
  udsend("rod", "pointerover", paa(t));
  udsend("rod", "pointerout", paa(t, { relatedTarget: barn }));
  udsend("rod", "pointerover", { target: barn, pointerType: "mouse" });
  assert.ok(!skjult(), "relatedTarget er inde i pilen");
  assert.equal(kald, 1, "samme pil, så ingen ny graf");
  udsend("rod", "pointerout", paa(t, { relatedTarget: { closest: () => null } }));
  assert.ok(skjult(), "musen forlod pilen");
});

test("en almindelig tekst-tooltip virker som før: mørk boks og ren tekst", () => {
  saetGrafKilde(() => "<div>graf</div>");
  udsend("rod", "pointerover", paa(pil({ "data-tip": "Ingen tidsserie for dette nøgletal" })));
  assert.equal(boks().textContent, "Ingen tidsserie for dette nøgletal");
  assert.ok(boks().className.includes("bg-gray-900"));
  assert.ok(!boks().className.includes("bg-white"));
});

test("tekst-tooltippen bruger textContent, så HTML i teksten ikke tolkes", () => {
  udsend("rod", "pointerover", paa(pil({ "data-tip": "<img src=x onerror=alert(1)>" })));
  assert.equal(boks().textContent, "<img src=x onerror=alert(1)>");
  assert.ok(!boks().innerHTML.includes("<img"), "textContent skriver ikke til innerHTML som HTML");
});

test("en pil, hvis graf er tom, falder tilbage på sin tekst, og uden begge vises intet", () => {
  saetGrafKilde(() => "");
  udsend("rod", "pointerover", paa(pil({ "data-graf": "x", "data-tip": "Forklaring" })));
  assert.equal(boks().textContent, "Forklaring");
  udsend("rod", "pointerout", paa(pil({ "data-graf": "x" })));
  udsend("rod", "pointerover", paa(pil({ "data-graf": "x" })));
  assert.ok(skjult(), "hverken graf eller tekst: boksen forbliver skjult");
});

test("uden en graf-kilde vises intet for en pil, der kun har en nøgle", () => {
  saetGrafKilde(null);
  udsend("rod", "pointerout", paa(pil({ "data-graf": "x" })));
  udsend("rod", "pointerover", paa(pil({ "data-graf": "x" })));
  assert.ok(skjult());
});

test("boksen klemmes ind i vinduet, både til siden og lodret", () => {
  saetGrafKilde((n) => `<div>${n}</div>`);
  // Yderst til højre og øverst: der er hverken plads ovenover eller til højre for midten.
  udsend("rod", "pointerover", paa(pil({ "data-graf": "x" }, { left: 990, top: 5 })));
  const x = Number.parseInt(boks().style.left, 10);
  const y = Number.parseInt(boks().style.top, 10);
  assert.ok(x >= 8 && x + 300 <= 1000 - 8, `x ${x}`);
  assert.ok(y >= 8 && y + 260 <= 800 - 8, `y ${y}`);
  // Nederst: der er ikke plads under, så den står over.
  udsend("rod", "pointerover", paa(pil({ "data-graf": "x" }, { left: 500, top: 780 })));
  assert.ok(Number.parseInt(boks().style.top, 10) + 260 <= 800 - 8);
});
