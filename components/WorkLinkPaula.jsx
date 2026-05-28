import React, { useState, useMemo } from "react";

/**
 * WorkLink — Paula's Team-Lead Inbound Queue (standalone design artifact)
 * -----------------------------------------------------------------------
 * The receiving side of WorkLink. Built to the same design grammar as the CFO
 * dashboard and Diane's worklist (the seven moves). Paula is the Authorization
 * team lead (Persona 4); her queue is dominantly inbound WorkLinks from Diane
 * (pre-bill auth that can't be obtained — a supervisory unblock, not an appeal).
 *
 * Grounded in:
 *  - Internal Work Request Module (the foundational WorkLink spec)
 *  - WorkLink — Dollar Attribution & DNFB-vs-Post-Bill Distinction
 *  - WorkLink — Per-Area Send/Receive Matrix
 *  - Worklist Engine (one engine, composable modules)
 *  - Why Tech Adoptions Fail (worker UI principles)
 *
 * Same composable engine as Diane: the engine doesn't care that these are
 * inbound requests vs. native queue items. Only the rendering and the action
 * set differ (configured per role).
 */

// ── Palette — identical to Diane's worklist ────────────────────────────────
const INK = "#0f172a";
const MUTE = "#64748b";
const FAINT = "#94a3b8";
const LINE = "#e2e8f0";
const PAPER = "#f8fafc";
const RED = "#dc2626";
const AMBER = "#d97706";
const GREEN = "#16a34a";

// ── SLA tiers (from the Internal Work Request Module) ──────────────────────
// Auto-calculated from account urgency. Breach → escalate to supervisor's supervisor.
const SLA_HOURS = { critical: 4, high: 24, medium: 48, low: 72 };

