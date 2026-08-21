import { test } from "node:test";
import assert from "node:assert/strict";
import { land, thisted, greve, konstanter } from "./fixtures.js";

test("fixture: kendte rå værdier fra regneark v5", () => {
  assert.equal(land.folketal, 6025603);
  assert.equal(land.disp_indkomst, 287682);
  assert.equal(thisted.folketal, 42572);
  assert.equal(thisted.disp_indkomst, 252934);
  assert.equal(greve.folketal, 54120);
  assert.equal(greve.disp_indkomst, 306548);
  assert.equal(greve.affald_kg, null); // Greve mangler affald i regnearket
  assert.equal(konstanter.anker, 10.0);
  assert.equal(thisted.region, "Nordjylland");
});
