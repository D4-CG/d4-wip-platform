// One-time generator for the DAILY baseline (time-horizon toggle: Today / Week / Month).
// Produces 31 daily snapshots (day 0 = today back to day -30) at portfolio + site level,
// plus a small set of dated DAILY EVENTS (the discrete things that move overnight).
//
// One daily series, three horizons derived by offset:
//   Today  = day 0 vs day -1
//   Week   = day 0 vs day -7
//   Month  = day 0 vs day -30   (must reconcile with site-baseline: 60 -> 62)
//
// The series ENDS exactly on the current locked values so every horizon reconciles to truth.
// Seeded (mulberry32) for reproducibility.

const fs = require("fs");
const path = require("path");

const ar = require(path.join(__dirname, "..", "app", "data", "ar-accounts.json"));
const baseline = require(path.join(__dirname, "..", "app", "data", "site-baseline.json"));

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260524);

const DAYS = 31; // index 0 = 30 days ago ... index 30 = today

// ---- current (day 0 / today) locked values ----
const totalAR = ar.reduce((s, a) => s + a.amount, 0);
const curArDays = baseline.portfolio.current.arDays;        // 62
const curOver90 = Math.round(ar.filter(a => a.daysOut > 90).reduce((s, a) => s + a.amount, 0) / totalAR * 100); // 22
const curDenial = Math.round(ar.filter(a => a.denialCode).length / ar.length * 100); // 13

// Build a daily walk from a 30-day-ago start to today's value, mild noise, endpoint locked.
// "today" is index DAYS-1. The -30 point (index 0) should equal the month-prior value.
function buildDaily(startVal, endVal, { noise = 0.3, round = 0 } = {}) {
  const pts = [];
  for (let i = 0; i < DAYS; i++) {
    const t = i / (DAYS - 1);
    const trend = startVal + (endVal - startVal) * t;
    const wobble = (rand() - 0.5) * 2 * noise * (1 - t * 0.5);
    let v = trend + wobble;
    if (i === 0) v = startVal;          // lock -30 endpoint (month-prior)
    if (i === DAYS - 1) v = endVal;      // lock today
    pts.push(round === 0 ? Math.round(v) : Math.round(v * 10 ** round) / 10 ** round);
  }
  return pts;
}

// Portfolio daily series. Start = month-prior locked values.
const portfolio = {
  arDays:     buildDaily(baseline.portfolio.prior.arDays, curArDays, { noise: 0.35 }),  // 60 -> 62
  over90Pct:  buildDaily(curOver90 - 3, curOver90, { noise: 0.4 }),                       // ~19 -> 22 over the month
  denialRate: buildDaily(curDenial - 2, curDenial, { noise: 0.35 }),                      // ~11 -> 13
};

// Per-site daily arDays series (start = each site's 30-day-prior, end = current).
const sites = {};
Object.entries(baseline.sites).forEach(([name, s]) => {
  sites[name] = {
    arDays: buildDaily(s.prior.arDays, s.current.arDays, { noise: 0.5 }),
    trend: s.trend,
  };
});

// ---- DAILY EVENTS (discrete, dated — the things that move overnight) ----
// These drive Today-specific findings. Dated relative to today (day offsets).
// Built from real-ish account movements consistent with the deteriorating story.

// Accounts that crossed 90 days in the last few days (high-EV, worth the CFO's eye).
// Pull real AR accounts just over 90 days, attribute a "crossed" date in last 3 days.
const justCrossed90 = ar
  .filter(a => a.daysOut >= 90 && a.daysOut <= 95)
  .sort((a, b) => b.amount - a.amount);

function buildCrossingEvents() {
  // group a handful into "yesterday" and "2 days ago"
  const ev = [];
  const y = justCrossed90.slice(0, 4);   // yesterday's crossings
  const d2 = justCrossed90.slice(4, 7);  // 2 days ago
  if (y.length) ev.push({
    dayOffset: -1,
    type: "crossed_90",
    count: y.length,
    amount: y.reduce((s, a) => s + a.amount, 0),
    accounts: y.map(a => ({ id: a.id, patient: a.patient, payer: a.payer, amount: a.amount, site: a.site })),
  });
  if (d2.length) ev.push({
    dayOffset: -2,
    type: "crossed_90",
    count: d2.length,
    amount: d2.reduce((s, a) => s + a.amount, 0),
    accounts: d2.map(a => ({ id: a.id, patient: a.patient, payer: a.payer, amount: a.amount, site: a.site })),
  });
  return ev;
}

// Write-offs landing on the desk (tie to real escalation records — dated to today/yesterday).
const writeOffEvents = [
  { dayOffset: 0,  type: "writeoff_landed", accountId: "AR-009", patient: "William Jackson", payer: "Medicaid", amount: 67500 },
  { dayOffset: -1, type: "writeoff_landed", accountId: "AR-005", patient: "Patricia Nguyen", payer: "Cigna", amount: 92500 },
];

// A site that jumped sharply day-over-day (pick the worst-deteriorating site, attribute an overnight tick).
const worstSite = Object.entries(baseline.sites)
  .filter(([, s]) => s.trend === "deteriorating")
  .sort((a, b) => b[1].delta.arDays - a[1].delta.arDays)[0];