// ── "Today" anchor matches Diane's data generator ──────────────────────────
const TODAY = new Date("2026-05-22T12:00:00Z");
const hoursSince = (iso) => Math.round((TODAY - new Date(iso)) / 3600000);
const prettyTime = (iso) => {
  const d = new Date(iso);
  const days = Math.round((TODAY - d) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
};
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// ── Sample inbound WorkLinks for Paula's queue ─────────────────────────────
// Mix of senders + request types to show the universality and SLA spread.
// Phase distinguishes the two currencies (gross pre-bill / net-EV post-bill).
const WORKLINKS = [
  {
    id: "WL-44219", requestType: "escalate_prebill_auth",
    from: { name: "Diane Aguilar", role: "Auth Specialist" },
    account: { id: "DNFB-00412", patient: "Patricia Nguyen", payer: "Blue Cross", amount: 92500, vertical: "Outpatient Surgery", site: "Site 6", cpt: "47562", dischargeDate: "2026-02-19", phase: "prebill" },
    note: "Submitted retro-auth via Availity 2026-04-22. Two follow-ups, payer says clinical reviewer is backlogged. Day 30 with no decision and TF window closing. Need supervisory unblock — peer-to-peer or medical director call to push the decision.",
    reason: "Payer stalled — retro-auth submitted, no decision after 30d",
    createdAt: "2026-05-21T14:20:00Z",
    slaTier: "critical",
  },
  {
    id: "WL-44188", requestType: "escalate_postbill_auth",
    from: { name: "Diane Aguilar", role: "Auth Specialist" },
    account: { id: "AR-08434", patient: "Margaret Ramirez", payer: "Humana", amount: 41200, vertical: "Outpatient Surgery", site: "Site 4", cpt: "29881", denialDate: "2026-04-26", phase: "postbill" },
    note: "Auth on file (AUTH-44102) is for wrong CPT (29882 vs 29881 billed). Tried to correct — Humana says original auth was approved only for the listed CPT and won't extend. Looks like a coding/auth mismatch at the front end. Need your call on whether to push back for review or route to coding for analysis.",
    reason: "Auth/CPT mismatch — payer refuses to extend",
    createdAt: "2026-05-20T09:15:00Z",
    slaTier: "high",
  },
  {
    id: "WL-44156", requestType: "escalate_prebill_auth",
    from: { name: "Diane Aguilar", role: "Auth Specialist" },
    account: { id: "DNFB-01188", patient: "James Whitfield", payer: "Medicare", amount: 64000, vertical: "Infusion", site: "Site 2", cpt: "96365", dischargeDate: "2025-06-02", phase: "prebill" },
    note: "Auth expired before DOS (AUTH-88231 exp 2025-05-30, DOS 2025-06-02). Submitted retro on 05-13, ref pending. Day 9, no payer response yet. Account is also approaching TF — wanted you to have eyes on it before it gets worse.",
    reason: "Expired auth · retro pending · approaching TF",
    createdAt: "2026-05-21T08:00:00Z",
    slaTier: "high",
  },
  {
    id: "WL-44102", requestType: "escalate_postbill_auth",
    from: { name: "Carlos Mendez", role: "Collector" },
    account: { id: "AR-09781", patient: "Anthony Reeves", payer: "United Health", amount: 28400, vertical: "Cardiology", site: "Site 7", cpt: "93458", denialDate: "2026-03-15", phase: "postbill" },
    note: "Denied CO-197 (auth absent). Verified with UHC there was a pre-auth on file but submitted under wrong NPI. Auth team tried to correct — UHC says provider needs to be re-credentialed first. This is past the obtain window. Asking you to call it: appeal route or write-off?",
    reason: "Auth submitted under wrong NPI · credentialing tangle",
    createdAt: "2026-05-19T11:40:00Z",
    slaTier: "medium",
  },
  {
    id: "WL-44031", requestType: "escalate_prebill_auth",
    from: { name: "Diane Aguilar", role: "Auth Specialist" },
    account: { id: "DNFB-02041", patient: "Robert Nguyen", payer: "Medicaid", amount: 12400, vertical: "Behavioral Health", site: "Site 3", cpt: "90837", dischargeDate: "2026-02-25", phase: "prebill" },
    note: "Medicaid auth required for >12 visits. Patient already at visit 18, no auth obtained at intake. Submitted retro, Medicaid policy says they don't grant retros for behavioral health absent emergent justification. Need your view — push for exception, or write down to patient responsibility per the policy?",
    reason: "Medicaid behavioral-health retro generally not granted",
    createdAt: "2026-05-18T15:25:00Z",
    slaTier: "medium",
  },
  {
    id: "WL-43998", requestType: "escalate_postbill_auth",
    from: { name: "Carlos Mendez", role: "Collector" },
    account: { id: "AR-07203", patient: "Sandra Patel", payer: "Aetna", amount: 9800, vertical: "Radiology", site: "Site 9", cpt: "70553", denialDate: "2026-04-10", phase: "postbill" },
    note: "Repeat denial — third time this provider's MRI auths bounce from Aetna with same reason. Possible systemic issue at intake. Routing to you so you can look across the pattern, not just this account.",
    reason: "Pattern flag — repeat MRI auth denials at this site",
    createdAt: "2026-05-17T13:00:00Z",
    slaTier: "low",
  },
];

const fmt = (n) => "$" + n.toLocaleString();

const REQUEST_LABEL = {
  escalate_prebill_auth: "Pre-bill auth · supervisory unblock",
  escalate_postbill_auth: "Post-bill auth · contested obtain",
};

// Compute SLA state from createdAt + slaTier.
function withSla(wl) {
  const elapsed = hoursSince(wl.createdAt);
  const window = SLA_HOURS[wl.slaTier];
  const hoursLeft = window - elapsed;
  const tier = hoursLeft <= 0 ? "breached" : hoursLeft <= window * 0.25 ? "critical" : hoursLeft <= window * 0.5 ? "watch" : "normal";
  return { ...wl, elapsed, window, hoursLeft, slaState: tier };
}

// ── SLA pill — same shape language as Diane's deadline pill ────────────────
function SlaPill({ hoursLeft, state, full }) {
  const map = {
    breached: { bg: "#fef2f2", bd: "#fecaca", fg: RED },
    critical: { bg: "#fef2f2", bd: "#fecaca", fg: RED },
    watch:    { bg: "#fffbeb", bd: "#fde68a", fg: AMBER },
    normal:   { bg: PAPER, bd: LINE, fg: MUTE },
  };
  const c = map[state];
  const label = hoursLeft <= 0
    ? `SLA ${Math.abs(hoursLeft)}h past`
    : hoursLeft < 24
    ? `${hoursLeft}h left`
    : `${Math.round(hoursLeft / 24)}d left`;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: full ? 13 : 12, fontWeight: 600, color: c.fg,
      background: c.bg, border: `1px solid ${c.bd}`,
      padding: full ? "5px 12px" : "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      {(state === "critical" || state === "breached") && (
        <span style={{ width: 5, height: 5, borderRadius: 999, background: RED }} />
      )}
      {label}
    </span>
  );
}

