import { useState, useMemo, useCallback } from "react";

const PAYER_BASELINES = {
  "Medicare": 88, "Blue Cross": 84, "Blue Shield": 82, "Aetna": 79,
  "United Health": 76, "Cigna": 74, "Humana": 72, "Medicaid": 56, "Worker Comp": 40,
};

const HOLD_CONFIG = {
  CODING_UNASSIGNED:  { area: "Coding",           color: "#6d28d9", label: "Coding — unassigned",          adj: -8,  severity: "HIGH" },
  CODING_COMPLEX:     { area: "Coding",           color: "#6d28d9", label: "Coding — complex hold",         adj: -12, severity: "MEDIUM" },
  PHYSICIAN_UNSIGNED: { area: "Physician/Doc",    color: "#1d4ed8", label: "Physician — note unsigned",    adj: -10, severity: "HIGH" },
  PHYSICIAN_QUERY:    { area: "Physician/Doc",    color: "#1d4ed8", label: "Physician — query pending",    adj: -14, severity: "MEDIUM" },
  CHARGE_MISSING:     { area: "Charge Capture",   color: "#be185d", label: "Charge — missing",             adj: -25, severity: "CRITICAL" },
  CHARGE_LAG:         { area: "Charge Capture",   color: "#be185d", label: "Charge — entry lag",           adj: -10, severity: "HIGH" },
  CREDENTIALING:      { area: "Credentialing",    color: "#9f1239", label: "Credentialing — provider gap", adj: -30, severity: "CRITICAL" },
  AUTH_MISSING:       { area: "Authorization",    color: "#c2410c", label: "Auth — not obtained",          adj: -22, severity: "HIGH" },
  AUTH_EXPIRED:       { area: "Authorization",    color: "#c2410c", label: "Auth — expired",               adj: -24, severity: "HIGH" },
  HIM_DEFICIENCY:     { area: "Clinical/HIM",     color: "#0369a1", label: "HIM — record deficiency",      adj: -6,  severity: "MEDIUM" },
  SCRUBBER_EDIT:      { area: "Billing/Scrubber", color: "#0f766e", label: "Scrubber — edit hold",         adj: -4,  severity: "LOW" },
  ELIGIBILITY:        { area: "Billing/Scrubber", color: "#0f766e", label: "Eligibility — mismatch",       adj: -8,  severity: "MEDIUM" },
  "CO-4":             { area: "Authorization",    color: "#c2410c", label: "Denial CO-4 — not covered",    adj: -35, severity: "HIGH" },
  "CO-16":            { area: "Billing/Scrubber", color: "#0f766e", label: "Denial CO-16 — missing info",  adj: -8,  severity: "MEDIUM" },
  "CO-22":            { area: "Billing/Scrubber", color: "#0f766e", label: "Denial CO-22 — COB issue",     adj: -20, severity: "MEDIUM" },
  "CO-50":            { area: "Physician/Doc",    color: "#1d4ed8", label: "Denial CO-50 — med necessity", adj: -30, severity: "HIGH" },
  "CO-97":            { area: "Billing/Scrubber", color: "#0f766e", label: "Denial CO-97 — bundling",      adj: -15, severity: "MEDIUM" },
  PENDING:            { area: "Collections",      color: "#374151", label: "Pending payment",              adj: 0,   severity: "LOW" },
};

