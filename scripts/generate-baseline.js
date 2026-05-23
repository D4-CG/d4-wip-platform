// One-time generator for the PRIOR-PERIOD baseline (30 days ago) at site level.
// Locks the comparison points the findings engine diffs against.
// Reads current ar-accounts.json, derives a plausible prior period with the
// approved trend story, writes app/data/site-baseline.json.
//   Story: weak sites (5,12,3) recently DETERIORATING; strong sites (6,9) IMPROVING;
//   others mild/flat. Moderate drift: AR days +/-5..15, denial +/-2..4 pts.

const fs = require("fs");
const path = require("path");

const ar = require(path.join(__dirname, "..", "app", "data", "ar-accounts.json"));

// ---- current site aggregates ----
const cur = {};
ar.forEach(a => {
  if (!cur[a.site]) cur[a.site] = { ar: 0, wd: 0, den: 0, n: 0, over90: 0 };
  const s = cur[a.site];
  s.ar += a.amount; s.wd += a.daysOut * a.amount; s.den += a.denialCode ? 1 : 0; s.n++;
  if (a.daysOut > 90) s.over90 += a.amount;
});

// Per-site drift (prior -> current). Positive arDaysDelta = deteriorated (got worse).
// We define how much WORSE each site got over the month. Prior = current - delta.
// Weak sites deteriorated a lot; strong improved (negative delta => prior was better/lower days... 
//   careful: improving means current < prior, so delta (cur-prior) negative).
const DRIFT = {
  "Site 5":  { days: +15, denial: +4 },   // deteriorating hard
  "Site 12": { days: +13, denial: +3 },   // deteriorating
  "Site 3":  { days: +11, denial: +3 },    // deteriorating
  "Site 2":  { days: +8,  denial: +2 },    // slipping
  "Site 8":  { days: +6,  denial: +1 },    // slipping
  "Site 11": { days: +5,  denial: +1 },
  "Site 1":  { days: +4,  denial: +1 },
  "Site 4":  { days: +3,  denial: 0  },
  "Site 7":  { days: +2,  denial: 0  },
  "Site 10": { days: -1,  denial: -1 },     // roughly flat / slight improve
  "Site 9":  { days: -2,  denial: -1 },     // improving
  "Site 6":  { days: -3,  denial: -1 },     // improving (strong holding)
};

const baseline = {};
Object.keys(cur).forEach(site => {
  const c = cur[site];
  const curDays = Math.round(c.wd / c.ar);
  const curDenial = Math.round(c.den / c.n * 100);
  const curOver90Pct = Math.round(c.over90 / c.ar * 100);
  const d = DRIFT[site] || { days: 0, denial: 0 };
  // prior = current - delta  (delta is how much it changed cur-over-prior)
  const priorDays = curDays - d.days;
  const priorDenial = Math.max(0, curDenial - d.denial);
  // prior AR balance: assume modest organic change inversely related to deterioration
  // (deteriorating sites accumulated more AR; improving sites drew it down) — small effect
  const arDriftPct = d.days * 0.004; // ~0.4% per day of drift
  const priorAR = Math.round(c.ar / (1 + arDriftPct));
  // prior over-90%: deteriorating sites had less aged AR a month ago
  const priorOver90Pct = Math.max(0, curOver90Pct - Math.round(d.days * 0.6));
  baseline[site] = {
    current:  { arDays: curDays, denialRate: curDenial, ar: c.ar, over90Pct: curOver90Pct },
    prior:    { arDays: priorDays, denialRate: priorDenial, ar: priorAR, over90Pct: priorOver90Pct },
    delta:    { arDays: d.days, denialRate: d.denial, arPct: Math.round((c.ar - priorAR) / priorAR * 100), over90Pct: curOver90Pct - priorOver90Pct },
    trend: d.days >= 6 ? "deteriorating" : d.days <= -4 ? "improving" : "stable",
  };
});

// portfolio-level rollup
const totCurAR = Object.values(cur).reduce((s, c) => s + c.ar, 0);
const totCurDays = Math.round(Object.values(cur).reduce((s, c) => s + c.wd, 0) / totCurAR);
const priorPortfolioDays = Math.round(
  Object.entries(baseline).reduce((s, [, b]) => s + b.prior.arDays * b.prior.ar, 0) /
  Object.values(baseline).reduce((s, b) => s + b.prior.ar, 0)
);

const out = {
  generatedFor: "2026-05-22",
  priorPeriod: "2026-04-22",
  portfolio: { current: { arDays: totCurDays }, prior: { arDays: priorPortfolioDays }, delta: { arDays: totCurDays - priorPortfolioDays } },
  sites: baseline,
};

fs.writeFileSync(path.join(__dirname, "..", "app", "data", "site-baseline.json"), JSON.stringify(out, null, 2));

// ---- report ----
console.log("Portfolio AR days: prior", priorPortfolioDays, "-> current", totCurDays, "(", (totCurDays - priorPortfolioDays >= 0 ? "+" : "") + (totCurDays - priorPortfolioDays), ")");
console.log("");
console.log("Site".padEnd(9), "PriorDays".padStart(10), "CurDays".padStart(8), "Delta".padStart(6), "Trend".padStart(14));
Object.entries(baseline).sort((a,b)=>b[1].delta.arDays - a[1].delta.arDays).forEach(([site, b]) => {
  console.log(site.padEnd(9), String(b.prior.arDays).padStart(10), String(b.current.arDays).padStart(8),
    ((b.delta.arDays>=0?"+":"")+b.delta.arDays).padStart(6), b.trend.padStart(14));
});
