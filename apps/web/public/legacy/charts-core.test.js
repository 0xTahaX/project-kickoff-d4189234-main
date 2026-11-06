import assert from "node:assert/strict";
import { test } from "node:test";
import "./charts-core.js";

const C = globalThis.DaraCharts;

test("bar chart renders labeled svg and legend for real data", () => {
  const html = C.bar({
    labels: ["فروردین", "اردیبهشت"],
    series: [
      { name: "درآمد", values: [10, 20] },
      { name: "هزینه", values: [5, 8] },
    ],
    format: (value) => String(value),
  });
  assert.match(html, /<svg/);
  assert.match(html, /فروردین/);
  assert.match(html, /درآمد/);
  assert.match(html, /chart-legend/);
  assert.match(html, /<title>/);
});

test("charts show an empty state instead of broken graphics", () => {
  assert.match(C.bar({ labels: [], series: [] }), /chart-empty/);
  assert.match(C.donut({ items: [] }), /chart-empty/);
  assert.match(C.line({ labels: [], values: [] }), /chart-empty/);
  assert.match(C.bar({ labels: ["a"], series: [{ name: "x", values: [0] }] }), /chart-empty/);
});

test("donut chart renders arcs, legend and percentages", () => {
  const html = C.donut({
    items: [
      { label: "خوراک", value: 75, display: "۷۵" },
      { label: "حمل‌ونقل", value: 25, display: "۲۵" },
    ],
  });
  assert.match(html, /<circle/);
  assert.match(html, /خوراک/);
  assert.match(html, /۷۵٪/);
  assert.match(html, /۲۵٪/);
});

test("line chart renders points and escapes user labels", () => {
  const html = C.line({ labels: ["<x>"], values: [5], format: (value) => String(value) });
  assert.match(html, /polyline/);
  assert.match(html, /&lt;x&gt;/);
  assert.doesNotMatch(html, /<x>/);
});

test("charts expose clickable keys for filtering", () => {
  const bar = C.bar({
    labels: ["مهر", "آبان"],
    series: [{ name: "هزینه", values: [10, 20] }],
    meta: ["-1", "0"],
    name: "tx-month",
  });
  assert.match(bar, /data-chart-name="tx-month"/);
  assert.match(bar, /data-chart-key="-1"/);
  assert.match(bar, /data-chart-key="0"/);
  const donut = C.donut({
    items: [{ label: "خوراک", value: 10, key: "c1" }],
    name: "tx-cat",
  });
  assert.match(donut, /data-chart-name="tx-cat"/);
  assert.match(donut, /data-chart-key="c1"/);
});