const SEV = {
  CRITICAL: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  HIGH:     { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  MEDIUM:   { bg: "#fefce8", text: "#854d0e", border: "#fde68a" },
  LOW:      { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
};

const OUTCOME_STATUSES = [
  { value: "promised_payment",    label: "Promised payment",       followUpDays: 5,  closed: false },
  { value: "left_voicemail",      label: "Left voicemail",         followUpDays: 2,  closed: false },
  { value: "in_adjudication",     label: "In adjudication",        followUpDays: 14, closed: false },
  { value: "needs_documentation", label: "Needs documentation",    followUpDays: 7,  closed: false },
  { value: "appeal_filed",        label: "Appeal filed",           followUpDays: 30, closed: false },
  { value: "resubmitted",         label: "Resubmitted",            followUpDays: 14, closed: false },
  { value: "escalated",           label: "Escalated",              followUpDays: 3,  closed: false },
  { value: "no_response",         label: "No response",            followUpDays: 7,  closed: false },
  { value: "physician_query",     label: "Physician query sent",   followUpDays: 2,  closed: false },
  { value: "coding_assigned",     label: "Coding assigned",        followUpDays: 3,  closed: false },
  { value: "paid_full",           label: "Paid — full",            followUpDays: null, closed: true },
  { value: "paid_partial",        label: "Paid — partial",         followUpDays: 14, closed: false },
  { value: "writeoff_recommended",label: "Write-off recommended",  followUpDays: null, closed: false, pending: true },
];

const AREAS = ["Coding","Physician/Doc","Charge Capture","Credentialing","Authorization","Clinical/HIM","Billing/Scrubber","Collections"];

const DNFB_DATA = [
  { id:"DNFB-001", patient:"Metro Behavioral Health",   payer:"Medicare",      amount:45200,  daysInDNFB:8,  serviceDate:"2026-05-05", lastContact:"2026-05-12", holdCode:"CODING_UNASSIGNED", site:"Site 3", vertical:"Behavioral Health" },
  { id:"DNFB-002", patient:"Coastal Infusion Center",   payer:"Blue Cross",    amount:128400, daysInDNFB:4,  serviceDate:"2026-05-09", lastContact:"2026-05-10", holdCode:"CHARGE_MISSING",    site:"Site 7", vertical:"Infusion" },
  { id:"DNFB-003", patient:"Summit Orthopedics",        payer:"Aetna",         amount:67100,  daysInDNFB:5,  serviceDate:"2026-05-08", lastContact:"2026-05-09", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 2", vertical:"Orthopedics" },
  { id:"DNFB-004", patient:"Harbor Home Health",        payer:"Medicare",      amount:23800,  daysInDNFB:12, serviceDate:"2026-05-01", lastContact:"2026-05-08", holdCode:"CREDENTIALING",     site:"Site 5", vertical:"Home Health" },
  { id:"DNFB-005", patient:"Riverdale Recovery Center", payer:"Medicaid",      amount:38600,  daysInDNFB:7,  serviceDate:"2026-05-06", lastContact:"2026-05-10", holdCode:"AUTH_MISSING",      site:"Site 9", vertical:"Behavioral Health" },
  { id:"DNFB-006", patient:"Lakeside Dental Group",     payer:"United Health", amount:12300,  daysInDNFB:3,  serviceDate:"2026-05-10", lastContact:"2026-05-12", holdCode:"HIM_DEFICIENCY",    site:"Site 1", vertical:"Dental" },
  { id:"DNFB-007", patient:"Coastal Infusion Center",   payer:"Blue Shield",   amount:89700,  daysInDNFB:14, serviceDate:"2026-04-29", lastContact:"2026-05-05", holdCode:"CREDENTIALING",     site:"Site 7", vertical:"Infusion" },
  { id:"DNFB-008", patient:"Valley Eye Care",           payer:"Cigna",         amount:34200,  daysInDNFB:6,  serviceDate:"2026-05-07", lastContact:"2026-05-11", holdCode:"CODING_COMPLEX",    site:"Site 4", vertical:"Ophthalmology" },
  { id:"DNFB-009", patient:"Harbor Home Health",        payer:"Medicare",      amount:19400,  daysInDNFB:9,  serviceDate:"2026-05-04", lastContact:"2026-05-10", holdCode:"PHYSICIAN_QUERY",   site:"Site 5", vertical:"Home Health" },
  { id:"DNFB-010", patient:"Metro Behavioral Health",   payer:"United Health", amount:52100,  daysInDNFB:11, serviceDate:"2026-05-02", lastContact:"2026-05-09", holdCode:"AUTH_EXPIRED",      site:"Site 3", vertical:"Behavioral Health" },
];

const AR_DATA = [
  { id:"AR-001", patient:"Metro Behavioral Health",   payer:"Medicaid",      amount:78400,  daysOut:145, serviceDate:"2025-12-21", lastContact:"2026-03-15", denialCode:"CO-4",  site:"Site 3", vertical:"Behavioral Health" },
  { id:"AR-002", patient:"Coastal Infusion Center",   payer:"Blue Cross",    amount:156200, daysOut:62,  serviceDate:"2026-03-10", lastContact:"2026-04-28", denialCode:null,    site:"Site 7", vertical:"Infusion" },
  { id:"AR-003", patient:"Summit Orthopedics",        payer:"Aetna",         amount:43100,  daysOut:89,  serviceDate:"2026-02-15", lastContact:"2026-04-10", denialCode:"CO-97", site:"Site 2", vertical:"Orthopedics" },
  { id:"AR-004", patient:"Harbor Home Health",        payer:"Medicare",      amount:31600,  daysOut:121, serviceDate:"2026-01-15", lastContact:"2026-03-20", denialCode:"CO-16", site:"Site 5", vertical:"Home Health" },
  { id:"AR-005", patient:"Riverdale Recovery Center", payer:"United Health", amount:67300,  daysOut:178, serviceDate:"2025-11-18", lastContact:"2026-02-10", denialCode:"CO-50", site:"Site 9", vertical:"Behavioral Health" },
  { id:"AR-006", patient:"Lakeside Dental Group",     payer:"Humana",        amount:8200,   daysOut:34,  serviceDate:"2026-04-09", lastContact:"2026-05-01", denialCode:null,    site:"Site 1", vertical:"Dental" },
  { id:"AR-007", patient:"Coastal Infusion Center",   payer:"Blue Shield",   amount:94100,  daysOut:97,  serviceDate:"2026-02-07", lastContact:"2026-03-28", denialCode:"CO-22", site:"Site 7", vertical:"Infusion" },
  { id:"AR-008", patient:"Valley Eye Care",           payer:"Cigna",         amount:29400,  daysOut:55,  serviceDate:"2026-03-21", lastContact:"2026-04-25", denialCode:null,    site:"Site 4", vertical:"Ophthalmology" },
  { id:"AR-009", patient:"Harbor Home Health",        payer:"Medicaid",      amount:47200,  daysOut:203, serviceDate:"2025-10-25", lastContact:"2026-01-30", denialCode:"CO-4",  site:"Site 5", vertical:"Home Health" },
  { id:"AR-010", patient:"Metro Behavioral Health",   payer:"Blue Cross",    amount:112300, daysOut:88,  serviceDate:"2026-02-16", lastContact:"2026-04-15", denialCode:null,    site:"Site 3", vertical:"Behavioral Health" },
];

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

function getAction(acc) {
  const { holdCode, prob, daysOut, payer, site, vertical, amount, serviceDate } = acc;
  if (prob < 20 && daysOut > 150) return { icon: "✕", color: "#64748b", label: "Write-off review", text: `${prob}% collection probability after ${daysOut} days. Collection cost likely exceeds expected recovery. Route to CFO for write-off approval.` };
  if (holdCode === "CREDENTIALING") return { icon: "⚡", color: "#c2410c", label: "Internal escalation", text: `Escalate to credentialing team — provider not credentialed at ${site} with ${payer}. ${amount > 50000 ? fmt(amount) + " at risk." : ""} Request expedited credentialing and estimated resolution date.` };
  if (holdCode === "CHARGE_MISSING") return { icon: "⚡", color: "#c2410c", label: "Internal escalation", text: `Route to charge capture at ${site} — ${vertical} charge missing. Service date ${serviceDate}. Enter charges immediately — timely filing clock is running.` };
  if (holdCode === "PHYSICIAN_UNSIGNED" || holdCode === "PHYSICIAN_QUERY") return { icon: "📝", color: "#1d4ed8", label: "Physician query", text: `Send physician query — ${vertical} note unsigned or query pending at ${site}. ${daysOut} days outstanding. Response required within 24 hours.` };
  if (holdCode === "AUTH_MISSING" || holdCode === "AUTH_EXPIRED") return { icon: "⚡", color: "#c2410c", label: "Internal escalation", text: `Route to authorization team — retrospective auth required for ${vertical} at ${site}. File within payer window. ${payer} retro-auth success rate approximately 45%.` };
  if (holdCode === "CO-4") return { icon: "📋", color: "#6d28d9", label: "Appeal submission", text: `File CO-4 appeal — service not covered. Submit medical necessity documentation and clinical notes. Deadline in ${Math.max(0, 180 - daysOut)} days. ~35% success rate with complete documentation.` };
  if (holdCode === "CO-50") return { icon: "📋", color: "#6d28d9", label: "Appeal submission", text: `File CO-50 appeal — medical necessity denied. Prepare clinical documentation package with supporting diagnosis codes. Escalate to physician for co-signature.` };
  if (holdCode === "CO-97") return { icon: "📋", color: "#6d28d9", label: "Appeal submission", text: `File CO-97 appeal — bundling dispute. Add modifier 59 or appropriate unbundling modifier and resubmit. Review CPT pairing against ${payer} fee schedule.` };
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

function ProbBar({ prob }) {
  const color = prob >= 70 ? "#16a34a" : prob >= 40 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: "#f1f5f9", borderRadius: 2 }}>
        <div style={{ width: prob + "%", height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, minWidth: 30, textAlign: "right" }}>{prob}%</span>
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
            <option key={o.value} value={o.value}>{o.label} — follow up in {o.followUpDays} {o.followUpDays === 1 ? "day" : "days"}</option>
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
  "AR-001": [
    { date: "2026-03-15", user: "J.Smith", outcome: "left_voicemail", text: "called Medicaid. no answer. left vm." },
    { date: "2026-04-02", user: "J.Smith", outcome: "no_response", text: "tried again. no answer." },
    { date: "2026-04-28", user: "T.Jones", outcome: "needs_documentation", text: "reached payer. denied CO-4. need med necessity docs for retro auth." },
  ],
  "AR-002": [
    { date: "2026-04-10", user: "J.Smith", outcome: "in_adjudication", text: "called BC. claim in process. said 30 days." },
    { date: "2026-04-28", user: "J.Smith", outcome: "in_adjudication", text: "follow up. still processing." },
  ],
  "AR-007": [
    { date: "2026-03-28", user: "T.Jones", outcome: "left_voicemail", text: "called Blue Shield re COB issue. left vm." },
    { date: "2026-04-10", user: "T.Jones", outcome: "needs_documentation", text: "reached provider services. need primary EOB. requested from patient." },
  ],
  "DNFB-002": [
    { date: "2026-05-10", user: "J.Smith", outcome: "escalated", text: "routed to charge capture. drug charge missing on infusion." },
  ],
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
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 400, messages: [{ role: "user", content: prompt }] })
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

function CollectorAccountCard({ acc, onLog }) {
  const [approved, setApproved] = useState(false);
  const [outcome, setOutcome] = useState("");
  const sev = SEV[acc.cfg.severity];

  const handleLog = () => {
    if (!outcome) return;
    const os = OUTCOME_STATUSES.find(o => o.value === outcome);
    onLog({
      id: acc.id, patient: acc.patient, amount: acc.amount,
      expectedValue: acc.expectedValue, outcome, outcomeLabel: os.label,
      followUpDate: os.closed ? "Closed" : os.pending ? "Pending CFO" : addBusinessDays(os.followUpDays),
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
              <span style={{ fontSize: 10, fontWeight: 600, background: acc.cfg.color + "12", color: acc.cfg.color, border: `1px solid ${acc.cfg.color}30`, padding: "2px 8px", borderRadius: 4 }}>{acc.area.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 3 }}>{acc.patient}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{acc.id} · {acc.site} · {acc.vertical} · {acc.payer}</div>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>{acc.cfg.label}</div>
            <ProbBar prob={acc.prob} />
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>Expected value</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#2563eb", letterSpacing: "-0.02em" }}>{fmt(acc.expectedValue)}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{fmt(acc.amount)} balance</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{acc.daysOut} days out</div>
          </div>
        </div>
      </div>

      {/* Account Summary */}
      <div style={{ padding: "12px 22px 0" }}><AccountSummary acc={acc} /></div>

      {/* Action */}
      <div style={{ padding: "16px 22px", background: "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 15 }}>{acc.action.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: acc.action.color, textTransform: "uppercase" }}>{acc.action.label}</span>
        </div>
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.65, marginBottom: 14 }}>{acc.action.text}</div>
        <button
          onClick={() => setApproved(true)}
          disabled={approved}
          style={{
            padding: "9px 20px", width: "100%",
            background: approved ? "#f0fdf4" : "#2563eb",
            border: `1px solid ${approved ? "#86efac" : "#2563eb"}`,
            borderRadius: 8, color: approved ? "#16a34a" : "#fff",
            cursor: approved ? "default" : "pointer", fontSize: 13,
            fontWeight: 600, fontFamily: "inherit",
          }}
        >
          {approved ? "✓ Action approved" : "Approve action"}
        </button>
      </div>

      {/* Outcome selector — appears after approval */}
      {approved && (
        <div style={{ padding: "16px 22px" }}>
          <OutcomeSelector onSelect={setOutcome} selectedOutcome={outcome} />
          <FollowUpPreview outcome={outcome} />
          {outcome && (
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
        </div>
      )}
    </div>
  );
}

function WorkedList({ worked }) {
  if (worked.length === 0) return null;
  const statusColors = { "Paid — full": "#16a34a", "Paid — partial": "#0369a1", "Write-off recommended": "#64748b" };
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Worked this session ({worked.length})</div>
      {worked.map(w => (
        <div key={w.id + w.timestamp} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", marginRight: 8 }}>{w.id}</span>
            <span style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>{w.patient}</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: statusColors[w.outcomeLabel] || "#0369a1", background: (statusColors[w.outcomeLabel] || "#0369a1") + "12", padding: "2px 8px", borderRadius: 4 }}>{w.outcomeLabel}</span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{w.followUpDate}</span>
            <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>{fmt(w.expectedValue)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CollectorView({ arScored }) {
  const [workedAccounts, setWorkedAccounts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);

  const workedIds = new Set(workedAccounts.map(w => w.id));
  const queue = arScored.filter(a => !workedIds.has(a.id));
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
    <div style={{ padding: "24px 32px" }}>
      {/* Productivity metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Accounts worked", value: workedAccounts.length, sub: `${queue.length} remaining in queue`, color: "#0f172a" },
          { label: "EV worked", value: fmt(totalEV), sub: "expected recovery logged", color: "#2563eb" },
          { label: "Average EV", value: workedAccounts.length ? fmt(avgEV) : "—", sub: "per account this session", color: "#0369a1" },
          { label: "Most common outcome", value: mostCommon === "—" ? "—" : mostCommon.split(" ").slice(0,2).join(" "), sub: mostCommon === "—" ? "no accounts worked yet" : mostCommon, color: "#16a34a" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: "-0.01em" }}>{value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <SearchBar
        value={searchQuery}
        onChange={handleSearch}
        placeholder="Search by account ID, patient, or payer — for inbound callbacks"
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

      {/* Current account */}
      {currentAccount ? (
        <CollectorAccountCard key={currentAccount.id + workedAccounts.length} acc={currentAccount} onLog={handleLog} />
      ) : !searchQuery ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a", marginBottom: 6 }}>Queue complete</div>
          <div style={{ fontSize: 13, color: "#166534" }}>All {arScored.length} accounts worked this session. {fmt(totalEV)} expected recovery logged.</div>
        </div>
      ) : null}

      {/* Worked list */}
      <WorkedList worked={workedAccounts} />
    </div>
  );
}

function BillerAccountCard({ acc }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [logged, setLogged] = useState(false);
  const sev = SEV[acc.cfg.severity];

  const handleLog = () => { if (outcome) setLogged(true); };

  return (
    <div style={{ background: logged ? "#f0fdf4" : "#fff", border: `1px solid ${logged ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "14px 18px", cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 20, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 600, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, padding: "1px 7px", borderRadius: 4 }}>{acc.cfg.severity}</span>
            <span style={{ fontSize: 10, fontWeight: 600, background: acc.cfg.color + "12", color: acc.cfg.color, border: `1px solid ${acc.cfg.color}30`, padding: "1px 7px", borderRadius: 4 }}>{acc.area.toUpperCase()}</span>
            {logged && <span style={{ fontSize: 10, fontWeight: 600, background: "#dcfce7", color: "#16a34a", border: "1px solid #bbf7d0", padding: "1px 7px", borderRadius: 4 }}>✓ LOGGED</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.patient}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>{acc.id} · {acc.site} · {acc.vertical} · {acc.payer}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>{acc.cfg.label}</div>
          <ProbBar prob={acc.prob} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Expected value</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#2563eb", letterSpacing: "-0.02em" }}>{fmt(acc.expectedValue)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{fmt(acc.amount)} · {acc.daysOut}d</div>
        </div>
        <div style={{ color: "#94a3b8", fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</div>
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
                <FollowUpPreview outcome={outcome} />
                {outcome && (
                  <button onClick={handleLog} style={{ marginTop: 10, padding: "9px 20px", width: "100%", background: "#0f172a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                    Log outcome
                  </button>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
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

export default function WIPPlatform() {
  const [tab, setTab] = useState("dnfb");
  const [role, setRole] = useState("collector");
  const [areaFilter, setAreaFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const dnfb = useMemo(() => DNFB_DATA.map(a => score(a, "dnfb")).sort((a,b) => b.expectedValue - a.expectedValue), []);
  const ar = useMemo(() => AR_DATA.map(a => score(a, "ar")).sort((a,b) => b.expectedValue - a.expectedValue), []);
  const current = tab === "dnfb" ? dnfb : ar;

  const filtered = useMemo(() => {
    let list = areaFilter ? current.filter(a => a.area === areaFilter) : current;
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
  }, [current, areaFilter, searchQuery]);

  const totalWIP = current.reduce((s,a) => s + a.amount, 0);
  const totalEV = current.reduce((s,a) => s + a.expectedValue, 0);
  const critCount = current.filter(a => a.cfg.severity === "CRITICAL").length;

  const runAI = async () => {
    setAiLoading(true);
    const byArea = {};
    current.forEach(a => { byArea[a.area] = (byArea[a.area] || 0) + a.amount; });
    const topArea = Object.entries(byArea).sort((a,b) => b[1]-a[1])[0];
    const crits = current.filter(a => a.cfg.severity === "CRITICAL");
    const prompt = `You are a healthcare revenue cycle expert. Write a 3-sentence CFO-level executive summary for this ${tab === "dnfb" ? "DNFB unbilled" : "collections"} WIP portfolio. Be specific with dollar amounts and prioritize the top 1-2 actions.\n\nPortfolio: ${fmt(totalWIP)} total WIP, ${fmt(totalEV)} expected recovery (${Math.round(totalEV/totalWIP*100)}% rate). Critical holds: ${critCount}. Largest area: ${topArea?.[0]} at ${fmt(topArea?.[1] || 0)}. Critical: ${crits.map(a => `${a.id} ${a.vertical} ${fmt(a.amount)} — ${a.cfg.label}`).join("; ")}.`;
    try {
      const res = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }) });
      const data = await res.json();
      setAiText(data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "Analysis unavailable.");
    } catch { setAiText("AI analysis temporarily unavailable."); }
    setAiLoading(false);
  };

  const seg = (label, val) => (
    <button onClick={() => { setRole(val); setAiText(""); setSearchQuery(""); setAreaFilter(null); }} style={{ padding: "6px 14px", cursor: "pointer", fontSize: 11, fontWeight: role === val ? 600 : 400, border: "none", borderRadius: 6, fontFamily: "inherit", background: role === val ? "#2563eb" : "transparent", color: role === val ? "#fff" : "#64748b" }}>{label}</button>
  );

  const tabStyle = active => ({ padding: "12px 20px", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, border: "none", borderBottom: active ? "2px solid #2563eb" : "2px solid transparent", background: "transparent", color: active ? "#2563eb" : "#64748b", fontFamily: "inherit" });

  if (role === "collector") {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>D4 Consulting Group</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>WIP Intelligence Platform <span style={{ fontSize: 11, color: "#2563eb", marginLeft: 6 }}>v2.0</span></div>
          </div>
          <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
            {seg("Collector", "collector")}{seg("Biller", "biller")}{seg("Supervisor", "supervisor")}{seg("CFO", "cfo")}
          </div>
        </div>
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "10px 32px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Collections Queue — Collector Mode</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>· {ar.length} accounts · sorted by expected value</span>
        </div>
        <CollectorView arScored={ar} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>D4 Consulting Group</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>WIP Intelligence Platform <span style={{ fontSize: 11, color: "#2563eb", marginLeft: 6 }}>v2.0</span></div>
        </div>
        <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
          {seg("Collector", "collector")}{seg("Biller", "biller")}{seg("Supervisor", "supervisor")}{seg("CFO", "cfo")}
        </div>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex" }}>
          <button style={tabStyle(tab === "dnfb")} onClick={() => { setTab("dnfb"); setAreaFilter(null); setSearchQuery(""); setAiText(""); }}>DNFB — Unbilled ({DNFB_DATA.length})</button>
          <button style={tabStyle(tab === "ar")} onClick={() => { setTab("ar"); setAreaFilter(null); setSearchQuery(""); setAiText(""); }}>Collections Queue ({AR_DATA.length})</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ fontSize: 10, color: "#94a3b8" }}>LIVE</span>
        </div>
      </div>

      <div style={{ padding: "24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          <MetricCard label="Total WIP" value={fmt(totalWIP)} sub={`${current.length} accounts`} />
          <MetricCard label="Expected recovery" value={fmt(totalEV)} sub={`${Math.round(totalEV/totalWIP*100)}% collection rate`} accent="#2563eb" />
          <MetricCard label="Critical holds" value={critCount} sub="require immediate action" accent="#b91c1c" />
        </div>

        {role === "cfo" && (
          <div style={{ marginBottom: 20 }}>
            <button onClick={runAI} disabled={aiLoading} style={{ padding: "9px 20px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, color: "#2563eb", cursor: aiLoading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
              {aiLoading ? "Analyzing..." : "Generate AI Executive Summary"}
            </button>
            {aiText && (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "16px 20px", marginTop: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "#2563eb", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>AI Executive Analysis</div>
                <div style={{ fontSize: 13, lineHeight: 1.75, color: "#1e3a5f" }}>{aiText}</div>
              </div>
            )}
          </div>
        )}

        {(role === "supervisor" || role === "cfo") && <AreaChart accounts={current} onFilter={setAreaFilter} activeFilter={areaFilter} />}

        <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search by account ID, patient, payer, or site..." />

        {role === "biller" && (
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

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{filtered.length} account{filtered.length !== 1 ? "s" : ""}{searchQuery ? ` matching "${searchQuery}"` : ""} · click to expand</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(filtered.reduce((s,a) => s + a.expectedValue, 0))} expected recovery</div>
        </div>

        {filtered.length === 0 && searchQuery && (
          <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "14px 18px", fontSize: 13, color: "#854d0e" }}>
            No accounts found for "{searchQuery}" — try account ID, patient name, payer, or site.
          </div>
        )}

        {filtered.map(acc => (
          <BillerAccountCard key={acc.id} acc={acc} />
        ))}
      </div>

      <div style={{ borderTop: "1px solid #e2e8f0", padding: "14px 32px", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#cbd5e1" }}>
        <span>D4 Consulting Group — Proprietary</span>
        <span>WIP Intelligence Platform v2.0 · Human-in-the-loop · Phase 1 Internal</span>
      </div>
    </div>
  );
}
