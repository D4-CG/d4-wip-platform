import { useState, useMemo, useCallback, useEffect } from "react";
import AR_DATA from "../app/data/ar-accounts.json";
import DNFB_DATA from "../app/data/dnfb-accounts.json";

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

const PAYER_BASELINES = {
  // Medicare
  "Medicare": 88, "Medicare Advantage": 85, "Medicare Part B": 88,
  // Blue Cross / Blue Shield
  "Blue Cross": 84, "Blue Shield": 82, "BCBS": 83, "Blue Cross Blue Shield": 83,
  "Anthem": 81, "Anthem BCBS": 81, "Highmark": 80, "Carefirst": 80,
  "Independence Blue Cross": 81, "Regence": 80, "Premera": 80,
  // Aetna / CVS
  "Aetna": 79, "Aetna Better Health": 62, "CVS Aetna": 79,
  // United Health
  "United Health": 76, "UnitedHealthcare": 76, "UHC": 76, "United Healthcare": 76,
  "United Community Plan": 60, "Optum": 76,
  // Cigna
  "Cigna": 74, "Cigna Behavioral": 72, "Evernorth": 74,
  // Humana
  "Humana": 72, "Humana Medicare": 85,
  // Other commercial
  "Molina Healthcare": 58, "Centene": 57, "WellCare": 57,
  "Centene / WellCare": 57, "AmeriHealth Caritas": 60,
  "Buckeye Health Plan": 59, "Magellan": 68, "Beacon Health": 68,
  "Tricare": 82, "VA": 84, "CHAMPVA": 82,
  // Medicaid
  "Medicaid": 56,
  // Workers Comp
  "Worker Comp": 40, "Workers Comp": 40, "Workers Compensation": 40,
};

const HOLD_CONFIG = {
  CODING_UNASSIGNED:  { area: "Coding",           color: "#6d28d9", label: "Coding — unassigned",          adj: -8,  severity: "URGENT" },
  CODING_COMPLEX:     { area: "Coding",           color: "#6d28d9", label: "Coding — complex hold",         adj: -12, severity: "MODERATE" },
  PHYSICIAN_UNSIGNED: { area: "Physician/Doc",    color: "#1d4ed8", label: "Physician — note unsigned",    adj: -10, severity: "URGENT" },
  PHYSICIAN_QUERY:    { area: "Physician/Doc",    color: "#1d4ed8", label: "Physician — query pending",    adj: -14, severity: "MODERATE" },
  CHARGE_MISSING:     { area: "Charge Capture",   color: "#be185d", label: "Charge — missing",             adj: -25, severity: "CRITICAL" },
  CHARGE_LAG:         { area: "Charge Capture",   color: "#be185d", label: "Charge — entry lag",           adj: -10, severity: "URGENT" },
  CREDENTIALING:      { area: "Credentialing",    color: "#9f1239", label: "Credentialing — provider gap", adj: -30, severity: "CRITICAL" },
  AUTH_MISSING:       { area: "Authorization",    color: "#c2410c", label: "Auth — not obtained",          adj: -22, severity: "URGENT" },
  AUTH_EXPIRED:       { area: "Authorization",    color: "#c2410c", label: "Auth — expired",               adj: -24, severity: "URGENT" },
  HIM_DEFICIENCY:     { area: "Clinical/HIM",     color: "#0369a1", label: "HIM — record deficiency",      adj: -6,  severity: "MODERATE" },
  SCRUBBER_EDIT:      { area: "Billing/Scrubber", color: "#0f766e", label: "Scrubber — edit hold",         adj: -4,  severity: "ROUTINE" },
  ELIGIBILITY:        { area: "Billing/Scrubber", color: "#0f766e", label: "Eligibility — mismatch",       adj: -8,  severity: "MODERATE" },
  "CO-4":             { area: "Authorization",    color: "#c2410c", label: "Denial CO-4 — not covered",    adj: -35, severity: "URGENT" },
  "CO-16":            { area: "Billing/Scrubber", color: "#0f766e", label: "Denial CO-16 — missing info",  adj: -8,  severity: "MODERATE" },
  "CO-22":            { area: "Billing/Scrubber", color: "#0f766e", label: "Denial CO-22 — COB issue",     adj: -20, severity: "MODERATE" },
  "CO-50":            { area: "Physician/Doc",    color: "#1d4ed8", label: "Denial CO-50 — med necessity", adj: -30, severity: "URGENT" },
  "CO-97":            { area: "Billing/Scrubber", color: "#0f766e", label: "Denial CO-97 — bundling",      adj: -15, severity: "MODERATE" },
  PENDING:            { area: "Pending",      color: "#374151", label: "Pending payment",              adj: 0,   severity: "ROUTINE" },
};

const SEV = {
  CRITICAL: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  URGENT:   { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  MODERATE: { bg: "#fefce8", text: "#854d0e", border: "#fde68a" },
  ROUTINE:  { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
};

const OUTCOME_STATUSES = [
  { value: "promised_payment",    label: "Promised payment",       followUpDays: 5,  closed: false },
  { value: "left_voicemail",      label: "Left voicemail",         followUpDays: 2,  closed: false },
  { value: "in_adjudication",     label: "In adjudication",        followUpDays: 14, closed: false },
  { value: "payer_followup",      label: "Payer follow-up pending", followUpDays: 5,  closed: false },
  { value: "authorization_pending",label: "Authorization pending", followUpDays: 7,  closed: false },
  { value: "needs_documentation", label: "Needs documentation",    followUpDays: 7,  closed: false },
  { value: "appeal_filed",        label: "Appeal filed",           followUpDays: 30, closed: false },
  { value: "alj_appeal_filed",    label: "ALJ appeal filed",       followUpDays: 60, closed: false },
  { value: "resubmitted",         label: "Resubmitted",            followUpDays: 14, closed: false },
  { value: "escalated",           label: "Escalated",              followUpDays: 3,  closed: false },
  { value: "no_response",         label: "No response",            followUpDays: 7,  closed: false },
  { value: "pending_eligibility", label: "Pending eligibility",    followUpDays: 14, closed: false },
  { value: "physician_query",     label: "Physician query sent",   followUpDays: 2,  closed: false },
  { value: "coding_assigned",     label: "Coding assigned",        followUpDays: 3,  closed: false },
  { value: "paid_full",           label: "Paid — full",            followUpDays: null, closed: true },
  { value: "paid_partial",        label: "Paid — partial",         followUpDays: 14, closed: false },
  { value: "writeoff_recommended",label: "Write-off recommended",  followUpDays: null, closed: false, pending: true },
];


const PAYER_CATEGORY = {
  "Medicare": "medicare",
  "Blue Cross": "commercial", "Blue Shield": "commercial",
  "Aetna": "commercial", "United Health": "commercial",
  "Cigna": "commercial", "Humana": "commercial",
  "Medicaid": "medicaid",
  "Worker Comp": "workers_comp",
};

const PAYER_BENCHMARKS = {
  medicare:     { min: 85, max: 92, label: "Medicare" },
  commercial:   { min: 75, max: 88, label: "Commercial" },
  medicaid:     { min: 55, max: 70, label: "Medicaid" },
  workers_comp: { min: 45, max: 65, label: "Worker's Comp" },
};

// Payer portal quick-links — opens provider portal in new tab
const PAYER_PORTALS = {
  "Medicare": "https://www.cms.gov/medicare/provider-enrollment-and-certification",
  "Medicare Advantage": "https://www.cms.gov/medicare/provider-enrollment-and-certification",
  "United Health": "https://www.uhcprovider.com",
  "UnitedHealthcare": "https://www.uhcprovider.com",
  "UHC": "https://www.uhcprovider.com",
  "Aetna": "https://www.aetna.com/health-care-professionals.html",
  "Aetna Better Health": "https://www.aetnabetterhealth.com/providers",
  "Cigna": "https://hcpportal.cigna.com",
  "Humana": "https://www.availity.com",
  "Blue Cross": "https://www.availity.com",
  "Blue Shield": "https://www.availity.com",
  "Anthem": "https://www.availity.com",
  "BCBS": "https://www.availity.com",
  "Medicaid": "https://www.availity.com",
  "Molina Healthcare": "https://providers.molinahealthcare.com",
  "Centene / WellCare": "https://www.availity.com",
  "AmeriHealth Caritas": "https://www.amerihealthcaritaspa.com/provider",
  "United Community Plan": "https://www.uhcprovider.com",
  "Buckeye Health Plan": "https://www.buckeyehealthplan.com/providers",
  "Worker Comp": "https://www.availity.com",
};
// Green starts where the payer benchmark minimum starts — internally consistent
const PROB_THRESHOLDS = {
  medicare:     { green: 82, amber: 55 },
  commercial:   { green: 70, amber: 40 },
  medicaid:     { green: 55, amber: 30 },
  workers_comp: { green: 45, amber: 25 },
  self_pay:     { green: 20, amber: 10 },
};

// WorkLink SLA by request type — replaces severity-only SLA
// Applied as MAX(severity_hrs, request_type_hrs)
const WORKLINK_REQUEST_SLA_HRS = {
  resubmit:       24,
  recode:         48,
  chase_auth:     72,
  cred_gap:       120,  // 5 days
  missing_charge: 24,
  him_deficiency: 48,
  physician_query: 72,
  other:          48,
};

// Vertical configuration — context injected into AI prompts
const CLIENT_CONFIG = {
  vertical: "ambulatory", // options: ambulatory | hospice | behavioral_health | infusion
  verticalContext: {
    ambulatory: "",
    hospice: "This is a hospice and palliative care platform. Use hospice-specific terminology: election documentation, Notice of Election (NOE), benefit period, face-to-face, election gap, cap liability, continuous care dispute, MAC reopening, ALJ appeal. Payer is almost always Medicare or Medicaid. Do not use commercial AR language. Notes should reflect episode-based billing context.",
    behavioral_health: "This is a behavioral health and addiction medicine platform with Medicaid-heavy reimbursement. Use behavioral health terminology: prior authorization (PA), MCO care coordinator, level of care (PHP, IOP, RTC, outpatient), utilization review (UR), peer-to-peer review, PA extension, Medicaid MCO, treatment episode. Reflect that most accounts are Medicaid with MCO-specific authorization requirements.",
    infusion: "This is an ambulatory infusion platform. Use infusion-specific terminology: prior authorization, J-code, NDC (National Drug Code), biologic, IVIG, infusion date of service, drug authorization, administration code, specialty pharmacy, buy-and-bill. Notes should reflect high-dollar specialty drug billing context.",
  },
};

const ROLE_DEFS = {
  commercial_collector: { label: "Commercial Collector",    paneLabel: "Commercial accounts only",              filter: ["commercial"],  mode: "collector" },
  medicare_bc:          { label: "Medicare Part B",            paneLabel: "Medicare Part B — MAC portal workflow",        filter: ["medicare"],    mode: "medicare_bc" },
  medicaid:             { label: "Medicaid Specialist",     paneLabel: "Medicaid accounts only",                filter: ["medicaid"],    mode: "collector" },
  wc:                   { label: "Worker's Comp",           paneLabel: "Worker's Comp accounts only",           filter: ["workers_comp"],mode: "collector" },
  biller:               { label: "Biller — All Payers",    paneLabel: "All payer types",                       filter: ["all"],         mode: "biller" },
  self_pay:             { label: "Self-Pay Specialist",     paneLabel: "Patient accounts — 30-day hold active", filter: ["self_pay"],    mode: "self_pay" },
  supervisor:           { label: "Supervisor",              paneLabel: "All payer types",                       filter: ["all"],         mode: "supervisor" },
  cfo:                  { label: "CFO",                     paneLabel: "All payer types",                       filter: ["all"],         mode: "cfo" },
  authorization:        { label: "Authorization",           paneLabel: "Auth holds + WorkLink requests",        filter: ["all"],         mode: "area", area: "Authorization" },
  charge_capture:       { label: "Charge Capture",          paneLabel: "Charge holds + WorkLink requests",      filter: ["all"],         mode: "area", area: "Charge Capture" },
  coder:                { label: "Coder",                   paneLabel: "Coding holds + WorkLink requests",      filter: ["all"],         mode: "area", area: "Coding" },
  him:                  { label: "HIM / Physician Doc",     paneLabel: "HIM & physician holds + WorkLink",      filter: ["all"],         mode: "area", area: "Clinical/HIM" },
  billing_scrubber:     { label: "Billing / Scrubber",      paneLabel: "Billing holds + WorkLink requests",     filter: ["all"],         mode: "area", area: "Billing/Scrubber" },
  credentialing:        { label: "Credentialing",           paneLabel: "Credentialing holds + WorkLink requests",filter: ["all"],        mode: "area", area: "Credentialing" },
};

const ESCALATION_DATA = {
  escalated: [
    { accountId: "AR-005",  patient: "Patricia Nguyen",    payer: "Cigna",     amount: 92500,  expectedValue: 11100,  escalatedBy: "T.Jones",   escalatedAt: "Today 8:42 AM",    note: "CO-50 denial — payer refusing retro auth after two attempts. Need clinical review and appeal strategy.", severity: "URGENT" },
    { accountId: "DNFB-007",patient: "James Whitfield",    payer: "Blue Cross", amount: 320000, expectedValue: 256000, escalatedBy: "J.Smith",   escalatedAt: "Today 9:15 AM",    note: "Infusion drug charge still missing after routing to charge capture twice. Site 7 unresponsive — $320K at risk.", severity: "CRITICAL" },
    { accountId: "AR-001",  patient: "Sandra Okonkwo",     payer: "Medicaid",   amount: 196000, expectedValue: 23520,  escalatedBy: "R.Garcia",  escalatedAt: "Yesterday 4:30 PM",note: "Medicaid CO-4 — three retro auth attempts exhausted. Payer final on denial. Recommend write-off review.", severity: "URGENT" },
  ],
  slaBreach: [
    { accountId: "AR-020",  patient: "Carol Thompson",     payer: "Worker Comp", assignedTo: "M.Williams", scheduledDate: "May 13", daysOverdue: 3, amount: 422500 },
    { accountId: "AR-035",  patient: "George Taylor",      payer: "Medicare",    assignedTo: "J.Smith",    scheduledDate: "May 12", daysOverdue: 4, amount: 55000 },
    { accountId: "DNFB-004",patient: "Patricia Nguyen",    payer: "Blue Cross",  assignedTo: "T.Jones",    scheduledDate: "May 14", daysOverdue: 2, amount: 255000 },
  ],
  writeOffPending: [
    { accountId: "AR-009",  patient: "William Jackson",    payer: "Medicaid",  amount: 67500,  recommendedBy: "J.Smith",  recommendedAt: "Today 10:20 AM",    rationale: "15% collection probability after 203 days. Timely filing window closed with Medicaid. All recovery paths exhausted." },
    { accountId: "AR-005",  patient: "Patricia Nguyen",    payer: "Cigna",     amount: 92500,  recommendedBy: "R.Garcia", recommendedAt: "Yesterday 2:15 PM", rationale: "12% probability after 206 days. CO-50 medical necessity denial — all three appeal levels exhausted." },
  ],
  overrideReview: [
    { accountId: "AR-003",  patient: "Linda Kowalski",   payer: "Medicaid",  collectorName: "J.Smith", aiRecommended: "Appeal submission", collectorChose: "Outbound call",    note: "Payer rep confirmed CO-97 fixable with modifier 59 — faster than full appeal process. Good call." },
    { accountId: "AR-007",  patient: "Charles Abramson", payer: "Medicaid",  collectorName: "T.Jones", aiRecommended: "Outbound call",    collectorChose: "Appeal submission", note: "COB not resolvable by phone — obtained primary EOB and filed formal appeal directly. Appropriate override." },
  ],
};

const AREAS = ["Coding","Physician/Doc","Charge Capture","Credentialing","Authorization","Clinical/HIM","Billing/Scrubber","Pending"];

// Revenue cycle order: Authorization → Charge Capture → Coding → HIM → Billing/Scrubber
const RC_AREA_ORDER = ["Authorization","Charge Capture","Coding","Clinical/HIM","Billing/Scrubber","Credentialing","Physician/Doc"];

// ─── Denial Prediction — Hold code → denial risk mapping ────────────────────
const DENIAL_RISK_MAP = {
  AUTH_MISSING:   { risk: "high",   carc: "CO-15", label: "Missing auth number", action: "Chase authorization before billing" },
  AUTH_EXPIRED:   { risk: "high",   carc: "CO-15", label: "Auth expired",         action: "Renew authorization immediately" },
  CODING_UNASSIGNED: { risk: "medium", carc: "CO-4",  label: "Coding incomplete",  action: "Assign coder — uncode claims denied" },
  CODING_COMPLEX: { risk: "medium", carc: "CO-97",  label: "Bundling risk",        action: "Review for modifier requirements" },
  HIM_DEFICIENCY: { risk: "medium", carc: "CO-50",  label: "Documentation gap",   action: "Resolve HIM deficiency before billing" },
  CREDENTIALING:  { risk: "high",   carc: "CO-29",  label: "Provider not credentialed", action: "Hold — do not submit until credentialing complete" },
  CHARGE_MISSING: { risk: "high",   carc: "CO-16",  label: "Incomplete charge",   action: "Submit missing charge or claim will be returned" },
};

// ─── Cash Flow Forecasting — Payer timing weights (days to payment) ──────────
const PAYER_TIMING = {
  medicare:     { p30: 0.60, p60: 0.85, p90: 0.95 }, // MAC pays fast
  commercial:   { p30: 0.35, p60: 0.65, p90: 0.85 }, // commercial varies
  medicaid:     { p30: 0.20, p60: 0.50, p90: 0.75 }, // Medicaid slowest
  workers_comp: { p30: 0.10, p60: 0.35, p90: 0.60 }, // WC longest tail
  self_pay:     { p30: 0.15, p60: 0.30, p90: 0.45 }, // self-pay lowest
};
const WORKLINK_ACTION_MAP = {
  "chase_auth":     { requestType: "chase_auth",      requestLabel: "Chase authorization", requestIcon: "🔐", targetArea: "Authorization" },
  "recode":         { requestType: "recode",           requestLabel: "Recode account",      requestIcon: "💻", targetArea: "Coding" },
  "him_deficiency": { requestType: "him_deficiency",   requestLabel: "HIM deficiency",      requestIcon: "📄", targetArea: "Clinical/HIM" },
  "physician_query":{ requestType: "physician_query",  requestLabel: "Physician query",     requestIcon: "👨‍⚕️", targetArea: "Physician/Doc" },
  "resubmit":       { requestType: "resubmit",         requestLabel: "Resubmit claim",      requestIcon: "🔄", targetArea: "Billing/Scrubber" },
  "missing_charge": { requestType: "missing_charge",   requestLabel: "Missing charge",      requestIcon: "⚡", targetArea: "Charge Capture" },
  "cred_gap":       { requestType: "cred_gap",         requestLabel: "Credentialing gap",   requestIcon: "📋", targetArea: "Credentialing" },
  "appeal":         { requestType: "physician_query",  requestLabel: "Physician query",     requestIcon: "👨‍⚕️", targetArea: "Physician/Doc" },
};

// Hold code → WorkLink auto-draft mapping (for area worklists)
const WORKLINK_HOLD_MAP = {
  "PHYSICIAN_QUERY_NEEDED": { requestType: "physician_query", requestLabel: "Physician query",     requestIcon: "👨‍⚕️", targetArea: "Physician/Doc" },
  "HIM_DEFICIENCY":         { requestType: "him_deficiency",  requestLabel: "HIM deficiency",      requestIcon: "📄", targetArea: "Clinical/HIM" },
  "AUTH_MISSING":           { requestType: "chase_auth",      requestLabel: "Chase authorization", requestIcon: "🔐", targetArea: "Authorization" },
  "AUTH_EXPIRED":           { requestType: "chase_auth",      requestLabel: "Chase authorization", requestIcon: "🔐", targetArea: "Authorization" },
  "CHARGE_MISSING":         { requestType: "missing_charge",  requestLabel: "Missing charge",      requestIcon: "⚡", targetArea: "Charge Capture" },
  "CODING_UNASSIGNED":      { requestType: "recode",          requestLabel: "Recode account",      requestIcon: "💻", targetArea: "Coding" },
  "CREDENTIALING_GAP":      { requestType: "cred_gap",        requestLabel: "Credentialing gap",   requestIcon: "📋", targetArea: "Credentialing" },
};

const WORKLINK_REQUEST_TYPES = [
  { value: "chase_auth",    label: "Chase authorization",      icon: "🔐", targetArea: "Authorization" },
  { value: "missing_charge",label: "Missing charge",           icon: "⚡", targetArea: "Charge Capture" },
  { value: "recode",        label: "Recode account",           icon: "💻", targetArea: "Coding" },
  { value: "him_deficiency",label: "HIM deficiency",           icon: "📄", targetArea: "Clinical/HIM" },
  { value: "physician_query",label: "Physician query",         icon: "👨‍⚕️", targetArea: "Physician/Doc" },
  { value: "resubmit",      label: "Resubmit claim",          icon: "🔄", targetArea: "Billing/Scrubber" },
  { value: "cred_gap",      label: "Credentialing gap",        icon: "📋", targetArea: "Credentialing" },
  { value: "other",         label: "Other",                    icon: "📌", targetArea: null },
];

const WORKLINK_TARGET_AREAS = ["Authorization","Charge Capture","Coding","Clinical/HIM","Billing/Scrubber","Credentialing","Physician/Doc"];

const WORKLINK_SLA_HRS = { CRITICAL: 4, URGENT: 24, MODERATE: 48, ROUTINE: 72 };

const DEFAULT_GOALS = {
  monitorMaxCount: null,   // no goal on monitor bucket
  monitorMaxEV: null,
  workAsapMaxCount: 0,     // goal: zero accounts in 3+ day bucket
  workAsapMaxAgeDays: 5,   // max days from service date before escalation
  workAsapMaxEV: 0,
  worklinkSLATarget: 95,   // % resolved within SLA
  worklinkMaxOpen: 10,     // max open requests per area
  worklinkAvgResolutionHrs: 24,
};

function getWorklinkSLA(severity, requestType, serviceDateStr) {
  const severityHrs = WORKLINK_SLA_HRS[severity] || 48;
  const requestHrs = WORKLINK_REQUEST_SLA_HRS[requestType] || 48;
  let hrs = Math.max(severityHrs, requestHrs);
  let isServiceDateSLA = false;

  if (serviceDateStr) {
    const sd = new Date(serviceDateStr);
    const leadTimeHrs = WORKLINK_REQUEST_SLA_HRS[requestType] || 48;
    const sdDeadline = new Date(sd.getTime() - leadTimeHrs * 3600000);
    const now = new Date();
    const hoursUntilDeadline = (sdDeadline - now) / 3600000;
    if (hoursUntilDeadline < hrs) {
      hrs = Math.max(0, Math.round(hoursUntilDeadline));
      isServiceDateSLA = true;
    }
  }

  const due = new Date(Date.now() + hrs * 3600000);
  const label = hrs === 0 ? "OVERDUE" : hrs < 24 ? `${hrs}hr` : `${Math.round(hrs/24)}d`;
  return { hrs, due, label, isServiceDateSLA };
}


const fmt = n => "$" + n.toLocaleString();
function daysSince(d) { return Math.floor((Date.now() - new Date(d)) / 86400000); }

function addBusinessDays(days) {
  const date = new Date();
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function addBusinessDaysISO(days) {
  const date = new Date();
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  return date.toISOString().split("T")[0];
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

const FOLLOWUP_KEY = "d4_followup";
function getFollowUpStore() {
  try { return JSON.parse(localStorage.getItem(FOLLOWUP_KEY) || "{}"); } catch { return {}; }
}
function setFollowUpDate(accountId, value) {
  try {
    const store = getFollowUpStore();
    store[accountId] = value;
    localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(store));
  } catch {}
}
function isAccountActionable(accountId) {
  const store = getFollowUpStore();
  const entry = store[accountId];
  if (!entry) return true;
  if (entry === "closed") return false;
  if (entry === "pending_cfo") return false;
  return entry <= todayISO();
}

function getAction(acc) {
  const { holdCode, prob, daysOut, payer, site, vertical, amount, serviceDate } = acc;
  if (prob < 20 && daysOut > 150) return { icon: "✕", color: "#64748b", label: "Write-off review", text: `${prob}% collection probability after ${daysOut} days. Collection cost likely exceeds expected recovery. Route to CFO for write-off approval.` };
  if (holdCode === "CREDENTIALING") return { icon: "⚡", color: "#c2410c", label: "Internal escalation", text: `Escalate to credentialing team — provider not credentialed at ${site} with ${payer}. ${amount > 50000 ? fmt(amount) + " at risk." : ""} Request expedited credentialing and estimated resolution date.` };
  if (holdCode === "CHARGE_MISSING") return { icon: "⚡", color: "#c2410c", label: "Internal escalation", text: `Route to charge capture at ${site} — ${vertical} charge missing. Service date ${serviceDate}. Enter charges immediately — timely filing clock is running.` };
  if (holdCode === "PHYSICIAN_UNSIGNED" || holdCode === "PHYSICIAN_QUERY") return { icon: "📝", color: "#1d4ed8", label: "Physician query", text: `Send physician query — ${vertical} note unsigned or query pending at ${site}. ${daysOut} days outstanding. Response required within 24 hours.` };
  if (holdCode === "AUTH_MISSING" || holdCode === "AUTH_EXPIRED") return { icon: "⚡", color: "#c2410c", label: "Internal escalation", text: `Route to authorization team — retrospective auth required for ${vertical} at ${site}. File within payer window. ${payer} retro-auth success rate approximately 45%.` };
  if (holdCode === "CO-4") return { icon: "📋", color: "#6d28d9", value: "appeal", label: "Appeal submission", text: `File CO-4 appeal — service not covered. Submit medical necessity documentation and clinical notes. Deadline in ${Math.max(0, 180 - daysOut)} days. ~35% success rate with complete documentation.` };
  if (holdCode === "CO-50") return { icon: "📋", color: "#6d28d9", value: "appeal", label: "Appeal submission", text: `File CO-50 appeal — medical necessity denied. Prepare clinical documentation package with supporting diagnosis codes. Escalate to physician for co-signature.` };
  if (holdCode === "CO-97") return { icon: "📋", color: "#6d28d9", value: "appeal", label: "Appeal submission", text: `File CO-97 appeal — bundling dispute. Add modifier 59 or appropriate unbundling modifier and resubmit. Review CPT pairing against ${payer} fee schedule.` };
  if (holdCode === "CO-22") return { icon: "📞", color: "#0369a1", label: "Outbound call", text: `Call ${payer} provider services — CO-22 COB issue on claim ${acc.id}. Obtain primary payer EOB and submit as secondary claim.` };
  if (holdCode === "CO-16") return { icon: "⚡", color: "#c2410c", label: "Internal escalation", text: `Fix and resubmit — CO-16 missing information on claim ${acc.id}. Review for blank required fields. Resubmit within 5 business days. High resolution rate.` };
  if (holdCode === "CODING_UNASSIGNED") return { icon: "⚡", color: "#6d28d9", label: "Internal escalation", text: `Assign to coder immediately — unassigned for ${acc.daysInDNFB || daysOut} days. ${amount > 50000 ? "High-value — escalate to coding supervisor." : "Route per normal queue priority."}` };
  if (holdCode === "HIM_DEFICIENCY") return { icon: "📝", color: "#1d4ed8", label: "Physician query", text: `Resolve HIM deficiency at ${site} — record incomplete. Route deficiency notice to responsible clinician. Target resolution within 48 hours.` };
  return { icon: "📞", color: "#0369a1", label: "Outbound call", text: `Call ${payer} provider services — claim ${acc.id}, ${daysOut} days outstanding. Verify receipt and processing status. Request estimated payment date.` };
}

function score(acc, type) {
  let prob = PAYER_BASELINES[acc.payer] || 70;
  const holdCode = type === "dnfb" ? acc.holdCode : (acc.denialCode || "PENDING");
  const cfg = HOLD_CONFIG[holdCode] || HOLD_CONFIG.PENDING;
  prob += cfg.adj;
  const days = type === "dnfb" ? acc.daysInDNFB : acc.daysOut;
  if (type === "dnfb") {
    if (days > 30) prob -= 40; else if (days > 21) prob -= 25; else if (days > 14) prob -= 15; else if (days > 7) prob -= 8;
  } else {
    if (days > 180) prob -= 50; else if (days > 120) prob -= 35; else if (days > 90) prob -= 20; else if (days > 60) prob -= 10; else if (days > 30) prob -= 5;
  }
  const sc = daysSince(acc.lastContact);
  if (sc > 60) prob -= 15; else if (sc > 30) prob -= 8; else if (sc < 7) prob += 5;
  prob = Math.max(5, Math.min(98, prob));
  const expectedValue = Math.round(prob / 100 * acc.amount);
  const daysOut = type === "dnfb" ? acc.daysInDNFB : acc.daysOut;
  return { ...acc, type, prob, expectedValue, cfg, area: cfg.area, action: getAction({ ...acc, holdCode, prob, daysOut }), daysOut };
}

function ProbCircle({ prob, payer }) {
  const category = PAYER_CATEGORY[payer] || "commercial";
  const thresholds = PROB_THRESHOLDS[category] || PROB_THRESHOLDS.commercial;
  const color = prob >= thresholds.green ? "#16a34a" : prob >= thresholds.amber ? "#d97706" : "#dc2626";
  const label = prob >= thresholds.green ? "Strong" : prob >= thresholds.amber ? "Fair" : "At Risk";
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = (prob / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Likelihood</div>
      <svg width="54" height="54" viewBox="0 0 54 54">
        <circle cx="27" cy="27" r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
        <circle cx="27" cy="27" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 27 27)" />
        <text x="27" y="24" textAnchor="middle" dominantBaseline="middle"
          fontSize="11" fontWeight="700" fill={color} fontFamily="system-ui, sans-serif">{prob}%</text>
        <text x="27" y="35" textAnchor="middle" dominantBaseline="middle"
          fontSize="7.5" fill="#64748b" fontFamily="system-ui, sans-serif">{label}</text>
      </svg>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }}>🔍</span>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "Search accounts..."}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "9px 12px 9px 36px", fontSize: 13,
          border: "1px solid #e2e8f0", borderRadius: 8,
          background: "#fff", color: "#0f172a", outline: "none",
          fontFamily: "inherit",
        }}
      />
      {value && (
        <button onClick={() => onChange("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
      )}
    </div>
  );
}

