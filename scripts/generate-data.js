// One-time generator for fixed synthetic AR + DNFB datasets.
// Run: node scripts/generate-data.js
// Output: app/data/ar-accounts.json, app/data/dnfb-accounts.json
// Seeded RNG => reproducible. Re-running produces identical files.

const fs = require("fs");
const path = require("path");

// ---- Seeded RNG (mulberry32) ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260622); // fixed seed
const rand = () => rng();
const randint = (lo, hi) => Math.floor(rand() * (hi - lo + 1)) + lo;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weightedPick = (entries) => {
  // entries: [[value, weight], ...]
  const total = entries.reduce((s, e) => s + e[1], 0);
  let r = rand() * total;
  for (const [val, w] of entries) { if ((r -= w) <= 0) return val; }
  return entries[entries.length - 1][0];
};

// ---- Reference data (must match WIPPlatform.jsx config) ----
const SITES = Array.from({ length: 12 }, (_, i) => `Site ${i + 1}`);
const VERTICALS = ["Behavioral Health","Cardiology","Dental","Emergency","Home Health","Hospice","Infusion","Laboratory","Ophthalmology","Orthopedics","Outpatient Surgery","Primary Care","Radiology","Urology"];

// Verticals whose claims are facility/stay-based, where DISCHARGE is later than the
// first service date. For these, the timely-filing clock legally starts at discharge.
// Encounter-based verticals (everything else) discharge same-day => discharge == service date.
const STAY_VERTICALS = new Set(["Behavioral Health","Emergency","Home Health","Hospice","Infusion","Outpatient Surgery"]);
// Length-of-stay (days from service/admit to discharge) for stay verticals.
function stayLengthDays(vertical) {
  if (!STAY_VERTICALS.has(vertical)) return 0;            // encounter-based: discharge == service
  if (vertical === "Emergency") return randint(0, 2);     // ED: same-day to short obs
  if (vertical === "Outpatient Surgery") return randint(0, 1);
  if (vertical === "Infusion") return randint(0, 1);
  if (vertical === "Home Health" || vertical === "Hospice") return randint(5, 30); // episodic
  if (vertical === "Behavioral Health") return randint(2, 10);
  return randint(1, 4);
}

// payer => contractual haircut range [min,max] off gross to get expected allowed (net)
const PAYERS = [
  ["Medicare", 0.55, 0.62, 14],
  ["Medicare Advantage", 0.52, 0.60, 9],
  ["Blue Cross", 0.42, 0.52, 10],
  ["Blue Shield", 0.42, 0.52, 9],
  ["Anthem", 0.43, 0.53, 6],
  ["Aetna", 0.40, 0.50, 10],
  ["Cigna", 0.40, 0.50, 8],
  ["Humana", 0.45, 0.55, 6],
  ["United Health", 0.42, 0.52, 11],
  ["Medicaid", 0.60, 0.70, 8],
  ["Worker Comp", 0.30, 0.40, 2],
  ["Self-Pay", 0.0, 0.0, 7],
];

