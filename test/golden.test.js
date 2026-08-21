import { test } from "node:test";
import assert from "node:assert/strict";
import { beregnKommune } from "../web/beregning.js";
import { land, thisted, greve, konstanter } from "./fixtures.js";

const naer = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);

test("GOLDEN §8.1 — Thisted reproducerer v5", () => {
  const r = beregnKommune(thisted, land, konstanter);
  const k = r.estimat.komponenter;
  naer(k.indkomsteffekt.low, -0.3624);
  naer(k.indkomsteffekt.high, -0.6039);
  naer(k.transporteffekt.low, 0.2141);
  naer(k.transporteffekt.high, 0.2676);
  naer(k.byggeeffekt.high, -0.2);
  naer(r.estimat.aftryk.low, 9.4102);
  naer(r.estimat.aftryk.high, 9.9053);
});

test("GOLDEN §8.2 — Greve fortegn (fanger -ABS()-fejlen)", () => {
  const r = beregnKommune(greve, land, konstanter);
  const k = r.estimat.komponenter;
  assert.ok(k.indkomsteffekt.low > 0, "indkomsteffekt skal være positiv for Greve");
  assert.ok(k.indkomsteffekt.high > 0);
  assert.ok(k.byggeeffekt.high > 0, "byggeeffekt skal være positiv for Greve");
  assert.ok(r.estimat.aftryk.low > 10, "Greve skal ligge over ankeret");
});