function OutcomeSelector({ onSelect, selectedOutcome }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Log outcome</div>
      <select
        value={selectedOutcome || ""}
        onChange={e => onSelect(e.target.value)}
        style={{
          width: "100%", padding: "9px 12px", fontSize: 13,
          border: "1px solid #e2e8f0", borderRadius: 8,
          background: "#fff", color: selectedOutcome ? "#0f172a" : "#94a3b8",
          fontFamily: "inherit", cursor: "pointer", outline: "none",
        }}
      >
        <option value="" disabled>Select outcome status...</option>
        <optgroup label="In progress">
          {OUTCOME_STATUSES.filter(o => !o.closed && !o.pending).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
        <optgroup label="Completed">
          {OUTCOME_STATUSES.filter(o => o.closed).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
        <optgroup label="Special">
          {OUTCOME_STATUSES.filter(o => o.pending).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

function FollowUpPreview({ outcome }) {
  if (!outcome) return null;
  const os = OUTCOME_STATUSES.find(o => o.value === outcome);
  if (!os) return null;
  return (
    <div style={{ marginTop: 10, padding: "10px 14px", background: os.closed ? "#f0fdf4" : "#eff6ff", border: `1px solid ${os.closed ? "#bbf7d0" : "#bfdbfe"}`, borderRadius: 8, fontSize: 12, color: os.closed ? "#166534" : "#1e40af" }}>
      {os.closed ? "✓ Account closed — no follow-up required." :
       os.pending ? "⏳ Pending CFO write-off approval — no follow-up set." :
       `📅 Next follow-up: ${addBusinessDays(os.followUpDays)} (${os.followUpDays} business day${os.followUpDays === 1 ? "" : "s"})`}
    </div>
  );
}

const SAMPLE_NOTES = {
  "AR-003": [
    { date:"2026-04-10", user:"M.Williams", outcome:"no_response", text:"called. no answer." }
  ],
  "AR-004": [
    { date:"2026-01-22", user:"J.Smith", outcome:"left_voicemail", text:"payer confirmed receipt. ref #15050980057." },
    { date:"2026-01-22", user:"T.Jones", outcome:"resubmitted", text:"called. rep said claim processing. ref #63882387328." },
    { date:"2026-04-02", user:"R.Garcia", outcome:"no_response", text:"resubmitted with modifier." },
    { date:"2026-04-09", user:"R.Garcia", outcome:"resubmitted", text:"called. rep said claim processing. ref #12651673637." },
    { date:"2026-04-11", user:"J.Smith", outcome:"appeal_filed", text:"escalated to clinical denials." }
  ],
  "AR-008": [
    { date:"2026-05-01", user:"T.Jones", outcome:"escalated", text:"called. rep said claim processing. ref #99565452851." }
  ],
  "AR-013": [
    { date:"2026-04-22", user:"S.Chen", outcome:"escalated", text:"appeal filed. waiting response." }
  ],
  "AR-014": [
    { date:"2026-05-09", user:"R.Garcia", outcome:"in_adjudication", text:"called. left vm." }
  ],
  "AR-015": [
    { date:"2026-03-12", user:"S.Chen", outcome:"needs_documentation", text:"called. denied CO-22. need to appeal." },
    { date:"2026-03-29", user:"T.Jones", outcome:"no_response", text:"resubmitted with modifier." }
  ],
  "AR-016": [
    { date:"2026-04-25", user:"R.Garcia", outcome:"escalated", text:"called. no answer." }
  ],
  "AR-019": [
    { date:"2026-01-02", user:"J.Smith", outcome:"appeal_filed", text:"called. no answer." },
    { date:"2026-01-04", user:"T.Jones", outcome:"in_adjudication", text:"appeal filed. waiting response." },
    { date:"2026-02-17", user:"R.Garcia", outcome:"appeal_filed", text:"called. no answer." },
    { date:"2026-02-26", user:"T.Jones", outcome:"promised_payment", text:"called. in adjudication. est 30 days." },
    { date:"2026-04-13", user:"J.Smith", outcome:"left_voicemail", text:"called. in adjudication. est 30 days." }
  ],
  "AR-020": [
    { date:"2026-03-05", user:"R.Garcia", outcome:"needs_documentation", text:"called. rep said claim processing. ref #24130881830." },
    { date:"2026-03-26", user:"J.Smith", outcome:"escalated", text:"called. no answer." },
    { date:"2026-04-03", user:"R.Garcia", outcome:"escalated", text:"called. payer requested EOB." },
    { date:"2026-05-06", user:"S.Chen", outcome:"resubmitted", text:"called. no answer." }
  ],
  "AR-022": [
    { date:"2026-04-13", user:"J.Smith", outcome:"left_voicemail", text:"called. in adjudication. est 30 days." },
    { date:"2026-05-12", user:"M.Williams", outcome:"left_voicemail", text:"called. denied CO-50. need to appeal." }
  ],
  "AR-023": [
    { date:"2026-04-13", user:"T.Jones", outcome:"no_response", text:"called. in adjudication. est 30 days." }
  ],
  "AR-027": [
    { date:"2026-05-09", user:"M.Williams", outcome:"needs_documentation", text:"called. payer requested EOB." }
  ],
  "AR-028": [
    { date:"2026-05-15", user:"R.Garcia", outcome:"appeal_filed", text:"called. payer requested EOB." }
  ],
  "AR-030": [
    { date:"2026-03-31", user:"M.Williams", outcome:"appeal_filed", text:"called. payer requested EOB." }
  ],
  "AR-032": [
    { date:"2026-04-14", user:"T.Jones", outcome:"no_response", text:"resubmitted with modifier." }
  ],
  "AR-033": [
    { date:"2026-03-27", user:"S.Chen", outcome:"left_voicemail", text:"appeal filed. waiting response." },
    { date:"2026-04-11", user:"R.Garcia", outcome:"no_response", text:"called. rep said claim processing. ref #35762567738." },
    { date:"2026-04-18", user:"M.Williams", outcome:"in_adjudication", text:"called. no answer." },
    { date:"2026-05-10", user:"T.Jones", outcome:"needs_documentation", text:"called. no answer." },
    { date:"2026-05-10", user:"T.Jones", outcome:"appeal_filed", text:"called. left vm." }
  ],
  "AR-037": [
    { date:"2026-04-27", user:"R.Garcia", outcome:"no_response", text:"payer confirmed receipt. ref #52951114166." },
    { date:"2026-05-05", user:"T.Jones", outcome:"escalated", text:"called. no answer." },
    { date:"2026-05-14", user:"R.Garcia", outcome:"no_response", text:"appeal filed. waiting response." }
  ],
  "AR-041": [
    { date:"2026-04-29", user:"S.Chen", outcome:"resubmitted", text:"appeal filed. waiting response." },
    { date:"2026-05-13", user:"M.Williams", outcome:"in_adjudication", text:"called. no answer." }
  ],
  "AR-044": [
    { date:"2026-03-01", user:"S.Chen", outcome:"escalated", text:"called. denied CO-4. need to appeal." },
    { date:"2026-04-28", user:"R.Garcia", outcome:"resubmitted", text:"called. left vm." }
  ],
  "AR-045": [
    { date:"2026-01-01", user:"M.Williams", outcome:"needs_documentation", text:"escalated to clinical denials." },
    { date:"2026-01-05", user:"T.Jones", outcome:"needs_documentation", text:"escalated to clinical denials." },
    { date:"2026-01-13", user:"S.Chen", outcome:"left_voicemail", text:"called. left vm." },
    { date:"2026-02-06", user:"R.Garcia", outcome:"appeal_filed", text:"called. left vm." }
  ],
  "AR-048": [
    { date:"2026-03-23", user:"M.Williams", outcome:"left_voicemail", text:"payer confirmed receipt. ref #17800125827." }
  ],
  "AR-049": [
    { date:"2026-02-19", user:"S.Chen", outcome:"escalated", text:"appeal filed. waiting response." },
    { date:"2026-03-15", user:"S.Chen", outcome:"escalated", text:"called. left vm." },
    { date:"2026-03-15", user:"J.Smith", outcome:"escalated", text:"called. no answer." },
    { date:"2026-04-01", user:"M.Williams", outcome:"appeal_filed", text:"called. in adjudication. est 30 days." }
  ],
  "AR-050": [
    { date:"2026-03-17", user:"M.Williams", outcome:"in_adjudication", text:"called. rep said claim processing. ref #97966685715." },
    { date:"2026-04-04", user:"S.Chen", outcome:"needs_documentation", text:"payer confirmed receipt. ref #16945302598." },
    { date:"2026-04-25", user:"T.Jones", outcome:"promised_payment", text:"called. rep said claim processing. ref #10712606223." }
  ],
  "AR-051": [
    { date:"2026-04-24", user:"J.Smith", outcome:"appeal_filed", text:"called. denied CO-4. need to appeal." }
  ],
  "AR-052": [
    { date:"2026-04-12", user:"J.Smith", outcome:"in_adjudication", text:"resubmitted with modifier." },
    { date:"2026-05-08", user:"R.Garcia", outcome:"appeal_filed", text:"called. left vm." }
  ],
  "AR-054": [
    { date:"2026-03-17", user:"R.Garcia", outcome:"appeal_filed", text:"called. left vm." },
    { date:"2026-04-05", user:"T.Jones", outcome:"no_response", text:"called. no answer." },
    { date:"2026-04-30", user:"R.Garcia", outcome:"needs_documentation", text:"called. payer requested EOB." }
  ],
  "AR-058": [
    { date:"2026-02-27", user:"J.Smith", outcome:"promised_payment", text:"resubmitted with modifier." },
    { date:"2026-05-08", user:"J.Smith", outcome:"resubmitted", text:"called. rep said claim processing. ref #93906234916." }
  ],
  "AR-063": [
    { date:"2026-05-07", user:"R.Garcia", outcome:"in_adjudication", text:"called. rep said claim processing. ref #61484050918." }
  ],
  "AR-066": [
    { date:"2026-02-08", user:"T.Jones", outcome:"resubmitted", text:"called. rep said claim processing. ref #16522255494." }
  ],
  "AR-069": [
    { date:"2026-04-25", user:"M.Williams", outcome:"escalated", text:"called. left vm." }
  ],
  "AR-073": [
    { date:"2026-03-17", user:"J.Smith", outcome:"in_adjudication", text:"escalated to clinical denials." },
    { date:"2026-05-07", user:"T.Jones", outcome:"in_adjudication", text:"called. left vm." }
  ],
  "AR-080": [
    { date:"2026-02-02", user:"J.Smith", outcome:"escalated", text:"called. denied CO-4. need to appeal." },
    { date:"2026-02-09", user:"S.Chen", outcome:"appeal_filed", text:"called. denied CO-4. need to appeal." },
    { date:"2026-04-01", user:"J.Smith", outcome:"in_adjudication", text:"called. payer requested EOB." },
    { date:"2026-05-05", user:"M.Williams", outcome:"appeal_filed", text:"resubmitted with modifier." }
  ],
  "AR-082": [
    { date:"2026-05-06", user:"J.Smith", outcome:"no_response", text:"called. denied CO-50. need to appeal." }
  ],
  "AR-087": [
    { date:"2026-02-06", user:"J.Smith", outcome:"appeal_filed", text:"payer confirmed receipt. ref #77143918378." },
    { date:"2026-03-08", user:"M.Williams", outcome:"no_response", text:"called. payer requested EOB." },
    { date:"2026-03-24", user:"J.Smith", outcome:"resubmitted", text:"escalated to clinical denials." },
    { date:"2026-04-14", user:"M.Williams", outcome:"needs_documentation", text:"resubmitted with modifier." }
  ],
  "AR-089": [
    { date:"2026-02-19", user:"S.Chen", outcome:"needs_documentation", text:"called. rep said claim processing. ref #76880075328." }
  ],
  "AR-092": [
    { date:"2026-02-06", user:"T.Jones", outcome:"in_adjudication", text:"called. left vm." },
    { date:"2026-03-13", user:"T.Jones", outcome:"in_adjudication", text:"called. no answer." },
    { date:"2026-04-02", user:"M.Williams", outcome:"appeal_filed", text:"escalated to clinical denials." },
    { date:"2026-04-05", user:"R.Garcia", outcome:"left_voicemail", text:"called. no answer." }
  ]
};

function AccountSummary({ acc }) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);

  const generate = async () => {
    setLoading(true);
    setShown(true);
    const notes = SAMPLE_NOTES[acc.id] || [];
    const noteText = notes.length > 0
      ? notes.map(n => `${n.date} [${n.user}] ${n.outcome}: ${n.text}`).join("\n")
      : "No work notes logged on this account yet.";

    const prompt = `You are a healthcare revenue cycle expert. Write a concise account summary in 4-5 sentences covering: (1) what is preventing payment right now, (2) work history and contact attempts, (3) any approaching deadline, (4) the specific recommended next step. Be concrete — use dollar amounts, dates, payer names. Plain language only.

Account: ${acc.id} | ${acc.patient} | ${acc.payer} | $${acc.amount.toLocaleString()} | ${acc.daysOut || acc.daysInDNFB} days out | ${acc.cfg.label} | ${acc.prob}% probability
Action: ${acc.action.label} — ${acc.action.text}
Notes:\n${noteText}`;

    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 400, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      setSummary(data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "Summary unavailable.");
    } catch { setSummary("Summary temporarily unavailable."); }
    setLoading(false);
  };

  if (!shown) return (
    <button onClick={generate} style={{ marginBottom: 12, padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, color: "#475569", cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
      <span>📄</span> Summarize account history
    </button>
  );

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "13px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase" }}>📄 Account summary</div>
        <button onClick={() => { setShown(false); setSummary(""); }} style={{ fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>Dismiss</button>
      </div>
      {loading ? <div style={{ fontSize: 12, color: "#94a3b8" }}>Generating summary...</div>
        : <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.75 }}>{summary}</div>}
    </div>
  );
}


