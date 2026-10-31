import assert from "node:assert/strict";
import { test } from "node:test";
import "./money-core.js";

const money = globalThis.DaraMoney;

test("parses decimal strings into scaled integers without floating point", () => {
  assert.equal(money.toScaled("1.234567"), 1_234_567n);
  assert.equal(money.toScaled("0.000001"), 1n);
  assert.equal(money.toScaled("12"), 12_000_000n);
  assert.equal(money.toScaled("-0.5"), -500_000n);
  assert.equal(money.toScaled("99999999999999.999999"), 99_999_999_999_999_999_999n);
});

test("rejects malformed or over-precise amounts", () => {
  for (const value of ["", "abc", "1.2345678", "1e5", "1.2.3", "١٢", null, undefined]) {
    assert.equal(money.isValid(value), false, `expected invalid: ${String(value)}`);
  }
  assert.equal(money.isValid("0.000001"), true);
});

test("round-trips scaled values", () => {
  for (const value of ["0", "1", "0.5", "12.34", "999999.000001"]) {
    assert.equal(money.fromScaled(money.toScaled(value)), value);
  }
});

test("multiplies and divides exactly by integer factors", () => {
  assert.equal(money.multiply("12.34", 10), "123.4");
  assert.equal(money.multiply("0.1", 10), "1");
  assert.equal(money.multiply("1234", 10), "12340");
  assert.equal(money.divide("123.4", 10), "12.34");
  assert.equal(money.divide("12340", 10), "1234");
});

test("rounds half up at the sixth decimal and never emits long floats", () => {
  assert.equal(money.divide("0.000001", 2), "0.000001");
  assert.equal(money.divide("0.000001", 10), "0");
  assert.equal(money.add("0.1", "0.2"), "0.3");
  assert.equal(money.add("1.000001", "0.000009"), "1.00001");
});