// ── WorkLink row — visually distinct from a "native" item via a sender ─────
// label on the left rail (no color, per design discipline).
function WorkLinkRow({ wl, idx, onOpen }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(wl)}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        background: hover ? PAPER : "#fff",
        borderBottom: `1px solid ${LINE}`,
        transition: "background 120ms ease",
        cursor: "pointer",
        animation: `rise 460ms cubic-bezier(.16,1,.3,1) ${idx * 40}ms both`,
      }}
    >
      {/* sender rail — the visual marker that this is an inbound request */}
      <div style={{
        width: 90, paddingRight: 14, borderRight: `1px solid ${LINE}`,
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: FAINT, textTransform: "uppercase" }}>From</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: INK, lineHeight: 1.2 }}>{wl.from.name.split(" ")[0]}</span>
        <span style={{ fontSize: 10, color: FAINT }}>{wl.from.role}</span>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: INK, letterSpacing: "-0.01em" }}>{wl.reason}</span>
          <span style={{ fontSize: 13, color: MUTE }}>{wl.account.patient}</span>
        </div>
        <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>
          {wl.id} · {wl.account.id} · {wl.account.payer} · {wl.account.vertical} · {wl.account.site}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, justifySelf: "end" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>{fmt(wl.account.amount)}</div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{wl.account.phase === "prebill" ? "gross" : "net / EV"}</div>
        </div>
        <div style={{ minWidth: 78, textAlign: "right" }}>
          <SlaPill hoursLeft={wl.hoursLeft} state={wl.slaState} />
        </div>
        <span style={{ fontSize: 18, color: hover ? INK : LINE, transition: "color 120ms" }}>›</span>
      </div>
    </div>
  );
}

// ── Group header — used to split the two currencies, same rule as Diane ─────
function GroupHeader({ title, count, sum, currency }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: "18px 20px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE }}>{title}</span>
        <span style={{ fontSize: 11, color: FAINT }}>{count} requests</span>
      </div>
      <span style={{ fontSize: 12, color: MUTE }}>
        <strong style={{ color: INK, fontWeight: 600 }}>{fmt(sum)}</strong> {currency}
      </span>
    </div>
  );
}

