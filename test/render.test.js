import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, tal, pct, ton, interval, retningsMarkoer } from "../web/render.js";

test("esc: escaper de fem farlige tegn", () => {
  assert.equal(esc('<a href="x">&\'</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
});

test("esc: håndterer null og tal uden at kaste", () => {
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(42), "42");
});

test("tal: dansk formatering med tusindtalsseparator", () => {
  assert.equal(tal(1234567), "1.234.567");
  assert.equal(tal(1234.5, 1), "1.234,5");
  assert.equal(tal(0.5557, 2), "0,56");
});

test("tal: null giver tankestreg, ikke nul", () => {
  assert.equal(tal(null), "–");
  assert.equal(tal(undefined), "–");
  assert.equal(tal(NaN), "–");
});

test("pct: fortegn er altid med", () => {
  assert.equal(pct(0.178423), "+17,8\u00A0%");
  assert.equal(pct(-0.120786), "-12,1\u00A0%");
  assert.equal(pct(0), "0,0\u00A0%");
});

test("pct: null giver tankestreg", () => {
  assert.equal(pct(null), "–");
});

test("ton: ét decimal og enhed", () => {
  assert.equal(ton(9.4102), "9,4 ton");
  assert.equal(ton(null), "–");
});

test("interval: to tal med enkelt dash", () => {
  assert.equal(interval(9.4102, 9.9053), "9,4 - 9,9");
});

test("interval: vises altid stigende, uanset argumentrækkefølge", () => {
  // Komponenternes low/high refererer til elasticitetens lave og høje ende,
  // ikke til den mindste og største værdi. For negative effekter er low
  // derfor det største tal, og et interval skrevet "-0,4 - -0,6" læses forkert.
  assert.equal(interval(-0.3624, -0.6039), "-0,6 - -0,4");
});

test("tal: negativt nul vises som nul", () => {
  // 0 gange et negativt tal giver -0 i IEEE 754, og Intl formaterer det
  // trofast som "-0,0". Byggeeffektens lave ende rammer præcis det.
  assert.equal(tal(-0, 1), "0,0");
  assert.equal(interval(-0, -0.2), "-0,2 - 0,0");
});

test("retningsMarkoer: de fire retninger har hver sin form", () => {
  const op = retningsMarkoer("over land");
  const ned = retningsMarkoer("under land");
  const niveau = retningsMarkoer("på niveau");
  const kontekst = retningsMarkoer("kontekst");
  const alle = [op, ned, niveau, kontekst];
  assert.equal(new Set(alle).size, 4, "alle fire skal være visuelt forskellige");
  assert.ok(op.includes("<path"), "op er en trekant");
  assert.ok(ned.includes("<path"), "ned er en trekant");
  assert.ok(niveau.includes("<line"), "på niveau er en streg");
  assert.ok(op !== ned, "op og ned må ikke være samme path");
});

test("retningsMarkoer: hver markør har tilgængeligt navn", () => {
  for (const r of ["over land", "under land", "på niveau", "kontekst"]) {
    const svg = retningsMarkoer(r);
    assert.ok(svg.includes('role="img"'), `${r} mangler role`);
    assert.ok(svg.includes("aria-label="), `${r} mangler aria-label`);
  }
});

test("retningsMarkoer: formen bærer retningen, farven vurderer ikke", () => {
  // Motoren giver kun retning, ingen vurdering af godt eller dårligt, og
  // specen forbyder auto-prioritering. En grøn/rød markør ville påtvinge en
  // dom, metoden ikke har truffet - fx er høj el-bil-andel over land godt.
  const alle = ["over land", "under land", "på niveau", "kontekst"].map(retningsMarkoer);
  for (const svg of alle) {
    assert.ok(!svg.includes("emerald"), "må ikke farvekode som godt");
    assert.ok(!svg.includes("red-"), "må ikke farvekode som dårligt");
  }
});