const siteJumpEvents = worstSite ? [{
  dayOffset: -1,
  type: "site_jump",
  site: worstSite[0],
  daysAdded: 3,            // overnight tick (within the daily noise band but called out)
  current: worstSite[1].current.arDays,
}] : [];

// SLA breaches that occurred (tie to escalation slaBreach records).
const slaEvents = [
  { dayOffset: 0,  type: "sla_breach", count: 2, area: "Physician/Doc" },
  { dayOffset: -1, type: "sla_breach", count: 1, area: "Coding" },
];

const events = [...buildCrossingEvents(), ...writeOffEvents, ...siteJumpEvents, ...slaEvents];

// ---- ROOT-CAUSE EVENTS (the five-whys answer to WHY AR days are rising) ----
// These are the operational narrative underneath the metric deterioration. Each ties a
// nameable operational failure to a deteriorating site, with a cause->effect chain and
// an estimated impact. They are NOT random noise — they are the root-cause analysis a
// seasoned RCM operator would give the CFO. Dated over the last ~30 days; some are
// recent (surface on Today/Week), some span the month (surface on Month).
//   onsetDayOffset: when it began (negative = days ago)
//   horizon: which view(s) it most belongs to
const rootCauses = [
  {
    id: "rc_billers_site5",
    site: "Site 5",
    onsetDayOffset: -26,
    horizon: ["month", "week"],
    trigger: "Lost 2 billers in late April",
    chain: "fewer billers → claims sit unbilled → DNFB backlog builds → aged AR climbs as the backlog finally bills late",
    impact: { arDaysContribution: 6, note: "Backlog now feeding aged AR" },
    severity: "high",
  },
  {
    id: "rc_integration_site12",
    site: "Site 12",
    onsetDayOffset: -18,
    horizon: ["month", "week"],
    trigger: "EHR integration cutover created a claim-transmission gap",
    chain: "interface mapping error → a batch of claims silently failed to transmit → ~9 days elapsed before anyone caught it → those claims now aging from day one",
    impact: { arDaysContribution: 5, note: "~9-day silent transmission delay" },
    severity: "high",
  },
  {
    id: "rc_coding_site3",
    site: "Site 3",
    onsetDayOffset: -22,
    horizon: ["month", "week"],
    trigger: "HIM coding process change introduced modifier errors",
    chain: "process change in HIM → modifier/coding inaccuracies → clean claims at first → denials landing 30–40 days downstream → AR aging now as denials surface",
    impact: { arDaysContribution: 4, denialContribution: 3, note: "Denials surfacing on a 30–40d lag" },
    severity: "high",
  },
  {
    id: "rc_collectors_understaffed",
    site: "Portfolio",
    onsetDayOffset: -20,
    horizon: ["month", "week", "today"],
    trigger: "Collections understaffed vs. denial volume",
    chain: "denial volume rose → collector capacity flat → high-EV denials sit unworked past follow-up SLA → recoverable dollars age toward the 90-day cliff",
    impact: { note: "High-EV denials aging unworked" },
    severity: "medium",
  },
];

const out = {
  days: DAYS,
  generatedFor: "2026-05-22",
  // index 0 = 30 days ago, index DAYS-1 = today
  portfolio,
  sites,
  events,
  rootCauses,
};

fs.writeFileSync(path.join(__dirname, "..", "app", "data", "daily-baseline.json"), JSON.stringify(out, null, 2));

// ---- report ----
const off = (k, n) => portfolio[k][DAYS - 1] - portfolio[k][DAYS - 1 - n];
console.log("Daily baseline:", DAYS, "snapshots (index 0 = -30d, last = today)");
console.log("");
console.log("Horizon reconciliation (delta = today - prior):");
console.log("  arDays:  today", portfolio.arDays[DAYS-1], "| -1d:", off("arDays",1), "| -7d:", off("arDays",7), "| -30d:", off("arDays",30), "(month must be +2)");
console.log("  over90:  today", portfolio.over90Pct[DAYS-1]+"%", "| -1d:", off("over90Pct",1), "| -7d:", off("over90Pct",7), "| -30d:", off("over90Pct",30));
console.log("  denial:  today", portfolio.denialRate[DAYS-1]+"%", "| -1d:", off("denialRate",1), "| -7d:", off("denialRate",7), "| -30d:", off("denialRate",30));
console.log("");
console.log("Daily events:", events.length);
events.forEach(e => {
  if (e.type === "crossed_90") console.log("  d"+e.dayOffset, "crossed_90:", e.count, "accts, $"+e.amount.toLocaleString());
  else if (e.type === "writeoff_landed") console.log("  d"+e.dayOffset, "writeoff:", e.accountId, "$"+e.amount.toLocaleString());
  else if (e.type === "site_jump") console.log("  d"+e.dayOffset, "site_jump:", e.site, "+"+e.daysAdded+"d ->", e.current);
  else if (e.type === "sla_breach") console.log("  d"+e.dayOffset, "sla_breach:", e.count, e.area);
});
console.log("");
console.log("Root-cause events:", rootCauses.length, "(the five-whys behind the deterioration)");
rootCauses.forEach(r => {
  console.log("  ["+r.site+", onset d"+r.onsetDayOffset+", "+r.horizon.join("/")+"] "+r.trigger);
  console.log("      → "+r.chain);
});