const btnPrimary = { background: INK, color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnGhost = { background: "#fff", color: INK, border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

// ── WorkLink DETAIL view ────────────────────────────────────────────────────
function WorkLinkDetail({ wl, onBack, onResolve }) {
  const [resolution, setResolution] = useState(null); // 'resolved' | 'reassigned' | 'declined'
  const [resolveNote, setResolveNote] = useState("");
  const [authNumber, setAuthNumber] = useState("");
  const isPre = wl.account.phase === "prebill";

  const SectionLabel = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, marginBottom: 10 }}>{children}</div>
  );
  const card = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, marginBottom: 14 };

  const noteValid = resolveNote.trim().length > 0;
  const authValid = resolution === "resolved" ? authNumber.trim().length > 0 : true;

  const commit = (kind) => {
    if (!noteValid || !authValid) return;
    onResolve && onResolve(wl.id, { kind, note: resolveNote, authNumber: authNumber || null });
  };

  return (
    <div style={{ animation: "slideIn 320ms cubic-bezier(.16,1,.3,1) both" }}>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTE, fontSize: 13, cursor: "pointer", padding: "4px 0", marginBottom: 14 }}>‹ Back to inbound</button>

      {/* identity */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: FAINT }}>
            Inbound WorkLink · from {wl.from.name} ({wl.from.role})
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 2px" }}>{wl.reason}</h2>
          <div style={{ fontSize: 13, color: MUTE }}>{wl.id} · sent {prettyTime(wl.createdAt)} · {REQUEST_LABEL[wl.requestType]}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>{fmt(wl.account.amount)}</div>
          <div style={{ fontSize: 11, color: FAINT }}>{isPre ? "gross charges" : "net / EV"}</div>
        </div>
      </div>

      {/* SLA + account context paired (same compositional move as Diane) */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ ...card, flex: "1 1 260px", borderLeft: `3px solid ${wl.slaState === "breached" || wl.slaState === "critical" ? RED : wl.slaState === "watch" ? AMBER : LINE}` }}>
          <SectionLabel>SLA</SectionLabel>
          <div style={{ marginBottom: 8 }}><SlaPill hoursLeft={wl.hoursLeft} state={wl.slaState} full /></div>
          <div style={{ fontSize: 13, color: MUTE }}>
            <strong style={{ color: INK }}>{wl.slaTier}</strong> tier · {wl.window}h window · {wl.elapsed}h elapsed since sent {prettyTime(wl.createdAt)}.
          </div>
        </div>
        <div style={{ ...card, flex: "1 1 260px" }}>
          <SectionLabel>Account</SectionLabel>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>{wl.account.patient}</div>
          <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.5 }}>
            {wl.account.id} · {wl.account.payer} · {wl.account.vertical} · CPT {wl.account.cpt}<br/>
            {wl.account.site} · {isPre ? `discharge ${prettyDate(wl.account.dischargeDate)}` : `denied ${prettyDate(wl.account.denialDate)}`}
          </div>
        </div>
      </div>

      {/* The note that traveled — the whole point of "note required to send" */}
      <div style={card}>
        <SectionLabel>Sender's note · context that traveled with this WorkLink</SectionLabel>
        <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, fontSize: 14, lineHeight: 1.65, color: INK }}>
          {wl.note}
        </div>
        <div style={{ fontSize: 11, color: FAINT, marginTop: 10 }}>
          {wl.from.name} logged this note before escalating · stored on the account · the obtaining work to date is documented in the EHR via prior batches.
        </div>
      </div>

      {/* Resolution actions */}
      <div style={card}>
        <SectionLabel>Resolution</SectionLabel>
        {!resolution ? (
          <>
            <div style={{ fontSize: 13, color: MUTE, marginBottom: 14 }}>
              Three paths. Each requires a note that goes back to {wl.from.name.split(" ")[0]} and into the account history.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => setResolution("resolved")} style={btnPrimary}>Resolved · return to {wl.from.name.split(" ")[0]}</button>
              <button onClick={() => setResolution("reassigned")} style={btnGhost}>Reassign within auth team</button>
              <button onClick={() => setResolution("declined")} style={btnGhost}>Decline · send back with reason</button>
            </div>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 12 }}>
              Resolved returns the dollars to the originating queue (auth on file → release / refile). Reassign hands to another auth specialist (dollars stay in WorkLink, recipient changes). Decline pushes back with explanation — dollars return to {wl.from.name.split(" ")[0]}'s queue.
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: resolution === "resolved" ? GREEN : AMBER }} />
              <strong style={{ color: INK }}>
                {resolution === "resolved" && `Resolving · returning to ${wl.from.name.split(" ")[0]} with the auth`}
                {resolution === "reassigned" && "Reassigning within auth team"}
                {resolution === "declined" && `Declining · returning to ${wl.from.name.split(" ")[0]}`}
              </strong>
              <button onClick={() => { setResolution(null); setResolveNote(""); setAuthNumber(""); }} style={{ marginLeft: "auto", background: "none", border: "none", color: MUTE, fontSize: 12, cursor: "pointer" }}>Change</button>
            </div>

            {resolution === "resolved" && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: MUTE, display: "block", marginBottom: 6 }}>Authorization number obtained (required)</label>
                <input value={authNumber} onChange={(e) => setAuthNumber(e.target.value)} placeholder="e.g. AUTH-99214-RETRO"
                  style={{ width: "100%", border: `1px solid ${authNumber.trim() ? LINE : "#fca5a5"}`, borderRadius: 9, padding: "9px 12px", fontSize: 13, color: INK, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>Same rule as Diane's resolution — the auth number goes in the note, releases the claim, and loads to the EHR.</div>
              </div>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: MUTE, display: "block", marginBottom: 6 }}>
              {resolution === "resolved" && "Resolution note (required)"}
              {resolution === "reassigned" && "Reassignment note · whom and why (required)"}
              {resolution === "declined" && "Reason for declining (required) — this travels back as a new WorkLink note"}
            </label>
            <textarea value={resolveNote} onChange={(e) => setResolveNote(e.target.value)}
              placeholder={
                resolution === "resolved" ? `e.g. "Called payer's medical director, got verbal approval, retro-auth ${authNumber || "AUTH-XXXX"} issued. Claim ready to release."`
                : resolution === "reassigned" ? "e.g. \"Reassigning to specialist with peer-to-peer access to this payer.\""
                : "e.g. \"This is a coding issue, not auth — route to coding first.\""
              }
              style={{ width: "100%", minHeight: 80, border: `1px solid ${noteValid ? LINE : "#fca5a5"}`, borderRadius: 9, padding: "10px 12px", fontSize: 13, color: INK, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={() => commit(resolution)} disabled={!noteValid || !authValid}
                style={{ ...btnPrimary, opacity: (noteValid && authValid) ? 1 : 0.4, cursor: (noteValid && authValid) ? "pointer" : "not-allowed" }}>
                Confirm · send back to {wl.from.name.split(" ")[0]}
              </button>
            </div>
            {(!noteValid || !authValid) && (
              <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 10 }}>
                {!authValid && "Auth number required. "}
                {!noteValid && "Resolution note required — it returns to the sender and is the audit record of what happened."}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main worklist ───────────────────────────────────────────────────────────
export default function WorkLinkPaula({ embedded = false } = {}) {
  const [overrides, setOverrides] = useState({});
  const scored = useMemo(
    () => WORKLINKS.map(withSla).filter((w) => !overrides[w.id]?.resolved),
    [overrides]
  );
  const [sortMode, setSortMode] = useState("dollar"); // dollar | sla
  const [breachOnly, setBreachOnly] = useState(false);
  const [open, setOpen] = useState(null);

  const onResolve = (id, payload) => {
    setOverrides((o) => ({ ...o, [id]: { resolved: true, ...payload } }));
    setOpen(null);
  };

  const sorted = useMemo(() => {
    let list = [...scored];
    if (breachOnly) list = list.filter((w) => w.slaState === "breached" || w.slaState === "critical");
    list.sort((a, b) =>
      sortMode === "dollar" ? b.account.amount - a.account.amount : a.hoursLeft - b.hoursLeft
    );
    return list;
  }, [scored, sortMode, breachOnly]);

  const prebill = scored.filter((w) => w.account.phase === "prebill");
  const postbill = scored.filter((w) => w.account.phase === "postbill");
  const preSum = prebill.reduce((s, w) => s + w.account.amount, 0);
  const postSum = postbill.reduce((s, w) => s + w.account.amount, 0);
  const breaching = scored.filter((w) => w.slaState === "breached" || w.slaState === "critical");
  const breachSum = breaching.reduce((s, w) => s + w.account.amount, 0);

  const wrap = { fontFamily: "'Söhne', ui-sans-serif, system-ui, -apple-system, sans-serif", background: PAPER, minHeight: "100%", color: INK, padding: "28px 24px", WebkitFontSmoothing: "antialiased" };
  const inner = { maxWidth: 880, margin: "0 auto" };

  if (open) {
    return (
      <div style={wrap}>
        <div style={inner}>
          <WorkLinkDetail wl={open} onBack={() => setOpen(null)} onResolve={onResolve} />
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <style>{`
        @keyframes rise { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:translateY(0);} }
        @keyframes fade { from { opacity:0; } to { opacity:1; } }
        @keyframes slideIn { from { opacity:0; transform:translateX(12px);} to { opacity:1; transform:translateX(0);} }
      `}</style>
      <div style={inner}>
        {/* header — two currencies shown SEPARATELY, never summed. Hidden when
            embedded inside a parent app shell that already provides identity. */}
        {!embedded && (
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", animation: "fade 600ms ease both" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT }}>
                WorkLink · Inbound · Authorization Team Lead
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>Paula's queue</h1>
            </div>
            <div style={{ fontSize: 12, color: MUTE, textAlign: "right" }}>
              <div><strong style={{ color: INK }}>{fmt(preSum)}</strong> gross · {prebill.length} pre-bill</div>
              <div style={{ marginTop: 2 }}><strong style={{ color: INK }}>{fmt(postSum)}</strong> net/EV · {postbill.length} post-bill</div>
            </div>
          </div>
        )}
        {embedded && (
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", animation: "fade 600ms ease both", fontSize: 12, color: MUTE }}>
            <div style={{ textAlign: "right" }}>
              <div><strong style={{ color: INK }}>{fmt(preSum)}</strong> gross · {prebill.length} pre-bill</div>
              <div style={{ marginTop: 2 }}><strong style={{ color: INK }}>{fmt(postSum)}</strong> net/EV · {postbill.length} post-bill</div>
            </div>
          </div>
        )}

        {/* lead with the answer — clickable when there's SLA pressure */}
        <div
          onClick={breaching.length ? () => { setBreachOnly(true); setSortMode("sla"); } : undefined}
          style={{
            marginTop: 18, padding: "18px 20px", background: "#fff",
            border: `1px solid ${LINE}`, borderLeft: `3px solid ${breaching.length ? RED : GREEN}`,
            borderRadius: 14, animation: "rise 520ms cubic-bezier(.16,1,.3,1) 80ms both",
            cursor: breaching.length ? "pointer" : "default",
          }}
        >
          {breaching.length ? (
            <div style={{ fontSize: 16, lineHeight: 1.5 }}>
              <strong style={{ color: RED }}>{breaching.length} requests</strong> are at or past SLA — <strong>{fmt(breachSum)}</strong> at stake.
              <span style={{ color: MUTE }}> Click to work these first →</span>
            </div>
          ) : (
            <div style={{ fontSize: 16 }}>All inbound work within SLA. Work by dollar, largest first.</div>
          )}
        </div>

        {/* controls */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, animation: "fade 700ms ease 160ms both" }}>
          <div style={{ display: "inline-flex", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: 3 }}>
            {[["dollar", "Dollar"], ["sla", "SLA"]].map(([k, l]) => (
              <button key={k} onClick={() => setSortMode(k)} style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", background: sortMode === k ? INK : "transparent", color: sortMode === k ? "#fff" : MUTE }}>
                Sort: {l}
              </button>
            ))}
          </div>
          <button
            onClick={() => setBreachOnly((v) => !v)}
            style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 9, border: `1px solid ${breachOnly ? RED : LINE}`, cursor: "pointer", background: breachOnly ? "#fef2f2" : "#fff", color: breachOnly ? RED : MUTE }}>
            {breachOnly ? "✓ SLA risk only" : "Show SLA risk only"}
          </button>
        </div>

        {/* The two-currency split — same rule as Diane */}
        <div style={{ marginTop: 16, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden" }}>
          {sorted.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: FAINT, fontSize: 14 }}>
              No inbound WorkLinks {breachOnly ? "at SLA risk" : "in queue"}.
            </div>
          ) : (
            <>
              {sorted.filter((w) => w.account.phase === "prebill").length > 0 && (
                <>
                  <GroupHeader
                    title="Pre-bill · supervisory unblock"
                    count={sorted.filter((w) => w.account.phase === "prebill").length}
                    sum={sorted.filter((w) => w.account.phase === "prebill").reduce((s, w) => s + w.account.amount, 0)}
                    currency="gross"
                  />
                  {sorted.filter((w) => w.account.phase === "prebill").map((wl, i) => (
                    <WorkLinkRow key={wl.id} wl={wl} idx={i} onOpen={setOpen} />
                  ))}
                </>
              )}
              {sorted.filter((w) => w.account.phase === "postbill").length > 0 && (
                <>
                  <div style={{ height: 1, background: LINE }} />
                  <GroupHeader
                    title="Post-bill · contested obtain"
                    count={sorted.filter((w) => w.account.phase === "postbill").length}
                    sum={sorted.filter((w) => w.account.phase === "postbill").reduce((s, w) => s + w.account.amount, 0)}
                    currency="net / EV"
                  />
                  {sorted.filter((w) => w.account.phase === "postbill").map((wl, i) => (
                    <WorkLinkRow key={wl.id} wl={wl} idx={i + prebill.length} onOpen={setOpen} />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div style={{ fontSize: 11, color: FAINT, marginTop: 14, textAlign: "center", animation: "fade 800ms ease 300ms both" }}>
          Pre-bill at gross · post-bill at net / EV · the two currencies are never summed.
          SLA tiers: critical 4h · high 24h · medium 48h · low 72h. Breaches escalate to the RCM director.
        </div>
      </div>
    </div>
  );
}
