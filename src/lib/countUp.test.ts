import { test } from "node:test";
import assert from "node:assert/strict";
import { tweenText, hasNumber, easeOut } from "./countUp";

test("final frame is the exact original text", () => {
  for (const s of ["$1,234.56 Mn", "12.3x – 18.0x", "+4.2%", "—", "NM", "₹1,700.00", "-12.5%", "n/m"]) {
    assert.equal(tweenText(s, 1), s);
  }
});

test("intermediate frames keep formatting and only scale the digits", () => {
  assert.equal(tweenText("$1,234.56 Mn", 0), "$0.00 Mn");
  assert.equal(tweenText("$1,000.00 Mn", 0.5), "$500.00 Mn");
  assert.equal(tweenText("10.0x – 20.0x", 0.5), "5.0x – 10.0x");
  assert.equal(tweenText("-40.0%", 0.5), "-20.0%");
  assert.equal(tweenText("Median: 12%", 0.25), "Median: 3%");
  assert.equal(tweenText("12345", 0.5), "6173");
});

test("helpers", () => {
  assert.equal(hasNumber("NM"), false);
  assert.equal(hasNumber("$1"), true);
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(easeOut(0.5) > 0.5);
});
