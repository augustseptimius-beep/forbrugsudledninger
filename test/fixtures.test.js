import { test } from "node:test";
import assert from "node:assert/strict";
import * as fixtures from "./fixtures.js";
import { land, thisted, greve } from "./fixtures.js";

test("fixture: kendte rå værdier fra regneark v5", () => {
  assert.equal(land.folketal, 6025603);
  assert.equal(land.disp_indkomst, 287682);
  assert.equal(thisted.folketal, 42572);
  assert.equal(thisted.disp_indkomst, 252934);
  assert.equal(greve.folketal, 54120);
  assert.equal(greve.disp_indkomst, 306548);
  assert.equal(greve.affald_kg, null, "Greve mangler affald i regnearket");
  assert.equal(thisted.region, "Nordjylland");
});

test("fixture: ingen koefficienter tilbage", () => {
  // Fixturen indeholdt et anker, en elasticitet, en bilkørselsandel, en
  // byggeandel og en boligudgiftsmodregning. Ingen af dem kunne
  // kildebelægges, og de er fjernet sammen med estimatet.
  assert.ok(!("konstanter" in fixtures), "konstanter hører ikke hjemme her længere");
});

test("fixture: de tre områder har samme feltsæt", () => {
  // Et felt, der kun findes for én af dem, ville give tests, der passerer
  // eller fejler af den forkerte grund.
  const felter = (o) => Object.keys(o).filter((k) => !["navn", "kode", "region"].includes(k)).sort();
  assert.deepEqual(felter(thisted), felter(greve));
  assert.deepEqual(felter(thisted), felter(land));
});
