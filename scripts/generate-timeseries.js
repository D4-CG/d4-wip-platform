// One-time generator for the portfolio WEEKLY time series (sparklines).
// Produces ~12 weekly points per metric, drifting toward the current locked values,
// consistent with the deteriorating-portfolio story. Seeded for reproducibility.
// Reads current data + baseline, writes app/data/timeseries.json.
//
// Metrics (portfolio level):
//   arDays      — smoothed line, trending UP (deteriorating) toward current 62
//   over90Pct   — smoothed line, trending UP toward current 22
//   denialRate  — smoothed line, trending UP toward current 13
//   improving   — the improving-sites "good news" shape: AR days at the 3 improving
//                 sites, trending DOWN (green). Anchored to their current avg.
//
// Each series ends at the current value (the locked truth) so sparkline endpoint
// reconciles with the finding's headline number.

const fs = require("fs");
const path = require("path");

const ar = require(path.join(__dirname, "..", "app", "data", "ar-accounts.json"));
const baseline = require(path.join(__dirname, "..", "app", "data", "site-baseline.json"));

// seeded RNG (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260523);

const WEEKS = 12;

// ---- current anchors (series must END here) ----
const totalAR = ar.reduce((s, a) => s + a.amount, 0);
const curArDays = baseline.portfolio.current.arDays;       // 62
const curOver90 = Math.round(ar.filter(a => a.daysOut > 90).reduce((s, a) => s + a.amount, 0) / totalAR * 100); // 22
const curDenial = Math.round(ar.filter(a => a.denialCode).length / ar.length * 100); // 13

// improving sites: current avg AR days across the improving sites
const improvingSites = Object.entries(baseline.sites).filter(([, s]) => s.trend === "improving");
const curImprovingDays = Math.round(
  improvingSites.reduce((s, [, st]) => s + st.current.arDays * st.current.ar, 0) /
  Math.max(1, improvingSites.reduce((s, [, st]) => s + st.current.ar, 0))
);

// Build a smoothed weekly series from a start value to an end value with mild noise.
// direction is implied by start vs end. Smoothing = small random walk around the trend line.
function buildSeries(startVal, endVal, { noise = 0.4, round = 0 } = {}) {
  const pts = [];
  for (let i = 0; i < WEEKS; i++) {
    const t = i / (WEEKS - 1);                 // 0..1
    const trend = startVal + (endVal - startVal) * t;
    // noise shrinks toward the end so the series converges cleanly on the current value
    const wobble = (rand() - 0.5) * 2 * noise * (1 - t * 0.7);
    let v = trend + wobble;
    if (i === WEEKS - 1) v = endVal;           // lock the endpoint to current truth
    pts.push(round === 0 ? Math.round(v) : Math.round(v * 10 ** round) / 10 ** round);
  }
  return pts;
}

// Start values ~12 weeks ago: roughly the prior-period value extended back a bit further.
// Deteriorating metrics started lower (better) and rose.
const out = {
  weeks: WEEKS,
  generatedFor: "2026-05-22",
  series: {
    arDays:     buildSeries(curArDays - 6, curArDays, { noise: 0.7 }),   // ~56 -> 62
    over90Pct:  buildSeries(curOver90 - 7, curOver90, { noise: 0.8 }),   // ~15 -> 22
    denialRate: buildSeries(curDenial - 5, curDenial, { noise: 0.6 }),   // ~8 -> 13
    improving:  buildSeries(curImprovingDays + 7, curImprovingDays, { noise: 0.6 }), // down (green)
  },
};

fs.writeFileSync(path.join(__dirname, "..", "app", "data", "timeseries.json"), JSON.stringify(out, null, 2));

// ---- report ----
console.log("Weekly time series (", WEEKS, "points each, endpoint = current truth):");
Object.entries(out.series).forEach(([k, v]) => {
  console.log("  " + k.padEnd(11), v.join(", "));
});