const FIRST = ["James","Mary","John","Patricia","Robert","Jennifer","Michael","Linda","William","Elizabeth","David","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen","Christopher","Nancy","Daniel","Lisa","Matthew","Betty","Anthony","Margaret","Mark","Sandra","Donald","Ashley","Steven","Kimberly","Paul","Emily","Andrew","Donna","Joshua","Michelle","Kenneth","Carol","Kevin","Amanda","Brian","Dorothy","George","Melissa","Edward","Deborah","Ronald","Stephanie","Timothy","Rebecca","Jason","Sharon","Jeffrey","Laura","Ryan","Cynthia"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts"];
const name = () => `${pick(FIRST)} ${pick(LAST)}`;

const AR_DENIALS = [null, null, null, null, "CO-16", "CO-22", "CO-50", "CO-97", "CO-4"];
const AR_CLAIM_STATUS = ["At Payer","Submitted to Clearinghouse","Adjudicated — Denied","Rejected by Clearinghouse","Pending Submission"];
const DNFB_HOLDS = ["CODING_UNASSIGNED","CODING_COMPLEX","PHYSICIAN_UNSIGNED","PHYSICIAN_QUERY","CHARGE_MISSING","CHARGE_LAG","CREDENTIALING","AUTH_MISSING","AUTH_EXPIRED","HIM_DEFICIENCY","SCRUBBER_EDIT","ELIGIBILITY"];

function isoDaysAgo(days) {
  const d = new Date("2026-05-22T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

// ---- Bimodal net-balance generator ----
// Returns NET (expected) balance. Gross is derived by inflating per payer contractual.
function bimodalNet() {
  const bucket = weightedPick([["small", 72], ["mid", 23], ["large", 5]]);
  if (bucket === "small") return randint(40, 1000);
  if (bucket === "mid") return randint(1000, 14000);
  return randint(14000, 120000);
}

function pickPayer() {
  const e = PAYERS.map(p => [p, p[3]]);
  return weightedPick(e); // returns [name, hcMin, hcMax, weight]
}

// ---- Site performance profiles ----
// Each site is assigned the site loop deterministically so dispersion lands where it falls.
// tier drives: payer mix bias, denial propensity, aging skew.
// "strong" = commercial-heavy, low denials, tight AR. "weak" = Medicaid/self-pay-heavy, denial-heavy, aged AR.
// Moderate spread: 3 strong, 6 average, 3 weak — distributed across the 12 sites.
const SITE_PROFILES = {
  "Site 1":  { tier: "average", denialMult: 1.00, agingShift: 0,  govBias: 1.00, sizeWeight: 9 },
  "Site 2":  { tier: "average", denialMult: 1.05, agingShift: 4,  govBias: 1.05, sizeWeight: 13 },
  "Site 3":  { tier: "weak",    denialMult: 1.45, agingShift: 16, govBias: 1.40, sizeWeight: 6 },
  "Site 4":  { tier: "average", denialMult: 1.10, agingShift: 6,  govBias: 1.05, sizeWeight: 7 },
  "Site 5":  { tier: "weak",    denialMult: 1.40, agingShift: 18, govBias: 1.35, sizeWeight: 4 },
  "Site 6":  { tier: "strong",  denialMult: 0.62, agingShift: -14, govBias: 0.70, sizeWeight: 18 },
  "Site 7":  { tier: "average", denialMult: 0.95, agingShift: -2, govBias: 0.95, sizeWeight: 11 },
  "Site 8":  { tier: "average", denialMult: 1.00, agingShift: 2,  govBias: 1.00, sizeWeight: 10 },
  "Site 9":  { tier: "strong",  denialMult: 0.65, agingShift: -12, govBias: 0.72, sizeWeight: 14 },
  "Site 10": { tier: "strong",  denialMult: 0.70, agingShift: -10, govBias: 0.75, sizeWeight: 8 },
  "Site 11": { tier: "average", denialMult: 1.08, agingShift: 5,  govBias: 1.05, sizeWeight: 3 },
  "Site 12": { tier: "weak",    denialMult: 1.38, agingShift: 14, govBias: 1.32, sizeWeight: 5 },
};
// Weighted site picker — accounts distribute by sizeWeight so sites vary in size realistically
const SITE_WEIGHTS = Object.entries(SITE_PROFILES).map(([k, v]) => [k, v.sizeWeight]);
function pickSite() { return weightedPick(SITE_WEIGHTS); }

// Payer pick biased by site profile: govBias > 1 raises Medicaid/Self-Pay weight, < 1 lowers it
function pickPayerForSite(profile) {
  const e = PAYERS.map(p => {
    let w = p[3];
    if (p[0] === "Medicaid" || p[0] === "Self-Pay") w = w * profile.govBias;
    else if (p[0].includes("Blue") || p[0] === "Aetna" || p[0] === "Cigna" || p[0] === "United Health" || p[0] === "Anthem") {
      w = w * (2 - profile.govBias); // commercial inversely biased
    }
    return [p, w];
  });
  return weightedPick(e);
}

// Aging biased by site profile agingShift (days added/removed from the base draw)
function daysOutForSite(profile) {
  const base = weightedPick([[randint(1, 30), 30], [randint(31, 60), 30], [randint(61, 90), 20], [randint(91, 150), 13], [randint(151, 270), 7]]);
  return Math.max(1, base + profile.agingShift + randint(-4, 4));
}

// Denial draw biased by site profile denialMult
function denialForSite(profile) {
  // Realistic first-pass denial: ~14% base, site multiplier spreads good ~9% to weak ~20%+
  const baseDenialProb = 0.14;
  const p = Math.min(0.40, baseDenialProb * profile.denialMult);
  if (rand() < p) return pick(["CO-16", "CO-22", "CO-50", "CO-97", "CO-4"]);
  return null;
}

// ---- AR generation ----
const AR_COUNT = 11473;
const ar = [];
for (let i = 1; i <= AR_COUNT; i++) {
  const site = pickSite();
  const profile = SITE_PROFILES[site];
  const p = pickPayerForSite(profile);
  const payer = p[0], hcMin = p[1], hcMax = p[2];
  const net = bimodalNet();
  // gross = net / (1 - haircut); self-pay gross == net
  const haircut = payer === "Self-Pay" ? 0 : (hcMin + rand() * (hcMax - hcMin));
  const gross = haircut > 0 ? Math.round(net / (1 - haircut)) : net;
  const contractual = gross - net;
  const daysOut = daysOutForSite(profile);
  const denial = denialForSite(profile);
  const vertical = pick(VERTICALS);
  // serviceDate: first date of service (claim clock anchor for encounter claims).
  const serviceDaysAgo = daysOut + randint(2, 10);
  const serviceDate = isoDaysAgo(serviceDaysAgo);
  // dischargeDate: for stay verticals, later than service by the length of stay;
  // for encounter verticals, identical to service date. This is the timely-filing
  // clock anchor for INITIAL SUBMISSION (facility claims file from discharge).
  const los = stayLengthDays(vertical);
  const dischargeDate = los > 0 ? isoDaysAgo(Math.max(1, serviceDaysAgo - los)) : serviceDate;
  // denialDate: only present when the claim was actually denied. The claim is
  // submitted, sits at the payer, then is adjudicated-denied somewhere between
  // service and today. This is the timely-filing clock anchor for the APPEAL window.
  // Placed in the back half of the time the account has been outstanding.
  const denialDate = denial ? isoDaysAgo(randint(1, Math.max(1, Math.floor(daysOut * 0.6)))) : null;
  ar.push({
    id: `AR-${String(i).padStart(5, "0")}`,
    patient: name(),
    payer,
    grossCharges: gross,
    contractualAdjustment: contractual,
    amount: net,                       // net = expected reimbursement / balance
    daysOut,
    serviceDate,
    dischargeDate,                     // initial-submission TF clock anchor
    lastContact: isoDaysAgo(randint(0, Math.min(daysOut, 60))),
    denialCode: denial,
    denialDate,                        // appeal-window TF clock anchor (null if not denied)
    site,
    vertical,
    claimStatus: denial ? "Adjudicated — Denied" : pick(AR_CLAIM_STATUS),
  });
}

function pickPayer2() { /* unused */ }
const DNFB_COUNT = 2847;
const dnfb = [];
for (let i = 1; i <= DNFB_COUNT; i++) {
  const [payer] = pickPayer();
  // DNFB sits at GROSS charges
  const gross = bimodalNet();
  const grossInflated = Math.round(gross * (1 + rand() * 0.8)); // gross is higher than net-equivalent
  const daysInDNFB = weightedPick([[randint(1, 3), 38], [randint(4, 5), 18], [randint(6, 12), 28], [randint(13, 30), 16]]);
  const vertical = pick(VERTICALS);
  const serviceDaysAgo = daysInDNFB + randint(1, 5);
  const serviceDate = isoDaysAgo(serviceDaysAgo);
  const los = stayLengthDays(vertical);
  const dischargeDate = los > 0 ? isoDaysAgo(Math.max(1, serviceDaysAgo - los)) : serviceDate;
  dnfb.push({
    id: `DNFB-${String(i).padStart(5, "0")}`,
    patient: name(),
    payer,
    amount: grossInflated,             // DNFB amount = gross charges
    daysInDNFB,
    serviceDate,
    dischargeDate,                     // initial-submission TF clock anchor (pre-bill; no denialDate yet)
    lastContact: isoDaysAgo(randint(0, daysInDNFB)),
    holdCode: pick(DNFB_HOLDS),
    site: pickSite(),
    vertical,
  });
}

// ---- Fixed annual NPR per site (as if pulled from the accounting system) ----
// These are independent givens — NOT derived live from AR. Each is a realistic
// annual net patient revenue, scaled to site size with strong sites turning AR
// faster (more annual revenue per dollar of AR). Sums to ~$353M.
const SITE_NPR = {
  "Site 1":  30273527,
  "Site 2":  38170723,
  "Site 3":  13948331,
  "Site 4":  24938523,
  "Site 5":  11679553,
  "Site 6":  74783215,
  "Site 7":  39027507,
  "Site 8":  28744210,
  "Site 9":  51980767,
  "Site 10": 23956961,
  "Site 11": 10283392,
  "Site 12": 9787508,
};

// ---- Write ----
const outDir = path.join(__dirname, "..", "app", "data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "ar-accounts.json"), JSON.stringify(ar));
fs.writeFileSync(path.join(outDir, "dnfb-accounts.json"), JSON.stringify(dnfb));
fs.writeFileSync(path.join(outDir, "site-npr.json"), JSON.stringify(SITE_NPR));

// ---- Report ----
const arGross = ar.reduce((s, a) => s + a.grossCharges, 0);
const arNet = ar.reduce((s, a) => s + a.amount, 0);
const arContractual = ar.reduce((s, a) => s + a.contractualAdjustment, 0);
const dnfbGross = dnfb.reduce((s, a) => s + a.amount, 0);
const small = ar.filter(a => a.amount < 1000).length;
const mid = ar.filter(a => a.amount >= 1000 && a.amount < 25000).length;
const large = ar.filter(a => a.amount >= 25000).length;
const sub1k = ar.filter(a => a.amount < 1000).length;
const t1 = ar.filter(a => a.amount >= 10000).length;
const t2 = ar.filter(a => a.amount >= 1000 && a.amount < 10000).length;
const t3 = ar.filter(a => a.amount < 1000).length;
const avgDaysAR = Math.round(ar.reduce((s, a) => s + a.daysOut, 0) / ar.length);
const avgDaysDNFB = (dnfb.reduce((s, a) => s + a.daysInDNFB, 0) / dnfb.length).toFixed(1);

console.log("=== AR ===");
console.log("Count:", ar.length);
console.log("Gross charges:   $" + arGross.toLocaleString());
console.log("Contractual adj: $" + arContractual.toLocaleString());
console.log("Net balance:     $" + arNet.toLocaleString());
console.log("Check (gross - contractual = net):", arGross - arContractual === arNet ? "RECONCILES" : "MISMATCH " + (arGross - arContractual - arNet));
console.log("Avg net balance: $" + Math.round(arNet / ar.length).toLocaleString());
console.log("Avg days in AR:", avgDaysAR);
console.log("Implied NPR (net x 365/avgDays): $" + Math.round(arNet * 365 / avgDaysAR).toLocaleString());
console.log("Distribution: small<1k", small, "| mid 1k-25k", mid, "| large 25k+", large);
console.log("Follow-up tiers: $10k+", t1, "| $1k-10k", t2, "| <$1k", t3);
console.log("");
console.log("=== DNFB ===");
console.log("Count:", dnfb.length);
console.log("Gross charges: $" + dnfbGross.toLocaleString());
console.log("Avg days in DNFB:", avgDaysDNFB);

// ---- New date-field checks ----
const arDenied = ar.filter(a => a.denialCode);
const arDeniedWithDate = arDenied.filter(a => a.denialDate);
const arNoDenialNoDate = ar.filter(a => !a.denialCode && a.denialDate === null);
const arDischargeAfterService = ar.filter(a => a.dischargeDate > a.serviceDate).length;
const arDischargeEqService = ar.filter(a => a.dischargeDate === a.serviceDate).length;
console.log("");
console.log("=== DATE FIELDS ===");
console.log("AR denied accounts:", arDenied.length, "| of those with denialDate:", arDeniedWithDate.length, arDenied.length === arDeniedWithDate.length ? "(all denied have a denialDate ✓)" : "(MISMATCH)");
console.log("AR non-denied with null denialDate:", arNoDenialNoDate.length, "of", ar.length - arDenied.length, "non-denied", (arNoDenialNoDate.length === ar.length - arDenied.length) ? "✓" : "(MISMATCH)");
console.log("AR dischargeDate > serviceDate (stay verticals):", arDischargeAfterService);
console.log("AR dischargeDate == serviceDate (encounter verticals):", arDischargeEqService);
console.log("Sample denied AR:", JSON.stringify((arDeniedWithDate[0] && { id: arDeniedWithDate[0].id, vertical: arDeniedWithDate[0].vertical, serviceDate: arDeniedWithDate[0].serviceDate, dischargeDate: arDeniedWithDate[0].dischargeDate, denialCode: arDeniedWithDate[0].denialCode, denialDate: arDeniedWithDate[0].denialDate })));
console.log("Sample DNFB:", JSON.stringify((dnfb[0] && { id: dnfb[0].id, vertical: dnfb[0].vertical, serviceDate: dnfb[0].serviceDate, dischargeDate: dnfb[0].dischargeDate })));