function ScratchNoteGenerator({ acc, outcome, onNoteReady }) {
  const [scratch, setScratch] = useState("");
  const [generated, setGenerated] = useState("");
  const [edited, setEdited] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [skipped, setSkipped] = useState(false);

  if (!outcome) return null;

  const os = OUTCOME_STATUSES.find(o => o.value === outcome);
  const followUpText = os?.closed ? "Account closed — no follow-up required." 
    : os?.pending ? "Pending CFO write-off approval." 
    : `Follow-up in ${os?.followUpDays} business day${os?.followUpDays === 1 ? "" : "s"}.`;

  const generate = async () => {
    if (!scratch.trim()) return;
    setLoading(true);
    const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
    const verticalCtx = CLIENT_CONFIG.verticalContext[CLIENT_CONFIG.vertical] || "";
    const prompt = `You are a healthcare revenue cycle documentation specialist. Convert the following scratch notes into a single professional work note for posting to an EHR account record.${verticalCtx ? " " + verticalCtx : ""}

Account: ${acc.id} | ${acc.patient} | ${acc.payer}
Balance: $${acc.amount.toLocaleString()} | ${acc.daysOut || acc.daysInDNFB} days outstanding
Issue: ${acc.cfg.label} | Area: ${acc.area}
Outcome logged: ${os?.label}
${followUpText}

Scratch notes: "${scratch}"

Requirements:
- Start with today's date: ${today}
- Include account ID, patient/entity, and payer name
- Describe the action taken based on the scratch notes
- Include any reference numbers or payer contact information mentioned
- State the outcome and next follow-up date
- 3-5 sentences maximum
- Professional clinical billing language — no bullet points
- Do not add information not present in the scratch notes or account context`;

    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 300, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const note = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      setGenerated(note);
      setEdited(note);
    } catch {
      setGenerated("Note generation unavailable. Please write manually.");
      setEdited("Note generation unavailable. Please write manually.");
    }
    setLoading(false);
  };

  const confirm = () => {
    setConfirmed(true);
    onNoteReady(edited);
  };

  const reset = () => {
    setConfirmed(false);
    setGenerated("");
    setEdited("");
    onNoteReady(null);
  };

  const skip = () => {
    setSkipped(true);
    onNoteReady("__SKIPPED__");
  };

  if (skipped) return (
    <div style={{ marginTop: 10, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#94a3b8" }}>No work note — skipped</span>
      <button onClick={() => { setSkipped(false); onNoteReady(null); }} style={{ fontSize: 10, color: "#64748b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Add note</button>
    </div>
  );

  if (confirmed) return (
    <div style={{ marginTop: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#16a34a", marginBottom: 5 }}>✓ Work note confirmed — queued for EHR</div>
      <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.65 }}>{edited}</div>
      <button onClick={reset} style={{ marginTop: 6, fontSize: 10, color: "#64748b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Edit</button>
    </div>
  );

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase" }}>Work note</div>
        <button onClick={skip} style={{ fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Skip</button>
      </div>

      {/* Scratch note input */}
      <textarea
        value={scratch}
        onChange={e => { setScratch(e.target.value); if (generated) { setGenerated(""); setEdited(""); } }}
        placeholder="Enter scratch notes — e.g. called. denied prior auth. ref #44243993444. sent to clinical denials."
        style={{
          width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 12,
          border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#334155",
          fontFamily: "inherit", resize: "vertical", minHeight: 68, outline: "none", lineHeight: 1.6,
          marginBottom: 8,
        }}
      />

      {scratch.trim() && !generated && (
        <button onClick={generate} disabled={loading} style={{
          padding: "7px 14px", background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 6, color: "#2563eb", cursor: loading ? "not-allowed" : "pointer",
          fontSize: 11, fontWeight: 600, fontFamily: "inherit", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {loading ? "Generating..." : "✦ Generate work note"}
        </button>
      )}

      {/* Generated note for review */}
      {generated && (
        <>
          <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.06em", marginBottom: 5 }}>Review and edit before confirming:</div>
          <textarea
            value={edited}
            onChange={e => setEdited(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 12,
              border: "1px solid #bfdbfe", borderRadius: 8, background: "#f8fbff", color: "#1e3a5f",
              fontFamily: "inherit", resize: "vertical", minHeight: 96, outline: "none", lineHeight: 1.75,
              marginBottom: 8,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={confirm} style={{
              padding: "8px 16px", flex: 1, background: "#16a34a", border: "none",
              borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 12,
              fontWeight: 600, fontFamily: "inherit",
            }}>✓ Confirm note</button>
            <button onClick={() => { setGenerated(""); setEdited(""); }} style={{
              padding: "8px 12px", background: "#fff", border: "1px solid #e2e8f0",
              borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit",
            }}>Regenerate</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Area Worklist ────────────────────────────────────────────────────────────

function AreaWorklist({ area, dnfbScored, worklinks, onResolve, onReturn, onWorkLink }) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const [activeTab, setActiveTab] = useState("asap");
  const [worked, setWorked] = useState(new Set());
  const [resolving, setResolving] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [goals, setGoals] = useState({ ...DEFAULT_GOALS });
  const [wlAccount, setWlAccount] = useState(null);
  const [areaSiteFilter, setAreaSiteFilter] = useState(null);

  // Account buckets
  const openWorklinkAccountIds = new Set(
    worklinks.filter(w => w.status === "open" && w.targetArea === area).map(w => w.accountId)
  );
  const allNative = dnfbScored.filter(a => a.area === area && !worked.has(a.id) && !openWorklinkAccountIds.has(a.id) && (!areaSiteFilter || a.site === areaSiteFilter));
  const monitor   = allNative.filter(a => a.daysInDNFB <= 3).sort((a,b) => b.expectedValue - a.expectedValue);
  const workAsap  = allNative.filter(a => a.daysInDNFB > 3).sort((a,b) => b.daysInDNFB - a.daysInDNFB || b.expectedValue - a.expectedValue);
  const wlOpen    = worklinks.filter(w => w.targetArea === area && w.status === "open")
    .sort((a,b) => {
      // Service-date urgent items first, then by SLA deadline
      const aUrgent = a.isServiceDateSLA && a.slaHrs < 4 ? 0 : 1;
      const bUrgent = b.isServiceDateSLA && b.slaHrs < 4 ? 0 : 1;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;
      return new Date(a.slaDue) - new Date(b.slaDue);
    });

  // Variance calculations
  const asapEV = workAsap.reduce((s,a) => s+a.expectedValue, 0);
  const asapCountVariance = goals.workAsapMaxCount !== null ? workAsap.length - goals.workAsapMaxCount : null;
  const asapEVVariance = goals.workAsapMaxEV !== null ? asapEV - goals.workAsapMaxEV : null;

  const wlTotal = worklinks.filter(w => w.targetArea === area).length;
  const wlResolved = worklinks.filter(w => w.targetArea === area && w.status !== "open").length;
  const wlBreached = wlOpen.filter(w => new Date() > w.slaDue).length;
  const slaRate = wlTotal > 0 ? Math.round((wlResolved / wlTotal) * 100) : 100;
  const slaVariance = slaRate - goals.worklinkSLATarget;
  const openVariance = wlOpen.length - goals.worklinkMaxOpen;

  const varColor = (v, higher = false) => {
    if (v === null) return "#94a3b8";
    const bad = higher ? v > 0 : v < 0;
    const warn = higher ? v > -0.1 * Math.abs(goals.worklinkSLATarget) : v > 0;
    if (!bad && !warn) return "#16a34a";
    if (warn && !bad) return "#d97706";
    return "#dc2626";
  };

  const slaColor = (w) => new Date() > w.slaDue ? "#dc2626" : (new Date(w.slaDue) - Date.now()) < 3600000 ? "#d97706" : "#16a34a";
  const slaRemaining = (w) => {
    const ms = new Date(w.slaDue) - Date.now();
    if (ms < 0) return "SLA breached";
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const tabStyle = (t) => ({
    padding: "10px 16px", cursor: "pointer", fontSize: 12, fontWeight: activeTab === t ? 600 : 400,
    border: "none", borderBottom: activeTab === t ? "2px solid #2563eb" : "2px solid transparent",
    background: "transparent", color: activeTab === t ? "#2563eb" : "#64748b", fontFamily: "inherit",
  });

  const NativeCard = ({ a }) => (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 8, padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 600, background: a.daysInDNFB > 3 ? "#fee2e2" : "#f1f5f9", color: a.daysInDNFB > 3 ? "#dc2626" : "#475569", border: `1px solid ${a.daysInDNFB > 3 ? "#fca5a5" : "#e2e8f0"}`, padding: "2px 8px", borderRadius: 4 }}>{a.holdCode}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: a.daysInDNFB > 3 ? "#dc2626" : "#64748b", background: a.daysInDNFB > 3 ? "#fee2e2" : "#f8fafc", padding: "2px 8px", borderRadius: 4, border: "1px solid transparent" }}>{a.daysInDNFB}d in DNFB</span>
            {DENIAL_RISK_MAP[a.holdCode] && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                background: DENIAL_RISK_MAP[a.holdCode].risk === "high" ? "#fee2e2" : "#fff7ed",
                color: DENIAL_RISK_MAP[a.holdCode].risk === "high" ? "#b91c1c" : "#c2410c",
                border: `1px solid ${DENIAL_RISK_MAP[a.holdCode].risk === "high" ? "#fca5a5" : "#fed7aa"}` }}>
                ⚠ {DENIAL_RISK_MAP[a.holdCode].risk === "high" ? "High" : "Medium"} denial risk · {DENIAL_RISK_MAP[a.holdCode].carc}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 2 }}>{a.patient}</div>
          <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
            {a.id} · {a.site} · {a.vertical} · {a.payer}{a.subPayer ? ` — ${a.subPayer}` : ""}
            {(PAYER_PORTALS[a.payer] || PAYER_PORTALS[a.subPayer]) && (
              <a href={PAYER_PORTALS[a.payer] || PAYER_PORTALS[a.subPayer] || "https://www.availity.com"} target="_blank" rel="noopener noreferrer"
                style={{ color: "#2563eb", fontSize: 10, textDecoration: "none" }} title="Open provider portal">↗</a>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Service: {a.serviceDate}</div>
          {a.scrubberEdit && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "3px 8px" }}>⚠ {a.scrubberEdit}</div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Expected value</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#2563eb" }}>{fmt(a.expectedValue)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(a.amount)} balance</div>
        </div>
      </div>
      {wlAccount === a.id
        ? <div style={{ marginTop: 10 }}><WorkLinkForm acc={a} defaultRequestType={WORKLINK_HOLD_MAP[a.holdCode]?.requestType} defaultTargetArea={WORKLINK_HOLD_MAP[a.holdCode]?.targetArea} autoGenerateNote={!!WORKLINK_HOLD_MAP[a.holdCode]} onSubmit={(wl) => { onWorkLink(wl); setWlAccount(null); }} onCancel={() => setWlAccount(null)} /></div>
        : (
          <div style={{ marginTop: 10 }}>
            {WORKLINK_HOLD_MAP[a.holdCode] && onWorkLink && WORKLINK_HOLD_MAP[a.holdCode].targetArea !== area && (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 6 }}>
                  ✦ AI WorkLink draft ready — {WORKLINK_HOLD_MAP[a.holdCode].requestIcon} {WORKLINK_HOLD_MAP[a.holdCode].requestLabel} → {WORKLINK_HOLD_MAP[a.holdCode].targetArea}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setWlAccount(a.id)}
                    style={{ flex: 1, padding: "6px 12px", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                    Review & Send
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => setWorked(prev => new Set([...prev, a.id]))}
                style={{ flex: 1, padding: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                Mark worked ✓
              </button>
              {onWorkLink && !WORKLINK_HOLD_MAP[a.holdCode] && (
                <button onClick={() => setWlAccount(a.id)}
                  style={{ background: "#fff", border: "1.5px solid #2563eb", borderRadius: 20, color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", padding: "6px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                  ⇄ Send WorkLink Request
                </button>
              )}
              {onWorkLink && WORKLINK_HOLD_MAP[a.holdCode] && WORKLINK_HOLD_MAP[a.holdCode].targetArea !== area && (
                <button onClick={() => setWlAccount(a.id)} style={{ background: "#fff", border: "1.5px solid #2563eb", borderRadius: 20, color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", padding: "6px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                  ⇄ Different WorkLink
                </button>
              )}
              {onWorkLink && (!WORKLINK_HOLD_MAP[a.holdCode] || WORKLINK_HOLD_MAP[a.holdCode].targetArea === area) && WORKLINK_HOLD_MAP[a.holdCode]?.targetArea === area && (
                <button onClick={() => setWlAccount(a.id)}
                  style={{ background: "#fff", border: "1.5px solid #2563eb", borderRadius: 20, color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", padding: "6px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                  ⇄ Send WorkLink Request
                </button>
              )}
            </div>
          </div>
        )
      }
    </div>
  );

  const WorkLinkCard = ({ w }) => (
    <div style={{ background: w.isServiceDateSLA && w.slaHrs < 4 ? "#fff1f2" : "#f0f9ff", border: `1px solid ${w.isServiceDateSLA && w.slaHrs < 4 ? "#fca5a5" : new Date() > w.slaDue ? "#fca5a5" : "#bae6fd"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
      {w.isServiceDateSLA && w.slaHrs < 4 && (
        <div style={{ background: "#dc2626", color: "#fff", padding: "5px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
          🚨 SERVICE DATE URGENT — Patient service {w.serviceDate} · Deadline in {w.slaHrs === 0 ? "&lt;1hr" : `${w.slaHrs}hr`}
        </div>
      )}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid #e0f2fe", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, background: "#0369a1", color: "#fff", padding: "2px 8px", borderRadius: 4 }}>⇄ WORKLINK</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0369a1" }}>{w.requestIcon} {w.requestLabel}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: slaColor(w), background: slaColor(w) + "14", padding: "2px 8px", borderRadius: 4 }}>⏱ {slaRemaining(w)}{w.isServiceDateSLA ? " (service date)" : ""}</span>
            {w.serviceDate && !w.isServiceDateSLA && <span style={{ fontSize: 10, color: "#64748b" }}>Service: {w.serviceDate}</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 2 }}>{w.patient}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{w.accountId} · {w.payer} · {w.vertical}</div>
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6, marginTop: 8, padding: "8px 12px", background: "#fff", borderRadius: 6, border: "1px solid #e0f2fe" }}>{w.note}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Expected value</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#2563eb" }}>{fmt(w.expectedValue)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(w.amount)} balance</div>
        </div>
      </div>
      <div style={{ padding: "10px 18px" }}>
        {resolving === w.id ? (
          <>
            <textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} placeholder="What action did you take? (required)" rows={2}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#0f172a", fontFamily: "inherit", resize: "none", outline: "none", marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { if (resolutionNote.trim()) { onResolve(w.id, resolutionNote); setResolving(null); setResolutionNote(""); } }}
                disabled={!resolutionNote.trim()}
                style={{ flex: 1, padding: "8px", background: resolutionNote.trim() ? "#16a34a" : "#f1f5f9", border: "none", borderRadius: 8, color: resolutionNote.trim() ? "#fff" : "#94a3b8", cursor: resolutionNote.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>✓ Mark resolved</button>
              <button onClick={() => { setResolving(null); setResolutionNote(""); }} style={{ padding: "8px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
            </div>
          </>
        ) : resolving === `return-${w.id}` ? (
          <>
            <input value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} placeholder="Reason for returning (required)..." 
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#0f172a", fontFamily: "inherit", outline: "none", marginBottom: 8 }} />
            <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Redirect to different area? (optional)</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {RC_AREA_ORDER.filter(a => a !== area).map(a => (
                <button key={a} onClick={() => { onReturn(w.id, resolutionNote, a); setResolving(null); setResolutionNote(""); }}
                  style={{ padding: "4px 10px", fontSize: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#475569", cursor: "pointer", fontFamily: "inherit" }}>{a}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { if (resolutionNote) { onReturn(w.id, resolutionNote, null); setResolving(null); setResolutionNote(""); } }}
                disabled={!resolutionNote}
                style={{ flex: 1, padding: "8px", background: resolutionNote ? "#64748b" : "#f1f5f9", border: "none", borderRadius: 8, color: resolutionNote ? "#fff" : "#94a3b8", cursor: resolutionNote ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Return to sender</button>
              <button onClick={() => { setResolving(null); setResolutionNote(""); }} style={{ padding: "8px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setResolving(w.id)} style={{ flex: 1, padding: "8px", background: "#0369a1", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Resolve</button>
            <button onClick={() => { setResolving(`return-${w.id}`); setResolutionNote(""); }} style={{ padding: "8px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Return</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? "16px 12px 80px" : "24px 32px" }}>

      {/* Site filter — area specialist assignment */}
      {(() => {
        const sites = [...new Set(dnfbScored.filter(a => a.area === area).map(a => a.site))].sort((a,b) => parseInt(a.replace(/\D/g,"")) - parseInt(b.replace(/\D/g,"")));
        if (sites.length <= 1) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>My sites:</span>
            <button onClick={() => setAreaSiteFilter(null)}
              style={{ padding: "3px 10px", fontSize: 11, fontWeight: !areaSiteFilter ? 600 : 400, border: `1px solid ${!areaSiteFilter ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: !areaSiteFilter ? "#2563eb" : "#fff", color: !areaSiteFilter ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
              All
            </button>
            {sites.map(s => (
              <button key={s} onClick={() => setAreaSiteFilter(areaSiteFilter === s ? null : s)}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: areaSiteFilter === s ? 600 : 400, border: `1px solid ${areaSiteFilter === s ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: areaSiteFilter === s ? "#2563eb" : "#fff", color: areaSiteFilter === s ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
                {s}
              </button>
            ))}
            {areaSiteFilter && <span style={{ fontSize: 10, color: "#2563eb", marginLeft: 4 }}>— your assigned accounts</span>}
          </div>
        );
      })()}

      {/* Settings panel */}
      {showSettings && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>⚙ Goals — {area}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12 }}>
            {[
              { label: "Work ASAP max accounts", key: "workAsapMaxCount", type: "number" },
              { label: "Work ASAP max age (days)", key: "workAsapMaxAgeDays", type: "number" },
              { label: "Work ASAP max EV ($)", key: "workAsapMaxEV", type: "number" },
              { label: "WorkLink SLA target (%)", key: "worklinkSLATarget", type: "number" },
              { label: "WorkLink max open requests", key: "worklinkMaxOpen", type: "number" },
              { label: "WorkLink avg resolution (hrs)", key: "worklinkAvgResolutionHrs", type: "number" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{f.label}</div>
                <input type={f.type} value={goals[f.key] ?? ""} onChange={e => setGoals(g => ({ ...g, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc", color: "#0f172a", fontFamily: "inherit", outline: "none" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setShowSettings(false)} style={{ padding: "8px 16px", background: "#0f172a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Save goals</button>
            <button onClick={() => { setGoals({ ...DEFAULT_GOALS }); }} style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Reset to defaults</button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Monitor (0–3d)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{monitor.length}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{fmt(monitor.reduce((s,a) => s+a.expectedValue, 0))} EV</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${asapCountVariance > 0 ? "#fca5a5" : "#e2e8f0"}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Work ASAP (3+d)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: workAsap.length > 0 ? "#dc2626" : "#16a34a" }}>{workAsap.length}</div>
          <div style={{ fontSize: 11, marginTop: 3 }}>
            {asapCountVariance !== null && asapCountVariance > 0
              ? <span style={{ color: "#dc2626", fontWeight: 600 }}>+{asapCountVariance} over goal · {fmt(asapEV)} EV at risk</span>
              : <span style={{ color: "#16a34a" }}>Within goal · {fmt(asapEV)} EV</span>}
          </div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${wlBreached > 0 ? "#fca5a5" : "#e2e8f0"}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>WorkLink open</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: openVariance > 0 ? "#dc2626" : wlOpen.length > 0 ? "#0369a1" : "#16a34a" }}>{wlOpen.length}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{wlBreached > 0 ? <span style={{ color: "#dc2626", fontWeight: 600 }}>{wlBreached} SLA breached</span> : "all within SLA"}</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${slaVariance < 0 ? "#fca5a5" : "#e2e8f0"}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>SLA compliance</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: slaVariance >= 0 ? "#16a34a" : slaVariance >= -10 ? "#d97706" : "#dc2626" }}>{slaRate}%</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>goal: {goals.worklinkSLATarget}% · {slaVariance >= 0 ? "✓" : slaVariance.toFixed(0) + "pp below"}</div>
        </div>
      </div>

      {/* Tab bar + settings gear */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", marginBottom: 16 }}>
        <div style={{ display: "flex" }}>
          <button style={tabStyle("monitor")} onClick={() => setActiveTab("monitor")}>
            Monitor <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 600, marginLeft: 4 }}>{monitor.length}</span>
          </button>
          <button style={tabStyle("asap")} onClick={() => setActiveTab("asap")}>
            Work ASAP
            <span style={{ background: workAsap.length > 0 ? "#fee2e2" : "#f1f5f9", color: workAsap.length > 0 ? "#dc2626" : "#64748b", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 600, marginLeft: 4 }}>{workAsap.length}</span>
          </button>
          <button style={{ ...tabStyle("worklink"), color: activeTab === "worklink" ? "#0369a1" : "#64748b", borderBottomColor: activeTab === "worklink" ? "#0369a1" : "transparent" }} onClick={() => setActiveTab("worklink")}>
            WorkLink — SLA
            <span style={{ background: wlOpen.length > 0 ? "#e0f2fe" : "#f1f5f9", color: wlOpen.length > 0 ? "#0369a1" : "#64748b", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 600, marginLeft: 4 }}>{wlOpen.length}</span>
          </button>
        </div>
        <button onClick={() => setShowSettings(s => !s)} style={{ padding: "6px 12px", background: showSettings ? "#f1f5f9" : "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
          ⚙ Goals
        </button>
      </div>

      {/* Monitor tab */}
      {activeTab === "monitor" && (
        <>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>Accounts in normal hold window (0–3 days) · sorted by EV · {monitor.length} accounts · {fmt(monitor.reduce((s,a)=>s+a.expectedValue,0))} EV</div>
          {monitor.length === 0 ? (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#16a34a" }}>No accounts in monitor bucket</div>
            </div>
          ) : monitor.slice(0,100).map(a => <NativeCard key={a.id} a={a} />)}
        </>
      )}

      {/* Work ASAP tab */}
      {activeTab === "asap" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Beyond normal hold (3+ days) · sorted by age desc · {workAsap.length} accounts</div>
            {asapEVVariance > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>{fmt(asapEVVariance)} EV over goal</div>}
          </div>
          {workAsap.length === 0 ? (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#16a34a" }}>Queue clear — at goal</div>
              <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>
                No accounts beyond normal hold period.{worked.size > 0 ? ` ${worked.size} account${worked.size > 1 ? "s" : ""} worked this session.` : ""}
              </div>
            </div>
          ) : workAsap.slice(0,100).map(a => <NativeCard key={a.id} a={a} />)}
        </>
      )}

      {/* WorkLink — SLA tab */}
      {activeTab === "worklink" && (
        <>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>Sorted by SLA deadline · most urgent first · SLA goal: {goals.worklinkSLATarget}% compliance</div>
          {wlOpen.length === 0 ? (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#16a34a" }}>No open WorkLink requests</div>
            </div>
          ) : wlOpen.map(w => <WorkLinkCard key={w.id} w={w} />)}
        </>
      )}
    </div>
  );
}

// ─── WorkLink Reporting ───────────────────────────────────────────────────────

function WorkLinkReporting({ worklinks, isMobile }) {
  const [drillArea, setDrillArea] = useState(null);

  const open = worklinks.filter(w => w.status === "open");
  const resolved = worklinks.filter(w => w.status !== "open");

  // Group by target area
  const byArea = {};
  WORKLINK_TARGET_AREAS.forEach(area => {
    const areaOpen = open.filter(w => w.targetArea === area);
    const areaResolved = resolved.filter(w => w.targetArea === area);
    const totalEV = areaOpen.reduce((s,w) => s+w.expectedValue, 0);
    const breached = areaOpen.filter(w => new Date() > w.slaDue).length;
    const avgResolutionHrs = areaResolved.length
      ? Math.round(areaResolved.reduce((s,w) => s + (new Date(w.resolvedAt) - new Date(w.sentAt)) / 3600000, 0) / areaResolved.length)
      : null;
    byArea[area] = { open: areaOpen, resolved: areaResolved, totalEV, breached, avgResolutionHrs };
  });

  const activeAreas = RC_AREA_ORDER.filter(a => byArea[a] && (byArea[a].open.length > 0 || byArea[a].resolved.length > 0));

  const totalOpenEV = open.reduce((s,w) => s+w.expectedValue, 0);
  const totalBreached = open.filter(w => new Date() > w.slaDue).length;

  // Donut for EV by area
  const cx = 56, cy = 56, outerR = 46, innerR = 28;
  const areaColors2 = { "Coding":"#6d28d9","Physician/Doc":"#1d4ed8","Charge Capture":"#be185d","Credentialing":"#9f1239","Authorization":"#c2410c","Clinical/HIM":"#0369a1","Billing/Scrubber":"#0f766e" };
  const toXY2 = (r, deg) => { const rad = (deg-90)*Math.PI/180; return [+(cx+r*Math.cos(rad)).toFixed(3), +(cy+r*Math.sin(rad)).toFixed(3)]; };
  const arcPath2 = (s, e) => { const [ox1,oy1]=toXY2(outerR,s);const [ox2,oy2]=toXY2(outerR,e);const [ix2,iy2]=toXY2(innerR,e);const [ix1,iy1]=toXY2(innerR,s);const lg=(e-s)>180?1:0;return `M${ox1} ${oy1} A${outerR} ${outerR} 0 ${lg} 1 ${ox2} ${oy2} L${ix2} ${iy2} A${innerR} ${innerR} 0 ${lg} 0 ${ix1} ${iy1}Z`; };
  let angle2 = 0;
  const donutSegs = activeAreas.map(area => {
    const sweep = totalOpenEV > 0 ? (byArea[area].totalEV / totalOpenEV) * 359.99 : 0;
    const seg = { area, sweep, startDeg: angle2, endDeg: angle2 + sweep };
    angle2 += sweep;
    return seg;
  });

  if (open.length === 0 && resolved.length === 0) return (
    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "24px", textAlign: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>✓ No WorkLink activity this session</div>
    </div>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: "#0369a1", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>⇄ WIP WorkLink — by area</div>

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Open requests", value: open.length, color: "#0369a1" },
          { label: "Total EV at stake", value: fmt(totalOpenEV), color: "#2563eb" },
          { label: "SLA breached", value: totalBreached, color: totalBreached > 0 ? "#dc2626" : "#16a34a" },
          { label: "Resolved this session", value: resolved.length, color: "#16a34a" },
        ].map(m => (
          <div key={m.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Donut + area cards */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
        {totalOpenEV > 0 && (
          <div style={{ flexShrink: 0 }}>
            <svg width="112" height="112" viewBox="0 0 112 112">
              {donutSegs.map(s => s.sweep > 0 && (
                <path key={s.area} d={arcPath2(s.startDeg, s.endDeg)}
                  fill={drillArea === s.area ? areaColors2[s.area] : (drillArea ? areaColors2[s.area] + "40" : areaColors2[s.area])}
                  stroke="#fff" strokeWidth={1.5} style={{ cursor: "pointer" }}
                  onClick={() => setDrillArea(drillArea === s.area ? null : s.area)} />
              ))}
              <text x={cx} y={cy-5} textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="system-ui">EV</text>
              <text x={cx} y={cy+8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="system-ui">{fmtDonut(totalOpenEV)}</text>
            </svg>
          </div>
        )}

        {/* Area cards */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)", gap: 8 }}>
          {activeAreas.map(area => {
            const d = byArea[area];
            const isActive = drillArea === area;
            return (
              <div key={area} onClick={() => setDrillArea(isActive ? null : area)}
                style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${isActive ? (areaColors2[area] || "#0369a1") : "#e2e8f0"}`, background: isActive ? (areaColors2[area] || "#0369a1") + "08" : "#f8fafc", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: areaColors2[area] || "#64748b" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{area}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>{fmt(d.totalEV)}</span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#94a3b8" }}>
                  <span>{d.open.length} open</span>
                  {d.breached > 0 && <span style={{ color: "#dc2626", fontWeight: 600 }}>⚠ {d.breached} breached</span>}
                  {d.avgResolutionHrs !== null && <span>avg {d.avgResolutionHrs}h to resolve</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drill-down */}
      {drillArea && byArea[drillArea].open.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
          <div style={{ fontSize: 10, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 10 }}>{drillArea} — open requests ({byArea[drillArea].open.length})</div>
          {byArea[drillArea].open.sort((a,b) => b.expectedValue - a.expectedValue).map(w => (
            <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{w.patient}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{w.accountId} · {w.requestIcon} {w.requestLabel} · {w.payer}</div>
                <div style={{ fontSize: 10, color: new Date() > w.slaDue ? "#dc2626" : "#94a3b8", marginTop: 2 }}>
                  {new Date() > w.slaDue ? "⚠ SLA breached" : `⏱ ${Math.max(0, Math.floor((new Date(w.slaDue) - Date.now()) / 3600000))}h remaining`}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#2563eb" }}>{fmt(w.expectedValue)}</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>EV</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {drillArea && byArea[drillArea].open.length === 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #f1f5f9", paddingTop: 14, fontSize: 12, color: "#16a34a" }}>✓ No open requests in {drillArea}</div>
      )}
    </div>
  );
}

// ─── WIP WorkLink Components ──────────────────────────────────────────────────

function WorkLinkForm({ acc, onSubmit, onCancel, defaultRequestType, defaultTargetArea, autoGenerateNote }) {
  const [requestType, setRequestType] = useState(defaultRequestType || "");
  const [targetArea, setTargetArea] = useState(defaultTargetArea || "");
  const [scratch, setScratch] = useState("");
  const [noteReady, setNoteReady] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState("form");
  const [serviceDate, setServiceDate] = useState(""); // optional service date for SLA override // form | review | done

  const selectedType = WORKLINK_REQUEST_TYPES.find(r => r.value === requestType);

  // Auto-generate note on mount if autoGenerateNote is true and defaults are set
  useEffect(() => {
    if (autoGenerateNote && defaultRequestType && defaultTargetArea) {
      generateNote(defaultRequestType, defaultTargetArea);
    }
  }, []);

  const handleTypeSelect = (type) => {
    setRequestType(type.value);
    if (type.targetArea) setTargetArea(type.targetArea);
  };

  const generateNote = async (rtOverride, taOverride) => {
    const rt = WORKLINK_REQUEST_TYPES.find(r => r.value === (rtOverride || requestType));
    const ta = taOverride || targetArea;
    setGenerating(true);
    const verticalCtx = CLIENT_CONFIG.verticalContext[CLIENT_CONFIG.vertical] || "";
    const prompt = `You are a healthcare revenue cycle specialist creating a structured internal work request.${verticalCtx ? " " + verticalCtx : ""} Generate a concise, professional work request note in 2-3 sentences. Account: ${acc.id} · ${acc.patient} · ${acc.payer} · Balance: ${fmt(acc.amount)} · EV: ${fmt(acc.expectedValue)} · Hold: ${acc.cfg?.label || acc.area || ""}. Request type: ${rt?.label || "WorkLink"}. Target area: ${ta}. ${scratch ? `Sender notes: "${scratch}".` : ""} Write as a direct communication to the ${ta} team. Be specific about what action is needed and why it is urgent. Return only the note text, no preamble.`;
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 200, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      setNoteReady(text.trim());
      setStep("review");
    } catch {
      setNoteReady(`${selectedType?.label} needed for ${acc.patient} (${acc.id}). Balance ${fmt(acc.amount)}, EV ${fmt(acc.expectedValue)}. ${scratch || "Please review and take action."}`);
      setStep("review");
    }
    setGenerating(false);
  };

  const handleSubmit = () => {
    const sla = getWorklinkSLA(acc.cfg?.severity || "MODERATE", requestType, serviceDate || null);
    onSubmit({
      id: `WL-${Date.now()}`,
      accountId: acc.id,
      patient: acc.patient,
      payer: acc.payer,
      site: acc.site,
      vertical: acc.vertical,
      amount: acc.amount,
      expectedValue: acc.expectedValue,
      severity: acc.cfg?.severity || "MODERATE",
      holdLabel: acc.cfg?.label || acc.area,
      requestType,
      requestLabel: selectedType?.label,
      requestIcon: selectedType?.icon,
      targetArea,
      scratch,
      note: noteReady,
      serviceDate: serviceDate || null,
      isServiceDateSLA: sla.isServiceDateSLA,
      sentAt: new Date(),
      slaHrs: sla.hrs,
      slaDue: sla.due,
      slaLabel: sla.label,
      status: "open",
      resolvedAt: null,
      resolutionNote: null,
    });
  };

  if (step === "review") {
    const sla = getWorklinkSLA(acc.cfg?.severity || "MODERATE", requestType, serviceDate || null);
    const isUrgent = sla.isServiceDateSLA && sla.hrs < 4;
    return (
    <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "16px 18px", marginTop: 12 }}>
      <div style={{ fontSize: 10, color: "#0369a1", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Review WorkLink request before sending</div>
      {isUrgent && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>
          🚨 SERVICE DATE URGENT — SLA deadline in {sla.hrs === 0 ? "less than 1 hour" : `${sla.hrs} hours`}. This request will be promoted to top of {targetArea} queue.
        </div>
      )}
      {sla.isServiceDateSLA && !isUrgent && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: "#c2410c" }}>
          ⏰ Service date SLA active — deadline {sla.label} based on patient service date, not request type.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Request type", value: `${selectedType?.icon} ${selectedType?.label}` },
          { label: "Target area", value: targetArea },
          { label: "Account", value: acc.id },
          { label: "EV", value: fmt(acc.expectedValue) },
          { label: "SLA", value: `${sla.label}${sla.isServiceDateSLA ? " (service date)" : ""}` },
          { label: "Priority", value: acc.cfg?.severity || "MODERATE" },
        ].map(f => (
          <div key={f.label} style={{ background: "#fff", borderRadius: 6, padding: "8px 10px", border: "1px solid #e0f2fe" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{f.label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{f.value}</div>
          </div>
        ))}
      </div>
      {/* Optional service date for SLA override */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Patient service date (optional) — tightens SLA if sooner than default</div>
        <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)}
          style={{ padding: "6px 10px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6, fontFamily: "inherit", color: "#334155", outline: "none" }} />
        {serviceDate && <span style={{ fontSize: 11, color: "#c2410c", marginLeft: 8 }}>SLA: {getWorklinkSLA(acc.cfg?.severity || "MODERATE", requestType, serviceDate).label}</span>}
      </div>
      <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 }}>✦ AI-generated note — review before sending</div>
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{noteReady}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} style={{ flex: 1, padding: "10px", background: isUrgent ? "#dc2626" : "#0369a1", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
          {isUrgent ? "🚨 Send URGENT to " : "Send to "}{targetArea} →
        </button>
        <button onClick={() => setStep("form")} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
          Edit
        </button>
        <button onClick={onCancel} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>
    </div>
    );
  }

  return (
    <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "16px 18px", marginTop: 12 }}>
      <div style={{ fontSize: 10, color: "#7c3aed", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
        ✦ WorkLink — Send request
      </div>

      {/* Step 1: Request type — one tap, auto-selects target area and triggers AI note */}
      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>What type of request?</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: 12 }}>
        {WORKLINK_REQUEST_TYPES.map(rt => (
          <button key={rt.value} onClick={() => { handleTypeSelect(rt); if (!noteReady && !generating) generateNote(rt.value, rt.targetArea || targetArea); }}
            style={{ padding: "8px 10px", background: requestType === rt.value ? "#7c3aed" : "#fff", border: `1px solid ${requestType === rt.value ? "#7c3aed" : "#e2e8f0"}`, borderRadius: 8, color: requestType === rt.value ? "#fff" : "#334155", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
            <span>{rt.icon}</span> {rt.label}
          </button>
        ))}
      </div>

      {/* Target area override — only when "Other" */}
      {requestType === "other" && (
        <>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Target area</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {WORKLINK_TARGET_AREAS.map(area => (
              <button key={area} onClick={() => setTargetArea(area)}
                style={{ padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${targetArea === area ? "#7c3aed" : "#e2e8f0"}`, borderRadius: 6, background: targetArea === area ? "#7c3aed" : "#fff", color: targetArea === area ? "#fff" : "#64748b", fontWeight: targetArea === area ? 600 : 400 }}>
                {area}
              </button>
            ))}
          </div>
        </>
      )}

      {/* AI-generated note — appears automatically after type selection */}
      {generating && (
        <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#7c3aed" }}>
          ✦ Generating note...
        </div>
      )}
      {noteReady && !generating && (
        <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 }}>✦ AI-generated note — edit if needed</div>
          <textarea value={noteReady} onChange={e => setNoteReady(e.target.value)} rows={3}
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 12, border: "1px solid #e9d5ff", borderRadius: 6, background: "#fff", color: "#334155", fontFamily: "inherit", resize: "vertical", outline: "none" }} />
        </div>
      )}

      {/* Step 2: Send — appears once type is selected */}
      {requestType && targetArea && (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { if (noteReady) { const sla = getWorklinkSLA(acc.cfg?.severity || "MODERATE", requestType); const rt = WORKLINK_REQUEST_TYPES.find(r => r.value === requestType); onSubmit({ id: `WL-${Date.now()}`, accountId: acc.id, patient: acc.patient, payer: acc.payer, vertical: acc.vertical, amount: acc.amount, expectedValue: acc.expectedValue, requestType, requestLabel: rt?.label, requestIcon: rt?.icon, targetArea, note: noteReady, status: "open", slaDue: sla.due, slaHrs: sla.hrs, slaSeverity: acc.cfg?.severity || "MODERATE", createdAt: new Date().toISOString() }); } }}
            disabled={!noteReady || generating}
            style={{ flex: 1, padding: "10px", background: !noteReady || generating ? "#f1f5f9" : "#7c3aed", border: "none", borderRadius: 8, color: !noteReady || generating ? "#94a3b8" : "#fff", cursor: !noteReady || generating ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
            Send to {targetArea} →
          </button>
          <button onClick={onCancel} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      )}
      {!requestType && (
        <button onClick={onCancel} style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
          Cancel
        </button>
      )}
    </div>
  );
}

function WorkLinkQueue({ worklinks, onResolve, onReturn }) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const [resolving, setResolving] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const open = worklinks.filter(w => w.status === "open").sort((a,b) => b.expectedValue - a.expectedValue);
  const resolved = worklinks.filter(w => w.status !== "open").sort((a,b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));

  const totalEV = open.reduce((s,w) => s+w.expectedValue, 0);
  const breached = open.filter(w => new Date() > w.slaDue);
  const avgAge = open.length ? Math.round(open.reduce((s,w) => s + (Date.now() - new Date(w.sentAt)) / 3600000, 0) / open.length) : 0;

  const slaColor = (w) => new Date() > w.slaDue ? "#dc2626" : (new Date(w.slaDue) - Date.now()) < 3600000 ? "#d97706" : "#16a34a";
  const slaRemaining = (w) => {
    const ms = new Date(w.slaDue) - Date.now();
    if (ms < 0) return "SLA breached";
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`;
  };

  return (
    <div style={{ padding: isMobile ? "16px 12px 80px" : "24px 32px" }}>
      {/* Header metrics */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Open requests", value: open.length, sub: "pending action", color: "#0369a1" },
          { label: "Total EV in queue", value: fmt(totalEV), sub: "expected recovery at stake", color: "#2563eb" },
          { label: "SLA breached", value: breached.length, sub: breached.length > 0 ? "needs immediate attention" : "all within SLA", color: breached.length > 0 ? "#dc2626" : "#16a34a" },
          { label: "Resolved this session", value: resolved.length, sub: `${fmt(resolved.reduce((s,w) => s+w.expectedValue,0))} EV released`, color: "#16a34a" },
        ].map(m => (
          <div key={m.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: m.color, letterSpacing: "-0.01em" }}>{m.value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Open queue */}
      {open.length === 0 ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "40px 24px", textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a" }}>WorkLink queue clear</div>
          <div style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>No open requests — all requests resolved.</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Open requests — sorted by expected value ({open.length})</div>
          {open.map(w => (
            <div key={w.id} style={{ background: "#fff", border: `1px solid ${new Date() > w.slaDue ? "#fca5a5" : "#e0f2fe"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              {/* Card header */}
              <div style={{ padding: "14px 18px", background: new Date() > w.slaDue ? "#fff7f7" : "#f0f9ff", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0369a1", background: "#e0f2fe", padding: "2px 8px", borderRadius: 4 }}>{w.requestIcon} {w.requestLabel}</span>
                    <span style={{ fontSize: 10, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 4 }}>{w.targetArea}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: slaColor(w), background: slaColor(w) + "14", padding: "2px 8px", borderRadius: 4 }}>⏱ {slaRemaining(w)}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 2 }}>{w.patient}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{w.accountId} · {w.payer} · {w.vertical} · {w.holdLabel}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>From collector · {w.sentAt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · SLA: {w.slaLabel}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Expected value</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#2563eb", letterSpacing: "-0.02em" }}>{fmt(w.expectedValue)}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(w.amount)} balance</div>
                </div>
              </div>
              {/* Note */}
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 9, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Request note</div>
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{w.note}</div>
              </div>
              {/* Actions */}
              <div style={{ padding: "12px 18px" }}>
                {resolving === w.id ? (
                  <>
                    <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Resolution note (optional)</div>
                    <textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} placeholder="What action did you take? Any follow-up needed?" rows={2}
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#0f172a", fontFamily: "inherit", resize: "none", outline: "none", marginBottom: 8 }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { onResolve(w.id, resolutionNote); setResolving(null); setResolutionNote(""); }}
                        style={{ flex: 1, padding: "9px", background: "#16a34a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                        ✓ Mark resolved
                      </button>
                      <button onClick={() => setResolving(null)} style={{ padding: "9px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setResolving(w.id)}
                      style={{ flex: 1, padding: "8px 14px", background: "#0f172a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                      Resolve
                    </button>
                    <button onClick={() => onReturn(w.id)}
                      style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                      Return to sender
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Resolved audit trail */}
      {resolved.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Resolved this session ({resolved.length})</div>
          {resolved.map(w => (
            <div key={w.id} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>✓ {w.status === "returned" ? "Returned" : "Resolved"}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{w.requestIcon} {w.requestLabel}</span>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>· {w.targetArea}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{w.patient} · {w.accountId}</div>
                {w.resolutionNote && <div style={{ fontSize: 11, color: "#475569", marginTop: 3, fontStyle: "italic" }}>{w.resolutionNote}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>{fmt(w.expectedValue)}</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>EV released</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkLinkSuppressedPanel({ suppressed }) {
  const [open, setOpen] = useState(false);
  if (suppressed.length === 0) return null;
  const totalEV = suppressed.reduce((s,w) => s+w.expectedValue, 0);
  return (
    <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, marginTop: 20, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "12px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, background: "#0369a1", color: "#fff", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>⇄ WORKLINK</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{suppressed.length} account{suppressed.length > 1 ? "s" : ""} suppressed pending resolution</span>
          <span style={{ fontSize: 12, color: "#0369a1", fontWeight: 600 }}>{fmt(totalEV)} EV</span>
        </div>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{open ? "▲ hide" : "▼ view all"}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #bae6fd", padding: "10px 18px" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 10 }}>These accounts are removed from your active queue until the WorkLink request is resolved by the receiving area.</div>
          {suppressed.map(w => (
            <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e0f2fe" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{w.patient}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{w.accountId} · {w.requestIcon} {w.requestLabel} → {w.targetArea}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Sent {w.sentAt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · SLA {w.slaLabel}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0369a1" }}>{fmt(w.expectedValue)}</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>EV</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollectorAccountCard({ acc, onLog, onWorkLink }) {
  const [approved, setApproved] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [overrideAction, setOverrideAction] = useState(null);
  const [showWorkLink, setShowWorkLink] = useState(false);
  const [worklinkSent, setWorklinkSent] = useState(false);
  const sev = SEV[acc.cfg.severity];

  const [noteReady, setNoteReady] = useState(null);

  const handleLog = () => {
    if (!outcome) return;
    const os = OUTCOME_STATUSES.find(o => o.value === outcome);
    onLog({
      id: acc.id, patient: acc.patient, amount: acc.amount,
      expectedValue: acc.expectedValue, outcome, outcomeLabel: os.label,
      followUpDate: os.closed ? "Closed" : os.pending ? "Pending CFO" : addBusinessDays(os.followUpDays),
      workNote: noteReady === "__SKIPPED__" ? null : noteReady,
      overrideAction: overrideAction,
      timestamp: new Date(),
    });
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      {/* Account header */}
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 600, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, padding: "2px 8px", borderRadius: 4 }}>{acc.cfg.severity}</span>
              <span style={{ fontSize: 10, fontWeight: 600, background: acc.cfg.color + "12", color: acc.cfg.color, border: `1px solid ${acc.cfg.color}30`, padding: "2px 8px", borderRadius: 4 }}>{acc.area === 'Collections' ? acc.cfg.label.split(' — ')[0].toUpperCase() : acc.area.toUpperCase()}</span>
            </div>
            {/* Patient name — heavy anchor */}
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 4, letterSpacing: "-0.01em" }}>{acc.patient}</div>
            {/* Account metadata — lighter, smaller */}
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{acc.id} · {acc.site} · {acc.vertical}</div>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
              {acc.payer}{acc.subPayer ? <span style={{ color: "#94a3b8", fontWeight: 400 }}> — {acc.subPayer}</span> : ""}
              {(PAYER_PORTALS[acc.payer] || PAYER_PORTALS[acc.subPayer]) && (
                <a href={PAYER_PORTALS[acc.payer] || PAYER_PORTALS[acc.subPayer] || "https://www.availity.com"} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#2563eb", fontSize: 10, marginLeft: 2, textDecoration: "none" }} title="Open provider portal">↗</a>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{acc.cfg.label}</div>
            {/* Claim status */}
            {acc.claimStatus && (
              <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                  background: acc.claimStatus === "Adjudicated — Paid" ? "#f0fdf4" : acc.claimStatus === "Adjudicated — Denied" || acc.claimStatus === "Rejected by Clearinghouse" ? "#fee2e2" : acc.claimStatus === "At Payer" ? "#fffbeb" : "#f1f5f9",
                  color: acc.claimStatus === "Adjudicated — Paid" ? "#16a34a" : acc.claimStatus === "Adjudicated — Denied" || acc.claimStatus === "Rejected by Clearinghouse" ? "#dc2626" : acc.claimStatus === "At Payer" ? "#d97706" : "#64748b",
                  border: `1px solid ${acc.claimStatus === "Adjudicated — Paid" ? "#bbf7d0" : acc.claimStatus === "Adjudicated — Denied" || acc.claimStatus === "Rejected by Clearinghouse" ? "#fca5a5" : acc.claimStatus === "At Payer" ? "#fed7aa" : "#e2e8f0"}`
                }}>
                  {acc.claimStatus}
                </span>
              </div>
            )}
            {/* Scrubber edit code */}
            {acc.scrubberEdit && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 8px" }}>
                ⚠ {acc.scrubberEdit}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            <ProbCircle prob={acc.prob} payer={acc.payer} />
            <div style={{ textAlign: "right" }}>
              {/* EV — dominant visual element */}
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>Expected value</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "#2563eb", letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(acc.expectedValue)}</div>
              {/* Balance and days — muted reference info */}
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{fmt(acc.amount)} balance · {acc.daysOut}d out</div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Summary */}
      <div style={{ padding: "12px 22px 0" }}><AccountSummary acc={acc} /></div>

      {/* Action */}
      <div style={{ padding: "16px 22px", background: "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
        {!overriding ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 15 }}>{acc.action.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: acc.action.color, textTransform: "uppercase" }}>{acc.action.label}</span>
              <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 2 }}>— AI recommended</span>
            </div>
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.65, marginBottom: 14 }}>{acc.action.text}</div>
            {!approved && (
              <>
                <button onClick={() => setApproved(true)} style={{ width: "100%", padding: "9px 20px", background: "#2563eb", border: "1px solid #2563eb", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", marginBottom: 8 }}>
                  Approve action
                </button>
                <button onClick={() => setOverriding(true)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
                  ↺ Override recommended action
                </button>
              </>
            )}
            {approved && (
              <div style={{ padding: "9px 20px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, color: "#16a34a", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                ✓ Action approved
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 10 }}>Select action taken</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
              {[
                { icon: "📞", label: "Outbound call", value: "call" },
                { icon: "📋", label: "Appeal submission", value: "appeal" },
                { icon: "⚡", label: "Internal escalation", value: "escalation" },
                { icon: "📝", label: "Physician query", value: "query" },
                { icon: "✕", label: "Write-off recommendation", value: "writeoff" },
              ].map(at => (
                <button key={at.value} onClick={() => { setOverrideAction(at.label); setApproved(true); setOverriding(false); }} style={{ padding: "8px 10px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#334155", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{at.icon}</span> {at.label}
                </button>
              ))}
            </div>
            <button onClick={() => setOverriding(false)} style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Cancel — go back</button>
          </>
        )}
      </div>

      {/* Agentic WorkLink — auto-draft when action maps to a cross-area request */}
      {(() => {
        const actionKey = acc.action.value;
        const isCall = actionKey === "call" || actionKey === "outbound_call";
        const draft = WORKLINK_ACTION_MAP[actionKey];
        // Suppress draft if account area already matches the draft's target area
        const draftActive = draft && draft.targetArea !== acc.area;

        if (worklinkSent) return (
          <div style={{ margin: "10px 22px 0", padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#0369a1", fontWeight: 600 }}>⇄ WorkLink sent — account suppressed from queue</span>
          </div>
        );

        return (
          <div style={{ padding: "10px 22px 0" }}>
            {draftActive && !showWorkLink && (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 6 }}>
                  ✦ AI WorkLink draft ready — {draftActive.requestIcon} {draftActive.requestLabel} → {draftActive.targetArea}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowWorkLink(true)}
                    style={{ flex: 1, padding: "7px 14px", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                    Review & Send
                  </button>
                  <button onClick={() => setShowWorkLink(false)}
                    style={{ padding: "7px 12px", background: "#fff", border: "1px solid #bfdbfe", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {!showWorkLink && (
              <button onClick={() => setShowWorkLink(true)}
                style={{ background: "#fff", border: "1.5px solid #2563eb", borderRadius: 20, color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", padding: "6px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                ⇄ {draft ? "Send different WorkLink" : "Send WorkLink Request"}
              </button>
            )}
            {showWorkLink && (
              <WorkLinkForm acc={acc}
                defaultRequestType={draftActive?.requestType}
                defaultTargetArea={draftActive?.targetArea}
                autoGenerateNote={!!draftActive}
                onSubmit={(req) => { onWorkLink(req); setWorklinkSent(true); setShowWorkLink(false); }}
                onCancel={() => setShowWorkLink(false)} />
            )}
          </div>
        );
      })()}

      {/* Outcome selector — appears after approval */}
      {approved && (
        <div style={{ padding: "16px 22px" }}>
          <OutcomeSelector onSelect={setOutcome} selectedOutcome={outcome} />
          {outcome && <ScratchNoteGenerator acc={acc} outcome={outcome} onNoteReady={setNoteReady} />}
          {outcome && (noteReady !== null) && (
            <button
              onClick={handleLog}
              style={{
                marginTop: 12, padding: "10px 20px", width: "100%",
                background: "#0f172a", border: "none", borderRadius: 8,
                color: "#fff", cursor: "pointer", fontSize: 13,
                fontWeight: 600, fontFamily: "inherit",
              }}
            >
              Log outcome &amp; advance to next account →
            </button>
          )}
          {outcome && (noteReady === null) && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
              Add a work note or skip to enable logging
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkedList({ worked }) {
  const [expanded, setExpanded] = useState(null);
  if (worked.length === 0) return null;
  const statusColors = { "Paid — full": "#16a34a", "Paid — partial": "#0369a1", "Write-off recommended": "#64748b" };
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Worked this session ({worked.length})</div>
      {worked.map(w => {
        const isOpen = expanded === w.id + w.timestamp;
        return (
          <div key={w.id + w.timestamp} style={{ background: "#fff", border: `1px solid ${isOpen ? "#bfdbfe" : "#e2e8f0"}`, borderRadius: 8, marginBottom: 6, overflow: "hidden" }}>
            <div onClick={() => setExpanded(isOpen ? null : w.id + w.timestamp)} style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", marginRight: 8 }}>{w.id}</span>
                <span style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>{w.patient}</span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: statusColors[w.outcomeLabel] || "#0369a1", background: (statusColors[w.outcomeLabel] || "#0369a1") + "12", padding: "2px 8px", borderRadius: 4 }}>{w.outcomeLabel}</span>
                <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>{fmt(w.expectedValue)}</span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>
            {isOpen && (
              <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 14px", background: "#f8fafc" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: w.workNote ? 10 : 0 }}>
                  {[
                    { label: "Outcome", value: w.outcomeLabel },
                    { label: "Amount", value: fmt(w.amount) },
                    { label: "Expected value", value: fmt(w.expectedValue) },
                    { label: "Action taken", value: w.overrideAction || "AI recommended" },
                    { label: "Worked at", value: new Date(w.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: 6, padding: "7px 10px" }}>
                      <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>{value}</div>
                    </div>
                  ))}
                </div>
                {w.workNote && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "9px 12px" }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Work note — queued for EHR</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.65 }}>{w.workNote}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CollectorView({ arScored, dnfbScored, isMedicareBc, worklinks, onWorkLink }) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const cols = (d, t, m) => isMobile ? m : isTablet ? t : d;
  const [workedAccounts, setWorkedAccounts] = useState([]);
  const [sessionStart] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [sortMode, setSortMode] = useState("ev"); // "ev" | "triage"
  const [viewMode, setViewMode] = useState("worklist"); // "worklist" | "focus"
  const [expandedId, setExpandedId] = useState(null);

  const openWorklinkIds = new Set(worklinks.filter(w => w.status === "open").map(w => w.accountId));
  const workedIds = new Set(workedAccounts.map(w => w.id));

  // Triage urgency factor — exponential as timely filing approaches
  const urgencyFactor = (acc) => {
    const daysToFiling = 120 - (acc.daysOut || 0); // assume 120d timely filing window
    if (daysToFiling < 0) return 0.1; // past filing — de-prioritize
    if (daysToFiling < 3) return 10.0;
    if (daysToFiling < 7) return 5.0;
    if (daysToFiling < 14) return 2.0;
    return 1.0;
  };

  const hasFiling = arScored.some(a => (120 - (a.daysOut || 0)) < 14);

  const [collectorSiteFilter, setCollectorSiteFilter] = useState(null);

  const sortedQueue = arScored
    .filter(a => !openWorklinkIds.has(a.id) && isAccountActionable(a.id))
    .filter(a => !collectorSiteFilter || a.site === collectorSiteFilter)
    .sort((a, b) => {
      if (sortMode === "triage") return (b.expectedValue * urgencyFactor(b)) - (a.expectedValue * urgencyFactor(a));
      return b.expectedValue - a.expectedValue;
    });

  const queue = sortedQueue;
  const suppressed = worklinks.filter(w => w.status === "open");
  const currentAccount = searchResult || queue[0] || null;

  const handleSearch = useCallback(q => {
    setSearchQuery(q);
    if (!q) { setSearchResult(null); return; }
    const match = arScored.find(a =>
      a.id.toLowerCase().includes(q.toLowerCase()) ||
      a.patient.toLowerCase().includes(q.toLowerCase()) ||
      a.payer.toLowerCase().includes(q.toLowerCase())
    );
    setSearchResult(match || null);
  }, [arScored]);

  const handleLog = useCallback(entry => {
    // Persist follow-up date so queue suppression survives page reload
    const os = OUTCOME_STATUSES.find(o => o.value === entry.outcome);
    if (os) {
      const storeValue = os.closed ? "closed" : os.pending ? "pending_cfo" : addBusinessDaysISO(os.followUpDays);
      setFollowUpDate(entry.id, storeValue);
      // Notify main component so CFO donuts re-render
      window.dispatchEvent(new CustomEvent("d4_account_logged", { detail: { id: entry.id } }));
    }
    setWorkedAccounts(prev => [...prev, entry]);
    setSearchResult(null);
    setSearchQuery("");
  }, []);

  const totalEV = workedAccounts.reduce((s, w) => s + w.expectedValue, 0);
  const avgEV = workedAccounts.length ? Math.round(totalEV / workedAccounts.length) : 0;
  const mostCommon = workedAccounts.length ? (() => {
    const counts = {};
    workedAccounts.forEach(w => { counts[w.outcomeLabel] = (counts[w.outcomeLabel] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0] || "—";
  })() : "—";

  return (
    <div style={{ padding: isMobile ? "16px 12px 80px" : isTablet ? "20px 20px" : "24px 32px" }}>
      {/* Productivity metrics */}
      <div style={{ display: "grid", gridTemplateColumns: cols("repeat(4, 1fr)", "repeat(2, 1fr)", "repeat(2, 1fr)"), gap: 12, marginBottom: 24 }}>
        {[
          { label: "Accounts worked today", value: workedAccounts.length, sub: `${Math.max(0, DAILY_GOAL - workedAccounts.length)} remaining to goal (${DAILY_GOAL}/day)`, color: "#0f172a" },
          { label: "EV worked", value: fmt(totalEV), sub: "expected recovery logged", color: "#2563eb" },
          { label: "Payment commitments", value: workedAccounts.filter(w => w.outcomeLabel && (w.outcomeLabel.toLowerCase().includes("promis") || w.outcomeLabel.toLowerCase().includes("payment") || w.outcomeLabel.toLowerCase().includes("paid"))).length, sub: "accounts with payment expected", color: "#16a34a" },
          { label: "Dollars per hour", value: (() => { const hrs = (Date.now() - sessionStart) / 3600000; return hrs > 0.01 && totalEV > 0 ? fmt(Math.round(totalEV / Math.max(hrs, 0.1))) : "—"; })(), sub: "EV worked ÷ session time", color: "#7c3aed" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: "-0.01em" }}>{value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Site filter — collector assignment */}
      {(() => {
        const sites = [...new Set(arScored.map(a => a.site))].sort((a,b) => parseInt(a.replace(/\D/g,"")) - parseInt(b.replace(/\D/g,"")));
        if (sites.length <= 1) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>My sites:</span>
            <button onClick={() => setCollectorSiteFilter(null)}
              style={{ padding: "3px 10px", fontSize: 11, fontWeight: !collectorSiteFilter ? 600 : 400, border: `1px solid ${!collectorSiteFilter ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: !collectorSiteFilter ? "#2563eb" : "#fff", color: !collectorSiteFilter ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
              All
            </button>
            {sites.map(s => (
              <button key={s} onClick={() => setCollectorSiteFilter(collectorSiteFilter === s ? null : s)}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: collectorSiteFilter === s ? 600 : 400, border: `1px solid ${collectorSiteFilter === s ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: collectorSiteFilter === s ? "#2563eb" : "#fff", color: collectorSiteFilter === s ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
                {s}
              </button>
            ))}
            {collectorSiteFilter && <span style={{ fontSize: 10, color: "#2563eb", marginLeft: 4 }}>— showing your assigned accounts</span>}
            {!collectorSiteFilter && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>— select your assigned sites to filter your queue</span>}
          </div>
        );
      })()}

      {/* Sort + View mode controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Sort:</span>
          <button onClick={() => setSortMode("ev")}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: sortMode === "ev" ? 600 : 400, border: `1px solid ${sortMode === "ev" ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: sortMode === "ev" ? "#2563eb" : "#fff", color: sortMode === "ev" ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
            Expected Value
          </button>
          <button onClick={() => setSortMode("triage")}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: sortMode === "triage" ? 600 : 400, border: `1px solid ${sortMode === "triage" ? "#dc2626" : "#e2e8f0"}`, borderRadius: 20, background: sortMode === "triage" ? "#dc2626" : "#fff", color: sortMode === "triage" ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
            ⚡ Triage
          </button>
          {hasFiling && sortMode === "ev" && (
            <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>⚠ Timely filing risk in queue — consider Triage sort</span>
          )}
          {sortMode === "triage" && (
            <span style={{ fontSize: 11, color: "#64748b" }}>Weighted by EV × filing urgency</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: 3 }}>
          <button onClick={() => setViewMode("worklist")}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: viewMode === "worklist" ? 600 : 400, border: "none", borderRadius: 6, background: viewMode === "worklist" ? "#fff" : "transparent", color: viewMode === "worklist" ? "#0f172a" : "#64748b", cursor: "pointer", fontFamily: "inherit", boxShadow: viewMode === "worklist" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
            ☰ Worklist
          </button>
          <button onClick={() => setViewMode("focus")}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: viewMode === "focus" ? 600 : 400, border: "none", borderRadius: 6, background: viewMode === "focus" ? "#fff" : "transparent", color: viewMode === "focus" ? "#0f172a" : "#64748b", cursor: "pointer", fontFamily: "inherit", boxShadow: viewMode === "focus" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
            ⊙ Focus
          </button>
        </div>
      </div>

      {/* Search */}
      <SearchBar
        value={searchQuery}
        onChange={handleSearch}
        placeholder="Search by account ID, patient, or payer..."
      />

      {searchQuery && !searchResult && (
        <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#854d0e" }}>
          No account found for "{searchQuery}"
        </div>
      )}

      {searchResult && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#1e40af", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Showing search result — {searchResult.id} · {searchResult.patient}</span>
          <button onClick={() => { setSearchQuery(""); setSearchResult(null); }} style={{ fontSize: 11, color: "#1e40af", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Return to queue</button>
        </div>
      )}

      {/* Queue position */}
      {!searchResult && queue.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Account {workedAccounts.length + 1} of {arScored.length} · sorted by expected value</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{queue.length} remaining</div>
        </div>
      )}

      {/* Worklist mode — compact list */}
      {viewMode === "worklist" && (
        <div style={{ marginBottom: 16 }}>
          {queue.length > 0 && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
              {queue.length} accounts · {fmt(queue.reduce((s,a)=>s+a.expectedValue,0))} EV · click any row to expand
            </div>
          )}
          {(searchResult ? [searchResult] : queue.slice(0, 100)).map(acc => {
            const sev = SEV[acc.cfg.severity] || SEV.ROUTINE;
            const isExpanded = expandedId === acc.id;
            return (
              <div key={acc.id} style={{ marginBottom: 4 }}>
                {!isExpanded ? (
                  <div onClick={() => setExpandedId(acc.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background="#fff"}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, flexShrink: 0 }}>{acc.cfg.severity}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acc.patient}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{acc.id} · {acc.payer}{acc.subPayer ? ` — ${acc.subPayer}` : ""} · {acc.daysOut}d out</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>{fmt(acc.expectedValue)}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{acc.prob}% likely</div>
                    </div>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>▼</span>
                  </div>
                ) : (
                  <div>
                    <button onClick={() => setExpandedId(null)} style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: "0 0 4px 0" }}>▲ collapse</button>
                    <CollectorAccountCard key={acc.id} acc={acc} onLog={handleLog} onWorkLink={onWorkLink} />
                  </div>
                )}
              </div>
            );
          })}
          {!searchResult && queue.length > 100 && (
            <div style={{ textAlign: "center", padding: "16px", fontSize: 12, color: "#94a3b8" }}>
              Showing top 100 of {queue.length.toLocaleString()} accounts by expected value · work these first or search for a specific account
            </div>
          )}
          {queue.length === 0 && !searchResult && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a", marginBottom: 6 }}>Queue complete</div>
              <div style={{ fontSize: 13, color: "#166534" }}>All {arScored.length} accounts worked this session. {fmt(totalEV)} expected recovery logged.</div>
            </div>
          )}
        </div>
      )}

      {/* Focus mode — single account at a time */}
      {viewMode === "focus" && (currentAccount ? (
        <CollectorAccountCard key={currentAccount.id + workedAccounts.length} acc={currentAccount} onLog={handleLog} onWorkLink={onWorkLink} />
      ) : !searchQuery ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a", marginBottom: 6 }}>Queue complete</div>
          <div style={{ fontSize: 13, color: "#166534" }}>All {arScored.length} accounts worked this session. {fmt(totalEV)} expected recovery logged.</div>
        </div>
      ) : null)}

      {/* Worked list */}
      <WorkedList worked={workedAccounts} />

      {/* WorkLink suppressed panel */}
      <WorkLinkSuppressedPanel suppressed={suppressed} />
    </div>
  );
}

function BillerAccountCard({ acc, onSeverityFilter, onWorkLink }) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [logged, setLogged] = useState(false);
  const [noteReady, setNoteReady] = useState(null);
  const [showWorkLink, setShowWorkLink] = useState(false);
  const sev = SEV[acc.cfg.severity];

  const handleLog = () => { if (outcome && noteReady !== null) setLogged(true); };

  return (
    <div style={{ background: logged ? "#f0fdf4" : "#fff", border: `1px solid ${logged ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: isMobile ? "12px 14px" : "14px 18px", cursor: "pointer", display: "grid", gridTemplateColumns: isMobile ? "1fr auto" : "1fr auto auto auto", gap: isMobile ? 10 : 16, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <span onClick={e => { e.stopPropagation(); if (acc.cfg.severity === "CRITICAL" || acc.cfg.severity === "URGENT") { onSeverityFilter && onSeverityFilter(prev => prev === acc.cfg.severity ? null : acc.cfg.severity); } }} style={{ fontSize: 10, fontWeight: 600, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, padding: "1px 7px", borderRadius: 4, cursor: acc.cfg.severity === "CRITICAL" || acc.cfg.severity === "URGENT" ? "pointer" : "default" }} title={acc.cfg.severity === "CRITICAL" || acc.cfg.severity === "URGENT" ? "Click to filter by " + acc.cfg.severity : ""}>{acc.cfg.severity}</span>
            <span style={{ fontSize: 10, fontWeight: 600, background: acc.cfg.color + "12", color: acc.cfg.color, border: `1px solid ${acc.cfg.color}30`, padding: "1px 7px", borderRadius: 4 }}>{acc.area === 'Collections' ? acc.cfg.label.split(' — ')[0].toUpperCase() : acc.area.toUpperCase()}</span>
            {logged && <span style={{ fontSize: 10, fontWeight: 600, background: "#dcfce7", color: "#16a34a", border: "1px solid #bbf7d0", padding: "1px 7px", borderRadius: 4 }}>✓ LOGGED</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.patient}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{acc.id} · {acc.site} · {acc.vertical} · {acc.payer}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{acc.cfg.label}</div>
        </div>
        <ProbCircle prob={acc.prob} payer={acc.payer} />
        {isMobile && <div style={{ color: "#94a3b8", fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</div>}
        {!isMobile && <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Expected value</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#2563eb", letterSpacing: "-0.02em" }}>{fmt(acc.expectedValue)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{fmt(acc.amount)} · {acc.daysOut}d</div>
        </div>}
        {!isMobile && <div style={{ color: "#94a3b8", fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</div>}
      </div>

      {open && (
        <div style={{ borderTop: "1px solid #f8fafc", padding: "14px 18px", background: "#fafbfc" }}>
          <AccountSummary acc={acc} />
          {/* Recommended action — reference only, no approve button */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "13px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>{acc.action.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: acc.action.color, textTransform: "uppercase" }}>{acc.action.label}</span>
              <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>Recommended action</span>
            </div>
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.65 }}>{acc.action.text}</div>
          </div>

          {/* Outcome selector — directly available, no pre-approval needed */}
          <div onClick={e => e.stopPropagation()}>
            {!logged ? (
              <>
                <OutcomeSelector onSelect={setOutcome} selectedOutcome={outcome} />
                {outcome && <ScratchNoteGenerator acc={acc} outcome={outcome} onNoteReady={setNoteReady} />}
                {outcome && (noteReady !== null) && (
                  <button onClick={handleLog} style={{ marginTop: 10, padding: "9px 20px", width: "100%", background: "#0f172a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                    Log outcome
                  </button>
                )}
                {outcome && (noteReady === null) && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
                    Add a work note or skip to enable logging
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: "#166534" }}>
                ✓ Outcome logged — {OUTCOME_STATUSES.find(o => o.value === outcome)?.label}
                <button onClick={() => { setLogged(false); setOutcome(""); }} style={{ marginLeft: 12, fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Edit</button>
              </div>
            )}
          </div>

          {/* Detail grid */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
            {[
              { label: "Payer", value: acc.payer },
              { label: "Service date", value: acc.serviceDate },
              { label: "Last contact", value: acc.lastContact },
              { label: "Vertical", value: acc.vertical },
              { label: "Days outstanding", value: acc.daysOut + " days" },
              { label: "Collection probability", value: acc.prob + "%" },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: 6, padding: "8px 12px" }}>
                <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* WorkLink — agentic draft if action maps to cross-area, manual button always */}
          {onWorkLink && (
            <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
              {!showWorkLink ? (
                WORKLINK_ACTION_MAP[acc.action?.value] ? (
                  <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 6 }}>
                      ✦ AI WorkLink draft ready — {WORKLINK_ACTION_MAP[acc.action.value].requestIcon} {WORKLINK_ACTION_MAP[acc.action.value].requestLabel} → {WORKLINK_ACTION_MAP[acc.action.value].targetArea}
                    </div>
                    <button onClick={() => setShowWorkLink(true)}
                      style={{ width: "100%", padding: "6px 12px", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                      Review & Send
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowWorkLink(true)}
                    style={{ background: "#fff", border: "1.5px solid #2563eb", borderRadius: 20, color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", padding: "6px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                    ⇄ Send WorkLink Request
                  </button>
                )
              ) : (
                <WorkLinkForm acc={acc}
                  defaultRequestType={WORKLINK_ACTION_MAP[acc.action?.value]?.requestType}
                  defaultTargetArea={WORKLINK_ACTION_MAP[acc.action?.value]?.targetArea}
                  autoGenerateNote={!!WORKLINK_ACTION_MAP[acc.action?.value]}
                  onSubmit={(wl) => { onWorkLink(wl); setShowWorkLink(false); }}
                  onCancel={() => setShowWorkLink(false)} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || "#0f172a", letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function AreaChart({ accounts, onFilter, activeFilter }) {
  const byArea = {};
  accounts.forEach(a => { byArea[a.area] = (byArea[a.area] || 0) + a.amount; });
  const max = Math.max(...Object.values(byArea), 1);
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>WIP by responsible area — click to filter</div>
      {AREAS.filter(a => byArea[a]).sort((a,b) => byArea[b] - byArea[a]).map(area => {
        const isActive = activeFilter === area;
        const color = HOLD_CONFIG[Object.keys(HOLD_CONFIG).find(k => HOLD_CONFIG[k].area === area)]?.color || "#64748b";
        return (
          <div key={area} onClick={() => onFilter(isActive ? null : area)} style={{ marginBottom: 10, cursor: "pointer", opacity: activeFilter && !isActive ? 0.4 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: isActive ? color : "#475569", fontWeight: isActive ? 600 : 400 }}>{area}</span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>{fmt(byArea[area])}</span>
            </div>
            <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2 }}>
              <div style={{ width: Math.round(byArea[area]/max*100) + "%", height: "100%", background: isActive ? color : color + "70", borderRadius: 2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}


function EscalationQueue({ arScored, dnfbScored }) {
  const [section, setSection] = useState("escalated");
  const [actionState, setActionState] = useState({}); // tracks action taken per item
  const [noteInput, setNoteInput] = useState({}); // note input per item
  const [showNote, setShowNote] = useState({}); // show note field per item

  const setItemAction = (id, action) => setActionState(p => ({...p, [id]: action}));
  const getNote = (id) => noteInput[id] || "";
  const setNote = (id, val) => setNoteInput(p => ({...p, [id]: val}));
  const toggleNote = (id) => setShowNote(p => ({...p, [id]: !p[id]}));

  const sectionBtn = (key, label, count, accent) => (
    <button onClick={() => setSection(key)} style={{
      padding: "8px 16px", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
      border: `1px solid ${section === key ? accent : "#e2e8f0"}`,
      borderRadius: 8, fontWeight: section === key ? 600 : 400,
      background: section === key ? accent + "10" : "#fff",
      color: section === key ? accent : "#64748b",
      display: "flex", alignItems: "center", gap: 6,
    }}>
      {label}
      <span style={{ background: section === key ? accent : "#f1f5f9", color: section === key ? accent : "#64748b", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{count}</span>
    </button>
  );

  const NoteField = ({ id, placeholder }) => (
    showNote[id] ? (
      <div style={{ marginTop: 8 }}>
        <textarea value={getNote(id)} onChange={e => setNote(id, e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6, fontFamily: "inherit", resize: "none", outline: "none", color: "#334155" }} />
      </div>
    ) : null
  );

  const escCard = (e) => {
    const resolved = actionState[e.accountId] === "resolved";
    const reassigned = actionState[e.accountId] === "reassigned";
    return (
      <div key={e.accountId} style={{ background: "#fff", border: "1px solid #fee2e2", borderLeft: "3px solid #dc2626", borderRadius: 8, padding: "14px 18px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 600, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", padding: "1px 7px", borderRadius: 4 }}>{e.severity}</span>
              <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{e.accountId}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 2 }}>{e.patient}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>{e.payer} · {fmt(e.amount)} balance · {fmt(e.expectedValue)} EV</div>
            <div style={{ fontSize: 12, color: "#334155", background: "#fafafa", border: "1px solid #f1f5f9", borderRadius: 6, padding: "8px 12px", lineHeight: 1.6 }}>
              <span style={{ fontSize: 10, color: "#94a3b8", marginRight: 6 }}>Escalated by {e.escalatedBy} · {e.escalatedAt}</span><br/>
              {e.note}
            </div>
            <NoteField id={e.accountId} placeholder="Add resolution note..." />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            {resolved ? (
              <div style={{ padding: "7px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, color: "#16a34a", fontSize: 11, fontWeight: 600, textAlign: "center" }}>✓ Resolved</div>
            ) : (
              <>
                <button onClick={() => { toggleNote(e.accountId); }} style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, color: "#475569", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                  {showNote[e.accountId] ? "Hide note" : "Add note"}
                </button>
                <button onClick={() => setItemAction(e.accountId, "resolved")} style={{ padding: "7px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, color: "#16a34a", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                  Resolve
                </button>
                <button onClick={() => setItemAction(e.accountId, "reassigned")} style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Reassign</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const slaCard = (s) => {
    const acked = actionState[s.accountId] === "acked";
    return (
      <div key={s.accountId} style={{ background: "#fff", border: "1px solid #fed7aa", borderLeft: "3px solid #f97316", borderRadius: 8, padding: "14px 18px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 3 }}>{s.patient}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{s.accountId} · {s.payer} · {fmt(s.amount)}</div>
            <div style={{ fontSize: 11, color: "#c2410c", marginTop: 4 }}>Scheduled {s.scheduledDate} — <strong>{s.daysOverdue} days overdue</strong> · Assigned to {s.assignedTo}</div>
            <NoteField id={s.accountId + "_sla"} placeholder="Add follow-up note..." />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            {acked ? (
              <div style={{ padding: "7px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, color: "#16a34a", fontSize: 11, fontWeight: 600 }}>✓ Acknowledged</div>
            ) : (
              <>
                <button onClick={() => toggleNote(s.accountId + "_sla")} style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, color: "#475569", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                  Add note
                </button>
                <button onClick={() => setItemAction(s.accountId, "acked")} style={{ padding: "7px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, color: "#c2410c", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                  Acknowledge
                </button>
                <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Reassign</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const writeOffCard = (w) => {
    const approved = actionState[w.accountId] === "approved";
    const returned = actionState[w.accountId] === "returned";
    return (
      <div key={w.accountId} style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: "3px solid #64748b", borderRadius: 8, padding: "14px 18px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 2 }}>{w.patient}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{w.accountId} · {w.payer} · {fmt(w.amount)}</div>
            <div style={{ fontSize: 11, color: "#475569", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 6, padding: "7px 10px" }}>{w.rationale}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Recommended by {w.recommendedBy} · {w.recommendedAt}</div>
            {(showNote[w.accountId] || showNote[w.accountId + "_ret"]) && (
              <div style={{ marginTop: 8 }}>
                <textarea
                  value={getNote(w.accountId)}
                  onChange={e => setNote(w.accountId, e.target.value)}
                  placeholder={showNote[w.accountId + "_ret"] ? "Reason for returning to biller..." : "Approval note (optional)..."}
                  rows={2}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6, fontFamily: "inherit", resize: "none", outline: "none", color: "#334155" }} />
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            {approved && <div style={{ padding: "7px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, color: "#2563eb", fontSize: 11, fontWeight: 600, textAlign: "center" }}>↗ Sent to CFO</div>}
            {returned && <div style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", fontSize: 11, fontWeight: 600, textAlign: "center" }}>↩ Returned</div>}
            {!approved && !returned && (
              <>
                <button onClick={() => { setShowNote(p => ({...p, [w.accountId]: true, [w.accountId + "_ret"]: false})); }} style={{ padding: "7px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, color: "#2563eb", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                  Approve to CFO
                </button>
                {showNote[w.accountId] && !showNote[w.accountId + "_ret"] && (
                  <button onClick={() => setItemAction(w.accountId, "approved")} style={{ padding: "7px 14px", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                    Confirm Approval →
                  </button>
                )}
                <button onClick={() => { setShowNote(p => ({...p, [w.accountId]: false, [w.accountId + "_ret"]: true})); }} style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                  Return to biller
                </button>
                {showNote[w.accountId + "_ret"] && (
                  <button onClick={() => setItemAction(w.accountId, "returned")} style={{ padding: "7px 14px", background: "#64748b", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                    Confirm Return →
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const overrideCard = (o) => {
    const acked = actionState[o.accountId] === "acked";
    const flagged = actionState[o.accountId] === "flagged";
    return (
      <div key={o.accountId} style={{ background: "#fff", border: "1px solid #ede9fe", borderLeft: "3px solid #7c3aed", borderRadius: 8, padding: "14px 18px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 2 }}>{o.patient}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>{o.accountId} · {o.payer} · overridden by {o.collectorName}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 10px" }}>
                <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>AI recommended</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{o.aiRecommended}</div>
              </div>
              <div style={{ background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 6, padding: "7px 10px" }}>
                <div style={{ fontSize: 9, color: "#7c3aed", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>Collector chose</div>
                <div style={{ fontSize: 12, color: "#6d28d9", fontWeight: 500 }}>{o.collectorChose}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>"{o.note}"</div>
            <NoteField id={o.accountId + "_ov"} placeholder="Coaching note (optional)..." />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            {acked && <div style={{ padding: "7px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, color: "#16a34a", fontSize: 11, fontWeight: 600 }}>✓ Acknowledged</div>}
            {flagged && <div style={{ padding: "7px 14px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 6, color: "#7c3aed", fontSize: 11, fontWeight: 600 }}>⚑ Flagged</div>}
            {!acked && !flagged && (
              <>
                <button onClick={() => { toggleNote(o.accountId + "_ov"); }} style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, color: "#475569", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                  Add coaching note
                </button>
                <button onClick={() => setItemAction(o.accountId, "acked")} style={{ padding: "7px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, color: "#16a34a", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                  Acknowledge
                </button>
                <button onClick={() => setItemAction(o.accountId, "flagged")} style={{ padding: "7px 14px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 6, color: "#7c3aed", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Flag for coaching</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const totalWriteOff = ESCALATION_DATA.writeOffPending.reduce((s,w) => s + w.amount, 0);

  return (
    <div style={{ padding: "24px 32px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <MetricCard label="Open escalations" value={ESCALATION_DATA.escalated.length} sub="pending supervisor action" accent="#dc2626" />
        <MetricCard label="SLA breaches" value={ESCALATION_DATA.slaBreach.length} sub="accounts overdue for follow-up" accent="#f97316" />
        <MetricCard label="Write-offs pending" value={fmt(totalWriteOff)} sub="awaiting supervisor approval" accent="#64748b" />
        <MetricCard label="Override rate this week" value="8%" sub="AI recommendations overridden" accent="#7c3aed" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {sectionBtn("escalated",      "Escalated",         ESCALATION_DATA.escalated.length,      "#dc2626")}
        {sectionBtn("slaBreach",      "SLA Breaches",      ESCALATION_DATA.slaBreach.length,      "#f97316")}
        {sectionBtn("writeOffPending","Write-Off Pending",  ESCALATION_DATA.writeOffPending.length, "#64748b")}
        {sectionBtn("overrideReview", "Override Review",   ESCALATION_DATA.overrideReview.length,  "#7c3aed")}
      </div>

      {section === "escalated"      && ESCALATION_DATA.escalated.map(escCard)}
      {section === "slaBreach"      && ESCALATION_DATA.slaBreach.map(slaCard)}
      {section === "writeOffPending"&& ESCALATION_DATA.writeOffPending.map(writeOffCard)}
      {section === "overrideReview" && ESCALATION_DATA.overrideReview.map(overrideCard)}
    </div>
  );
}

const DAILY_GOAL = 50; // Default daily goal — will be configurable per user in Phase 2

const SELF_PAY_ACTIONS = [
  { value: "send_statement",   label: "Send statement",                days: null,  note: "First contact — required before phone outreach" },
  { value: "outbound_call",    label: "Outbound call — payment",       days: 14,    note: "Discuss balance and payment options" },
  { value: "payment_plan",     label: "Offer payment plan",            days: 30,    note: "Structured installment agreement" },
  { value: "financial_counsel",label: "Financial counseling referral", days: 7,     note: "Route to financial counselor for charity care screening" },
  { value: "charity_care",     label: "Charity care application",      days: 14,    note: "Patient qualifies — begin application process" },
  { value: "plan_default",     label: "Payment plan — default",        days: 5,     note: "Missed installment — follow up on plan" },
  { value: "collection_agency",label: "Refer to collection agency",    days: null,  note: "Internal collection exhausted — external referral" },
  { value: "writeoff_charity", label: "Write-off — charity care",      days: null,  closed: true },
  { value: "writeoff_bad_debt",label: "Write-off — bad debt",          days: null,  closed: true },
];

const SP_DATA = [
  { id:"SP-001", patient:"Daniel Moore", balance:2600, daysOut:91, serviceDate:"2026-02-08", firstStatement:"2026-02-16", lastContact:"2026-04-15", type:"uninsured", insuranceClosed:false, site:"Site 4", vertical:"Primary Care", prob:55 },
  { id:"SP-002", patient:"Paul Williams", balance:500, daysOut:101, serviceDate:"2026-01-23", firstStatement:"2026-02-05", lastContact:"2026-03-26", type:"patient_portion", insuranceClosed:true, site:"Site 7", vertical:"Primary Care", prob:41 },
  { id:"SP-003", patient:"Daniel Davis", balance:7200, daysOut:52, serviceDate:"2026-03-16", firstStatement:"2026-03-29", lastContact:"2026-04-15", type:"uninsured", insuranceClosed:false, site:"Site 4", vertical:"Behavioral Health", prob:56 },
  { id:"SP-004", patient:"Barbara Moore", balance:5800, daysOut:173, serviceDate:"2025-11-10", firstStatement:"2025-11-29", lastContact:"2026-04-11", type:"uninsured", insuranceClosed:false, site:"Site 2", vertical:"Behavioral Health", prob:16 },
  { id:"SP-005", patient:"Barbara Davis", balance:6100, daysOut:177, serviceDate:"2025-11-14", firstStatement:"2025-11-24", lastContact:"2026-05-09", type:"uninsured", insuranceClosed:false, site:"Site 8", vertical:"Outpatient Surgery", prob:20 },
  { id:"SP-006", patient:"Kimberly Johnson", balance:7600, daysOut:133, serviceDate:"2025-12-20", firstStatement:"2026-01-07", lastContact:"2026-04-30", type:"uninsured", insuranceClosed:false, site:"Site 8", vertical:"Radiology", prob:33 },
  { id:"SP-007", patient:"Anthony Williams", balance:800, daysOut:38, serviceDate:"2026-03-27", firstStatement:"2026-04-13", lastContact:"2026-05-13", type:"uninsured", insuranceClosed:false, site:"Site 7", vertical:"Outpatient Surgery", prob:65 },
  { id:"SP-008", patient:"Paul Clark", balance:900, daysOut:155, serviceDate:"2025-11-27", firstStatement:"2025-12-15", lastContact:"2026-03-24", type:"uninsured", insuranceClosed:false, site:"Site 2", vertical:"Primary Care", prob:39 },
  { id:"SP-009", patient:"Kimberly Brown", balance:6400, daysOut:34, serviceDate:"2026-04-02", firstStatement:"2026-04-15", lastContact:"2026-05-15", type:"uninsured", insuranceClosed:false, site:"Site 8", vertical:"Primary Care", prob:56 },
  { id:"SP-010", patient:"James Taylor", balance:6100, daysOut:52, serviceDate:"2026-03-19", firstStatement:"2026-03-28", lastContact:"2026-04-15", type:"uninsured", insuranceClosed:false, site:"Site 3", vertical:"Behavioral Health", prob:53 },
  { id:"SP-011", patient:"Jessica Brown", balance:2300, daysOut:71, serviceDate:"2026-02-27", firstStatement:"2026-03-06", lastContact:"2026-05-12", type:"uninsured", insuranceClosed:false, site:"Site 7", vertical:"Radiology", prob:51 },
  { id:"SP-012", patient:"Paul Anderson", balance:6200, daysOut:56, serviceDate:"2026-03-07", firstStatement:"2026-03-24", lastContact:"2026-04-27", type:"patient_portion", insuranceClosed:true, site:"Site 5", vertical:"Orthopedics", prob:66 },
  { id:"SP-013", patient:"Joseph Williams", balance:1100, daysOut:154, serviceDate:"2025-12-08", firstStatement:"2025-12-13", lastContact:"2026-03-29", type:"patient_portion", insuranceClosed:true, site:"Site 1", vertical:"Outpatient Surgery", prob:23 },
  { id:"SP-014", patient:"Paul Moore", balance:5600, daysOut:51, serviceDate:"2026-03-19", firstStatement:"2026-03-26", lastContact:"2026-04-03", type:"uninsured", insuranceClosed:false, site:"Site 5", vertical:"Laboratory", prob:62 },
  { id:"SP-015", patient:"Andrew Harris", balance:5600, daysOut:79, serviceDate:"2026-02-17", firstStatement:"2026-02-28", lastContact:"2026-03-21", type:"patient_portion", insuranceClosed:true, site:"Site 6", vertical:"Cardiology", prob:44 },
  { id:"SP-016", patient:"Karen White", balance:6900, daysOut:152, serviceDate:"2025-12-04", firstStatement:"2025-12-19", lastContact:"2026-04-11", type:"uninsured", insuranceClosed:false, site:"Site 5", vertical:"Radiology", prob:32 },
  { id:"SP-017", patient:"Nancy Brown", balance:1500, daysOut:100, serviceDate:"2026-01-29", firstStatement:"2026-02-06", lastContact:"2026-04-22", type:"patient_portion", insuranceClosed:true, site:"Site 4", vertical:"Emergency", prob:36 },
  { id:"SP-018", patient:"Maria Clark", balance:1800, daysOut:60, serviceDate:"2026-03-08", firstStatement:"2026-03-18", lastContact:"2026-04-04", type:"patient_portion", insuranceClosed:true, site:"Site 1", vertical:"Radiology", prob:57 },
  { id:"SP-019", patient:"Nancy Brown", balance:6000, daysOut:122, serviceDate:"2025-12-30", firstStatement:"2026-01-18", lastContact:"2026-03-29", type:"uninsured", insuranceClosed:false, site:"Site 1", vertical:"Laboratory", prob:29 },
  { id:"SP-020", patient:"Ashley Harris", balance:1100, daysOut:166, serviceDate:"2025-11-20", firstStatement:"2025-12-01", lastContact:"2026-05-08", type:"uninsured", insuranceClosed:false, site:"Site 7", vertical:"Primary Care", prob:17 },
  { id:"SP-021", patient:"Charles Rodriguez", balance:2400, daysOut:95, serviceDate:"2026-01-28", firstStatement:"2026-02-15", lastContact:"2026-05-10", type:"uninsured", insuranceClosed:false, site:"Site 1", vertical:"Radiology", prob:39 },
  { id:"SP-022", patient:"Michael Wilson", balance:2800, daysOut:153, serviceDate:"2025-12-01", firstStatement:"2025-12-18", lastContact:"2026-03-27", type:"patient_portion", insuranceClosed:true, site:"Site 6", vertical:"Laboratory", prob:30 },
  { id:"SP-023", patient:"Joseph Garcia", balance:5700, daysOut:177, serviceDate:"2025-11-06", firstStatement:"2025-11-23", lastContact:"2026-03-29", type:"uninsured", insuranceClosed:false, site:"Site 4", vertical:"Radiology", prob:29 },
  { id:"SP-024", patient:"Jessica Rodriguez", balance:4400, daysOut:108, serviceDate:"2026-01-18", firstStatement:"2026-02-02", lastContact:"2026-04-18", type:"uninsured", insuranceClosed:false, site:"Site 6", vertical:"Behavioral Health", prob:39 },
  { id:"SP-025", patient:"Matthew Taylor", balance:4600, daysOut:70, serviceDate:"2026-02-20", firstStatement:"2026-03-08", lastContact:"2026-03-23", type:"uninsured", insuranceClosed:false, site:"Site 8", vertical:"Orthopedics", prob:52 },
  { id:"SP-026", patient:"Ashley Taylor", balance:6300, daysOut:54, serviceDate:"2026-03-09", firstStatement:"2026-03-28", lastContact:"2026-05-11", type:"uninsured", insuranceClosed:false, site:"Site 5", vertical:"Primary Care", prob:57 },
  { id:"SP-027", patient:"Christopher Clark", balance:5700, daysOut:137, serviceDate:"2025-12-17", firstStatement:"2026-01-03", lastContact:"2026-04-06", type:"uninsured", insuranceClosed:false, site:"Site 7", vertical:"Outpatient Surgery", prob:37 },
  { id:"SP-028", patient:"Andrew White", balance:6400, daysOut:151, serviceDate:"2025-12-05", firstStatement:"2025-12-17", lastContact:"2026-04-21", type:"patient_portion", insuranceClosed:true, site:"Site 7", vertical:"Orthopedics", prob:32 },
  { id:"SP-029", patient:"Joshua Thomas", balance:5800, daysOut:102, serviceDate:"2026-01-21", firstStatement:"2026-02-06", lastContact:"2026-04-02", type:"uninsured", insuranceClosed:false, site:"Site 1", vertical:"Outpatient Surgery", prob:53 },
  { id:"SP-030", patient:"Margaret White", balance:7800, daysOut:98, serviceDate:"2026-02-01", firstStatement:"2026-02-09", lastContact:"2026-04-23", type:"patient_portion", insuranceClosed:true, site:"Site 2", vertical:"Laboratory", prob:40 }
];

function scoreSelfPay(acc) {
  const ev = Math.round(acc.prob / 100 * acc.balance);
  let nextAction;
  if (acc.daysOut < 45) nextAction = { label: "Send statement", text: `First statement — send within 30 days of service. Do not call before statement is sent.`, compliance: "FDCPA: First written contact required before phone outreach." };
  else if (acc.daysOut < 90) nextAction = { label: "Outbound call — payment", text: `Call patient to discuss balance of $${acc.balance.toLocaleString()}. Identify ability to pay. Offer payment plan or charity care screening if appropriate.`, compliance: "" };
  else if (acc.daysOut < 150) nextAction = { label: "Offer payment plan", text: `Patient has not responded to prior contacts. Present structured payment plan options. Minimum $50/month. Escalate to financial counseling if unable to pay.`, compliance: "" };
  else nextAction = { label: "Financial counseling referral", text: `Balance outstanding ${acc.daysOut} days. Route to financial counselor for charity care screening before any extraordinary collection action.`, compliance: "ACA: Financial assistance must be offered before extraordinary collection actions." };
  return { ...acc, ev, nextAction };
}

function SelfPayView() {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const cols = (d, t, m) => isMobile ? m : isTablet ? t : d;
  const scored = useMemo(() =>
    SP_DATA.map(scoreSelfPay).sort((a,b) => b.ev - a.ev), []);
  const [worked, setWorked] = useState([]);
  const [search, setSearch] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [outcome, setOutcome] = useState("");
  const [noteReady, setNoteReady] = useState(null);
  const [showScratch, setShowScratch] = useState(false);

  const workedIds = new Set(worked.map(w => w.id));
  const queue = scored.filter(a => !workedIds.has(a.id));
  const searchResult = search ? scored.find(a =>
    a.id.toLowerCase().includes(search.toLowerCase()) ||
    a.patient.toLowerCase().includes(search.toLowerCase())
  ) : null;
  const current = searchResult || queue[0] || null;

  const totalBalance = scored.reduce((s,a) => s + a.balance, 0);
  const totalEV = scored.reduce((s,a) => s + a.ev, 0);
  const uninsured = scored.filter(a => a.type === "uninsured").length;
  const patientPortion = scored.filter(a => a.type === "patient_portion").length;

  const handleLog = () => {
    if (!outcome || noteReady === null) return;
    const act = SELF_PAY_ACTIONS.find(a => a.value === outcome);
    setWorked(prev => [...prev, {
      id: current.id, patient: current.patient, balance: current.balance,
      ev: current.ev, outcomeLabel: act?.label || outcome,
      note: noteReady === "__SKIPPED__" ? null : noteReady,
      timestamp: new Date(),
    }]);
    setOutcome(""); setNoteReady(null); setShowScratch(false); setSearch("");
  };

  if (!current && queue.length === 0 && worked.length > 0) return (
    <div style={{ padding: "40px 32px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a" }}>Queue complete</div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{worked.length} accounts worked · ${worked.reduce((s,w) => s + w.balance, 0).toLocaleString()} total balance processed</div>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? "16px 12px 80px" : isTablet ? "20px 20px" : "24px 32px" }}>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: cols("repeat(4, 1fr)", "repeat(2, 1fr)", "repeat(2, 1fr)"), gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total self-pay balance" value={"$"+totalBalance.toLocaleString()} sub={`${scored.length} accounts`} />
        <MetricCard label="Expected recovery" value={"$"+totalEV.toLocaleString()} sub={`${Math.round(totalEV/totalBalance*100)}% rate`} accent="#2563eb" />
        <MetricCard label="Uninsured" value={uninsured} sub="full balance patient responsibility" />
        <MetricCard label="Patient portion" value={patientPortion} sub="insurance fully adjudicated" />
      </div>

      {/* Compliance banner */}
      <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 14 }}>⚖️</span>
        <div style={{ fontSize: 12, color: "#854d0e" }}>
          <strong>FDCPA &amp; ACA Compliance Active</strong> — 30-day hold enforced · First contact must be written statement · No phone calls before statement sent · Financial assistance must be offered before extraordinary collection actions
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }}>🔍</span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by account ID or patient name..."
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 36px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#0f172a", outline: "none", fontFamily: "inherit" }} />
        {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>×</button>}
      </div>

      {searchResult && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#1e40af" }}>
          <span>Showing search result — {searchResult.id} · {searchResult.patient}</span>
          <button onClick={() => setSearch("")} style={{ fontSize: 11, color: "#1e40af", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Return to queue</button>
        </div>
      )}

      {!searchResult && queue.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 11, color: "#94a3b8" }}>
          <span>Account {worked.length + 1} of {scored.length} · sorted by expected value</span>
          <span>{queue.length} remaining</span>
        </div>
      )}

      {/* Current account */}
      {current && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          {/* Account header */}
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, background: current.type === "patient_portion" ? "#eff6ff" : "#f0fdf4", color: current.type === "patient_portion" ? "#1d4ed8" : "#166534", border: `1px solid ${current.type === "patient_portion" ? "#bfdbfe" : "#bbf7d0"}`, padding: "1px 8px", borderRadius: 4 }}>
                    {current.type === "patient_portion" ? "Patient Portion" : "Uninsured"}
                  </span>
                  {current.type === "patient_portion" && current.insuranceClosed && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", padding: "1px 8px", borderRadius: 4 }}>✓ Insurance closed</span>
                  )}
                  <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{current.id}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 3 }}>{current.patient}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{current.site} · {current.vertical} · {current.daysOut} days outstanding</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Service: {current.serviceDate} · First statement: {current.firstStatement}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                <ProbCircle prob={current.prob} payer={current.payer} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Patient balance</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#2563eb", letterSpacing: "-0.02em" }}>${current.balance.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>EV: ${current.ev.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Recommended action */}
          <div style={{ padding: "14px 22px", background: "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Recommended action</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 4 }}>{current.nextAction.label}</div>
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, marginBottom: current.nextAction.compliance ? 8 : 0 }}>{current.nextAction.text}</div>
            {current.nextAction.compliance && (
              <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#854d0e" }}>⚖️ {current.nextAction.compliance}</div>
            )}
          </div>

          {/* Outcome selector */}
          <div style={{ padding: "14px 22px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>Log outcome</div>
            <select value={outcome} onChange={e => { setOutcome(e.target.value); setNoteReady(null); setShowScratch(false); }}
              style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: outcome ? "#0f172a" : "#94a3b8", fontFamily: "inherit", cursor: "pointer", outline: "none", marginBottom: 10 }}>
              <option value="" disabled>Select outcome status...</option>
              {SELF_PAY_ACTIONS.filter(a => !a.closed).map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
              <optgroup label="Closed">
                {SELF_PAY_ACTIONS.filter(a => a.closed).map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </optgroup>
            </select>

            {/* Scratch note */}
            {outcome && !showScratch && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button onClick={() => setShowScratch(true)} style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, color: "#475569", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>📝 Add work note</button>
                <button onClick={() => setNoteReady("__SKIPPED__")} style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#94a3b8", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Skip note</button>
              </div>
            )}
            {outcome && showScratch && (
              <ScratchNoteGenerator acc={{...current, amount: current.balance, daysOut: current.daysOut, cfg: {label: "Self-pay"}, area: "Self-Pay", action: {label: current.nextAction.label, text: current.nextAction.text}}} outcome={outcome} onNoteReady={setNoteReady} />
            )}

            {outcome && noteReady !== null && (
              <button onClick={handleLog} style={{ marginTop: 10, padding: "10px 20px", width: "100%", background: "#0f172a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                Log outcome &amp; advance →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Worked list */}
      {worked.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Worked this session ({worked.length})</div>
          {worked.map(w => (
            <div key={w.id+w.timestamp} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", marginRight: 8 }}>{w.id}</span>
                <span style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>{w.patient}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#0369a1", background: "#eff6ff", padding: "2px 8px", borderRadius: 4 }}>{w.outcomeLabel}</span>
                <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>${w.balance.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function DonutChart({ accounts, onFilter, activeFilter, title }) {
  const byArea = {};
  accounts.forEach(a => { byArea[a.area] = (byArea[a.area] || 0) + a.amount; });
  const total = Object.values(byArea).reduce((s,v) => s+v, 0) || 1;
  const areaColors = { "Coding":"#6d28d9","Physician/Doc":"#1d4ed8","Charge Capture":"#be185d","Credentialing":"#9f1239","Authorization":"#c2410c","Clinical/HIM":"#0369a1","Billing/Scrubber":"#0f766e","Pending":"#374151" };
  const sorted = Object.entries(byArea).sort((a,b) => b[1]-a[1]);
  const cx = 70, cy = 70, outerR = 56, innerR = 34;
  const toXY = (r, deg) => {
    const rad = (deg - 90) * Math.PI / 180;
    return [+(cx + r * Math.cos(rad)).toFixed(3), +(cy + r * Math.sin(rad)).toFixed(3)];
  };
  const arcPath = (startDeg, endDeg) => {
    const [ox1, oy1] = toXY(outerR, startDeg);
    const [ox2, oy2] = toXY(outerR, endDeg);
    const [ix2, iy2] = toXY(innerR, endDeg);
    const [ix1, iy1] = toXY(innerR, startDeg);
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M${ox1} ${oy1} A${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} L${ix2} ${iy2} A${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1}Z`;
  };
  let angle = 0;
  const segs = sorted.map(([area, amount]) => {
    const sweep = (amount / total) * 359.99;
    const s = { area, amount, startDeg: angle, endDeg: angle + sweep, pct: Math.round(amount/total*100) };
    angle += sweep;
    return s;
  });
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>WIP by responsible area</div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ flexShrink: 0 }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            {segs.length === 0 && <circle cx={cx} cy={cy} r={(outerR+innerR)/2} fill="none" stroke="#f1f5f9" strokeWidth={outerR-innerR} />}
            {segs.map(s => {
              const isActive = activeFilter === s.area;
              return (
                <path key={s.area} d={arcPath(s.startDeg, s.endDeg)}
                  fill={areaColors[s.area] || "#64748b"}
                  stroke="#fff" strokeWidth={2}
                  opacity={activeFilter && !isActive ? 0.25 : 1}
                  style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                  onClick={() => onFilter && onFilter(isActive ? null : s.area)}
                />
              );
            })}
            <text x={cx} y={cy - 7} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="system-ui">TOTAL WIP</text>
            <text x={cx} y={cy + 9} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a" fontFamily="system-ui">{fmtDonut(total)}</text>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          {sorted.map(([area, amount]) => {
            const isActive = activeFilter === area;
            return (
              <div key={area} onClick={() => onFilter && onFilter(isActive ? null : area)}
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, cursor: "pointer", opacity: activeFilter && !isActive ? 0.4 : 1, padding: "3px 6px", borderRadius: 6, background: isActive ? (areaColors[area] || "#64748b") + "12" : "transparent" }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: areaColors[area] || "#64748b", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: isActive ? (areaColors[area] || "#64748b") : "#475569", flex: 1, fontWeight: isActive ? 600 : 400 }}>{area}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{Math.round(amount/total*100)}%</span>
                <span style={{ fontSize: 12, color: "#334155", fontWeight: 500, minWidth: 70, textAlign: "right" }}>${(amount/1000).toFixed(0)}K</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


const fmtDonut = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : `$${(n/1000).toFixed(0)}K`;

function DonutChartPanel({ accounts, title, onFilter, activeFilter }) {
  const width = useWindowWidth();
  const panelMobile = width < 768;
  const byArea = {};
  accounts.forEach(a => { byArea[a.area] = (byArea[a.area] || 0) + a.amount; });
  const total = Object.values(byArea).reduce((s,v) => s+v, 0) || 1;
  const areaColors = { "Coding":"#6d28d9","Physician/Doc":"#1d4ed8","Charge Capture":"#be185d","Credentialing":"#9f1239","Authorization":"#c2410c","Clinical/HIM":"#0369a1","Billing/Scrubber":"#0f766e","Pending":"#374151" };
  const sorted = Object.entries(byArea).sort((a,b) => b[1]-a[1]);
  const cx = 70, cy = 70, outerR = 56, innerR = 34;
  const toXY = (r, deg) => { const rad = (deg - 90) * Math.PI / 180; return [+(cx + r * Math.cos(rad)).toFixed(3), +(cy + r * Math.sin(rad)).toFixed(3)]; };
  const arcPath = (s, e) => { const [ox1,oy1]=toXY(outerR,s);const [ox2,oy2]=toXY(outerR,e);const [ix2,iy2]=toXY(innerR,e);const [ix1,iy1]=toXY(innerR,s);const lg=(e-s)>180?1:0;return `M${ox1} ${oy1} A${outerR} ${outerR} 0 ${lg} 1 ${ox2} ${oy2} L${ix2} ${iy2} A${innerR} ${innerR} 0 ${lg} 0 ${ix1} ${iy1}Z`; };
  let angle = 0;
  const segs = sorted.map(([area, amount]) => { const sweep=(amount/total)*359.99; const seg={area,amount,startDeg:angle,endDeg:angle+sweep}; angle+=sweep; return seg; });
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{title}</div>
      <div style={{ display: "flex", alignItems: panelMobile ? "flex-start" : "center", flexDirection: panelMobile ? "column" : "row", gap: 20 }}>
        <div style={{ flexShrink: 0 }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            {segs.length === 0 && <circle cx={cx} cy={cy} r={(outerR+innerR)/2} fill="none" stroke="#f1f5f9" strokeWidth={outerR-innerR} />}
            {segs.map(s => {
              const isActive = activeFilter === s.area;
              return (
                <path key={s.area} d={arcPath(s.startDeg, s.endDeg)}
                  fill={areaColors[s.area] || "#64748b"}
                  stroke="#fff" strokeWidth={2}
                  opacity={activeFilter && !isActive ? 0.25 : 1}
                  style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                  onClick={() => onFilter && onFilter(isActive ? null : s.area)}
                />
              );
            })}
            <text x={cx} y={cy - 7} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="system-ui">TOTAL WIP</text>
            <text x={cx} y={cy + 9} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a" fontFamily="system-ui">{fmtDonut(total)}</text>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          {sorted.map(([area, amount]) => {
            const isActive = activeFilter === area;
            return (
              <div key={area} onClick={() => onFilter && onFilter(isActive ? null : area)}
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, cursor: "pointer", opacity: activeFilter && !isActive ? 0.4 : 1, padding: "3px 6px", borderRadius: 6, background: isActive ? (areaColors[area] || "#64748b") + "12" : "transparent" }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: areaColors[area] || "#64748b", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: isActive ? (areaColors[area] || "#64748b") : "#475569", flex: 1, fontWeight: isActive ? 600 : 400 }}>{area}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{Math.round(amount/total*100)}%</span>
                <span style={{ fontSize: 12, color: "#334155", fontWeight: 500, minWidth: 60, textAlign: "right" }}>{fmtDonut(amount)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CFOEscalationSection() {
  const [open, setOpen] = useState(false);
  const [approved, setApproved] = useState({});
  const [showOverrides, setShowOverrides] = useState(false);
  const [showEscalations, setShowEscalations] = useState(false);
  const writeOffTotal = ESCALATION_DATA.writeOffPending.reduce((s,w) => s + w.amount, 0);
  const pendingCount = ESCALATION_DATA.writeOffPending.filter(w => !approved[w.accountId]).length;
  return (
    <div style={{ marginTop: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Escalation Summary</span>
          {pendingCount > 0 && <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{pendingCount} write-off{pendingCount > 1 ? "s" : ""} pending your approval</span>}
        </div>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px 18px" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Write-offs pending your approval</div>
            {ESCALATION_DATA.writeOffPending.map(w => (
              <div key={w.accountId} style={{ background: "#fafafa", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 2 }}>{w.patient}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{w.accountId} · {w.payer} · Recommended by {w.recommendedBy} · {w.recommendedAt}</div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 5, fontStyle: "italic" }}>{w.rationale}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>${w.amount.toLocaleString()}</div>
                  {approved[w.accountId] ? (
                    <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Write-off approved</div>
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setApproved(p => ({...p, [w.accountId]: true}))} style={{ padding: "6px 12px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, color: "#b91c1c", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>Approve</button>
                      <button style={{ padding: "6px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Return</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Override rate — drill down */}
            <div style={{ background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 8, overflow: "hidden" }}>
              <div onClick={() => setShowOverrides(o => !o)} style={{ padding: "12px 14px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", letterSpacing: "0.08em", textTransform: "uppercase" }}>Override rate this period</div>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>{showOverrides ? "▲" : "▼"}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#6d28d9", marginTop: 4 }}>8%</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Within normal range — target under 15%</div>
              </div>
              {showOverrides && (
                <div style={{ borderTop: "1px solid #ede9fe", padding: "10px 14px", background: "#fff" }}>
                  <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{ESCALATION_DATA.overrideReview.length} overrides this period</div>
                  {ESCALATION_DATA.overrideReview.map(o => (
                    <div key={o.accountId} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #f5f3ff" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{o.patient} · {o.accountId}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11 }}>
                        <span style={{ color: "#64748b", background: "#f8fafc", padding: "1px 6px", borderRadius: 4 }}>AI: {o.aiRecommended}</span>
                        <span style={{ color: "#6d28d9", background: "#faf5ff", padding: "1px 6px", borderRadius: 4 }}>Chose: {o.collectorChose}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 3, fontStyle: "italic" }}>{o.collectorName}: "{o.note}"</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Open escalations — drill down */}
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, overflow: "hidden" }}>
              <div onClick={() => setShowEscalations(o => !o)} style={{ padding: "12px 14px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#c2410c", letterSpacing: "0.08em", textTransform: "uppercase" }}>Open escalations</div>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>{showEscalations ? "▲" : "▼"}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#c2410c", marginTop: 4 }}>{ESCALATION_DATA.escalated.length}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Pending supervisor resolution</div>
              </div>
              {showEscalations && (
                <div style={{ borderTop: "1px solid #fed7aa", padding: "10px 14px", background: "#fff" }}>
                  <div style={{ fontSize: 10, color: "#c2410c", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Open escalations</div>
                  {ESCALATION_DATA.escalated.map(e => (
                    <div key={e.accountId} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #fff7ed" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{e.patient} · {e.accountId}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{e.payer} · Escalated by {e.escalatedBy} · {e.escalatedAt}</div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#c2410c" }}>${(e.expectedValue/1000).toFixed(0)}K EV</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{e.note}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



function CFOCriticalHolds({ accounts }) {
  const [open, setOpen] = useState(false);
  const crits = accounts.filter(a => a.cfg.severity === "CRITICAL");
  if (crits.length === 0) return null;
  return (
    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "12px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>CRITICAL</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{crits.length} critical hold{crits.length > 1 ? "s" : ""} — {fmt(crits.reduce((s,a) => s+a.amount, 0))} at risk</span>
        </div>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{open ? "▲ hide" : "▼ view all"}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #fed7aa", padding: "10px 18px" }}>
          {crits.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #fff7ed" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{a.patient}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{a.id} · {a.payer} · {a.vertical} · {a.daysOut}d</div>
                <div style={{ fontSize: 11, color: "#c2410c", marginTop: 2 }}>{a.cfg.label}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{fmt(a.amount)}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>EV: {fmt(a.expectedValue)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WIPPlatform() {
  const [tab, setTab] = useState(() => {
    const savedRole = (() => { try { return localStorage.getItem("d4_last_role") || "cfo"; } catch { return "cfo"; } })();
    return savedRole === "supervisor" ? "escalation" : "metrics";
  });
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem("d4_last_role") || "cfo"; } catch { return "cfo"; }
  });
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotifications, setReadNotifications] = useState(new Set());

  const setRoleAndPersist = (val) => {
    try { localStorage.setItem("d4_last_role", val); } catch {}
    setRole(val);
    setTab(val === "supervisor" ? "escalation" : "metrics");
    setAiText(null);
    setSearchQuery("");
    setAreaFilter(null);
    setSeverityFilter(null);
    setShowRoleSwitcher(false);
  };
  const [areaFilter, setAreaFilter] = useState(null);
  const [severityFilter, setSeverityFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiText, setAiText] = useState(null);
  const [critFilter, setCritFilter] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [donutExpanded, setDonutExpanded] = useState(false);
  const [worklinks, setWorklinks] = useState([]);
  const [siteFilter, setSiteFilter] = useState(null);
  const [activeTier, setActiveTier] = useState(null);

  // Tracks worked account IDs in React state so donuts re-render when accounts are logged
  const [workedIdSet, setWorkedIdSet] = useState(() => new Set(Object.keys(getFollowUpStore())));

  useEffect(() => {
    const handler = (e) => setWorkedIdSet(prev => new Set([...prev, e.detail.id]));
    window.addEventListener("d4_account_logged", handler);
    return () => window.removeEventListener("d4_account_logged", handler);
  }, []);

  const handleSendWorklink = (req) => setWorklinks(prev => [...prev, req]);
  const handleResolveWorklink = (id, note) => setWorklinks(prev => prev.map(w => w.id === id ? {...w, status: "resolved", resolvedAt: new Date(), resolutionNote: note} : w));
  const handleReturnWorklink = (id, reason, redirectArea) => {
    setWorklinks(prev => prev.map(w => {
      if (w.id !== id) return w;
      if (redirectArea) {
        // Re-route to correct area instead of returning
        return { ...w, targetArea: redirectArea, returnReason: reason, returnedBy: w.targetArea, status: "open" };
      }
      return { ...w, status: "returned", resolvedAt: new Date(), resolutionNote: reason || "Returned to sender" };
    }));
  };

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const cols = (desktop, tablet, mobile) => isMobile ? mobile : isTablet ? tablet : desktop;

  const dnfb = useMemo(() => DNFB_DATA.map(a => score(a, "dnfb")).sort((a,b) => b.expectedValue - a.expectedValue), []);
  const ar = useMemo(() => AR_DATA.map(a => score(a, "ar")).sort((a,b) => b.expectedValue - a.expectedValue), []);

  const roleConfig = ROLE_DEFS[role] || ROLE_DEFS.biller;
  const payerFilter = roleConfig.filter;

  const applyPayerFilter = (accounts) => {
    if (payerFilter.includes("all")) return accounts;
    return accounts.filter(a => payerFilter.includes(PAYER_CATEGORY[a.payer] || "commercial"));
  };

  const dnfbForRole = useMemo(() => applyPayerFilter(dnfb), [dnfb, role]);
  const arForRole = useMemo(() => applyPayerFilter(ar), [ar, role]);

  // Site-filtered data for CFO metrics tab
  const dnfbFiltered = siteFilter ? dnfbForRole.filter(a => a.site === siteFilter) : dnfbForRole;
  const arFiltered = siteFilter ? arForRole.filter(a => a.site === siteFilter) : arForRole;

  const current = tab === "dnfb" ? dnfbForRole : arForRole;

  const filtered = useMemo(() => {
    let list = areaFilter ? current.filter(a => a.area === areaFilter) : current;
    // DNFB tier filter — driven by activeTier on the Billing WIP tab (set from both Metrics and Billing WIP tab tier clicks)
    if (activeTier && tab === "dnfb") {
      if (activeTier === "normal") list = list.filter(a => (a.daysInDNFB||0) <= 3);
      else if (activeTier === "watch") list = list.filter(a => (a.daysInDNFB||0) > 3 && (a.daysInDNFB||0) < 6);
      else if (activeTier === "flag") list = list.filter(a => (a.daysInDNFB||0) >= 6);
    }
    // AR follow-up tier filter — set when clicking a Collections tier on Metrics tab
    if (severityFilter && tab === "ar") {
      const pd = (a) => !workedIdSet.has(a.id); // unworked in platform
      if (severityFilter === "followup_high") list = list.filter(a => pd(a) && a.amount >= 10000);
      else if (severityFilter === "followup_mid") list = list.filter(a => pd(a) && a.amount >= 1000 && a.amount < 10000);
      else if (severityFilter === "followup_low") list = list.filter(a => pd(a) && a.amount < 1000);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a =>
        a.id.toLowerCase().includes(q) ||
        a.patient.toLowerCase().includes(q) ||
        a.payer.toLowerCase().includes(q) ||
        a.site.toLowerCase().includes(q)
      );
    }
    return list;
  }, [current, areaFilter, activeTier, severityFilter, searchQuery, tab]);

  const exportToExcel = () => {
    let rows, filename;
    if (tab === "dnfb") {
      filename = "billing-wip-dnfb.csv";
      const headers = ["Account ID","Patient","Site","Vertical","Payer","Balance","Days in DNFB","Hold Code","Service Date","Last Contact"];
      const data = filtered.map(a => [a.id, a.patient, a.site, a.vertical, a.payer, a.amount, a.daysInDNFB, a.holdCode, a.serviceDate, a.lastContact]);
      rows = [headers, ...data];
    } else {
      filename = tab === "ar" ? "collections-wip.csv" : "wip-export.csv";
      const headers = ["Account ID","Patient","Payer","Site","Vertical","Balance","Expected Value","Probability %","Days Out","Responsible Area","Severity","Last Contact","Outcome Status","Denial Code"];
      const data = filtered.map(a => [a.id, a.patient, a.payer, a.site, a.vertical, a.amount, a.expectedValue, Math.round(a.probability*100), a.daysOut, a.area, a.cfg?.severity||"", a.lastContact, a.outcomeStatus||"", a.denialCode||""]);
      rows = [headers, ...data];
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const totalWIP = (role === "cfo" ? dnfbFiltered : current).reduce((s,a) => s + a.amount, 0);
  const totalARVal = (role === "cfo" ? arFiltered : current).reduce((s,a) => s + a.amount, 0);
  const totalEV = (role === "cfo" ? arFiltered : current).reduce((s,a) => s + a.expectedValue, 0);
  const totalDnfbVal = (role === "cfo" ? dnfbFiltered : current).reduce((s,a) => s + a.amount, 0);
  const totalDnfbEV = (role === "cfo" ? dnfbFiltered : current).reduce((s,a) => s + a.expectedValue, 0);
  const critCount = (role === "cfo" ? arFiltered : current).filter(a => a.cfg.severity === "CRITICAL").length;

  const runAI = async () => {
    setAiLoading(true);
    const baseAR = role === "cfo" ? arFiltered : current;
    const baseDNFB = role === "cfo" ? dnfbFiltered : current;
    const byArea = {};
    baseDNFB.forEach(a => { byArea[a.area] = (byArea[a.area] || 0) + a.amount; });
    const topArea = Object.entries(byArea).sort((a,b) => b[1]-a[1])[0];
    const crits = baseAR.filter(a => a.cfg.severity === "CRITICAL");
    const woList = ESCALATION_DATA.writeOffPending.map(w => w.accountId + " " + fmt(w.amount)).join(", ");
    const critList = crits.slice(0,5).map(a => a.id + " · " + a.patient + " · " + a.payer + " · " + fmt(a.amount) + " · " + a.cfg.label + " · " + a.daysOut + " days").join("; ");
    const verticalCtx = CLIENT_CONFIG.verticalContext[CLIENT_CONFIG.vertical] || "";
    const siteCtx = siteFilter ? `Site filter active: ${siteFilter} only.` : `All ${[...new Set([...baseAR,...baseDNFB].map(a=>a.site))].length} sites.`;

    // Payer breakdown
    const payerBreakdown = Object.entries(
      baseAR.reduce((acc, a) => { const cat = PAYER_CATEGORY[a.payer] || "other"; acc[cat] = (acc[cat] || 0) + a.amount; return acc; }, {})
    ).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}: ${fmt(v)}`).join(", ");

    // Area breakdown for DNFB
    const areaBreakdown = Object.entries(byArea).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}: ${fmt(v)}`).join(", ");

    // Denial summary
    const deniedAccounts = baseAR.filter(a => a.denialCode);
    const denialRate = baseAR.length > 0 ? Math.round(deniedAccounts.length / baseAR.length * 100) : 0;

    // WorkLink summary
    const openWL = worklinks.filter(w => w.status === "open").length;
    const breachedWL = worklinks.filter(w => w.status === "open" && new Date() > w.slaDue).length;

    const prompt = `You are a healthcare revenue cycle expert advising a CFO. ${verticalCtx} ${siteCtx}

Return ONLY a valid JSON object with exactly these four keys: status, priorities, risks, decisions. No markdown, no code fences. Raw JSON only.

PORTFOLIO DATA:
- Total AR (billed): ${fmt(totalARVal)} across ${baseAR.length} accounts
- Total DNFB (unbilled): ${fmt(totalWIP)} across ${baseDNFB.length} accounts  
- Expected Recovery (EV): ${fmt(totalEV)} (${Math.round(totalEV / Math.max(totalARVal, 1) * 100)}% NCR)
- Critical holds: ${critCount} accounts
- Denial rate: ${denialRate}% (${deniedAccounts.length} of ${baseAR.length} accounts)
- Open WorkLink requests: ${openWL} (${breachedWL} SLA breached)
- Write-offs pending CFO approval: ${woList || "none"}

PAYER MIX (AR): ${payerBreakdown}
DNFB BY AREA: ${areaBreakdown}
TOP CRITICAL ACCOUNTS: ${critList || "none"}

Return JSON with:
{
  "status": "2-3 sentence executive summary of portfolio health, NCR performance, and biggest operational issue",
  "priorities": ["3 specific priority actions, each naming the account ID or area, dollar amount, and exact next step", "...", "..."],
  "risks": ["3 specific risk flags with dollar exposure quantified where possible", "...", "..."],
  "decisions": ["1-2 specific items requiring CFO decision or approval with context and recommended action"]
}`;

    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      if (!res.ok) {
        setAiText({ status: `API error ${res.status}: ${data.error || "Unknown error"}`, priorities: [], risks: [], decisions: [] });
        setAiLoading(false);
        return;
      }
      const raw = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "{}";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      try {
        setAiText(JSON.parse(cleaned));
      } catch {
        setAiText({ status: raw.slice(0, 500), priorities: [], risks: [], decisions: [] });
      }
    } catch (err) {
      console.error("AI summary error:", err);
      setAiText({ status: "AI analysis temporarily unavailable — check that ANTHROPIC_API_KEY is set in Vercel environment variables.", priorities: [], risks: [], decisions: [] });
    }
    setAiLoading(false);
  };

  // ─── Notification Tray ──────────────────────────────────────────────────────
  const notifications = useMemo(() => {
    const items = [];
    // SLA breaches — per-WorkLink, role-navigable
    const breached = worklinks.filter(w => w.status === "open" && new Date() > w.slaDue);
    breached.forEach(w => items.push({ id: `sla-${w.id}`, type: "sla", urgency: "critical", title: "WorkLink SLA breached", body: `${w.requestLabel} → ${w.targetArea} · ${w.patient} · ${fmt(w.expectedValue)} EV`, tab: "worklink", role: "supervisor" }));
    // Service-date urgent WorkLinks
    const sdUrgent = worklinks.filter(w => w.status === "open" && w.isServiceDateSLA && w.slaHrs < 4);
    sdUrgent.forEach(w => items.push({ id: `sd-${w.id}`, type: "sla", urgency: "critical", title: `SERVICE DATE URGENT — ${w.targetArea}`, body: `${w.patient} · service ${w.serviceDate} · deadline in ${w.slaHrs < 1 ? "<1hr" : `${w.slaHrs}hr`}`, tab: "worklink", role: null }));
    // Critical holds
    const crits = arForRole.filter(a => a.cfg?.severity === "CRITICAL");
    if (crits.length > 0) items.push({ id: "crits", type: "critical", urgency: "critical", title: `${crits.length} critical hold${crits.length > 1 ? "s" : ""}`, body: `${fmt(crits.reduce((s,a)=>s+a.amount,0))} at risk · immediate action required`, tab: "metrics", role: "cfo" });
    // Timely filing risk
    const filingRisk = arForRole.filter(a => (120 - (a.daysOut||0)) < 14 && (120 - (a.daysOut||0)) >= 0);
    if (filingRisk.length > 0) items.push({ id: "filing", type: "filing", urgency: "high", title: `${filingRisk.length} account${filingRisk.length > 1 ? "s" : ""} near timely filing deadline`, body: `${fmt(filingRisk.reduce((s,a)=>s+a.amount,0))} at risk of permanent loss · switch to Triage sort`, tab: "ar", role: null });
    // Write-offs pending
    const wo = ESCALATION_DATA.writeOffPending;
    if (wo.length > 0) items.push({ id: "writeoffs", type: "writeoff", urgency: "high", title: `${wo.length} write-off${wo.length > 1 ? "s" : ""} pending approval`, body: `${fmt(wo.reduce((s,w)=>s+w.amount,0))} · Supervisor then CFO approval`, tab: "escalation", role: "supervisor" });
    // Open WorkLinks — live count, always shown
    const openWL = worklinks.filter(w => w.status === "open");
    if (openWL.length > 0) items.push({ id: `wl-open-${openWL.length}`, type: "worklink", urgency: "medium", title: `${openWL.length} open WorkLink request${openWL.length > 1 ? "s" : ""}`, body: `${fmt(openWL.reduce((s,w)=>s+w.expectedValue,0))} EV pending cross-area resolution`, tab: "worklink", role: null });
    return items;
  }, [worklinks, arForRole]);

  const markRead = (id) => {
    setReadNotifications(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const markAllRead = () => setReadNotifications(new Set(notifications.map(n => n.id)));
  const unreadCount = notifications.filter(n => !readNotifications.has(n.id)).length;
  const urgencyColor = { critical: "#dc2626", high: "#d97706", medium: "#2563eb" };
  const urgencyBg = { critical: "#fee2e2", high: "#fef3c7", medium: "#eff6ff" };
  const urgencyIcon = { critical: "🔴", high: "🟠", medium: "🔵" };

  const seg = (label, val) => (
    <button onClick={() => setRoleAndPersist(val)} style={{ padding: "6px 14px", cursor: "pointer", fontSize: 11, fontWeight: role === val ? 600 : 400, border: "none", borderRadius: 6, fontFamily: "inherit", background: role === val ? "#2563eb" : "transparent", color: role === val ? "#fff" : "#64748b" }}>{label}</button>
  );

  const tabStyle = active => ({ padding: "12px 20px", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, border: "none", borderBottom: active ? "2px solid #2563eb" : "2px solid transparent", background: "transparent", color: active ? "#2563eb" : "#64748b", fontFamily: "inherit" });

  const isSelfPayMode = roleConfig?.mode === "self_pay";
  const isCollectorMode = roleConfig?.mode === "collector" || roleConfig?.mode === "medicare_bc";
  const isAreaMode = roleConfig?.mode === "area";
  if (isSelfPayMode) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: "#0f766e", padding: isMobile ? "12px 16px" : "14px 32px", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: isMobile ? 8 : 0 }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>D4 Consulting Group</div>
            <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#fff" }}>Self-Pay Specialist <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginLeft: 8, background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 10 }}>Patient Accounts</span></div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {!isMobile && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.15)", padding: "4px 12px", borderRadius: 6 }}>⚖️ FDCPA Active</span>}
            {!isMobile && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.15)", padding: "4px 12px", borderRadius: 6 }}>🔒 30-Day Hold Enforced</span>}
            <button onClick={() => setRole("commercial_collector")} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, padding: "4px 12px", fontFamily: "inherit" }}>Switch role</button>
          </div>
        </div>
        <div style={{ background: "#f0fdfa", borderBottom: "1px solid #99f6e4", padding: "8px 32px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#0f766e", fontWeight: 600 }}>Patient Account Queue</span>
          <span style={{ fontSize: 11, color: "#64748b" }}>· {SP_DATA.length} accounts · sorted by expected value · first contact must be written statement</span>
        </div>
        <SelfPayView />
      </div>
    );
  }
  if (isCollectorMode) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
        {/* Unified header — same as CFO/Supervisor */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "10px 16px" : "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>D4 Consulting Group</div>
            <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#0f172a" }}>WIP Intelligence Platform <span style={{ fontSize: 11, color: "#2563eb", marginLeft: 6 }}>v2.1</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Notification bell */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowNotifications(s => !s)}
                style={{ background: showNotifications ? "#f1f5f9" : "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                <span style={{ fontSize: 16 }}>🔔</span>
                {unreadCount > 0 && (
                  <span style={{ background: notifications.some(n=>n.urgency==="critical" && !readNotifications.has(n.id)) ? "#dc2626" : "#d97706", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{unreadCount}</span>
                )}
              </button>
              {showNotifications && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 320, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Notifications {unreadCount > 0 && <span style={{ fontSize: 10, color: "#2563eb", fontWeight: 400, marginLeft: 4 }}>{unreadCount} unread</span>}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {unreadCount > 0 && <button onClick={() => markAllRead()} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 10 }}>Mark all read</button>}
                      <button onClick={() => setShowNotifications(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>✕</button>
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "#94a3b8" }}>No active notifications</div>
                  ) : notifications.map(n => (
                    <div key={n.id} onClick={() => { markRead(n.id); setShowNotifications(false); if (n.role) setRoleAndPersist(n.role); if (n.tab) setTab(n.tab); }}
                      style={{ padding: "12px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: urgencyBg[n.urgency] + "40", display: "flex", gap: 10 }}
                      onMouseEnter={e => e.currentTarget.style.background = urgencyBg[n.urgency]}
                      onMouseLeave={e => e.currentTarget.style.background = urgencyBg[n.urgency] + "40"}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{urgencyIcon[n.urgency]}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: urgencyColor[n.urgency], marginBottom: 2 }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{n.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Role switcher */}
            {!showRoleSwitcher ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Current role</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{roleConfig.label}</div>
                </div>
                <button onClick={() => setShowRoleSwitcher(true)}
                  style={{ padding: "7px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, color: "#475569", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit" }}>
                  Switch role ↓
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <div style={{ display: "flex", gap: isMobile ? 4 : 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Collectors &amp; Billers</div>
                    <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {seg("Commercial", "commercial_collector")}
                      {seg("Medicare Part B", "medicare_bc")}
                      {seg("Medicaid", "medicaid")}
                      {seg("Self-Pay", "self_pay")}
                      {seg("WC", "wc")}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Area Worklists</div>
                    <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {seg("Auth", "authorization")}
                      {seg("Charge", "charge_capture")}
                      {seg("Coder", "coder")}
                      {seg("HIM", "him")}
                      {seg("Billing", "billing_scrubber")}
                      {seg("Cred", "credentialing")}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Management</div>
                    <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
                      {seg("Supervisor", "supervisor")}
                      {seg("CFO", "cfo")}
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowRoleSwitcher(false)}
                  style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
                  ↑ collapse
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "8px 16px" : "10px 32px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>{roleConfig?.label} — {roleConfig?.mode === "medicare_bc" ? "Unified DNFB + AR" : "Collections Queue"}</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>· {arForRole.length} accounts · sorted by expected value</span>
        </div>
        <CollectorView arScored={arForRole} dnfbScored={dnfbForRole} isMedicareBc={roleConfig?.mode === "medicare_bc"} worklinks={worklinks} onWorkLink={handleSendWorklink} />
      </div>
    );
  }

  if (isAreaMode) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
        {/* Unified header */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "10px 16px" : "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>D4 Consulting Group</div>
            <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#0f172a" }}>WIP Intelligence Platform <span style={{ fontSize: 11, color: "#2563eb", marginLeft: 6 }}>v2.1</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Notification bell */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowNotifications(s => !s)}
                style={{ background: showNotifications ? "#f1f5f9" : "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                <span style={{ fontSize: 16 }}>🔔</span>
                {unreadCount > 0 && (
                  <span style={{ background: notifications.some(n=>n.urgency==="critical" && !readNotifications.has(n.id)) ? "#dc2626" : "#d97706", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{unreadCount}</span>
                )}
              </button>
              {showNotifications && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 320, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Notifications {unreadCount > 0 && <span style={{ fontSize: 10, color: "#2563eb", fontWeight: 400, marginLeft: 4 }}>{unreadCount} unread</span>}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {unreadCount > 0 && <button onClick={() => markAllRead()} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 10 }}>Mark all read</button>}
                      <button onClick={() => setShowNotifications(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>✕</button>
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "#94a3b8" }}>No active notifications</div>
                  ) : notifications.map(n => (
                    <div key={n.id} onClick={() => { markRead(n.id); setShowNotifications(false); if (n.role) setRoleAndPersist(n.role); if (n.tab) setTab(n.tab); }}
                      style={{ padding: "12px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: urgencyBg[n.urgency] + "40", display: "flex", gap: 10 }}
                      onMouseEnter={e => e.currentTarget.style.background = urgencyBg[n.urgency]}
                      onMouseLeave={e => e.currentTarget.style.background = urgencyBg[n.urgency] + "40"}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{urgencyIcon[n.urgency]}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: urgencyColor[n.urgency], marginBottom: 2 }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{n.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Role switcher */}
            {!showRoleSwitcher ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Current role</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{roleConfig.label}</div>
                </div>
                <button onClick={() => setShowRoleSwitcher(true)}
                  style={{ padding: "7px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, color: "#475569", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit" }}>
                  Switch role ↓
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Collectors</div>
                    <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {seg("Commercial", "commercial_collector")}
                      {seg("Medicare", "medicare_bc")}
                      {seg("Medicaid", "medicaid")}
                      {seg("Self-Pay", "self_pay")}
                      {seg("WC", "wc")}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Area Worklists</div>
                    <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {seg("Auth", "authorization")}
                      {seg("Charge", "charge_capture")}
                      {seg("Coder", "coder")}
                      {seg("HIM", "him")}
                      {seg("Billing", "billing_scrubber")}
                      {seg("Cred", "credentialing")}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Management</div>
                    <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
                      {seg("Supervisor", "supervisor")}
                      {seg("CFO", "cfo")}
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowRoleSwitcher(false)}
                  style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
                  ↑ collapse
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "8px 16px" : "10px 32px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{roleConfig.label}</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>DNFB holds + WorkLink requests · sorted by expected value</span>
          {worklinks.filter(w => w.targetArea === roleConfig.area && w.status === "open").length > 0 && (
            <span style={{ background: "#0369a1", color: "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>
              {worklinks.filter(w => w.targetArea === roleConfig.area && w.status === "open").length} WorkLink
            </span>
          )}
        </div>
        <AreaWorklist area={roleConfig.area} dnfbScored={dnfbForRole} worklinks={worklinks} onResolve={handleResolveWorklink} onReturn={handleReturnWorklink} onWorkLink={handleSendWorklink} />
        <div style={{ borderTop: "1px solid #e2e8f0", padding: isMobile ? "12px 16px" : "14px 32px", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#cbd5e1" }}>
          <span>D4 Consulting Group — Proprietary</span>
          {!isMobile && <span>WIP Intelligence Platform v2.1 · Human-in-the-loop · Phase 1 Internal</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "10px 16px" : "14px 32px", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: isMobile ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>D4 Consulting Group</div>
          <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#0f172a" }}>WIP Intelligence Platform <span style={{ fontSize: 11, color: "#2563eb", marginLeft: 6 }}>v2.1</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Notification bell */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowNotifications(s => !s)}
              style={{ background: showNotifications ? "#f1f5f9" : "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              {notifications.length > 0 && (
                <span style={{ background: notifications.some(n=>n.urgency==="critical") ? "#dc2626" : "#d97706", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 10, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{notifications.length}</span>
              )}
            </button>
            {showNotifications && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 340, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Notifications</span>
                  <button onClick={() => setShowNotifications(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "#94a3b8" }}>No active notifications</div>
                ) : notifications.map(n => (
                  <div key={n.id} onClick={() => { markRead(n.id); setShowNotifications(false); if (n.role) setRoleAndPersist(n.role); if (n.tab) setTab(n.tab); }}
                    style={{ padding: "12px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: urgencyBg[n.urgency] + "40", display: "flex", gap: 10, alignItems: "flex-start" }}
                    onMouseEnter={e => e.currentTarget.style.background = urgencyBg[n.urgency]}
                    onMouseLeave={e => e.currentTarget.style.background = urgencyBg[n.urgency] + "40"}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{urgencyIcon[n.urgency]}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: urgencyColor[n.urgency], marginBottom: 2 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{n.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collapsed role display */}
          {!showRoleSwitcher ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Current role</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{roleConfig.label}</div>
              </div>
              <button onClick={() => setShowRoleSwitcher(true)}
                style={{ padding: "7px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, color: "#475569", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit" }}>
                Switch role ↓
              </button>
            </div>
          ) : (
            /* Expanded role switcher */
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <div style={{ display: "flex", gap: isMobile ? 4 : 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Collectors &amp; Billers</div>
                  <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                    {seg("Biller", "biller")}
                    {seg("Commercial", "commercial_collector")}
                    {!isMobile && seg("Medicare Part B", "medicare_bc")}
                    {isMobile && seg("Medicare", "medicare_bc")}
                    {seg("Medicaid", "medicaid")}
                    {seg("Self-Pay", "self_pay")}
                    {seg("WC", "wc")}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Area Worklists</div>
                  <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                    {seg("Auth", "authorization")}
                    {seg("Charge", "charge_capture")}
                    {seg("Coder", "coder")}
                    {seg("HIM", "him")}
                    {seg("Billing", "billing_scrubber")}
                    {seg("Cred", "credentialing")}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Management</div>
                  <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
                    {seg("Supervisor", "supervisor")}
                    {seg("CFO", "cfo")}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowRoleSwitcher(false)}
                style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
                ↑ collapse
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "0 12px" : "0 32px", display: isMobile ? "none" : "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex" }}>
          {/* Supervisor: Act Now first (escalation + SLA breaches) */}
          {role === "supervisor" && (
            <button style={{...tabStyle(tab === "escalation"), color: tab === "escalation" ? "#dc2626" : "#64748b", borderBottomColor: tab === "escalation" ? "#dc2626" : "transparent"}} onClick={() => { setTab("escalation"); setAreaFilter(null); setSearchQuery(""); }}>
              ⚡ Act Now <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700, marginLeft: 4 }}>{ESCALATION_DATA.escalated.length + ESCALATION_DATA.slaBreach.length}</span>
            </button>
          )}
          {/* CFO: Dashboard */}
          {role === "cfo" && (
            <button style={tabStyle(tab === "metrics")} onClick={() => { setTab("metrics"); setSeverityFilter(null); setActiveTier(null); setAreaFilter(null); }}>Dashboard</button>
          )}
          {(role === "supervisor" || role === "cfo") && (
            <button style={tabStyle(tab === "dnfb")} onClick={() => { setTab("dnfb"); setAreaFilter(null); setSeverityFilter(null); setActiveTier(null); setSearchQuery(""); setAiText(null); }}>Billing WIP ({dnfbForRole.length})</button>
          )}
          {role !== "biller" && role !== "cfo" && (
            <button style={tabStyle(tab === "ar")} onClick={() => { setTab("ar"); setAreaFilter(null); setSeverityFilter(null); setSearchQuery(""); setAiText(null); }}>Collections WIP ({arForRole.length})</button>
          )}
          {role === "cfo" && (
            <button style={tabStyle(tab === "ar")} onClick={() => { setTab("ar"); setAreaFilter(null); setSeverityFilter(null); setSearchQuery(""); setAiText(null); }}>Collections WIP ({arForRole.length})</button>
          )}
          {role === "biller" && (
            <button style={tabStyle(tab === "dnfb")} onClick={() => { setTab("dnfb"); setAreaFilter(null); setSeverityFilter(null); setActiveTier(null); setSearchQuery(""); setAiText(null); }}>Billing WIP ({dnfbForRole.length})</button>
          )}
          {role === "supervisor" && (
            <button onClick={() => setTab("worklink")} style={{ ...tabStyle(tab === "worklink"), color: tab === "worklink" ? "#0369a1" : "#64748b", borderBottomColor: tab === "worklink" ? "#0369a1" : "transparent" }}>
              WorkLink
              {worklinks.filter(w => w.status === "open").length > 0 && (
                <span style={{ background: "#0369a1", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700, marginLeft: 6 }}>{worklinks.filter(w => w.status === "open").length}</span>
              )}
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ fontSize: 10, color: "#94a3b8" }}>LIVE</span>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e2e8f0", display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {role === "cfo" && (
            <button onClick={() => setTab("metrics")} style={{ flex: 1, padding: "12px 4px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="9" width="4" height="8" rx="1" fill={tab === "metrics" ? "#2563eb" : "#94a3b8"}/><rect x="7" y="5" width="4" height="12" rx="1" fill={tab === "metrics" ? "#2563eb" : "#94a3b8"}/><rect x="13" y="1" width="4" height="16" rx="1" fill={tab === "metrics" ? "#2563eb" : "#94a3b8"}/></svg>
              <span style={{ fontSize: 9, fontWeight: tab === "metrics" ? 600 : 400, color: tab === "metrics" ? "#2563eb" : "#94a3b8" }}>Metrics</span>
            </button>
          )}
          {(role === "supervisor" || role === "cfo" || role === "biller") && (
            <button onClick={() => { setTab("dnfb"); setAreaFilter(null); setSeverityFilter(null); setActiveTier(null); setSearchQuery(""); setAiText(null); }} style={{ flex: 1, padding: "12px 4px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="16" height="3" rx="1" fill={tab === "dnfb" ? "#1d4ed8" : "#94a3b8"}/><rect x="1" y="6" width="11" height="3" rx="1" fill={tab === "dnfb" ? "#1d4ed8" : "#94a3b8"}/><rect x="1" y="11" width="14" height="3" rx="1" fill={tab === "dnfb" ? "#1d4ed8" : "#94a3b8"}/></svg>
              <span style={{ fontSize: 9, fontWeight: tab === "dnfb" ? 600 : 400, color: tab === "dnfb" ? "#1d4ed8" : "#94a3b8" }}>Billing</span>
            </button>
          )}
          {(role !== "biller") && (
            <button onClick={() => { setTab("ar"); setAreaFilter(null); setSeverityFilter(null); setSearchQuery(""); setAiText(null); }} style={{ flex: 1, padding: "12px 4px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke={tab === "ar" ? "#c2410c" : "#94a3b8"} strokeWidth="1.5"/><path d="M9 5v4l3 2" stroke={tab === "ar" ? "#c2410c" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 9, fontWeight: tab === "ar" ? 600 : 400, color: tab === "ar" ? "#c2410c" : "#94a3b8" }}>Collections</span>
            </button>
          )}
          {role === "supervisor" && (
            <button onClick={() => { setTab("escalation"); setAreaFilter(null); setSearchQuery(""); }} style={{ flex: 1, padding: "12px 4px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1L11 7h6L12 11l2 6L9 14l-5 3 2-6L1 7h6L9 1z" fill={tab === "escalation" ? "#dc2626" : "#94a3b8"}/></svg>
              <span style={{ fontSize: 9, fontWeight: tab === "escalation" ? 600 : 400, color: tab === "escalation" ? "#dc2626" : "#94a3b8" }}>Act Now</span>
              <span style={{ position: "absolute", top: 8, right: "calc(50% - 14px)", background: "#dc2626", color: "#fff", borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700 }}>{ESCALATION_DATA.escalated.length + ESCALATION_DATA.slaBreach.length}</span>
            </button>
          )}
        </div>
      )}

      {(tab === "escalation" && role === "supervisor") || (tab === "metrics" && role === "cfo" && false) ? null : null}
      {tab === "escalation" && role === "supervisor" && (
        <EscalationQueue arScored={arForRole} dnfbScored={dnfbForRole} />
      )}
      {tab === "worklink" && role === "supervisor" && (
        <div style={{ padding: isMobile ? "16px 12px 80px" : "24px 32px" }}>
          <WorkLinkReporting worklinks={worklinks} isMobile={isMobile} />
          <WorkLinkQueue worklinks={worklinks} onResolve={handleResolveWorklink} onReturn={handleReturnWorklink} />
        </div>
      )}
      {tab !== "escalation" && tab !== "worklink" && (
      <div style={{ padding: isMobile ? "16px 12px 80px" : isTablet ? "20px 20px" : "24px 32px" }}>
        {role === "cfo" && tab === "metrics" ? (
          <div>
            {/* Site filter */}
            {(() => {
              const sites = [...new Set([...dnfbForRole, ...arForRole].map(a => a.site))].sort((a,b) => parseInt(a.replace(/\D/g,"")) - parseInt(b.replace(/\D/g,"")));
              const siteStats = sites.map(s => {
                const siteAR = arForRole.filter(a => a.site === s);
                const siteDNFB = dnfbForRole.filter(a => a.site === s);
                const totalAR = siteAR.reduce((sum,a) => sum+a.amount, 0);
                const totalDNFB = siteDNFB.reduce((sum,a) => sum+a.amount, 0);
                const totalExposure = totalAR + totalDNFB;
                const totalEV = siteAR.reduce((sum,a) => sum+a.expectedValue, 0);
                const avgDays = totalAR > 0 ? Math.round(siteAR.reduce((s,a) => s+a.daysOut*a.amount, 0) / totalAR) : 0;
                const npr = avgDays > 0 ? Math.round(totalAR / avgDays * 365 * 0.82) : 0;
                const ncr = npr > 0 ? Math.round(totalEV / npr * 100) : 0;
                const deniedCount = siteAR.filter(a => a.denialCode !== null).length;
                const denialRate = siteAR.length > 0 ? Math.round(deniedCount / siteAR.length * 100) : 0;
                const openWL = worklinks.filter(w => w.status==="open" && [...siteAR,...siteDNFB].some(a => a.id===w.accountId)).length;
                return { site: s, npr, totalAR, totalDNFB, totalExposure, totalEV, avgDays, ncr, denialRate, openWL };
              });
              const siteStatsTableSorted = [...siteStats].sort((a,b) => b.totalEV - a.totalEV);
              const cols9 = "90px repeat(8, 1fr)";

              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
                  {/* Filter chip bar — always visible at top */}
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", background: "#f8fafc" }}>
                    <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0, marginRight: 2 }}>Site:</span>
                    <button onClick={() => setSiteFilter(null)}
                      style={{ padding: "3px 10px", fontSize: 11, fontWeight: siteFilter===null ? 700 : 400, border: `1px solid ${siteFilter===null ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: siteFilter===null ? "#2563eb" : "#fff", color: siteFilter===null ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
                      All
                    </button>
                    {siteStats.map(s => (
                      <button key={s.site} onClick={() => setSiteFilter(siteFilter===s.site ? null : s.site)}
                        style={{ padding: "3px 10px", fontSize: 11, fontWeight: siteFilter===s.site ? 700 : 400, border: `1px solid ${siteFilter===s.site ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: siteFilter===s.site ? "#2563eb" : "#fff", color: siteFilter===s.site ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
                        {s.site}
                      </button>
                    ))}
                    {siteFilter && (
                      <button onClick={() => setSiteFilter(null)} style={{ marginLeft: "auto", fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>✕ clear</button>
                    )}
                  </div>
                  {/* Site performance table — visible in All Sites mode only, desktop only */}
                  {!siteFilter && !isMobile && (
                    <div style={{ overflowX: "auto" }}>
                      {/* Header */}
                      <div style={{ display: "grid", gridTemplateColumns: cols9, minWidth: 820, fontSize: 9, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase", padding: "7px 16px", background: "#f8fafc", borderTop: "1px solid #f1f5f9" }}>
                        <span>Site</span>
                        <span style={{ textAlign:"right" }}>NPR (est.)</span>
                        <span style={{ textAlign:"right" }}>Total AR</span>
                        <span style={{ textAlign:"right" }}>DNFB</span>
                        <span style={{ textAlign:"right" }}>Total Exposure</span>
                        <span style={{ textAlign:"right" }}>EV</span>
                        <span style={{ textAlign:"right" }}>AR Days</span>
                        <span style={{ textAlign:"right" }}>NCR</span>
                        <span style={{ textAlign:"right" }}>Denial Rate</span>
                      </div>
                      {/* Rows */}
                      {siteStatsTableSorted.map(s => {
                        const daysColor = s.avgDays < 40 ? "#16a34a" : s.avgDays < 55 ? "#2563eb" : s.avgDays < 65 ? "#d97706" : "#dc2626";
                        const ncrColor = s.ncr >= 95 ? "#16a34a" : s.ncr >= 85 ? "#d97706" : "#dc2626";
                        const denialColor = s.denialRate <= 5 ? "#16a34a" : s.denialRate <= 10 ? "#d97706" : "#dc2626";
                        return (
                          <div key={s.site} onClick={() => setSiteFilter(s.site)}
                            style={{ display: "grid", gridTemplateColumns: cols9, minWidth: 820, padding: "7px 16px", cursor: "pointer", borderTop: "1px solid #f8fafc", background: "transparent", alignItems: "center" }}
                            onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                            onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                            <span style={{ fontSize: 11, color: "#0f172a", fontWeight: 600 }}>{s.site}</span>
                            <span style={{ fontSize: 11, color: "#475569", textAlign:"right" }}>{fmt(s.npr)}</span>
                            <span style={{ fontSize: 11, color: "#475569", textAlign:"right" }}>{fmt(s.totalAR)}</span>
                            <span style={{ fontSize: 11, color: "#64748b", textAlign:"right" }}>{fmt(s.totalDNFB)}</span>
                            <span style={{ fontSize: 11, color: "#334155", fontWeight: 600, textAlign:"right" }}>{fmt(s.totalExposure)}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", textAlign:"right" }}>{fmt(s.totalEV)}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: daysColor, textAlign:"right" }}>{s.avgDays}d</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: ncrColor, textAlign:"right" }}>{s.ncr}%</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: denialColor, textAlign:"right" }}>{s.denialRate}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Active site context when filtered */}
                  {siteFilter && (
                    <div style={{ padding: "7px 16px", fontSize: 11, color: "#2563eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid #f1f5f9" }}>
                      <span>📍 Showing: {siteFilter}</span>
                      {(() => {
                        const s = siteStats.find(x => x.site === siteFilter);
                        if (!s) return null;
                        const daysColor = s.avgDays < 40 ? "#16a34a" : s.avgDays < 55 ? "#2563eb" : s.avgDays < 65 ? "#d97706" : "#dc2626";
                        const ncrColor = s.ncr >= 95 ? "#16a34a" : s.ncr >= 85 ? "#d97706" : "#dc2626";
                        return (
                          <span style={{ fontWeight: 400, color: "#64748b", fontSize: 11 }}>
                            · NPR {fmt(s.npr)} · AR {fmt(s.totalAR)} · DNFB {fmt(s.totalDNFB)} · EV <span style={{ color: "#2563eb", fontWeight: 600 }}>{fmt(s.totalEV)}</span> · AR Days <span style={{ color: daysColor, fontWeight: 600 }}>{s.avgDays}d</span> · NCR <span style={{ color: ncrColor, fontWeight: 600 }}>{s.ncr}%</span> · Denial <span style={{ color: s.denialRate <= 5 ? "#16a34a" : s.denialRate <= 10 ? "#d97706" : "#dc2626", fontWeight: 600 }}>{s.denialRate}%</span>
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })()}

            <CFOCriticalHolds accounts={arFiltered} />
            {/* Headline KPIs */}
            {(() => {
              const grossAR = arFiltered.reduce((s,a) => s+a.amount, 0);
              const arDays = grossAR > 0 ? Math.round(arFiltered.reduce((s,a) => s + a.amount * a.daysOut, 0) / grossAR) : 0;
              const annualNPR = arDays > 0 ? Math.round(grossAR / arDays * 365 * 0.82) : 0;
              const arDaysColor = arDays < 40 ? "#16a34a" : arDays < 55 ? "#2563eb" : arDays < 65 ? "#d97706" : "#dc2626";
              const arDaysLabel = arDays < 40 ? "Excellent" : arDays < 55 ? "Good" : arDays < 65 ? "Needs attention" : "Critical";
              return (
                <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 12 }}>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Net Patient Revenue (est.)</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>{fmt(annualNPR)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Annualized · 82% net revenue factor · from accounting system in production{siteFilter ? ` · ${siteFilter}` : ""}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Total AR</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>{fmt(grossAR)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{arFiltered.length} billed accounts{siteFilter ? ` · ${siteFilter}` : ""}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>AR Days Outstanding</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: arDaysColor, letterSpacing: "-0.02em" }}>{arDays}</div>
                      <div style={{ fontSize: 13, color: arDaysColor, fontWeight: 600 }}>days</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Dollar-weighted average age · &lt;40 excellent, &lt;55 good, &lt;65 watch</div>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const groups = {
                Medicare:   { label: "Medicare",    accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "medicare") },
                Commercial: { label: "Commercial",  accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "commercial") },
                Medicaid:   { label: "Medicaid",    accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "medicaid") },
                "Worker Comp": { label: "Worker's Comp", accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "workers_comp") },
              };
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Expected recovery by payer group</div>
                    {!isMobile && <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10, color: "#64748b" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />On target</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d97706", display: "inline-block" }} />&lt;10pp below</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />&gt;10pp below</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 2, height: 12, background: "#0f172a", display: "inline-block", borderRadius: 1 }} />Benchmark min</span>
                    </div>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: cols("repeat(4, 1fr)", "repeat(2, 1fr)", "1fr"), gap: 12 }}>
                    {Object.entries(groups).map(([key, g]) => {
                      const bal = g.accounts.reduce((s,a) => s+a.amount, 0);
                      const ev = g.accounts.reduce((s,a) => s+a.expectedValue, 0);
                      const rate = bal > 0 ? Math.round(ev/bal*100) : 0;
                      const bm = PAYER_BENCHMARKS[key] || { min: 70, max: 85 };
                      const gap = bm.min - rate;
                      const color = rate >= bm.min ? "#16a34a" : gap <= 10 ? "#d97706" : "#dc2626";
                      return (
                        <div key={key} style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{g.label}</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                            <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1 }}>{rate}%</div>
                            <div style={{ fontSize: 11, color, fontWeight: 600 }}>{rate >= bm.min ? "✓ On target" : ""}</div>
                          </div>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 8 }}>{fmt(ev)} recovered of {fmt(bal)}</div>
                          <div style={{ position: "relative", height: 6, background: "#e2e8f0", borderRadius: 3, marginBottom: 6 }}>
                            <div style={{ width: Math.min(rate, 100) + "%", height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
                            <div style={{ position: "absolute", left: "calc(" + bm.min + "% - 1px)", top: -3, width: 2, height: 12, background: "#0f172a", borderRadius: 1 }} />
                            <div style={{ position: "absolute", left: "calc(" + Math.min(bm.max, 99) + "% - 1px)", top: -1, width: 1, height: 8, background: "#94a3b8", borderRadius: 1 }} />
                          </div>
                          <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.04em" }}>Best practice: {bm.min}–{bm.max}%</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 12, fontStyle: "italic", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
                    Benchmark ranges represent industry best practice for well-managed AR portfolios. Rates reflect probability model on current data — calibrate to client historical AR for production accuracy.
                  </div>
                </div>
              );
            })()}

            {/* Billing WIP + Billing Donut + Follow-up WIP + Follow-up Donut — all one row */}
            <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr 1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 12 }}>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 10, color: "#1d4ed8", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Billing WIP — DNFB</div>
                {(() => {
                  const tiers = [
                    { label: "Normal (1–3 days)", key: "normal", accs: dnfbFiltered.filter(a => a.daysInDNFB <= 3), color: "#16a34a" },
                    { label: "Watch (3–5 days)",  key: "watch",  accs: dnfbFiltered.filter(a => a.daysInDNFB > 3 && a.daysInDNFB < 6), color: "#d97706" },
                    { label: "Flag (6+ days)",    key: "flag",   accs: dnfbFiltered.filter(a => a.daysInDNFB >= 6), color: "#dc2626" },
                  ];
                  return tiers.map((t, i) => (
                    <div key={t.key} onClick={() => { setTab("dnfb"); setActiveTier(t.key); setAreaFilter(null); setSearchQuery(""); window.scrollTo(0,0); }}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", marginBottom: 4, borderRadius: 6, cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = t.color + "10"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>{t.label}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{t.accs.length} accts</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{fmt(t.accs.reduce((s,a) => s+a.amount, 0))}</span>
                      </div>
                    </div>
                  ));
                })()}
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 6, paddingTop: 6, borderTop: "1px solid #f1f5f9" }}>Total unbilled: {fmt(dnfbFiltered.reduce((s,a) => s+a.amount, 0))} · {dnfbFiltered.length} accounts{siteFilter ? " — " + siteFilter : ""}</div>
              </div>
              <DonutChartPanel accounts={dnfbFiltered} title="Billing WIP by responsible area" onFilter={(area) => { setTab("dnfb"); setAreaFilter(area); setSeverityFilter(null); setSearchQuery(""); window.scrollTo(0,0); }} activeFilter={null} />
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 10, color: "#c2410c", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Follow-up WIP — Collections</div>
                {(() => {
                  const pastDue = arFiltered.filter(a => !workedIdSet.has(a.id)); // unworked in platform
                  const tiers = [
                    { label: "$10K+",    key: "followup_high", accs: pastDue.filter(a => a.amount >= 10000), color: "#b91c1c" },
                    { label: "$1K–$10K", key: "followup_mid",  accs: pastDue.filter(a => a.amount >= 1000 && a.amount < 10000), color: "#c2410c" },
                    { label: "<$1K",     key: "followup_low",  accs: pastDue.filter(a => a.amount < 1000), color: "#64748b" },
                  ];
                  return tiers.map((t, i) => (
                    <div key={t.key} onClick={() => { setTab("ar"); setSeverityFilter(t.key); setAreaFilter(null); setSearchQuery(""); window.scrollTo(0,0); }}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", marginBottom: 4, borderRadius: 6, cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = t.color + "10"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>{t.label}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{t.accs.length} accts</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{fmt(t.accs.reduce((s,a) => s+a.amount, 0))}</span>
                      </div>
                    </div>
                  ));
                })()}
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 6, paddingTop: 6, borderTop: "1px solid #f1f5f9" }}>Accounts &gt;21 days without contact · {arFiltered.filter(a => !workedIdSet.has(a.id)).length} unworked in platform</div>
              </div>
              <DonutChartPanel accounts={arFiltered.filter(a => !workedIdSet.has(a.id))} title="Collections WIP — past due by area" onFilter={(area) => { setTab("ar"); setAreaFilter(area); setSeverityFilter(null); setSearchQuery(""); window.scrollTo(0,0); }} activeFilter={null} />
            </div>
            {/* NCR + Denial Rate — CFO metrics tab only */}
            {(() => {
              const totalGrossAR = arFiltered.reduce((s,a) => s+a.amount, 0);
              const totalEV = arFiltered.reduce((s,a) => s+a.expectedValue, 0);
              const totalNPR = totalGrossAR * 0.82;
              const ncr = totalNPR > 0 ? Math.round(totalEV / totalNPR * 100) : 0;
              const ncrColor = ncr >= 95 ? "#16a34a" : ncr >= 85 ? "#d97706" : "#dc2626";
              const ncrLabel = ncr >= 95 ? "Excellent" : ncr >= 85 ? "Acceptable" : "Needs attention";
              const totalDenied = arFiltered.filter(a => a.denialCode !== null).length;
              const denialRate = arFiltered.length > 0 ? Math.round(totalDenied / arFiltered.length * 100) : 0;
              const deniedBalance = arFiltered.filter(a => a.denialCode !== null).reduce((s,a) => s+a.amount, 0);
              const denialBalanceRate = totalGrossAR > 0 ? Math.round(deniedBalance / totalGrossAR * 100) : 0;
              const denialColor = denialRate <= 5 ? "#16a34a" : denialRate <= 10 ? "#d97706" : "#dc2626";
              const denialLabel = denialRate <= 5 ? "Excellent" : denialRate <= 10 ? "Acceptable" : "Needs attention";
              return (
                <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 12 }}>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Net Collection Rate</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: ncrColor, letterSpacing: "-0.02em" }}>{ncr}%</div>
                      <div style={{ fontSize: 12, color: ncrColor, fontWeight: 600 }}>{ncrLabel}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>EV {fmt(totalEV)} of NPR {fmt(Math.round(totalNPR))}</div>
                    <div style={{ position: "relative", height: 5, background: "#f1f5f9", borderRadius: 3, marginBottom: 5 }}>
                      <div style={{ width: Math.min(ncr, 100) + "%", height: "100%", background: ncrColor, borderRadius: 3 }} />
                      <div style={{ position: "absolute", left: "calc(95% - 1px)", top: -3, width: 2, height: 11, background: "#0f172a", borderRadius: 1 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>Benchmark: &gt;95% excellent · EV ÷ Net Patient Revenue</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>First-Pass Denial Rate</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: denialColor, letterSpacing: "-0.02em" }}>{denialRate}%</div>
                      <div style={{ fontSize: 12, color: denialColor, fontWeight: 600 }}>{denialLabel}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{totalDenied} of {arFiltered.length} accounts · {fmt(deniedBalance)} denied balance ({denialBalanceRate}%)</div>
                    <div style={{ position: "relative", height: 5, background: "#f1f5f9", borderRadius: 3, marginBottom: 5 }}>
                      <div style={{ width: Math.min(denialRate * 4, 100) + "%", height: "100%", background: denialColor, borderRadius: 3 }} />
                      <div style={{ position: "absolute", left: "20%", top: -3, width: 2, height: 11, background: "#0f172a", borderRadius: 1 }} />
                      <div style={{ position: "absolute", left: "40%", top: -1, width: 1, height: 7, background: "#94a3b8", borderRadius: 1 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>Benchmark: &lt;5% excellent, &lt;10% acceptable · Denied claims ÷ total submitted</div>
                  </div>
                </div>
              );
            })()}

            {/* Bad Debt Rate */}
            {(() => {
              const writeOffs = ESCALATION_DATA.writeOffPending;
              const approvedWO = writeOffs.filter(w => w.approved);
              const woTotal = writeOffs.reduce((s,w) => s+w.amount, 0);
              const approvedTotal = approvedWO.reduce((s,w) => s+w.amount, 0);
              const totalARBal = arFiltered.reduce((s,a) => s+a.amount, 0);
              const grossCharges = totalARBal / 0.45; // synthetic gross charges estimate
              const badDebtRate = grossCharges > 0 ? Math.round(woTotal / grossCharges * 100 * 10) / 10 : 0;
              const bdColor = badDebtRate <= 2 ? "#16a34a" : badDebtRate <= 5 ? "#d97706" : "#dc2626";
              const bdLabel = badDebtRate <= 2 ? "Well-managed" : badDebtRate <= 5 ? "Acceptable" : "Needs attention";
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Bad Debt Rate</div>
                  <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr 1fr", "1fr 1fr 1fr", "1fr"), gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: bdColor, letterSpacing: "-0.02em", marginBottom: 4 }}>{badDebtRate}%</div>
                      <div style={{ fontSize: 12, color: bdColor, fontWeight: 600, marginBottom: 4 }}>{bdLabel}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Write-offs ÷ Gross Charges (est.)</div>
                      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>Benchmark: &lt;2% commercial · &lt;5% overall</div>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Write-Offs Pending</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{writeOffs.length}</div>
                      <div style={{ fontSize: 11, color: "#d97706", fontWeight: 600 }}>{fmt(woTotal)} pending CFO approval</div>
                    </div>
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Approved This Session</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{approvedWO.length}</div>
                      <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>{fmt(approvedTotal)} approved</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 8 }}>Gross charges estimated from AR balance ÷ 0.45 average net ratio. Phase 2: actual gross charges from billing system.</div>
                </div>
              );
            })()}
            {(() => {
              const ar90 = arFiltered.filter(a => a.daysOut > 90);
              const ar120 = arFiltered.filter(a => a.daysOut > 120);
              const totalAR = arFiltered.reduce((s,a) => s+a.amount, 0);
              const ar90Bal = ar90.reduce((s,a) => s+a.amount, 0);
              const ar120Bal = ar120.reduce((s,a) => s+a.amount, 0);
              const ar90Pct = totalAR > 0 ? Math.round(ar90Bal / totalAR * 100) : 0;
              const ar120Pct = totalAR > 0 ? Math.round(ar120Bal / totalAR * 100) : 0;
              const ar90Color = ar90Pct <= 10 ? "#16a34a" : ar90Pct <= 15 ? "#d97706" : "#dc2626";
              const ar120Color = ar120Pct <= 5 ? "#16a34a" : ar120Pct <= 10 ? "#d97706" : "#dc2626";
              return (
                <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 12 }}>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>AR Over 90 Days</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: ar90Color, letterSpacing: "-0.02em" }}>{ar90Pct}%</div>
                      <div style={{ fontSize: 12, color: ar90Color, fontWeight: 600 }}>{fmt(ar90Bal)}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{ar90.length} accounts · {fmt(ar90Bal)} of {fmt(totalAR)} total AR</div>
                    <div style={{ position: "relative", height: 5, background: "#f1f5f9", borderRadius: 3, marginBottom: 5 }}>
                      <div style={{ width: Math.min(ar90Pct * 4, 100) + "%", height: "100%", background: ar90Color, borderRadius: 3 }} />
                      <div style={{ position: "absolute", left: "40%", top: -3, width: 2, height: 11, background: "#0f172a", borderRadius: 1 }} />
                      <div style={{ position: "absolute", left: "60%", top: -1, width: 1, height: 7, background: "#94a3b8", borderRadius: 1 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>Benchmark: &lt;10% PE target · &lt;15% acceptable · &gt;90 days outstanding</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>AR Over 120 Days</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: ar120Color, letterSpacing: "-0.02em" }}>{ar120Pct}%</div>
                      <div style={{ fontSize: 12, color: ar120Color, fontWeight: 600 }}>{fmt(ar120Bal)}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{ar120.length} accounts · {fmt(ar120Bal)} of {fmt(totalAR)} total AR</div>
                    <div style={{ position: "relative", height: 5, background: "#f1f5f9", borderRadius: 3, marginBottom: 5 }}>
                      <div style={{ width: Math.min(ar120Pct * 8, 100) + "%", height: "100%", background: ar120Color, borderRadius: 3 }} />
                      <div style={{ position: "absolute", left: "40%", top: -3, width: 2, height: 11, background: "#0f172a", borderRadius: 1 }} />
                      <div style={{ position: "absolute", left: "80%", top: -1, width: 1, height: 7, background: "#94a3b8", borderRadius: 1 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>Benchmark: &lt;5% well-managed · &lt;10% acceptable · &gt;120 days outstanding</div>
                  </div>
                </div>
              );
            })()}

            {/* Self-Pay EV + Collection Rate */}
            {(() => {
              const spScored = SP_DATA.map(a => ({ ...a, ev: Math.round(a.prob / 100 * a.balance) }));
              const spTotalBal = spScored.reduce((s,a) => s+a.balance, 0);
              const spTotalEV = spScored.reduce((s,a) => s+a.ev, 0);
              const spCollected = spScored.filter(a => a.daysOut > 90).reduce((s,a) => s + Math.round(a.balance * 0.28), 0); // synthetic 28% collection
              const spCollRate = spTotalBal > 0 ? Math.round(spCollected / spTotalBal * 100) : 0;
              const spRateColor = spCollRate >= 35 ? "#16a34a" : spCollRate >= 20 ? "#d97706" : "#dc2626";
              const spEvColor = "#2563eb";
              return (
                <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 12 }}>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Self-Pay — Expected Recovery</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: spEvColor, letterSpacing: "-0.02em", marginBottom: 4 }}>{fmt(spTotalEV)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{spScored.length} accounts · {fmt(spTotalBal)} total balance</div>
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>Probability-weighted forward-looking · does not blend with insurance EV</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Self-Pay Collection Rate</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: spRateColor, letterSpacing: "-0.02em" }}>{spCollRate}%</div>
                      <div style={{ fontSize: 12, color: spRateColor, fontWeight: 600 }}>{spCollRate >= 35 ? "Top performer" : spCollRate >= 20 ? "Industry average" : "Below average"}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{fmt(spCollected)} collected of {fmt(spTotalBal)} billed</div>
                    <div style={{ position: "relative", height: 5, background: "#f1f5f9", borderRadius: 3, marginBottom: 5 }}>
                      <div style={{ width: Math.min(spCollRate * 2, 100) + "%", height: "100%", background: spRateColor, borderRadius: 3 }} />
                      <div style={{ position: "absolute", left: "40%", top: -3, width: 2, height: 11, background: "#0f172a", borderRadius: 1 }} />
                      <div style={{ position: "absolute", left: "70%", top: -1, width: 1, height: 7, background: "#94a3b8", borderRadius: 1 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>Benchmark: 20–30% industry avg · 35–40% top performer</div>
                  </div>
                </div>
              );
            })()}

            {/* Cash Flow Forecast — 30/60/90 day */}
            {(() => {
              const horizons = [
                { label: "30-Day Forecast", days: 30, color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
                { label: "60-Day Forecast", days: 60, color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
                { label: "90-Day Forecast", days: 90, color: "#7c3aed", bg: "#faf5ff", border: "#e9d5ff" },
              ];
              const computeForecast = (days) => {
                let total = 0;
                arFiltered.forEach(a => {
                  const cat = PAYER_CATEGORY[a.payer] || "commercial";
                  const timing = PAYER_TIMING[cat] || PAYER_TIMING.commercial;
                  const weight = days <= 30 ? timing.p30 : days <= 60 ? timing.p60 : timing.p90;
                  total += a.expectedValue * weight;
                });
                dnfbFiltered.forEach(a => {
                  const cat = PAYER_CATEGORY[a.payer] || "commercial";
                  const timing = PAYER_TIMING[cat] || PAYER_TIMING.commercial;
                  const holdDelay = a.daysInDNFB > 14 ? 0.3 : 0.6;
                  const weight = (days <= 30 ? timing.p30 : days <= 60 ? timing.p60 : timing.p90) * holdDelay;
                  total += a.expectedValue * weight;
                });
                return Math.round(total);
              };
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Cash Flow Forecast</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Probability-weighted cash timing · hardcoded payer timing weights Phase 1</div>
                  <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr 1fr", "1fr 1fr 1fr", "1fr"), gap: 10 }}>
                    {horizons.map(h => {
                      const forecast = computeForecast(h.days);
                      return (
                        <div key={h.days} style={{ background: h.bg, border: `1px solid ${h.border}`, borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ fontSize: 10, color: h.color, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{h.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: h.color, letterSpacing: "-0.02em" }}>{fmt(forecast)}</div>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Expected cash receipts · {h.days}d horizon</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 10 }}>
                    Medicare timing: 60% in 30d · Commercial: 35% in 30d · Medicaid: 20% in 30d · WC: 10% in 30d · DNFB applies hold clearance probability. Phase 2: ERA-calibrated weights.
                  </div>
                </div>
              );
            })()}

            {/* Denial Prediction Risk Summary */}
            {(() => {
              const highRisk = dnfbFiltered.filter(a => DENIAL_RISK_MAP[a.holdCode]?.risk === "high");
              const medRisk = dnfbFiltered.filter(a => DENIAL_RISK_MAP[a.holdCode]?.risk === "medium");
              const highEV = highRisk.reduce((s,a) => s+a.expectedValue, 0);
              const medEV = medRisk.reduce((s,a) => s+a.expectedValue, 0);
              const reworkCost = Math.round((highRisk.length * 118) + (medRisk.length * 65));
              if (highRisk.length === 0 && medRisk.length === 0) return null;
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Pre-Submission Denial Risk</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Rule-based prediction · accounts at risk before submission · Phase 1</div>
                  <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr 1fr", "1fr 1fr 1fr", "1fr"), gap: 10 }}>
                    <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#b91c1c", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>High Risk</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#dc2626" }}>{highRisk.length}</div>
                      <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2, fontWeight: 600 }}>{fmt(highEV)} EV at risk</div>
                    </div>
                    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#c2410c", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Medium Risk</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#d97706" }}>{medRisk.length}</div>
                      <div style={{ fontSize: 11, color: "#d97706", marginTop: 2, fontWeight: 600 }}>{fmt(medEV)} EV at risk</div>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Projected Rework Cost</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{fmt(reworkCost)}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>If denied · $65–118/claim to rework</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: cols("repeat(3, 1fr)", "repeat(3, 1fr)", "1fr"), gap: 12, marginBottom: 24 }}>
            <MetricCard label="Total WIP" value={fmt(role === "cfo" && tab === "ar" ? totalARVal : totalWIP)} sub={`${current.length} accounts`} />
            <MetricCard label="Expected recovery" value={fmt(role === "cfo" && tab === "ar" ? totalEV : totalDnfbEV)} sub={(() => {
              const ev = role === "cfo" && tab === "ar" ? totalEV : totalDnfbEV;
              const base = role === "cfo" && tab === "ar" ? totalARVal : totalDnfbVal;
              return `${Math.round(ev / Math.max(base, 1) * 100)}% net collection rate`;
            })()} accent="#2563eb" />
            <div onClick={() => setCritFilter(f => !f)} style={{ cursor: "pointer" }}><MetricCard label="Critical holds" value={critCount} sub={critFilter ? "click to clear filter" : "click to filter worklist"} accent="#b91c1c" /></div>
          </div>
        )}



        {role === "biller" && tab === "dnfb" && (
          <AreaWorklist area="Billing/Scrubber" dnfbScored={dnfbForRole} worklinks={worklinks} onResolve={handleResolveWorklink} onReturn={handleReturnWorklink} onWorkLink={handleSendWorklink} />
        )}
        {(role === "supervisor") && <AreaChart accounts={current} onFilter={setAreaFilter} activeFilter={areaFilter} />}

        {role === "cfo" && tab === "ar" && (() => {
          const pastDue = arForRole.filter(a => !workedIdSet.has(a.id)); // unworked in platform
          const tiers = [
            { label: "$10K+",    key: "followup_high", accs: pastDue.filter(a => a.amount >= 10000), color: "#b91c1c" },
            { label: "$1K–$10K", key: "followup_mid",  accs: pastDue.filter(a => a.amount >= 1000 && a.amount < 10000), color: "#c2410c" },
            { label: "<$1K",     key: "followup_low",  accs: pastDue.filter(a => a.amount < 1000), color: "#64748b" },
          ];
          const activeTierData = tiers.find(t => t.key === severityFilter);
          return (
            <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 16 }}>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: 10, color: "#c2410c", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Follow-up WIP — Collections</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>Click a tier to filter the account list →</div>
                {tiers.map((t) => {
                  const isActive = severityFilter === t.key;
                  return (
                    <div key={t.key} onClick={() => setSeverityFilter(isActive ? null : t.key)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, cursor: "pointer", opacity: severityFilter && !isActive ? 0.4 : 1, padding: "6px 8px", borderRadius: 6, background: isActive ? t.color + "18" : "transparent", border: isActive ? `1px solid ${t.color}40` : "1px solid transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: isActive ? t.color : "#475569", fontWeight: isActive ? 700 : 500 }}>{t.label}</span>
                      </div>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{t.accs.length} accts</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{fmt(t.accs.reduce((s,a) => s+a.amount, 0))}</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 9, color: "#94a3b8" }}>
                    {severityFilter ? `${tiers.find(t=>t.key===severityFilter)?.label}: ${fmt((tiers.find(t=>t.key===severityFilter)?.accs||[]).reduce((s,a)=>s+a.amount,0))} · ${(tiers.find(t=>t.key===severityFilter)?.accs||[]).length} accounts` : `Accounts >21 days without contact · ${pastDue.length} past due`}
                  </span>
                  {severityFilter && <button onClick={() => setSeverityFilter(null)} style={{ fontSize: 9, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Show all ×</button>}
                </div>
              </div>
              <DonutChart accounts={activeTierData ? activeTierData.accs : pastDue} onFilter={setAreaFilter} activeFilter={areaFilter}
                title={activeTierData ? activeTierData.label + " — by area" : "Past Due (>21d) — by area"} />
            </div>
          );
        })()}

        {role === "cfo" && tab === "dnfb" && (() => {
          const tiers = [
            { key: "normal", label: "Normal (1–3 days)", accs: dnfbForRole.filter(a => a.daysInDNFB <= 3), color: "#16a34a" },
            { key: "watch",  label: "Watch (3–5 days)",  accs: dnfbForRole.filter(a => a.daysInDNFB > 3 && a.daysInDNFB < 6), color: "#d97706" },
            { key: "flag",   label: "Flag (6+ days)",    accs: dnfbForRole.filter(a => a.daysInDNFB >= 6), color: "#dc2626" },
          ];
          const activeTierData = tiers.find(t => t.key === activeTier);
          const donutAccounts = activeTierData ? activeTierData.accs : dnfbForRole;
          return (
            <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 16 }}>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: 10, color: "#1d4ed8", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Billing WIP — DNFB</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>Click a tier to filter the area breakdown →</div>
                {tiers.map((t) => {
                  const isActive = activeTier === t.key;
                  return (
                    <div key={t.key} onClick={() => setActiveTier(isActive ? null : t.key)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, cursor: "pointer", opacity: activeTier && !isActive ? 0.4 : 1, padding: "6px 8px", borderRadius: 6, background: isActive ? t.color + "18" : "transparent", border: isActive ? `1px solid ${t.color}40` : "1px solid transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: isActive ? t.color : "#475569", fontWeight: isActive ? 700 : 500 }}>{t.label}</span>
                      </div>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{t.accs.length} accts</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{fmt(t.accs.reduce((s,a) => s+a.amount, 0))}</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 9, color: "#94a3b8" }}>
                    {activeTierData ? `${activeTierData.label}: ${fmt(activeTierData.accs.reduce((s,a)=>s+a.amount,0))} · ${activeTierData.accs.length} accounts` : `Total: ${fmt(dnfbForRole.reduce((s,a)=>s+a.amount,0))} · ${dnfbForRole.length} accounts`}
                  </span>
                  {activeTier && <button onClick={() => setActiveTier(null)} style={{ fontSize: 9, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Show all ×</button>}
                </div>
              </div>
              <DonutChart accounts={donutAccounts} onFilter={setAreaFilter} activeFilter={areaFilter}
                title={activeTierData ? `${activeTierData.label} — by area` : "All DNFB — by area"} />
            </div>
          );
        })()}
        {/* CFO DNFB account list — compact row format matching Collections WIP */}
        {role === "cfo" && tab === "dnfb" && (() => {
          const tiers = {
            normal: dnfbForRole.filter(a => a.daysInDNFB <= 3),
            watch:  dnfbForRole.filter(a => a.daysInDNFB > 3 && a.daysInDNFB < 6),
            flag:   dnfbForRole.filter(a => a.daysInDNFB >= 6),
          };
          let list = activeTier ? tiers[activeTier] : dnfbForRole;
          if (areaFilter) list = list.filter(a => a.area === areaFilter);
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(a => a.id?.toLowerCase().includes(q) || a.patient?.toLowerCase().includes(q) || a.payer?.toLowerCase().includes(q) || a.site?.toLowerCase().includes(q));
          }
          list = [...list].sort((a,b) => b.expectedValue - a.expectedValue);
          const dnfbCapped = list.slice(0, 100);
          const dnfbOverflow = list.length - dnfbCapped.length;
          return (<>{dnfbCapped.map(a => {
            const denialRisk = DENIAL_RISK_MAP[a.holdCode];
            const dayColor = a.daysInDNFB >= 6 ? "#dc2626" : a.daysInDNFB >= 3 ? "#d97706" : "#16a34a";
            return (
              <div key={a.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 16, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, background: dayColor + "15", color: dayColor, border: `1px solid ${dayColor}40`, padding: "1px 7px", borderRadius: 4 }}>{a.daysInDNFB}d IN DNFB</span>
                      <span style={{ fontSize: 10, fontWeight: 600, background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", padding: "1px 7px", borderRadius: 4 }}>{a.area?.toUpperCase()}</span>
                      {denialRisk && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: denialRisk.risk === "high" ? "#fee2e2" : "#fff7ed", color: denialRisk.risk === "high" ? "#b91c1c" : "#c2410c", border: `1px solid ${denialRisk.risk === "high" ? "#fca5a5" : "#fed7aa"}` }}>⚠ {denialRisk.carc}</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.patient}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{a.id} · {a.site} · {a.vertical} · {a.payer}{a.subPayer ? ` — ${a.subPayer}` : ""}
                      {PAYER_PORTALS[a.payer] && <a href={PAYER_PORTALS[a.payer]} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: 10, marginLeft: 4, textDecoration: "none" }}>↗</a>}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{a.holdCode?.replace(/_/g, " ")}</div>
                    {a.scrubberEdit && <div style={{ marginTop: 4, fontSize: 11, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "3px 8px", display: "inline-block" }}>⚠ {a.scrubberEdit}</div>}
                  </div>
                  <ProbCircle prob={a.prob} payer={a.payer} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Expected value</div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: "#2563eb", letterSpacing: "-0.02em" }}>{fmt(a.expectedValue)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{fmt(a.amount)} · {a.daysInDNFB}d</div>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 11 }}>▼</div>
                </div>
              </div>
            );
          })}
          {dnfbOverflow > 0 && (
            <div style={{ textAlign: "center", padding: "16px", fontSize: 12, color: "#94a3b8" }}>
              Showing top 100 of {list.length.toLocaleString()} accounts by expected value · refine with search or filters
            </div>
          )}</>);
        })()}

        <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search by account ID, patient, payer, or site..." />

        {(role === "biller" || role === "medicaid" || role === "wc") && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {[null, ...AREAS.filter(a => current.some(acc => acc.area === a))].map(a => {
              const isActive = areaFilter === a;
              const color = a ? (HOLD_CONFIG[Object.keys(HOLD_CONFIG).find(k => HOLD_CONFIG[k].area === a)]?.color || "#64748b") : "#2563eb";
              return (
                <button key={a || "all"} onClick={() => setAreaFilter(a)} style={{ padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${isActive ? color : "#e2e8f0"}`, borderRadius: 6, background: isActive ? color + "12" : "#fff", color: isActive ? color : "#64748b", fontWeight: isActive ? 600 : 400 }}>
                  {a || "All areas"}{a && ` (${current.filter(acc => acc.area === a).length})`}
                </button>
              );
            })}
            {areaFilter && <button onClick={() => setAreaFilter(null)} style={{ padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", color: "#94a3b8" }}>Clear</button>}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 8 : 0, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{filtered.length} account{filtered.length !== 1 ? "s" : ""}{searchQuery ? ` matching "${searchQuery}"` : ""} · click to expand</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(filtered.reduce((s,a) => s + a.expectedValue, 0))} expected recovery</div>
            <button onClick={exportToExcel} disabled={filtered.length === 0} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, color: "#15803d", cursor: filtered.length === 0 ? "not-allowed" : "pointer", opacity: filtered.length === 0 ? 0.5 : 1 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1 9v1.5A.5.5 0 001.5 11h9a.5.5 0 00.5-.5V9" stroke="#15803d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Export {filtered.length > 0 ? `(${filtered.length})` : ""}
            </button>
          </div>
        </div>

        {role === "cfo" && tab === "metrics" && <WorkLinkReporting worklinks={worklinks} isMobile={isMobile} />}
        {role === "cfo" && tab === "metrics" && <CFOEscalationSection />}
        {role === "cfo" && tab === "metrics" && (
          <div style={{ padding: isMobile ? "0 12px 80px" : "0 32px 40px" }}>
            <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #e9d5ff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7c3aed", marginBottom: 2 }}>✦ AI Executive Analysis</div>
                  <div style={{ fontSize: 11, color: "#9333ea" }}>AI-generated · verify before acting · review after data, not before</div>
                </div>
                <button onClick={runAI} disabled={aiLoading} style={{ padding: "8px 18px", background: aiLoading ? "#f3e8ff" : "#7c3aed", border: "none", borderRadius: 8, color: aiLoading ? "#9333ea" : "#fff", cursor: aiLoading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                  {aiLoading ? (
                    <><span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span> Analyzing...</>
                  ) : "✦ Generate Summary"}
                </button>
              </div>
              {aiText !== null && typeof aiText === "object" && (
                <div style={{ padding: "18px 20px" }}>
                  {aiText.status && <div style={{ fontSize: 13, color: "#4c1d95", lineHeight: 1.8, marginBottom: 16, padding: "12px 16px", background: "#f5f3ff", borderRadius: 8, borderLeft: "3px solid #7c3aed" }}>{aiText.status}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12 }}>
                    {aiText.priorities?.length > 0 && (
                      <div style={{ background: "#fff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Top Priorities</div>
                        {aiText.priorities.map((p, i) => <div key={i} style={{ fontSize: 12, color: "#334155", lineHeight: 1.65, marginBottom: 6, paddingLeft: 10, borderLeft: "2px solid #c4b5fd" }}>{p}</div>)}
                      </div>
                    )}
                    {aiText.risks?.length > 0 && (
                      <div style={{ background: "#fff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Risk Flags</div>
                        {aiText.risks.map((r, i) => <div key={i} style={{ fontSize: 12, color: "#334155", lineHeight: 1.65, marginBottom: 6, paddingLeft: 10, borderLeft: "2px solid #fca5a5" }}>{r}</div>)}
                      </div>
                    )}
                    {aiText.decisions?.length > 0 && (
                      <div style={{ background: "#fff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Decisions Required</div>
                        {aiText.decisions.map((d, i) => <div key={i} style={{ fontSize: 12, color: "#334155", lineHeight: 1.65, marginBottom: 6, paddingLeft: 10, borderLeft: "2px solid #fca5a5" }}>{d}</div>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {aiText === null && !aiLoading && (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "#9333ea", fontSize: 12 }}>
                  Review the data above first, then generate the AI analysis to check your assessment.
                </div>
              )}
            </div>
          </div>
        )}

        {critFilter && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#b91c1c" }}>
            <span>⚡ Showing CRITICAL accounts only — {filtered.length} accounts</span>
            <button onClick={() => setCritFilter(false)} style={{ fontSize: 11, color: "#b91c1c", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Clear filter</button>
          </div>
        )}
        {filtered.length === 0 && searchQuery && (
          <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "14px 18px", fontSize: 13, color: "#854d0e" }}>
            No accounts found for "{searchQuery}" — try account ID, patient name, payer, or site.
          </div>
        )}

        {filtered.slice(0, 100).map(acc => (
          (role === "cfo" && tab === "dnfb") ? null :
          <BillerAccountCard key={acc.id} acc={acc} onSeverityFilter={setSeverityFilter} onWorkLink={handleSendWorklink} />
        ))}
        {(role !== "cfo" || tab !== "dnfb") && filtered.length > 100 && (
          <div style={{ textAlign: "center", padding: "16px", fontSize: 12, color: "#94a3b8" }}>
            Showing top 100 of {filtered.length.toLocaleString()} accounts by expected value · refine with search or filters
          </div>
        )}
      </div>
      )}

      <div style={{ borderTop: "1px solid #e2e8f0", padding: isMobile ? "12px 16px" : "14px 32px", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#cbd5e1" }}>
        <span>D4 Consulting Group — Proprietary</span>
        {!isMobile && <span>WIP Intelligence Platform v2.1 · Human-in-the-loop · Phase 1 Internal</span>}
      </div>
    </div>
  );
}
