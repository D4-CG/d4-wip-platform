import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import AR_DATA from "../app/data/ar-accounts.json";
import DNFB_DATA from "../app/data/dnfb-accounts.json";
import SITE_NPR from "../app/data/site-npr.json";
import SITE_BASELINE from "../app/data/site-baseline.json";
import TIMESERIES from "../app/data/timeseries.json";
import DAILY from "../app/data/daily-baseline.json";
import CFO_KPIS from "../app/data/cfo-kpis.json";
import WorkLinkPaula from "./WorkLinkPaula";

// ─── PHASE A.1: SHARED DESIGN TOKENS ─────────────────────────────────────────
// Hex values verified identical across Carlos's and Diane's standalone artifacts.
// These name what existed scattered as inline literals (718 occurrences across
// this file as of port). New code MUST use these constants. Old code stays —
// the hex values are the same, retroactive replacement is busywork.
//
// Carlos's palette adds BLUE/PURPLE/TEAL for status pills and inbound rows.
// Diane's palette is the subset {INK, MUTE, FAINT, LINE, PAPER, RED, AMBER, GREEN}.
// All future surfaces (Paula, Amara, Renata, James) draw from this set.
const INK    = "#0f172a";   // Primary text, h1, strong values
const MUTE   = "#64748b";   // Secondary text, metadata
const FAINT  = "#94a3b8";   // Tertiary text, separators in metadata lines
const LINE   = "#e2e8f0";   // Borders, dividers
const PAPER  = "#f8fafc";   // Card backgrounds (hover, sleeping state, subtle tints)
const RED    = "#dc2626";   // Critical urgency, breached SLA, write-off
const AMBER  = "#d97706";   // Watch urgency, in-progress alerts
const GREEN  = "#16a34a";   // All-clear state, paid, resolved
const BLUE   = "#2563eb";   // In-progress status, inbound WL accent
const PURPLE = "#7c3aed";   // Reserved: escalation, supervisory routing
const TEAL   = "#0d9488";   // Reserved: specialist routing

// ─── SHARED KEYFRAME STYLES ──────────────────────────────────────────────────
// Both standalones use these exact keyframes. Carlos staggers rows at idx*28ms,
// Diane at idx*40ms; we'll preserve each surface's rhythm in its own renders.
// This style block renders ONCE at the platform root (via PlatformStyles below).
const PLATFORM_KEYFRAMES = `
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
`;
function PlatformStyles() {
  return <style>{PLATFORM_KEYFRAMES}</style>;
}

// ─── PHASE A.2: VISUAL PRIMITIVES ────────────────────────────────────────────
// Date formatters (Carlos's standalone provides these; platform did not have them).
// Used by CollectorDeadlinePill ("closes May 12") and any surface chrome with a date.
const prettyDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const prettyDateLong = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

// ── Pill ─────────────────────────────────────────────────────────────────────
// Low-level inline metadata badge. Rounded-rect (radius 6), tinted bg + colored fg.
// Carlos's standalone primitive — used in CollectorDeadlinePill, NEW DENIAL flag,
// "+N more" overflow indicators, and any short colored tag.
function Pill({ children, color, bg }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, color, background: bg, padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

// ── SlaPill ──────────────────────────────────────────────────────────────────
// WorkLink SLA timer. Unified to Diane+Paula's pill-capsule design (radius 999,
// 1px tinted border, soft tinted bg). Carlos's older rounded-rect SLA pill is
// retired per the "unify on newer design language" decision.
// Used on every inbound WorkLink row across Carlos, Diane, Paula surfaces.
// `full` prop scales up for detail-view headers.
function SlaPill({ hoursLeft, state, full }) {
  const map = {
    breached: { bg: "#fef2f2", bd: "#fecaca", fg: RED },
    critical: { bg: "#fef2f2", bd: "#fecaca", fg: RED },
    watch:    { bg: "#fffbeb", bd: "#fde68a", fg: AMBER },
    normal:   { bg: PAPER,     bd: LINE,      fg: MUTE },
  };
  const c = map[state] || map.normal;
  const label =
    hoursLeft <= 0 ? `SLA ${Math.abs(hoursLeft)}h past`
    : hoursLeft < 24 ? `${hoursLeft}h left`
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

// ── CollectorDeadlinePill ────────────────────────────────────────────────────
// Information-dense deadline pill for the collector surface (Carlos, Medicare,
// Medicaid, Self-Pay, WC). Reads platform-shape account: bindingLabel +
// bindingCloseDate are STRINGS; the days-remaining number comes from
// appealTfRemaining (AR) or submissionTfRemaining (DNFB). Carlos's standalone
// collapsed these into one field named `bindingClock` (a number); platform
// keeps `bindingClock` as the TYPE identifier and stores the number separately.
// Renders rich text: "Appeal TF · 14d · closes May 12". Carries more semantic
// weight because collector surface has no tab to disambiguate deadline type.
function CollectorDeadlinePill({ acc }) {
  const c = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  // Strip payer prefix — platform's bindingLabel is '[Payer] appeal TF' but
  // payer already appears in the row's metadata line above. Match Carlos's
  // standalone format: 'Appeal TF' / 'Submission TF' only.
  const rawLbl = acc.bindingLabel || "";
  const lbl = rawLbl.toLowerCase().includes("appeal") ? "Appeal TF"
            : rawLbl.toLowerCase().includes("submission") ? "Submission TF"
            : rawLbl;
  const dt = acc.bindingCloseDate;
  if (c == null) {
    if (acc.followUpDaysAway != null && acc.followUpDaysAway <= 0) return <Pill color={AMBER} bg="#fef3c7">Follow-up due</Pill>;
    if (acc.followUpDaysAway != null && acc.followUpDaysAway <= 7) return <Pill color={MUTE} bg="#f1f5f9">Follow-up {acc.followUpDaysAway}d</Pill>;
    return null;
  }
  if (c <= 0) return <Pill color={RED} bg="#fecaca">{lbl} CLOSED · {dt ? prettyDate(dt) : "—"}</Pill>;
  if (c <= 14) return <Pill color={RED} bg="#fee2e2">{lbl} · {c}d · closes {prettyDate(dt)}</Pill>;
  if (acc.followUpDaysAway != null && acc.followUpDaysAway <= 0) return <Pill color={AMBER} bg="#fef3c7">Follow-up due</Pill>;
  if (c <= 30) return <Pill color={AMBER} bg="#fef3c7">{lbl} · {c}d · closes {prettyDate(dt)}</Pill>;
  if (acc.followUpDaysAway != null && acc.followUpDaysAway <= 7) return <Pill color={MUTE} bg="#f1f5f9">Follow-up {acc.followUpDaysAway}d</Pill>;
  return null;
}

// ── AuthDeadlinePill ─────────────────────────────────────────────────────────
// Minimal deadline pill for the auth surface (Diane). Renders short labels
// ("14d left" / "due today" / "3d past"). Pill capsule with red-dot prefix for
// critical. Justified by Diane's tabbed surface — pre-bill / post-bill tab plus
// the row's hold/denial code already disambiguates the deadline type.
// `full` prop scales up for detail-view headers.
function AuthDeadlinePill({ daysLeft, tier, full }) {
  const map = {
    critical: { bg: "#fef2f2", bd: "#fecaca", fg: RED },
    watch:    { bg: "#fffbeb", bd: "#fde68a", fg: AMBER },
    normal:   { bg: PAPER,     bd: LINE,      fg: MUTE },
  };
  const c = map[tier] || map.normal;
  const label =
    daysLeft < 0 ? `${Math.abs(daysLeft)}d past`
    : daysLeft === 0 ? "due today"
    : `${daysLeft}d left`;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: full ? 13 : 12, fontWeight: 600, color: c.fg,
      background: c.bg, border: `1px solid ${c.bd}`,
      padding: full ? "5px 12px" : "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      {tier === "critical" && (
        <span style={{ width: 5, height: 5, borderRadius: 999, background: RED }} />
      )}
      {label}
    </span>
  );
}

// ── StatusPill ───────────────────────────────────────────────────────────────
// Account status indicator. Renders ONLY for not_started and in_progress per
// Carlos's standalone reasoning: other statuses (followup_due, awaiting_payer,
// awaiting_wl, partial) are either stale-by-the-time-collector-sees-row or
// implied by queue gating (the queue itself surfaces follow-up-due items).
// Reads from platform's STATUS dict (defined below this primitive block).
function StatusPill({ status }) {
  if (status !== "not_started" && status !== "in_progress") return null;
  const s = STATUS[status];
  if (!s) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: s.color }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
      {s.label}
    </span>
  );
}

// ─── PHASE A.3: ROW COMPONENTS ───────────────────────────────────────────────
// Three rows port faithfully from the standalones. They are NOT unified — each
// surface has its own canonical row design driven by different IA needs.
//
// CollectorAccountRow — Carlos's design. 3px colored left border (red if TF≤14d,
// else status color). Card stacks: each row is a standalone card with
// marginBottom and rounded corners, separated by visible white gap. Hover lifts
// the card with transform translateY(-1px) and a soft shadow. Animation: idx*28ms
// stagger, 380ms rise. Carries primary issue + "+N more" + NEW DENIAL pill on
// top line; patient/payer/id on second line; StatusPill + CollectorDeadlinePill
// on third line; EV + AR balance right-aligned. No chevron — click navigates.
function CollectorAccountRow({ acc, onSelect, idx }) {
  const tfRemaining = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  const isUrgent =
    (tfRemaining != null && tfRemaining <= 14) ||
    (acc.followUpDaysAway != null && acc.followUpDaysAway <= 0);
  const statusColor = STATUS[acc.status]?.color || MUTE;
  const borderColor = isUrgent ? RED : statusColor;
  const primaryIssue = acc.issues?.find(i => i.primary) || acc.issues?.[0];
  const moreIssues = acc.issues && acc.issues.length > 1;
  return (
    <div
      onClick={() => onSelect(acc.id)}
      style={{
        padding: "14px 18px", background: "#fff", border: `1px solid ${LINE}`,
        borderLeft: `3px solid ${borderColor}`, borderRadius: 10, marginBottom: 8, cursor: "pointer",
        display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
        transition: "transform 120ms, box-shadow 120ms",
        animation: `rise 380ms cubic-bezier(.16,1,.3,1) ${Math.min((idx || 0) * 28, 280)}ms both`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: INK, marginBottom: 4, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {primaryIssue && (
            <span>
              {CLAIM_STATE_CODES.has(primaryIssue.code)
                ? primaryIssue.label
                : `${primaryIssue.code} · ${primaryIssue.label}`}
            </span>
          )}
          {moreIssues && <Pill color={MUTE} bg="#f1f5f9">+{acc.issues.length - 1} more</Pill>}
          {acc.newDenialOverride && <Pill color={RED} bg="#fee2e2">NEW DENIAL</Pill>}
        </div>
        <div style={{ fontSize: 12, color: MUTE, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>{acc.patient}</span><span style={{ color: FAINT }}>·</span>
          <span>{acc.payer}</span><span style={{ color: FAINT }}>·</span>
          <span style={{ color: FAINT }}>{acc.id}</span>
          {acc.followUpDate && acc.followUpDaysAway > 0 && (
            <>
              <span style={{ color: FAINT }}>·</span>
              <span style={{ color: MUTE }}>Follow-up {prettyDate(acc.followUpDate)}</span>
            </>
          )}
          {acc.status === "partial" && acc.paid && (
            <>
              <span style={{ color: FAINT }}>·</span>
              <span style={{ color: MUTE }}>Partial: paid {"$" + Math.round(acc.paid).toLocaleString()}</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <StatusPill status={acc.status} />
          <CollectorDeadlinePill acc={acc} />
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10.5, color: FAINT, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>EV</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>
          {"$" + Math.round(acc.expectedValue || acc.ev || 0).toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: MUTE }}>
          {"$" + Math.round(acc.amount || 0).toLocaleString()} AR
        </div>
      </div>
    </div>
  );
}

// AuthAccountRow — Diane's design. No left border; continuous rows inside a
// rounded card container, separated by borderBottom. Hover changes background
// to PAPER. Sleeping accounts (status === "awaiting") render at opacity 0.72
// with subtle bg shift. Animation: idx*40ms stagger, 460ms rise. Renders the
// hold/denial reason + patient name on top line; account id + payer + vertical
// + site + optional status badge on second line. Amount + currency type +
// AuthDeadlinePill + chevron on the right. Tier derived locally from daysLeft
// using Diane's thresholds (≤7 critical, ≤21 watch).
function AuthAccountRow({ acc, onSelect, idx, holdLabels, denialLabels }) {
  const [hover, setHover] = useState(false);
  const isPre = acc.phase === "prebill" || acc.type === "dnfb";
  const reason = isPre
    ? (holdLabels?.[acc.holdCode] || acc.cfg?.label || acc.holdCode)
    : (denialLabels?.[acc.denialCode] || acc.cfg?.label || acc.denialCode || "Denied");
  const daysLeft = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  const tier = daysLeft == null ? "normal" : daysLeft <= 7 ? "critical" : daysLeft <= 21 ? "watch" : "normal";
  const sleeping = STATUS[acc.status]?.group === "awaiting" && acc.status === "awaiting_payer";
  const statusVisible = acc.status && acc.status !== "not_started" && STATUS[acc.status];
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => onSelect(acc)}
      style={{
        display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 16,
        padding: "16px 20px",
        background: hover ? PAPER : (sleeping ? "#fbfcfd" : "#fff"),
        borderBottom: `1px solid ${LINE}`,
        transition: "background 120ms ease",
        cursor: "pointer", opacity: sleeping ? 0.72 : 1,
        animation: `rise 460ms cubic-bezier(.16,1,.3,1) ${(idx || 0) * 40}ms both`,
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: INK, letterSpacing: "-0.01em" }}>{reason}</span>
          <span style={{ fontSize: 13, color: MUTE }}>{acc.patient}</span>
        </div>
        <div style={{ fontSize: 12, color: FAINT, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{acc.id} · {acc.payer}{acc.vertical ? ` · ${acc.vertical}` : ""}{acc.site ? ` · ${acc.site}` : ""}</span>
          {statusVisible && (
            <span style={{ fontSize: 11, fontWeight: 600, color: STATUS[acc.status].color, background: PAPER, border: `1px solid ${LINE}`, borderRadius: 999, padding: "1px 8px" }}>
              {STATUS[acc.status].label}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, justifySelf: "end" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>
            {"$" + Math.round(acc.amount || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>
            {isPre ? "gross" : "net / EV"}
          </div>
        </div>
        <div style={{ minWidth: 78, textAlign: "right" }}>
          {sleeping && acc.followUpDate ? (
            <div style={{ fontSize: 11, color: MUTE, lineHeight: 1.3 }}>
              follow-up<br />
              <span style={{ fontWeight: 600, color: INK }}>{prettyDate(acc.followUpDate)}</span>
            </div>
          ) : daysLeft != null ? (
            <AuthDeadlinePill daysLeft={daysLeft} tier={tier} />
          ) : null}
        </div>
        <span style={{ fontSize: 18, color: hover ? INK : LINE, transition: "color 120ms" }}>›</span>
      </div>
    </div>
  );
}

// InboundWorkLinkRow — shared between Carlos and Diane surfaces. The 84-90px
// FROM rail on the left is the canonical "this came from someone else" visual
// marker (per the WorkLink Integration Pattern: integrate, don't separate).
// Same shape language as the surface's native AccountRow, with sender context
// elevated into a column instead of buried in metadata. Used on every collector
// queue and every auth queue when an inbound WL is present. Reads enriched WL
// state: from{name,role}, reason, note, hoursLeft, slaState, account (looked up).
// `variant` prop chooses between Carlos's card-stacks rhythm (margins, radius,
// hover lift) and Diane's continuous-rows rhythm (borderBottom, hover bg).
function InboundWorkLinkRow({ wl, idx, onOpen, variant = "card" }) {
  const [hover, setHover] = useState(false);
  const acc = wl.account;
  const isUrgent = wl.slaState === "breached" || wl.slaState === "critical";
  const isCard = variant === "card";
  // Carlos's standalone uses card variant with 3px colored left border (red if
  // urgent, else BLUE for "inbound accent"). Diane's standalone uses continuous
  // variant — no left border, just borderBottom separation.
  const cardStyles = isCard ? {
    border: `1px solid ${LINE}`,
    borderLeft: `3px solid ${isUrgent ? RED : BLUE}`,
    borderRadius: 10, marginBottom: 8,
  } : {
    borderBottom: `1px solid ${LINE}`,
  };
  const cardHover = isCard
    ? { transform: "translateY(-1px)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }
    : { background: PAPER };
  return (
    <div
      onMouseEnter={(e) => { setHover(true); if (isCard) { e.currentTarget.style.transform = cardHover.transform; e.currentTarget.style.boxShadow = cardHover.boxShadow; } }}
      onMouseLeave={(e) => { setHover(false); if (isCard) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; } }}
      onClick={() => onOpen(wl)}
      style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 16,
        padding: isCard ? "14px 18px" : "16px 20px",
        background: !isCard && hover ? PAPER : "#fff",
        cursor: "pointer",
        transition: isCard ? "transform 120ms, box-shadow 120ms" : "background 120ms ease",
        animation: `rise ${isCard ? 380 : 460}ms cubic-bezier(.16,1,.3,1) ${(idx || 0) * (isCard ? 28 : 40)}ms both`,
        ...cardStyles,
      }}>
      {/* FROM rail */}
      <div style={{ width: 84, paddingRight: 12, borderRight: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: FAINT, textTransform: "uppercase" }}>WL · from</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: INK, lineHeight: 1.2 }}>
          {(wl.from?.name || "—").split(" ")[0]}
        </span>
        <span style={{ fontSize: 10, color: FAINT }}>{wl.from?.role || wl.fromArea || ""}</span>
      </div>
      {/* Content */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: INK, marginBottom: 4, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span>{wl.reason || (wl.requestLabel || "WorkLink") + (acc ? " ready" : "")}</span>
          <Pill color={BLUE} bg="#dbeafe">INBOUND</Pill>
        </div>
        <div style={{ fontSize: 12, color: MUTE, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {acc ? (
            <>
              <span>{acc.patient}</span><span style={{ color: FAINT }}>·</span>
              <span>{acc.payer}</span><span style={{ color: FAINT }}>·</span>
              <span style={{ color: FAINT }}>{acc.id}</span>
            </>
          ) : (
            <span style={{ color: FAINT }}>Account {wl.accountId}</span>
          )}
          <span style={{ color: FAINT }}>·</span>
          <span style={{ color: FAINT }}>{wl.id}</span>
        </div>
        {wl.note && (
          <div style={{ fontSize: 12, color: MUTE, marginTop: 4, lineHeight: 1.45 }}>
            {wl.note.length > 100 ? wl.note.slice(0, 100) + "..." : wl.note}
          </div>
        )}
      </div>
      {/* Right side: EV (from account) + SLA pill */}
      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        {acc && (
          <>
            <div style={{ fontSize: 10.5, color: FAINT, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>EV</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>
              {"$" + Math.round(acc.expectedValue || acc.ev || acc.amount || 0).toLocaleString()}
            </div>
          </>
        )}
        <SlaPill hoursLeft={wl.hoursLeft} state={wl.slaState} />
      </div>
    </div>
  );
}

// ─── PHASE A.4: BURNING BANNER ───────────────────────────────────────────────
// Shared "what needs attention now" alert. White card with 3px colored left
// border — RED when burning, GREEN when all clear. Sentence-format body. Clickable
// when burning (jumps to a filtered view via onClick handler).
//
// Two variants, both seen in standalones:
//   "overline" — Carlos's design. Tiny uppercase overline ("WORK FIRST" /
//     "ALL CLEAR IN YOUR BOOK") above larger body text. Hover-lift effect.
//     "show these →" affordance right-aligned. Visual weight: prominent.
//   "single" — Diane's design. Single-line body. Inline "Click to work these
//     first →" affordance. No hover lift. Visual weight: quieter.
//
// Caller passes already-computed numbers + an idleMessage. The component is
// thin — it doesn't compute burning logic, it just renders what it's given.
function BurningBanner({
  burningCount, burningEV, breakdown,
  idleMessage, idleSecondary,
  onClick, variant = "overline",
}) {
  const clickable = burningCount > 0 && onClick;
  const isOverline = variant === "overline";
  const fmtMoney = (n) => "$" + Math.round(n || 0).toLocaleString();
  const baseStyle = {
    padding: isOverline ? "16px 20px" : "18px 20px",
    background: "#fff",
    border: `1px solid ${LINE}`,
    borderLeft: `3px solid ${burningCount ? RED : GREEN}`,
    borderRadius: isOverline ? 12 : 14,
    cursor: clickable ? "pointer" : "default",
    transition: "transform 120ms, box-shadow 120ms",
    animation: `rise ${isOverline ? 480 : 520}ms cubic-bezier(.16,1,.3,1) ${isOverline ? 60 : 80}ms both`,
  };
  const handleEnter = (e) => {
    if (!clickable || !isOverline) return;
    e.currentTarget.style.transform = "translateY(-1px)";
    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
  };
  const handleLeave = (e) => {
    if (!isOverline) return;
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = "none";
  };

  if (isOverline) {
    return (
      <div onClick={clickable ? onClick : undefined} role={clickable ? "button" : undefined}
        style={baseStyle} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: burningCount ? RED : GREEN, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {burningCount ? "Work first" : "All clear in your book"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginTop: 4, lineHeight: 1.4 }}>
              {burningCount ? (
                <>
                  <strong>{burningCount}</strong> {burningCount === 1 ? "item" : "items"} need attention now
                  {breakdown && <> — {breakdown}</>}
                  {burningEV != null && <> — <strong>{fmtMoney(burningEV)}</strong> EV at risk</>}
                </>
              ) : (
                <>{idleMessage || "No deadline pressure."}{idleSecondary && <> {idleSecondary}</>}</>
              )}
            </div>
          </div>
          {burningCount > 0 && (
            <div style={{ fontSize: 11, color: MUTE, whiteSpace: "nowrap", flexShrink: 0 }}>show these →</div>
          )}
        </div>
      </div>
    );
  }

  // single-line variant
  return (
    <div onClick={clickable ? onClick : undefined} style={baseStyle}>
      {burningCount ? (
        <div style={{ fontSize: 16, lineHeight: 1.5 }}>
          <strong style={{ color: RED }}>{burningCount} {burningCount === 1 ? "item" : "items"}</strong>
          {" need attention now"}
          {breakdown && <> — {breakdown}</>}
          {burningEV != null && <> — <strong>{fmtMoney(burningEV)}</strong> at risk</>}
          .<span style={{ color: MUTE }}> Click to work these first →</span>
        </div>
      ) : (
        <div style={{ fontSize: 16 }}>{idleMessage || "Nothing burning."}{idleSecondary && <> {idleSecondary}</>}</div>
      )}
    </div>
  );
}

// ─── PHASE A.5: SURFACE HEADER ───────────────────────────────────────────────
// Shared header chrome. Tiny uppercase overline (role context like
// "AUTHORIZATION · OBTAINING" or "COLLECTIONS · COMMERCIAL · CARLOS MENDEZ"),
// then h1 with the surface's title, with a right-aligned 2-line summary slot.
// Identical pattern across all three standalones; this consolidates it.
//
// `summary` is JSX so each surface chooses what to put in the right slot —
// Carlos shows "$X EV · N items ready" + "$Y AR balance · M inbound WLs";
// Diane shows "$X gross · N pre-bill" + "$Y net/EV · M post-bill".
function SurfaceHeader({ overline, title, summary }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 16, marginBottom: 18,
      animation: "fade 600ms ease both",
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT }}>
          {overline}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0", color: INK }}>
          {title}
        </h1>
      </div>
      {summary && (
        <div style={{ fontSize: 12, color: MUTE, textAlign: "right" }}>
          {summary}
        </div>
      )}
    </div>
  );
}

// ─── PHASE A.6: GROUP HEADER + BUTTON STYLES ─────────────────────────────────
// GroupHeader — Paula's surface grouping divider. Renders "PRE-BILL ·
// SUPERVISORY UNBLOCK   3 requests" left, dollar subtotal right. Used inside
// her single rounded card to separate sections of the queue. Carlos and Diane
// don't use this (Carlos has TF filter pills, Diane has tabs) but Paula's
// surface depends on it for Phase D.
function GroupHeader({ title, count, sum, currency }) {
  const fmtMoney = (n) => "$" + Math.round(n || 0).toLocaleString();
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: "18px 20px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE }}>{title}</span>
        <span style={{ fontSize: 11, color: FAINT }}>{count} {count === 1 ? "request" : "requests"}</span>
      </div>
      {sum != null && (
        <span style={{ fontSize: 12, color: MUTE }}>
          <strong style={{ color: INK, fontWeight: 600 }}>{fmtMoney(sum)}</strong> {currency}
        </span>
      )}
    </div>
  );
}

// Shared button styles. All three standalones use the same primary/ghost
// pattern with minor variations; this is the canonical pair. Used in detail
// views, banners, and confirmation flows. NOT React components — style objects
// callers spread into <button style={...btnPrimary}>...</button>.
const btnPrimary = { background: INK, color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnGhost = { background: "#fff", color: INK, border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnGhostLink = { background: "none", border: "none", color: MUTE, fontSize: 11, fontFamily: "inherit", cursor: "pointer", textDecoration: "underline", padding: "4px 0" };

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

// ─── Payer Rules Table: TF + Appeal windows ───────────────────────────────────
// Replaces the prior hardcoded 120d TF assumption (CollectorView urgencyFactor).
// Drives the binding clock on every account: AR uses Appeal TF (post-denial),
// DNFB uses Submission TF (pre-billing). When neither rule exists for a payer,
// _default applies (conservative 180d submission / 90d appeal).
//
// BCBS federation note: BCBS plans vary 60-730d depending on the regional
// licensee (Anthem, Highmark, Independence BC, Carefirst, Regence, Premera,
// Federal, etc.). The values below use a single representative window for the
// catch-all "Blue Cross" / "Blue Shield" / "BCBS" strings. Production should
// override per-account from the eligibility/cards source of truth.
//
// Aetna appeal 60d and UHC appeal 90d reflect current code state. Canon docs
// the audit findings (some Aetna plans use 180d; some UHC plans use 65d) but
// values stay as-is pending payer-by-payer verification with the source data.
// Refs: Payer Rules Table module (Notion canon).
const PAYER_RULES = {
  "Aetna":              { submissionTfDays: 120, appealTfDays: 60,  label: "Aetna" },
  "Aetna Better Health":{ submissionTfDays: 120, appealTfDays: 60,  label: "Aetna" },
  "CVS Aetna":          { submissionTfDays: 120, appealTfDays: 60,  label: "Aetna" },
  "Blue Cross":         { submissionTfDays: 180, appealTfDays: 180, label: "BCBS" },
  "Blue Shield":        { submissionTfDays: 180, appealTfDays: 180, label: "BCBS" },
  "BCBS":               { submissionTfDays: 180, appealTfDays: 180, label: "BCBS" },
  "Blue Cross Blue Shield": { submissionTfDays: 180, appealTfDays: 180, label: "BCBS" },
  "Anthem":             { submissionTfDays: 180, appealTfDays: 180, label: "Anthem" },
  "Anthem BCBS":        { submissionTfDays: 180, appealTfDays: 180, label: "Anthem" },
  "Highmark":           { submissionTfDays: 180, appealTfDays: 180, label: "Highmark" },
  "Carefirst":          { submissionTfDays: 180, appealTfDays: 180, label: "Carefirst" },
  "Independence Blue Cross": { submissionTfDays: 180, appealTfDays: 180, label: "Independence BC" },
  "Regence":            { submissionTfDays: 180, appealTfDays: 180, label: "Regence" },
  "Premera":            { submissionTfDays: 180, appealTfDays: 180, label: "Premera" },
  "Cigna":              { submissionTfDays: 90,  appealTfDays: 180, label: "Cigna" },
  "Cigna Behavioral":   { submissionTfDays: 90,  appealTfDays: 180, label: "Cigna" },
  "Evernorth":          { submissionTfDays: 90,  appealTfDays: 180, label: "Cigna" },
  "Humana":             { submissionTfDays: 180, appealTfDays: 180, label: "Humana" },
  "Humana Medicare":    { submissionTfDays: 365, appealTfDays: 60,  label: "Humana MA" },
  "United Health":      { submissionTfDays: 90,  appealTfDays: 90,  label: "UnitedHealthcare" },
  "UnitedHealthcare":   { submissionTfDays: 90,  appealTfDays: 90,  label: "UnitedHealthcare" },
  "UHC":                { submissionTfDays: 90,  appealTfDays: 90,  label: "UnitedHealthcare" },
  "United Healthcare":  { submissionTfDays: 90,  appealTfDays: 90,  label: "UnitedHealthcare" },
  "United Community Plan": { submissionTfDays: 90, appealTfDays: 90, label: "UHC Community" },
  "Optum":              { submissionTfDays: 90,  appealTfDays: 90,  label: "Optum/UHC" },
  "Medicare":           { submissionTfDays: 365, appealTfDays: 120, label: "Medicare" },
  "Medicare Part B":    { submissionTfDays: 365, appealTfDays: 120, label: "Medicare Part B" },
  "Medicare Advantage": { submissionTfDays: 365, appealTfDays: 60,  label: "Medicare Advantage" },
  "Medicaid":           { submissionTfDays: 95,  appealTfDays: 90,  label: "Medicaid" },
  "Molina Healthcare":  { submissionTfDays: 95,  appealTfDays: 90,  label: "Molina Medicaid" },
  "Centene":            { submissionTfDays: 95,  appealTfDays: 90,  label: "Centene Medicaid" },
  "WellCare":           { submissionTfDays: 95,  appealTfDays: 90,  label: "WellCare Medicaid" },
  "Centene / WellCare": { submissionTfDays: 95,  appealTfDays: 90,  label: "Centene Medicaid" },
  "AmeriHealth Caritas":{ submissionTfDays: 95,  appealTfDays: 90,  label: "AmeriHealth Medicaid" },
  "Buckeye Health Plan":{ submissionTfDays: 95,  appealTfDays: 90,  label: "Buckeye Medicaid" },
  "Magellan":           { submissionTfDays: 90,  appealTfDays: 90,  label: "Magellan" },
  "Beacon Health":      { submissionTfDays: 90,  appealTfDays: 90,  label: "Beacon" },
  "Worker Comp":        { submissionTfDays: 180, appealTfDays: 180, label: "Worker Comp" },
  "Workers Comp":       { submissionTfDays: 180, appealTfDays: 180, label: "Worker Comp" },
  "Workers Compensation":{ submissionTfDays: 180, appealTfDays: 180, label: "Worker Comp" },
  "Tricare":            { submissionTfDays: 365, appealTfDays: 90,  label: "Tricare" },
  "VA":                 { submissionTfDays: 365, appealTfDays: 90,  label: "VA" },
  "CHAMPVA":            { submissionTfDays: 365, appealTfDays: 90,  label: "CHAMPVA" },
  "_default":           { submissionTfDays: 180, appealTfDays: 90,  label: "Default" },
};

function getPayerRule(payer) {
  return PAYER_RULES[payer] || PAYER_RULES._default;
}

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
  // ── Denial codes (CO/PR/OA) — primary identifier for adjudicated denials ─────
  "CO-4":             { area: "Authorization",    color: "#c2410c", label: "not covered",                          adj: -35, severity: "URGENT" },
  "CO-11":            { area: "Coding",           color: "#6d28d9", label: "DX/CPT mismatch",                      adj: -12, severity: "MODERATE" },
  "CO-16":            { area: "Billing/Scrubber", color: "#0f766e", label: "missing info",                         adj: -8,  severity: "MODERATE" },
  "CO-18":            { area: "Billing/Scrubber", color: "#0f766e", label: "duplicate claim",                      adj: -5,  severity: "ROUTINE" },
  "CO-22":            { area: "Billing/Scrubber", color: "#0f766e", label: "COB primary unclear",                  adj: -20, severity: "MODERATE" },
  "CO-23":            { area: "Billing/Scrubber", color: "#0f766e", label: "prior payer impact",                   adj: -15, severity: "MODERATE" },
  "CO-29":            { area: "Billing/Scrubber", color: "#0f766e", label: "timely filing exceeded",               adj: -40, severity: "CRITICAL" },
  "CO-31":            { area: "Billing/Scrubber", color: "#0f766e", label: "patient unidentified",                 adj: -20, severity: "URGENT" },
  "CO-45":            { area: "Billing/Scrubber", color: "#0f766e", label: "exceeds fee schedule",                 adj: -10, severity: "MODERATE" },
  "CO-50":            { area: "Physician/Doc",    color: "#1d4ed8", label: "medical necessity",                    adj: -30, severity: "URGENT" },
  "CO-97":            { area: "Billing/Scrubber", color: "#0f766e", label: "bundled / inclusive",                  adj: -15, severity: "MODERATE" },
  "CO-109":           { area: "Billing/Scrubber", color: "#0f766e", label: "not covered by payer",                 adj: -20, severity: "MODERATE" },
  "CO-197":           { area: "Authorization",    color: "#c2410c", label: "auth absent",                          adj: -25, severity: "URGENT" },
  "CO-B7":            { area: "Credentialing",    color: "#9f1239", label: "provider not eligible",                adj: -35, severity: "CRITICAL" },
  "PR-1":             { area: "Patient Balance",  color: "#374151", label: "patient deductible",                   adj: 0,   severity: "ROUTINE" },
  "PR-3":             { area: "Patient Balance",  color: "#374151", label: "patient copay",                        adj: 0,   severity: "ROUTINE" },
  "PR-204":           { area: "Patient Balance",  color: "#374151", label: "not covered by patient plan",          adj: -5,  severity: "MODERATE" },
  "OA-23":            { area: "Billing/Scrubber", color: "#0f766e", label: "prior payer adjustment",               adj: -10, severity: "MODERATE" },
  // ── Pre-adjudication claim states — for AR accounts not yet denied ─────────
  PENDING_SUBMISSION: { area: "Billing/Scrubber", color: "#dc2626", label: "Submission pending — not yet billed",  adj: 0,   severity: "URGENT" },
  IN_TRANSIT:         { area: "Billing/Scrubber", color: "#64748b", label: "In transit — clearinghouse",           adj: 0,   severity: "ROUTINE" },
  AT_PAYER:           { area: "Billing/Scrubber", color: "#64748b", label: "At payer — awaiting adjudication",     adj: 0,   severity: "ROUTINE" },
  REJECTED:           { area: "Billing/Scrubber", color: "#dc2626", label: "Rejected — clearinghouse bounce",      adj: -10, severity: "URGENT" },
  // ── Fallback when nothing else matches (legacy, becoming rare) ─────────────
  PENDING:            { area: "Pending",          color: "#374151", label: "Pending payment",                      adj: 0,   severity: "ROUTINE" },
};

// Maps claimStatus (from AR data) to a HOLD_CONFIG key for non-denied accounts.
// Used by score() to populate issues[0] meaningfully for pre-adjudication AR.
const CLAIM_STATE_TO_CODE = {
  "Pending Submission":          "PENDING_SUBMISSION",
  "Submitted to Clearinghouse":  "IN_TRANSIT",
  "At Payer":                    "AT_PAYER",
  "Rejected by Clearinghouse":   "REJECTED",
};

// Set of HOLD_CONFIG keys that represent claim states (not real denial codes).
// Row renderers use this to suppress the code prefix and show just the label,
// since the SCREAMING_SNAKE code is not a meaningful identifier to surface.
const CLAIM_STATE_CODES = new Set(["PENDING_SUBMISSION", "IN_TRANSIT", "AT_PAYER", "REJECTED"]);

const SEV = {
  CRITICAL: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  URGENT:   { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  MODERATE: { bg: "#fefce8", text: "#854d0e", border: "#fde68a" },
  ROUTINE:  { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
};

// ─── Canonical STATUS dictionary ──────────────────────────────────────────────
// Every worker surface (collector, biller, auth specialist, team lead) shares
// this status vocabulary. Status values feed the worklist (sleep/resurface) and
// reporting (CFO altitude). Modular: each role uses a subset.
// Canon docs: Account Status Lifecycle — Auto-Populating, Modular, Role-Dependent.
const STATUS = {
  not_started:      { label: "New",                color: "#0d9488", group: "working" },
  in_progress:      { label: "In progress",        color: "#2563eb", group: "working" },
  followup_due:     { label: "Follow-up due",      color: "#d97706", group: "working" },
  awaiting_payer:   { label: "Awaiting payer",     color: "#64748b", group: "awaiting" },
  awaiting_wl:      { label: "Awaiting WorkLink",  color: "#7c3aed", group: "awaiting" },
  payment_expected: { label: "Payment expected",   color: "#2563eb", group: "awaiting" }, // 7d sleep waiting for cash post (backend)
  partial:          { label: "Partial payment",    color: "#16a34a", group: "awaiting" },
  paid:             { label: "Paid in full",       color: "#16a34a", group: "escalated" },
  wo_pending:       { label: "Write-off pending",  color: "#dc2626", group: "escalated" },
  escalated:        { label: "Escalated",          color: "#dc2626", group: "escalated" },
};

// ─── Canonical 18 outcomes + Other escape valve ───────────────────────────────
// Each outcome carries: followUpDays (sleep), nextStatus (where it lands),
// group (UI grouping), and optionally triggersWL / requiresField /
// requiresNoteChars. NO outcome carries `closes: true` — worker UI never closes
// accounts; cash posting (backend) does. paid_full and paid_partial advance to
// payment_expected with 7d sleep, then resurface if cash hasn't posted.
// Canon docs: Outcome Status List — Design Principles.
const OUTCOME_STATUSES = [
  { value: "promised_payment",     label: "Promised payment",        followUpDays: 5,    nextStatus: "awaiting_payer",   group: "Awaiting payer" },
  { value: "left_voicemail",       label: "Left voicemail",          followUpDays: 2,    nextStatus: "in_progress",      group: "Retry" },
  { value: "in_adjudication",      label: "In adjudication",         followUpDays: 14,   nextStatus: "awaiting_payer",   group: "Awaiting payer" },
  { value: "payer_followup",       label: "Payer follow-up pending", followUpDays: 5,    nextStatus: "awaiting_payer",   group: "Awaiting payer" },
  { value: "authorization_pending",label: "Authorization pending",   followUpDays: 7,    nextStatus: "awaiting_payer",   group: "Awaiting payer" },
  { value: "needs_documentation",  label: "Needs documentation",     followUpDays: 7,    nextStatus: "awaiting_wl",      group: "Action needed", triggersWL: "him_deficiency" },
  { value: "appeal_filed",         label: "Appeal filed",            followUpDays: 30,   nextStatus: "awaiting_payer",   group: "Awaiting payer", requiresField: "appealRef", requiresFieldLabel: "Appeal reference number" },
  { value: "alj_appeal_filed",     label: "ALJ appeal filed",        followUpDays: 60,   nextStatus: "awaiting_payer",   group: "Awaiting payer", requiresField: "aljDocket", requiresFieldLabel: "ALJ docket number" },
  { value: "resubmitted",          label: "Resubmitted",             followUpDays: 14,   nextStatus: "awaiting_payer",   group: "Awaiting payer", requiresField: "resubmissionRef", requiresFieldLabel: "Resubmission claim reference" },
  { value: "escalated",            label: "Escalated to team lead",  followUpDays: 3,    nextStatus: "escalated",        group: "Terminal", triggersWL: "escalate_lead", requiresNoteChars: 20 },
  { value: "refer_specialist",     label: "Refer to specialist",     followUpDays: 3,    nextStatus: "escalated",        group: "Terminal", triggersWL: "refer_specialist", requiresNoteChars: 20 },
  { value: "no_response",          label: "No response",             followUpDays: 7,    nextStatus: "in_progress",      group: "Retry" },
  { value: "pending_eligibility",  label: "Pending eligibility",     followUpDays: 14,   nextStatus: "awaiting_wl",      group: "Action needed", triggersWL: "eligibility" },
  { value: "physician_query",      label: "Physician query sent",    followUpDays: 2,    nextStatus: "awaiting_wl",      group: "Action needed", triggersWL: "him_deficiency" },
  { value: "coding_assigned",      label: "Coding assigned",         followUpDays: 3,    nextStatus: "awaiting_wl",      group: "Action needed" },
  // Pre-adjudication blockers — added Q4 fix (May 31 2026). Upstream areas
  // must act before payer follow-up makes sense. All triggersWL → outcome
  // and WL get logged together so account history reflects the work done.
  { value: "submission_pending",   label: "Submission pending",      followUpDays: 3,    nextStatus: "awaiting_wl",      group: "Action needed", triggersWL: "resubmit" },
  { value: "auth_required",        label: "Auth required",           followUpDays: 5,    nextStatus: "awaiting_wl",      group: "Action needed", triggersWL: "chase_auth" },
  { value: "recode_required",      label: "Recode required",         followUpDays: 3,    nextStatus: "awaiting_wl",      group: "Action needed", triggersWL: "recode" },
  { value: "charge_capture_gap",   label: "Charge capture gap",      followUpDays: 2,    nextStatus: "awaiting_wl",      group: "Action needed", triggersWL: "missing_charge" },
  { value: "cred_gap",             label: "Credentialing gap",       followUpDays: 14,   nextStatus: "awaiting_wl",      group: "Action needed", triggersWL: "cred_gap" },
  { value: "paid_full",            label: "Paid in full",            followUpDays: 7,    nextStatus: "payment_expected", group: "Resolution" },
  { value: "paid_partial",         label: "Paid partial",            followUpDays: 7,    nextStatus: "payment_expected", group: "Resolution" },
  { value: "writeoff_recommended", label: "Write-off recommended",   followUpDays: null, nextStatus: "wo_pending",       group: "Terminal", triggersWL: "write_off_request", pending: true },
];

// Outcome grouping for UI pickers (Carlos's LogOutcomeFlow uses this; the older
// OutcomeSelector uses a simplified 3-group view as a transition).
const OUTCOME_GROUPS = [
  { label: "Resolution",     color: "#16a34a", ids: ["paid_full", "paid_partial"] },
  { label: "Awaiting payer", color: "#2563eb", ids: ["promised_payment", "in_adjudication", "payer_followup", "authorization_pending", "appeal_filed", "alj_appeal_filed", "resubmitted"] },
  { label: "Retry",          color: "#d97706", ids: ["left_voicemail", "no_response"] },
  { label: "Action needed",  color: "#7c3aed", ids: ["needs_documentation", "pending_eligibility", "physician_query", "coding_assigned", "submission_pending", "auth_required", "recode_required", "charge_capture_gap", "cred_gap"] },
  { label: "Terminal",       color: "#dc2626", ids: ["escalated", "refer_specialist", "writeoff_recommended"] },
];


const PAYER_CATEGORY = {
  "Medicare": "medicare",
  "Medicare Advantage": "commercial",  // MA admin'd by commercial insurers; collector workflow is commercial
  "Blue Cross": "commercial", "Blue Shield": "commercial",
  "Aetna": "commercial", "United Health": "commercial",
  "Cigna": "commercial", "Humana": "commercial",
  "Anthem": "commercial", "Highmark": "commercial", "Independence BC": "commercial",
  "Medicaid": "medicaid",
  "Self-Pay": "self_pay",
  "Worker Comp": "workers_comp",
};

const PAYER_BENCHMARKS = {
  medicare:     { min: 85, max: 92, label: "Medicare" },
  commercial:   { min: 75, max: 88, label: "Commercial" },
  medicaid:     { min: 55, max: 70, label: "Medicaid" },
  self_pay:     { min: 25, max: 50, label: "Self-Pay" },
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

// Client-level capability flags for the PayerContactBlock. Reference data
// (phone, portal, fax, email) is always shown when the payer has it;
// CLIENT_CAPS gates what's actionable. autoDial enables a click-to-dial
// pill on the phone row (requires telephony integration). autoFax/autoEmail
// would gate send affordances when those flows are added.
const CLIENT_CAPS = { autoFax: true, autoEmail: true, autoDial: false };

// Payer contact directory — phone / fax / email. Portal URLs come from the
// existing PAYER_PORTALS dict above (it has broader coverage and is already
// used by other surfaces). contactFor() merges both. Keyed by exact payer
// names that appear in AR data (verified May 31 2026). Government payers
// (Medicare/Medicaid) and Self-Pay are not in Carlos's commercial book by
// filter, so they're intentionally omitted — contactFor returns null and
// the block won't render for them.
const PAYER_DIR = {
  "Aetna":              { phone: "800-872-3862", fax: null,           email: "providers@aetna.com" },
  "Anthem":             { phone: "800-676-2583", fax: "800-345-0823", email: null },
  "Blue Cross":         { phone: "800-676-2583", fax: "877-291-3504", email: null },
  "Blue Shield":        { phone: "800-676-2583", fax: "877-291-3504", email: null },
  "Cigna":              { phone: "800-882-4462", fax: null,           email: null },
  "Humana":             { phone: "800-457-4708", fax: null,           email: null },
  "United Health":      { phone: "877-842-3210", fax: "888-559-0625", email: "providers@uhc.com" },
};

// Returns merged contact info for a payer, or null if no data exists.
// Merges PAYER_DIR (phone/fax/email) with PAYER_PORTALS (portal URL).
function contactFor(payer) {
  if (!payer) return null;
  const dir = PAYER_DIR[payer];
  const portal = PAYER_PORTALS[payer];
  // No data anywhere — skip rendering (no fake BCBS fallback like standalone)
  if (!dir && !portal) return null;
  return {
    phone:  dir?.phone || null,
    portal: portal || null,
    fax:    dir?.fax || null,
    email:  dir?.email || null,
  };
}
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
  // Work requests (existing)
  resubmit:       24,
  recode:         48,
  chase_auth:     72,
  cred_gap:       120,  // 5 days
  missing_charge: 24,
  him_deficiency: 48,
  physician_query: 72,
  other:          48,
  // Escalations (Session 3 — Carlos/Diane → team leads, specialists, supervisors)
  escalate_prebill_auth:     24,  // Diane → Paula: auth obtaining stalled pre-bill
  escalate_postbill_auth:    24,  // Diane or Carlos → Paula: contested obtain post-bill
  escalate_auth_lead:        24,  // auth specialist → Paula: general escalation
  escalate_collections_lead: 24,  // Carlos → Amara: collections team lead
  refer_specialist:          48,  // Carlos → Renata: specialist referral
  write_off_request:         72,  // Carlos → James/CFO: tier 2 write-off chain
  // Inbound notifications (Session 3 — resolution returns to originator)
  inbound_resolution:        24,
  inbound_decline:           24,
};

// Paula's SLA tier vocabulary (critical/high/medium/low) — coexists with the
// existing slaSeverity (CRITICAL/URGENT/MODERATE/ROUTINE) on the same WL.
// Both render correctly in their respective surfaces; canon unifies in Session 6.
const WL_SLA_TIER_HOURS = { critical: 4, high: 24, medium: 48, low: 72 };

// Severity ↔ tier mapping for components that need to round-trip
function sevToTier(sev) {
  if (sev === "CRITICAL") return "critical";
  if (sev === "URGENT") return "high";
  if (sev === "MODERATE") return "medium";
  return "low";
}
function tierToSev(tier) {
  if (tier === "critical") return "CRITICAL";
  if (tier === "high") return "URGENT";
  if (tier === "medium") return "MODERATE";
  return "ROUTINE";
}

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
  auth_team_lead:       { label: "Auth Team Lead (Paula)",  paneLabel: "Inbound supervisory escalations from auth specialists", filter: ["all"], mode: "team_lead" },
  cfo:                  { label: "CFO",                     paneLabel: "All payer types",                       filter: ["all"],         mode: "cfo" },
  authorization:        { label: "Authorization",           paneLabel: "Auth holds + WorkLink requests",        filter: ["all"],         mode: "area", area: "Authorization" },
  charge_capture:       { label: "Charge Capture",          paneLabel: "Charge holds + WorkLink requests",      filter: ["all"],         mode: "area", area: "Charge Capture" },
  coder:                { label: "Coder",                   paneLabel: "Coding holds + WorkLink requests",      filter: ["all"],         mode: "area", area: "Coding" },
  him:                  { label: "HIM / Physician Doc",     paneLabel: "HIM & physician holds + WorkLink",      filter: ["all"],         mode: "area", area: "Clinical/HIM" },
  billing_scrubber:     { label: "Billing / Scrubber",      paneLabel: "Billing holds + WorkLink requests",     filter: ["all"],         mode: "area", area: "Billing/Scrubber" },
  credentialing:        { label: "Credentialing",           paneLabel: "Credentialing holds + WorkLink requests",filter: ["all"],        mode: "area", area: "Credentialing" },
  physician:            { label: "Physician (light)",        paneLabel: "WorkLinks waiting on you",              filter: ["all"],         mode: "light_recipient", area: "Physician/Doc" },
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
  // Work requests (target an area)
  { value: "chase_auth",    label: "Chase authorization",      icon: "🔐", targetArea: "Authorization" },
  { value: "missing_charge",label: "Missing charge",           icon: "⚡", targetArea: "Charge Capture" },
  { value: "recode",        label: "Recode account",           icon: "💻", targetArea: "Coding" },
  { value: "him_deficiency",label: "HIM deficiency",           icon: "📄", targetArea: "Clinical/HIM" },
  { value: "physician_query",label: "Physician query",         icon: "👨‍⚕️", targetArea: "Physician/Doc" },
  { value: "resubmit",      label: "Resubmit claim",          icon: "🔄", targetArea: "Billing/Scrubber" },
  { value: "cred_gap",      label: "Credentialing gap",        icon: "📋", targetArea: "Credentialing" },
  { value: "other",         label: "Other",                    icon: "📌", targetArea: null },
  // Escalations (target a role, not an area)
  { value: "escalate_prebill_auth",     label: "Pre-bill auth · supervisory unblock", icon: "⚡", targetRole: "auth_team_lead" },
  { value: "escalate_postbill_auth",    label: "Post-bill auth · contested obtain",   icon: "⚡", targetRole: "auth_team_lead" },
  { value: "escalate_auth_lead",        label: "Escalate to auth team lead",          icon: "⚡", targetRole: "auth_team_lead" },
  { value: "escalate_collections_lead", label: "Escalate to collections team lead",   icon: "⚡", targetRole: "collections_team_lead" },
  { value: "refer_specialist",          label: "Refer to specialist",                 icon: "🎯", targetRole: "specialist" },
  { value: "write_off_request",         label: "Write-off request",                   icon: "✕", targetRole: "cfo_writeoff" },
  // Inbound notifications (sent back to originator on resolve/decline)
  { value: "inbound_resolution", label: "Resolution returned",     icon: "✓", targetRole: null },
  { value: "inbound_decline",    label: "Declined — returned",     icon: "↩", targetRole: null },
];

const WORKLINK_TARGET_AREAS = ["Authorization","Charge Capture","Coding","Clinical/HIM","Billing/Scrubber","Credentialing","Physician/Doc"];

// Escalation receivers — roles that receive escalation WLs.
// auth_team_lead exists in ROLE_DEFS (Paula). Others are placeholders pending
// surface fold-in (Session 6 builds minimal stubs for Amara, Renata, James).
const WORKLINK_TARGET_ROLES = ["auth_team_lead", "collections_team_lead", "specialist", "cfo_writeoff"];

// Seed realistic WorkLink requests for the demo, derived from real DNFB accounts.
// Produces a credible by-area spread: a mix of open (some SLA-breached) and resolved.
function seedWorklinks() {
  // Map DNFB hold codes → target area + request meta
  const HOLD_TO_REQ = {
    "PHYSICIAN_QUERY":    { requestType: "physician_query", requestLabel: "Physician query",     requestIcon: "👨‍⚕️", targetArea: "Physician/Doc" },
    "PHYSICIAN_UNSIGNED": { requestType: "physician_query", requestLabel: "Physician query",     requestIcon: "👨‍⚕️", targetArea: "Physician/Doc" },
    "HIM_DEFICIENCY":     { requestType: "him_deficiency",  requestLabel: "HIM deficiency",      requestIcon: "📄", targetArea: "Clinical/HIM" },
    "AUTH_MISSING":       { requestType: "chase_auth",      requestLabel: "Chase authorization", requestIcon: "🔐", targetArea: "Authorization" },
    "AUTH_EXPIRED":       { requestType: "chase_auth",      requestLabel: "Chase authorization", requestIcon: "🔐", targetArea: "Authorization" },
    "CHARGE_MISSING":     { requestType: "missing_charge",  requestLabel: "Missing charge",      requestIcon: "⚡", targetArea: "Charge Capture" },
    "CHARGE_LAG":         { requestType: "missing_charge",  requestLabel: "Missing charge",      requestIcon: "⚡", targetArea: "Charge Capture" },
    "CODING_UNASSIGNED":  { requestType: "recode",          requestLabel: "Recode account",      requestIcon: "💻", targetArea: "Coding" },
    "CODING_COMPLEX":     { requestType: "recode",          requestLabel: "Recode account",      requestIcon: "💻", targetArea: "Coding" },
    "CREDENTIALING":      { requestType: "cred_gap",        requestLabel: "Credentialing gap",   requestIcon: "📋", targetArea: "Credentialing" },
    "SCRUBBER_EDIT":      { requestType: "resubmit",        requestLabel: "Resubmit claim",      requestIcon: "🔄", targetArea: "Billing/Scrubber" },
  };
  const now = Date.now();
  const hr = 3600000;
  // Target counts per area: open (with a few breached) + resolved. Tuned for a realistic spread.
  const PLAN = {
    "Authorization":   { open: 7, resolved: 5 },
    "Charge Capture":  { open: 5, resolved: 6 },
    "Coding":          { open: 6, resolved: 8 },
    "Clinical/HIM":    { open: 4, resolved: 5 },
    "Billing/Scrubber":{ open: 9, resolved: 7 },
    "Credentialing":   { open: 3, resolved: 2 },
    "Physician/Doc":   { open: 6, resolved: 4 },
  };
  // Bucket DNFB accounts by their mapped target area
  const byArea = {};
  for (const a of DNFB_DATA) {
    const meta = HOLD_TO_REQ[a.holdCode];
    if (!meta) continue;
    (byArea[meta.targetArea] = byArea[meta.targetArea] || []).push({ a, meta });
  }
  const out = [];
  let seq = 0;
  for (const area of WORKLINK_TARGET_AREAS) {
    const pool = (byArea[area] || []).slice().sort((x, y) => y.a.amount - x.a.amount);
    const plan = PLAN[area] || { open: 0, resolved: 0 };
    let idx = 0;
    // Open requests — vary age; mark ~25% as SLA-breached (sent earlier than SLA window)
    for (let i = 0; i < plan.open && idx < pool.length; i++, idx++) {
      const { a, meta } = pool[idx];
      const ageHrs = 4 + (i * 9) % 60;            // 4–64h old
      const breached = i % 4 === 0;                // ~25% breached
      const slaWindow = breached ? ageHrs - 6 : ageHrs + 18;
      out.push({
        id: `WL-SEED-${++seq}`,
        accountId: a.id, patient: a.patient, payer: a.payer, vertical: a.vertical,
        amount: a.amount, expectedValue: Math.round(a.amount * 0.78),
        originType: "DNFB", sourceArea: "Billing/Scrubber",
        requestType: meta.requestType, requestLabel: meta.requestLabel, requestIcon: meta.requestIcon,
        targetArea: area, note: `${meta.requestLabel} needed — ${a.holdCode.replace(/_/g, " ").toLowerCase()} on ${a.id}. ${fmtSeed(a.amount)} at stake.`,
        status: "open",
        sentAt: new Date(now - ageHrs * hr),
        slaDue: new Date(now - ageHrs * hr + slaWindow * hr),
        slaHrs: slaWindow, slaSeverity: breached ? "URGENT" : "MODERATE",
        slaLabel: breached ? "BREACHED" : `${slaWindow}h`,
        createdAt: new Date(now - ageHrs * hr).toISOString(),
      });
    }
    // Resolved requests — sent earlier, resolved within a plausible window
    for (let i = 0; i < plan.resolved && idx < pool.length; i++, idx++) {
      const { a, meta } = pool[idx];
      const sentHrs = 30 + (i * 11) % 80;
      const resolveHrs = 6 + (i * 5) % 28;
      out.push({
        id: `WL-SEED-${++seq}`,
        accountId: a.id, patient: a.patient, payer: a.payer, vertical: a.vertical,
        amount: a.amount, expectedValue: Math.round(a.amount * 0.78),
        requestType: meta.requestType, requestLabel: meta.requestLabel, requestIcon: meta.requestIcon,
        targetArea: area, note: `${meta.requestLabel} on ${a.id}.`,
        status: "resolved",
        sentAt: new Date(now - sentHrs * hr),
        resolvedAt: new Date(now - (sentHrs - resolveHrs) * hr),
        resolutionNote: "Resolved by receiving area.",
        slaDue: new Date(now - sentHrs * hr + 24 * hr),
        slaHrs: 24, slaSeverity: "MODERATE", slaLabel: "24h",
        createdAt: new Date(now - sentHrs * hr).toISOString(),
      });
    }
  }
  // ---- AR-originated WorkLinks (Collections → upstream areas) ----
  // Collectors working billed AR hit internal blockers and send WorkLinks upstream.
  // These accounts are suppressed from Follow-up WIP (the AR-side of the mesh).
  // AR denial code → target area for the collector-originated request.
  const AR_DENIAL_TO_REQ = {
    "CO-16": { requestType: "missing_charge",  requestLabel: "Missing info / charge", requestIcon: "⚡", targetArea: "Charge Capture" },
    "CO-22": { requestType: "resubmit",         requestLabel: "COB correction",        requestIcon: "🔄", targetArea: "Billing/Scrubber" },
    "CO-50": { requestType: "physician_query",  requestLabel: "Physician query",       requestIcon: "👨‍⚕️", targetArea: "Physician/Doc" },
    "CO-97": { requestType: "recode",           requestLabel: "Recode (unbundle)",     requestIcon: "💻", targetArea: "Coding" },
    "CO-4":  { requestType: "chase_auth",       requestLabel: "Chase authorization",   requestIcon: "🔐", targetArea: "Authorization" },
  };
  // Pull denied AR accounts (collectors originate from these), highest-value first
  const deniedAR = AR_DATA.filter(a => a.denialCode && AR_DENIAL_TO_REQ[a.denialCode])
    .sort((a, b) => b.amount - a.amount);
  // Seed ~30 AR-originated open WorkLinks across the mapped areas — these demonstrate
  // Follow-up WIP suppression (account leaves collector queue, enters WorkLink-in-flight).
  const AR_ORIGINATED_COUNT = 30;
  for (let i = 0; i < AR_ORIGINATED_COUNT && i < deniedAR.length; i++) {
    const a = deniedAR[i];
    const meta = AR_DENIAL_TO_REQ[a.denialCode];
    const ageHrs = 3 + (i * 7) % 70;
    const breached = i % 5 === 0;
    const slaWindow = breached ? ageHrs - 5 : ageHrs + 20;
    out.push({
      id: `WL-SEED-AR-${++seq}`,
      accountId: a.id, patient: a.patient, payer: a.payer, vertical: a.vertical,
      amount: a.amount, expectedValue: a.amount,  // AR carries net/EV currency, NOT gross
      originType: "AR", sourceArea: "Collections",
      requestType: meta.requestType, requestLabel: meta.requestLabel, requestIcon: meta.requestIcon,
      targetArea: meta.targetArea,
      note: `${meta.requestLabel} — ${a.denialCode} denial on ${a.id}. Collector blocked pending ${meta.targetArea} action. ${fmtSeed(a.amount)} EV in flight.`,
      status: "open",
      sentAt: new Date(now - ageHrs * hr),
      slaDue: new Date(now - ageHrs * hr + slaWindow * hr),
      slaHrs: slaWindow, slaSeverity: breached ? "URGENT" : "MODERATE",
      slaLabel: breached ? "BREACHED" : `${slaWindow}h`,
      createdAt: new Date(now - ageHrs * hr).toISOString(),
    });
  }

  // ---- Escalation WorkLinks (Session 3) ----
  // Carlos/Diane → Paula (auth_team_lead), Amara (collections_team_lead),
  // Renata (specialist), James (cfo_writeoff). These give Session 6 real seed
  // data when Paula's surface folds in. Escalation WLs carry targetRole (not
  // targetArea), from{name,role} for inbound-back-routing, and slaTier in
  // Paula's vocabulary.
  const escalations = [
    // Paula's six (mirroring original WorkLinkPaula sample data)
    {
      requestType: "escalate_prebill_auth",
      from: { name: "Diane Aguilar", role: "Auth Specialist" },
      account: { id: "DNFB-00412", patient: "Patricia Nguyen", payer: "Blue Cross", amount: 92500, vertical: "Outpatient Surgery", site: "Site 6", cpt: "47562", dischargeDate: "2026-02-19", phase: "prebill" },
      note: "Submitted retro-auth via Availity 2026-04-22. Two follow-ups, payer says clinical reviewer is backlogged. Day 30 with no decision and TF window closing. Need supervisory unblock — peer-to-peer or medical director call to push the decision.",
      reason: "Payer stalled — retro-auth submitted, no decision after 30d",
      ageHrs: 96, slaTier: "critical",
    },
    {
      requestType: "escalate_postbill_auth",
      from: { name: "Diane Aguilar", role: "Auth Specialist" },
      account: { id: "AR-08434", patient: "Margaret Ramirez", payer: "Humana", amount: 41200, vertical: "Outpatient Surgery", site: "Site 4", cpt: "29881", denialDate: "2026-04-26", phase: "postbill" },
      note: "Auth on file (AUTH-44102) is for wrong CPT (29882 vs 29881 billed). Tried to correct — Humana says original auth was approved only for the listed CPT and won't extend. Looks like a coding/auth mismatch at the front end. Need your call on whether to push back for review or route to coding for analysis.",
      reason: "Auth/CPT mismatch — payer refuses to extend",
      ageHrs: 120, slaTier: "high",
    },
    {
      requestType: "escalate_prebill_auth",
      from: { name: "Diane Aguilar", role: "Auth Specialist" },
      account: { id: "DNFB-01188", patient: "James Whitfield", payer: "Medicare", amount: 64000, vertical: "Infusion", site: "Site 2", cpt: "96365", dischargeDate: "2025-06-02", phase: "prebill" },
      note: "Auth expired before DOS (AUTH-88231 exp 2025-05-30, DOS 2025-06-02). Submitted retro on 05-13, ref pending. Day 9, no payer response yet. Account is also approaching TF — wanted you to have eyes on it before it gets worse.",
      reason: "Expired auth · retro pending · approaching TF",
      ageHrs: 108, slaTier: "high",
    },
    {
      requestType: "escalate_postbill_auth",
      from: { name: "Carlos Mendez", role: "Collector" },
      account: { id: "AR-09781", patient: "Anthony Reeves", payer: "United Health", amount: 28400, vertical: "Cardiology", site: "Site 7", cpt: "93458", denialDate: "2026-03-15", phase: "postbill" },
      note: "Denied CO-197 (auth absent). Verified with UHC there was a pre-auth on file but submitted under wrong NPI. Auth team tried to correct — UHC says provider needs to be re-credentialed first. This is past the obtain window. Asking you to call it: appeal route or write-off?",
      reason: "Auth submitted under wrong NPI · credentialing tangle",
      ageHrs: 132, slaTier: "medium",
    },
    {
      requestType: "escalate_prebill_auth",
      from: { name: "Diane Aguilar", role: "Auth Specialist" },
      account: { id: "DNFB-02041", patient: "Robert Nguyen", payer: "Medicaid", amount: 12400, vertical: "Behavioral Health", site: "Site 3", cpt: "90837", dischargeDate: "2026-02-25", phase: "prebill" },
      note: "Medicaid auth required for >12 visits. Patient already at visit 18, no auth obtained at intake. Submitted retro, Medicaid policy says they don't grant retros for behavioral health absent emergent justification. Need your view — push for exception, or write down to patient responsibility per the policy?",
      reason: "Medicaid behavioral-health retro generally not granted",
      ageHrs: 156, slaTier: "medium",
    },
    {
      requestType: "escalate_postbill_auth",
      from: { name: "Carlos Mendez", role: "Collector" },
      account: { id: "AR-07203", patient: "Sandra Patel", payer: "Aetna", amount: 9800, vertical: "Radiology", site: "Site 9", cpt: "70553", denialDate: "2026-04-10", phase: "postbill" },
      note: "Repeat denial — third time this provider's MRI auths bounce from Aetna with same reason. Possible systemic issue at intake. Routing to you so you can look across the pattern, not just this account.",
      reason: "Pattern flag — repeat MRI auth denials at this site",
      ageHrs: 180, slaTier: "low",
    },
    // Amara — collections team lead (2 from Carlos)
    {
      requestType: "escalate_collections_lead",
      from: { name: "Carlos Mendez", role: "Collector" },
      account: { id: "AR-04127", patient: "Lisa Henderson", payer: "Aetna", amount: 18600, vertical: "Ophthalmology", site: "Site 5", cpt: "67028", denialDate: "2026-03-20", phase: "postbill" },
      note: "Three calls to Aetna, three different reps, three different answers on why CO-22 wasn't fixable by phone. Need a senior to push for escalation contact or formal complaint. Account is at 70 days with appeal TF closing in 10.",
      reason: "Payer reps giving conflicting info · need senior escalation",
      ageHrs: 72, slaTier: "high", targetRole: "collections_team_lead",
    },
    {
      requestType: "escalate_collections_lead",
      from: { name: "Carlos Mendez", role: "Collector" },
      account: { id: "AR-06892", patient: "David Park", payer: "Cigna", amount: 33200, vertical: "Orthopedics", site: "Site 1", cpt: "27447", denialDate: "2026-02-08", phase: "postbill" },
      note: "Cigna denying CO-50 medical necessity despite two appeals with clinical documentation. Considering ALJ but the patient's chart has gaps the physician hasn't addressed. Need guidance on whether to push physician for addendum or accept the denial.",
      reason: "Two appeals failed · ALJ decision needed · physician chart gaps",
      ageHrs: 144, slaTier: "medium", targetRole: "collections_team_lead",
    },
    // James — CFO write-off chain (1 from Carlos)
    {
      requestType: "write_off_request",
      from: { name: "Carlos Mendez", role: "Collector" },
      account: { id: "AR-02547", patient: "Maria Sanchez", payer: "Medicaid", amount: 4200, vertical: "Behavioral Health", site: "Site 3", cpt: "90834", denialDate: "2025-09-15", phase: "postbill" },
      note: "Medicaid CO-4 — three retro auth attempts over 8 months exhausted. Payer final on denial. All recovery paths exhausted. 12% collection probability after 257 days. Recommending write-off.",
      reason: "Recovery exhausted · 12% probability after 257d · TF closed",
      ageHrs: 48, slaTier: "low", targetRole: "cfo_writeoff",
    },
  ];

  for (const esc of escalations) {
    const targetRole = esc.targetRole || "auth_team_lead";
    const slaHrs = WL_SLA_TIER_HOURS[esc.slaTier];
    const breached = esc.ageHrs > slaHrs;
    out.push({
      id: `WL-SEED-ESC-${++seq}`,
      accountId: esc.account.id, patient: esc.account.patient, payer: esc.account.payer,
      vertical: esc.account.vertical, site: esc.account.site, cpt: esc.account.cpt,
      amount: esc.account.amount,
      expectedValue: esc.account.phase === "prebill" ? Math.round(esc.account.amount * 0.78) : esc.account.amount,
      originType: esc.from.role === "Collector" ? "AR" : "DNFB",
      sourceArea: esc.from.role === "Collector" ? "Collections" : "Authorization",
      sourceRole: esc.from.role === "Collector" ? "commercial_collector" : "authorization",
      from: esc.from,
      requestType: esc.requestType,
      requestLabel: WORKLINK_REQUEST_TYPES.find(t => t.value === esc.requestType)?.label || esc.requestType,
      requestIcon: WORKLINK_REQUEST_TYPES.find(t => t.value === esc.requestType)?.icon || "⚡",
      targetRole,
      note: esc.note,
      reason: esc.reason,
      phase: esc.account.phase,
      denialDate: esc.account.denialDate,
      dischargeDate: esc.account.dischargeDate,
      status: "open",
      sentAt: new Date(now - esc.ageHrs * hr),
      slaDue: new Date(now - esc.ageHrs * hr + slaHrs * hr),
      slaHrs,
      slaSeverity: tierToSev(esc.slaTier),
      slaTier: esc.slaTier,
      slaLabel: breached ? "BREACHED" : `${slaHrs}h`,
      createdAt: new Date(now - esc.ageHrs * hr).toISOString(),
    });
  }

  return out;
}
function fmtSeed(n) { return "$" + n.toLocaleString(); }


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
  if (entry === "closed") return false;       // legacy: pre-migration browsers may have this. New outcomes don't produce it.
  if (entry === "pending_cfo") return false;  // write-off chain pending
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

  // ─── Session 2: Derived TF clock + canonical Carlos-shape fields ───────────
  // AR (post-denial): Appeal TF is the binding clock. Submission TF doesn't
  // apply — claim was already submitted (that's why it's in AR). denialDate
  // derived from daysOut (which measures days since the denial event for AR).
  // DNFB (pre-billing): Submission TF is the binding clock. dateOfService
  // derived from daysInDNFB (which measures days since service for unbilled).
  // Both clocks use the payer-driven PAYER_RULES table.
  const rule = getPayerRule(acc.payer);
  const todayMs = Date.now();
  let derived = { payerRule: rule };
  if (type === "ar") {
    const isDenied = acc.claimStatus === "Adjudicated — Denied" || !!acc.denialCode;
    if (isDenied) {
      // Denied account → Appeal TF is the binding clock
      const denialDate = acc.denialDate || new Date(todayMs - daysOut * 86400000).toISOString().slice(0, 10);
      const denialMs = new Date(denialDate + "T00:00:00Z").getTime();
      const appealCloseMs = denialMs + rule.appealTfDays * 86400000;
      const denialCode = acc.denialCode || "PENDING";
      const denialCfg = HOLD_CONFIG[denialCode] || HOLD_CONFIG.PENDING;
      const daysSinceDenial = Math.round((todayMs - denialMs) / 86400000);
      derived = {
        ...derived,
        denialDate,
        issues: [{ code: denialCode, label: denialCfg.label, primary: true }],
        notes: [],
        bindingClock: "appeal_tf",
        bindingLabel: `${rule.label} appeal TF`,
        bindingCloseDate: new Date(appealCloseMs).toISOString().slice(0, 10),
        appealTfRemaining: rule.appealTfDays - daysSinceDenial,
        appealTfCloseDate: new Date(appealCloseMs).toISOString().slice(0, 10),
      };
    } else {
      // Pre-adjudication AR → Submission TF is the binding clock
      // Service date used as the anchor for the submission window
      const serviceDateMs = acc.serviceDate ? new Date(acc.serviceDate + "T00:00:00Z").getTime() : todayMs - daysOut * 86400000;
      const daysSinceService = Math.round((todayMs - serviceDateMs) / 86400000);
      const subCloseMs = serviceDateMs + rule.submissionTfDays * 86400000;
      const stateCode = CLAIM_STATE_TO_CODE[acc.claimStatus] || "PENDING";
      const stateCfg = HOLD_CONFIG[stateCode] || HOLD_CONFIG.PENDING;
      derived = {
        ...derived,
        issues: [{ code: stateCode, label: stateCfg.label, primary: true }],
        notes: [],
        bindingClock: "submission_tf",
        bindingLabel: `${rule.label} submission TF`,
        bindingCloseDate: new Date(subCloseMs).toISOString().slice(0, 10),
        submissionTfRemaining: rule.submissionTfDays - daysSinceService,
        submissionTfCloseDate: new Date(subCloseMs).toISOString().slice(0, 10),
      };
    }
  } else if (type === "dnfb") {
    const dosMs = todayMs - (acc.daysInDNFB || 0) * 86400000;
    const subCloseMs = dosMs + rule.submissionTfDays * 86400000;
    derived = {
      ...derived,
      dateOfService: new Date(dosMs).toISOString().slice(0, 10),
      notes: [],
      bindingClock: "submission_tf",
      bindingLabel: `${rule.label} submission TF`,
      bindingCloseDate: new Date(subCloseMs).toISOString().slice(0, 10),
      submissionTfRemaining: rule.submissionTfDays - (acc.daysInDNFB || 0),
      submissionTfCloseDate: new Date(subCloseMs).toISOString().slice(0, 10),
    };
  }

  return { ...acc, type, prob, expectedValue, cfg, area: cfg.area, action: getAction({ ...acc, holdCode, prob, daysOut }), daysOut, ...derived };
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
          {OUTCOME_STATUSES.filter(o => !o.pending && o.nextStatus !== "payment_expected").map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
        <optgroup label="Payment expected (sleeps until cash posts)">
          {OUTCOME_STATUSES.filter(o => o.nextStatus === "payment_expected").map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
        <optgroup label="Pending approval">
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
  if (os.pending) {
    return (
      <div style={{ marginTop: 10, padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#854d0e" }}>
        ⏳ Pending CFO write-off approval — no follow-up set.
      </div>
    );
  }
  if (os.nextStatus === "payment_expected") {
    return (
      <div style={{ marginTop: 10, padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, color: "#1e40af", lineHeight: 1.5 }}>
        📅 Status → Payment expected. Sleeps {os.followUpDays} business days (resurfaces {addBusinessDays(os.followUpDays)}).
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontStyle: "italic" }}>
          Cash posting closes the account. If cash hasn't arrived by the follow-up date, the account resurfaces here.
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10, padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, color: "#1e40af" }}>
      📅 Next follow-up: {addBusinessDays(os.followUpDays)} ({os.followUpDays} business day{os.followUpDays === 1 ? "" : "s"})
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

// PayerContactBlock — phone / portal / fax / email reference card. Always shown
// when the payer has any data. Renders nothing if contactFor() returns null
// (government payers, Self-Pay, or any payer without data). CLIENT_CAPS gates
// the click-to-dial pill on phone. Fax/email shown as reference-only until
// transmit flows land. Ported from Carlos's standalone (B.2.5).
function PayerContactBlock({ payer }) {
  const c = contactFor(payer);
  if (!c) return null;
  const methods = [
    c.phone  && { icon: "☎", label: "Phone",  value: c.phone,  href: "tel:" + c.phone },
    c.portal && { icon: "🔗", label: "Portal", value: c.portal.replace(/^https?:\/\//, ""), href: c.portal },
    c.fax    && { icon: "📠", label: "Fax",    value: c.fax,    href: null },
    c.email  && { icon: "✉", label: "Email",  value: c.email,  href: "mailto:" + c.email },
  ].filter(Boolean);
  if (methods.length === 0) return null;
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", background: "#fff", marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Reach {payer}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${methods.length}, 1fr)`, gap: 10 }}>
        {methods.map((m, i) => {
          const showDial = m.label === "Phone" && CLIENT_CAPS.autoDial;
          return (
            <div key={i} style={{ padding: "8px 10px", background: "#f8fafc", borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>{m.icon} {m.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {m.href ? (
                  <a href={m.href} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0f172a", fontWeight: 500, textDecoration: "none", wordBreak: "break-all" }}>{m.value}</a>
                ) : (
                  <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 500 }}>{m.value}</div>
                )}
                {showDial && (
                  <span style={{ fontSize: 10, color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, padding: "1px 7px", cursor: "pointer", fontWeight: 600, letterSpacing: "0.04em" }}>DIAL</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
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
  const followUpText = os?.pending ? "Pending CFO write-off approval."
    : os?.nextStatus === "payment_expected" ? `Account → Payment expected. Sleeps ${os.followUpDays} business days waiting for cash posting; resurfaces if no cash by ${addBusinessDays(os.followUpDays)}.`
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

// ─── Light Recipient View ─────────────────────────────────────────────────────
// ─── Session 5: Diane's Authorization Specialist Surface ──────────────────────
// Handles BOTH inbound chase_auth WLs (from collectors blocked on missing auth)
// AND native AUTH_MISSING / AUTH_EXPIRED DNFB accounts (pre-billing). Unified
// queue, four resolution paths per item. Resolutions on inbound WLs route back
// to the originator via handleResolveWorklink's emit path.

function AuthWorkCard({ item, onResolveWl, onLogDnfb, onEscalate }) {
  const [resolution, setResolution] = useState(null); // 'resolved' | 'reassigned' | 'declined' | 'escalate'
  const [authNumber, setAuthNumber] = useState("");
  const [note, setNote] = useState("");
  const [reassignTo, setReassignTo] = useState("");

  const isWl = item.kind === "wl";
  const accountId = item.accountId;
  const patient = item.patient;
  const payer = item.payer;
  const amount = item.amount;
  const ev = item.ev;

  // ── WL origin classification ──────────────────────────────────────────────
  // Three origins, each with different sender attribution and resolution semantics:
  //   1. AR-originated from a collector (Collections sourceArea, originType=AR)
  //   2. DNFB-originated from Billing intake (Billing/Scrubber sourceArea, originType=DNFB)
  //      — pre-routed by intake/scrubber, no human sender to push back to
  //   3. Escalation from another auth specialist (from.role=Auth Specialist)
  const wlOrigin = !isWl ? null
    : item.wl.from?.role === "Collector" || item.wl.originType === "AR" ? "collector"
    : item.wl.from?.role === "Auth Specialist" ? "auth_peer"
    : item.wl.originType === "DNFB" ? "intake"
    : "unknown";
  const senderLabel = wlOrigin === "collector" ? (item.wl.from?.name || "Collector")
    : wlOrigin === "auth_peer" ? (item.wl.from?.name || "Auth peer")
    : wlOrigin === "intake" ? "Billing intake"
    : "Sender";
  const senderRoleLabel = wlOrigin === "collector" ? "Collector"
    : wlOrigin === "auth_peer" ? "Auth Specialist"
    : wlOrigin === "intake" ? "Billing/Scrubber intake (auto-routed)"
    : "—";
  // Decline only valid when there's a real human sender to receive the pushback.
  // Intake WLs (auto-routed from scrubber) have no sender to notify — resolve or escalate only.
  const canDecline = wlOrigin === "collector" || wlOrigin === "auth_peer";

  // TF clock derivation
  const tf = item.acc?.submissionTfRemaining ?? item.acc?.appealTfRemaining ?? null;
  const tfLabel = item.acc?.bindingLabel || (isWl ? "Auth window" : null);
  const tfColor = tf == null ? "#64748b" : tf < 0 ? "#64748b" : tf < 3 ? "#dc2626" : tf < 14 ? "#d97706" : tf < 30 ? "#0369a1" : "#16a34a";

  // SLA on inbound WL
  const wlHrsOut = isWl ? Math.round((Date.now() - new Date(item.sentAt).getTime()) / 3600000) : null;
  const wlBreached = isWl && wlHrsOut > item.slaHrs;

  const noteValid = note.trim().length >= 10;
  const authValid = resolution === "resolved" ? authNumber.trim().length >= 3 : true;
  const reassignValid = resolution === "reassigned" ? reassignTo.trim().length >= 2 : true;
  const canCommit = resolution && noteValid && authValid && reassignValid;

  const commit = () => {
    if (!canCommit) return;
    if (resolution === "escalate") {
      onEscalate(item, note.trim());
      return;
    }
    if (isWl) {
      onResolveWl(item.wl.id, {
        kind: resolution,
        note: note.trim(),
        authNumber: resolution === "resolved" ? authNumber.trim() : null,
        reassignTo: resolution === "reassigned" ? reassignTo.trim() : null,
      });
    } else {
      onLogDnfb(item.acc, {
        outcome: resolution === "resolved" ? "auth_obtained" : resolution === "declined" ? "auth_denied" : "auth_reassigned",
        authNumber: resolution === "resolved" ? authNumber.trim() : null,
        note: note.trim(),
        reassignTo: resolution === "reassigned" ? reassignTo.trim() : null,
      });
    }
  };

  // Inbound badge label varies by origin
  const inboundBadge = wlOrigin === "collector" ? "⇄ INBOUND · collector"
    : wlOrigin === "auth_peer" ? "⇄ INBOUND · auth peer"
    : wlOrigin === "intake" ? "📨 ROUTED · billing intake"
    : "⇄ INBOUND";
  const inboundBadgeColors = wlOrigin === "intake"
    ? { bg: "#fdf4ff", color: "#7c2d92", border: "#e9d5ff" }   // purple — intake-routed
    : { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" };  // blue — human sender

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 600, background: isWl ? inboundBadgeColors.bg : "#fef3c7", color: isWl ? inboundBadgeColors.color : "#854d0e", border: `1px solid ${isWl ? inboundBadgeColors.border : "#fde68a"}`, padding: "2px 8px", borderRadius: 4 }}>
                {isWl ? inboundBadge : "📋 NATIVE DNFB"}
              </span>
              {tf != null && tfLabel && (
                <span style={{ fontSize: 10, fontWeight: 600, background: tfColor + "12", color: tfColor, border: `1px solid ${tfColor}40`, padding: "2px 8px", borderRadius: 4 }}>
                  ⏱ {tfLabel}: {tf < 0 ? `CLOSED (${Math.abs(tf)}d past)` : `${tf}d remaining`}
                </span>
              )}
              {isWl && (
                <span style={{ fontSize: 10, fontWeight: 600, background: wlBreached ? "#fef2f2" : "#fffbeb", color: wlBreached ? "#dc2626" : "#92400e", border: `1px solid ${wlBreached ? "#fecaca" : "#fde68a"}`, padding: "2px 8px", borderRadius: 4 }}>
                  {wlBreached ? `WL SLA BREACHED · ${wlHrsOut}h of ${item.slaHrs}h` : `${wlHrsOut}h of ${item.slaHrs}h`}
                </span>
              )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{patient}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
              {accountId} · {item.acc?.site || item.wl?.site || "—"} · {item.acc?.vertical || item.wl?.vertical || ""}
            </div>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>
              {payer}
              {(PAYER_PORTALS[payer]) && (
                <a href={PAYER_PORTALS[payer]} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: 10, marginLeft: 4, textDecoration: "none" }}>↗</a>
              )}
            </div>
            {isWl && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                {wlOrigin === "intake" ? (
                  <>Routed by <strong>Billing intake</strong> (auto) · {Math.round((Date.now() - new Date(item.sentAt).getTime()) / 86400000)}d in queue</>
                ) : (
                  <>Sent by <strong>{senderLabel}</strong> ({senderRoleLabel}) · {Math.round((Date.now() - new Date(item.sentAt).getTime()) / 86400000)}d ago</>
                )}
              </div>
            )}
            {!isWl && item.acc && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                Hold: <strong>{item.acc.cfg.label}</strong> · {item.daysInDNFB}d in DNFB
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>{isWl ? "EV in flight" : "Expected value"}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#2563eb", letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(ev)}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{fmt(amount)} balance</div>
          </div>
        </div>
      </div>

      {/* Sender note / intake context (inbound WL only) */}
      {isWl && item.wl.note && (
        <div style={{ padding: "12px 20px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>
            {wlOrigin === "intake" ? "Intake context · auto-routed from scrubber" : "Sender's note · context that traveled with this WorkLink"}
          </div>
          <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.65, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "10px 14px" }}>
            {item.wl.note}
          </div>
          {item.wl.reason && (
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Reason: <strong>{item.wl.reason}</strong></div>
          )}
        </div>
      )}

      {/* Resolution paths */}
      <div style={{ padding: "16px 20px" }}>
        {!resolution ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 10 }}>How are you resolving this?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <button onClick={() => setResolution("resolved")} style={{ padding: "10px 14px", background: "#16a34a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", textAlign: "left" }}>
                ✓ Auth obtained {isWl ? (wlOrigin === "intake" ? "· release to biller" : `· return to ${senderLabel}`) : "· log to account"}
              </button>
              <button onClick={() => setResolution("escalate")} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #dc2626", borderRadius: 8, color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", textAlign: "left" }}>
                ⚡ Escalate to Paula (auth team lead)
              </button>
              <button onClick={() => setResolution("reassigned")} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#475569", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", textAlign: "left" }}>
                ↻ Reassign within auth team
              </button>
              {isWl && canDecline && (
                <button onClick={() => setResolution("declined")} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#475569", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", textAlign: "left" }}>
                  ↩ Decline · push back to {senderLabel}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>
              {wlOrigin === "intake"
                ? "Intake-routed WLs have no human sender — resolve releases the claim back to biller; escalate sends to Paula. No 'decline' path (nothing to push back to)."
                : isWl
                ? `Resolution sends a note back to ${senderLabel}. Auth number is recorded on the account and used downstream to release the claim.`
                : "Logging advances the account status. Auth number (if obtained) is recorded for the biller to submit with the claim."
              }
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: resolution === "resolved" ? "#16a34a" : resolution === "escalate" ? "#dc2626" : "#d97706" }} />
              <strong style={{ color: "#0f172a" }}>
                {resolution === "resolved" && (isWl ? (wlOrigin === "intake" ? "Resolving · releasing to biller" : `Resolving · returning auth to ${senderLabel}`) : "Logging auth obtained")}
                {resolution === "escalate" && "Escalating to Paula"}
                {resolution === "reassigned" && "Reassigning within auth team"}
                {resolution === "declined" && `Declining · pushing back to ${senderLabel}`}
              </strong>
              <button onClick={() => { setResolution(null); setAuthNumber(""); setNote(""); setReassignTo(""); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "#64748b", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Change</button>
            </div>

            {resolution === "resolved" && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Authorization number (required)</label>
                <input value={authNumber} onChange={(e) => setAuthNumber(e.target.value)} placeholder="e.g. AUTH-99214-RETRO"
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${authNumber.trim().length >= 3 ? "#e2e8f0" : "#fca5a5"}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0f172a", fontFamily: "inherit", outline: "none" }} />
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>The auth number is recorded on the account and surfaces in the inbound resolution returned to {wlOrigin === "intake" ? "the biller" : senderLabel}.</div>
              </div>
            )}

            {resolution === "reassigned" && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Reassign to (auth specialist name)</label>
                <input value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} placeholder="e.g. Marcus Chen"
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${reassignTo.trim().length >= 2 ? "#e2e8f0" : "#fca5a5"}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0f172a", fontFamily: "inherit", outline: "none" }} />
              </div>
            )}

            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {resolution === "resolved" && "Resolution note (required)"}
              {resolution === "escalate" && "Why does this need Paula's review? (required)"}
              {resolution === "reassigned" && "Reassignment note · why (required)"}
              {resolution === "declined" && "Reason for declining (required)"}
            </label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={
                resolution === "resolved" ? `e.g. "Called payer, obtained retro-auth ${authNumber || "AUTH-XXXX"}, valid through end of episode. Claim ready to release."`
                : resolution === "escalate" ? "e.g. \"Payer stalled — submitted retro 30d ago, two follow-ups, no decision. Need peer-to-peer or medical director call.\""
                : resolution === "reassigned" ? "e.g. \"Reassigning to specialist with peer-to-peer access to this payer.\""
                : "e.g. \"This is a coding issue, not auth — route to coding first.\""
              }
              style={{ width: "100%", boxSizing: "border-box", minHeight: 80, border: `1px solid ${noteValid ? "#e2e8f0" : "#fca5a5"}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", fontFamily: "inherit", resize: "vertical", outline: "none", lineHeight: 1.5 }} />
            <div style={{ fontSize: 11, color: noteValid ? "#94a3b8" : "#dc2626", marginTop: 4 }}>
              {noteValid ? `${note.length} characters` : `${note.length}/10 minimum — add context about what was tried.`}
            </div>

            <button onClick={commit} disabled={!canCommit}
              style={{ marginTop: 12, padding: "10px 20px", width: "100%", background: canCommit ? "#0f172a" : "#e2e8f0", border: "none", borderRadius: 8, color: canCommit ? "#fff" : "#94a3b8", cursor: canCommit ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
              {resolution === "resolved" && (isWl ? (wlOrigin === "intake" ? "Confirm · release to biller" : `Confirm · send auth back to ${senderLabel}`) : "Confirm · log auth obtained")}
              {resolution === "escalate" && "Send to Paula"}
              {resolution === "reassigned" && "Confirm reassignment"}
              {resolution === "declined" && `Confirm · push back to ${senderLabel}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DianeAuthView({ dnfbScored, worklinks, onResolve, onSendWorklink, onReturn }) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const [worked, setWorked] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [siteFilter, setSiteFilter] = useState(null);

  // Inbound WLs targeted to Authorization area
  const inboundWls = useMemo(() => worklinks.filter(w =>
    w.status === "open" &&
    w.targetArea === "Authorization" &&
    !worked.has(w.id) &&
    (!siteFilter || w.site === siteFilter)
  ), [worklinks, worked, siteFilter]);

  // Native AUTH_* DNFB accounts (not yet WL'd, not in worked set)
  const inboundAccIds = new Set(inboundWls.map(w => w.accountId));
  const nativeDnfb = useMemo(() => dnfbScored.filter(a =>
    a.area === "Authorization" &&
    !worked.has(a.id) &&
    !inboundAccIds.has(a.id) &&
    (!siteFilter || a.site === siteFilter)
  ), [dnfbScored, worked, inboundAccIds, siteFilter]);

  // Sent escalations (Diane → Paula) for visibility
  const sentEscalations = useMemo(() => worklinks.filter(w =>
    w.status === "open" &&
    (w.requestType === "escalate_auth_lead" || w.requestType === "escalate_prebill_auth" || w.requestType === "escalate_postbill_auth") &&
    w.from?.role === "Auth Specialist"
  ), [worklinks]);

  // Unified queue
  const items = useMemo(() => {
    const out = [
      ...inboundWls.map(w => ({
        kind: "wl", id: w.id, wl: w, accountId: w.accountId,
        patient: w.patient, payer: w.payer, amount: w.amount, ev: w.expectedValue,
        sentAt: w.sentAt, slaHrs: w.slaHrs, slaDue: w.slaDue,
        acc: null, // WLs don't carry full account, just snapshot fields
      })),
      ...nativeDnfb.map(a => ({
        kind: "dnfb", id: a.id, wl: null, accountId: a.id,
        patient: a.patient, payer: a.payer, amount: a.amount, ev: a.expectedValue,
        daysInDNFB: a.daysInDNFB, holdCode: a.holdCode, acc: a,
      })),
    ];
    // Sort: WLs breached first, then non-breached WLs by SLA, then DNFB by daysInDNFB desc, EV desc within ties
    out.sort((a, b) => {
      const aBreached = a.kind === "wl" && (Date.now() - new Date(a.sentAt).getTime()) / 3600000 > a.slaHrs;
      const bBreached = b.kind === "wl" && (Date.now() - new Date(b.sentAt).getTime()) / 3600000 > b.slaHrs;
      if (aBreached !== bBreached) return aBreached ? -1 : 1;
      if (a.kind === "wl" && b.kind === "wl") return new Date(a.slaDue) - new Date(b.slaDue);
      if (a.kind === "wl" && b.kind === "dnfb") return -1;
      if (a.kind === "dnfb" && b.kind === "wl") return 1;
      if (a.daysInDNFB !== b.daysInDNFB) return (b.daysInDNFB || 0) - (a.daysInDNFB || 0);
      return b.ev - a.ev;
    });
    return out;
  }, [inboundWls, nativeDnfb]);

  const totalEV = items.reduce((s, i) => s + i.ev, 0);
  const wlCount = items.filter(i => i.kind === "wl").length;
  const wlBreachedCount = items.filter(i => i.kind === "wl" && (Date.now() - new Date(i.sentAt).getTime()) / 3600000 > i.slaHrs).length;
  const dnfbCount = items.filter(i => i.kind === "dnfb").length;

  const handleResolveWl = useCallback((wlId, resolution) => {
    onResolve(wlId, resolution);
    setWorked(prev => new Set([...prev, wlId]));
    setExpandedId(null);
  }, [onResolve]);

  const handleLogDnfb = useCallback((acc, entry) => {
    // For DNFB accounts, log to platform's follow-up store (suppresses from queue)
    setFollowUpDate(acc.id, addBusinessDaysISO(7));
    window.dispatchEvent(new CustomEvent("d4_account_logged", { detail: { id: acc.id } }));
    setWorked(prev => new Set([...prev, acc.id]));
    setExpandedId(null);
  }, []);

  const handleEscalate = useCallback((item, escalationNote) => {
    // Emit escalate_auth_lead WL targeting Paula
    const escId = `WL-OUT-${Date.now()}-${item.accountId}`;
    const reqDef = WORKLINK_REQUEST_TYPES.find(t => t.value === "escalate_auth_lead");
    onSendWorklink({
      id: escId,
      accountId: item.accountId, patient: item.patient, payer: item.payer,
      vertical: item.acc?.vertical || "", site: item.acc?.site || "",
      amount: item.amount, expectedValue: item.ev,
      originType: item.kind === "wl" ? "ESCALATED_WL" : "ESCALATED_DNFB",
      sourceArea: "Authorization", sourceRole: "authorization",
      from: { name: "Diane Aguilar", role: "Auth Specialist" },
      requestType: "escalate_auth_lead",
      requestLabel: reqDef?.label || "Escalate to auth team lead",
      requestIcon: reqDef?.icon || "⚡",
      targetRole: "auth_team_lead",
      note: escalationNote,
      reason: item.kind === "wl" ? `Escalated from inbound WL ${item.wl.id}` : `Escalated from native DNFB hold ${item.acc?.holdCode}`,
      parentId: item.kind === "wl" ? item.wl.id : null,
      status: "open",
      sentAt: new Date(),
      slaHrs: WORKLINK_REQUEST_SLA_HRS.escalate_auth_lead,
      slaDue: new Date(Date.now() + WORKLINK_REQUEST_SLA_HRS.escalate_auth_lead * 3600 * 1000),
      slaSeverity: "URGENT", slaTier: "high",
      slaLabel: `${WORKLINK_REQUEST_SLA_HRS.escalate_auth_lead}h`,
      createdAt: new Date().toISOString(),
    });
    // Mark as worked so it leaves Diane's queue (Paula owns it now)
    setWorked(prev => new Set([...prev, item.id]));
    setExpandedId(null);
  }, [onSendWorklink]);

  return (
    <div style={{ padding: isMobile ? "16px 12px 80px" : "24px 32px" }}>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Items to work", value: items.length, sub: `${wlCount} inbound · ${dnfbCount} native`, color: "#0f172a" },
          { label: "WL SLA breached", value: wlBreachedCount, sub: wlBreachedCount > 0 ? "work these first" : "all within SLA", color: wlBreachedCount > 0 ? "#dc2626" : "#16a34a" },
          { label: "Sent to Paula", value: sentEscalations.length, sub: "auth escalations in flight", color: "#7c3aed" },
          { label: "Total EV in queue", value: fmt(totalEV), sub: "expected recovery if all resolved", color: "#2563eb" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: "-0.01em" }}>{value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Site filter */}
      {(() => {
        const sites = [...new Set([...inboundWls, ...nativeDnfb].map(x => x.site || x.acc?.site).filter(Boolean))].sort();
        if (sites.length <= 1) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>My sites:</span>
            <button onClick={() => setSiteFilter(null)} style={{ padding: "3px 10px", fontSize: 11, fontWeight: !siteFilter ? 600 : 400, border: `1px solid ${!siteFilter ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: !siteFilter ? "#2563eb" : "#fff", color: !siteFilter ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>All</button>
            {sites.map(s => (
              <button key={s} onClick={() => setSiteFilter(siteFilter === s ? null : s)} style={{ padding: "3px 10px", fontSize: 11, fontWeight: siteFilter === s ? 600 : 400, border: `1px solid ${siteFilter === s ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: siteFilter === s ? "#2563eb" : "#fff", color: siteFilter === s ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
            ))}
          </div>
        );
      })()}

      {/* Queue */}
      {items.length === 0 ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a", marginBottom: 6 }}>Auth queue clear</div>
          <div style={{ fontSize: 13, color: "#166534" }}>No inbound WorkLinks or native auth holds to work right now.</div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{items.length} items · click to expand and resolve</div>
          {items.slice(0, 50).map(item => {
            const isExpanded = expandedId === item.id;
            const breached = item.kind === "wl" && (Date.now() - new Date(item.sentAt).getTime()) / 3600000 > item.slaHrs;
            return (
              <div key={item.id} style={{ marginBottom: 4 }}>
                {!isExpanded ? (
                  <div onClick={() => setExpandedId(item.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", border: `1px solid ${breached ? "#fca5a5" : "#e2e8f0"}`, borderRadius: 8, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background="#fff"}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: item.kind === "wl" ? "#eff6ff" : "#fef3c7", color: item.kind === "wl" ? "#1e40af" : "#854d0e", border: `1px solid ${item.kind === "wl" ? "#bfdbfe" : "#fde68a"}`, flexShrink: 0 }}>
                      {item.kind === "wl" ? "INBOUND" : "DNFB"}
                    </span>
                    {breached && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", flexShrink: 0 }}>BREACHED</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.patient}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {item.accountId} · {item.payer} · {
                          item.kind === "dnfb" ? `${item.daysInDNFB}d in DNFB`
                          : item.wl.from?.role === "Collector" || item.wl.originType === "AR" ? `sent by ${item.wl.from?.name || "Collector"}`
                          : item.wl.from?.role === "Auth Specialist" ? `escalated by ${item.wl.from?.name || "auth peer"}`
                          : item.wl.originType === "DNFB" ? "routed by Billing intake"
                          : "inbound"
                        }
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>{fmt(item.ev)}</div>
                    </div>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>▼</span>
                  </div>
                ) : (
                  <div>
                    <button onClick={() => setExpandedId(null)} style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: "0 0 4px 0" }}>▲ collapse</button>
                    <AuthWorkCard key={item.id} item={item} onResolveWl={handleResolveWl} onLogDnfb={handleLogDnfb} onEscalate={handleEscalate} />
                  </div>
                )}
              </div>
            );
          })}
          {items.length > 50 && (
            <div style={{ textAlign: "center", padding: "10px", fontSize: 11, color: "#94a3b8" }}>
              Showing top 50 of {items.length} · resolve current items to surface the rest
            </div>
          )}
        </div>
      )}

      {/* Sent escalations panel */}
      {sentEscalations.length > 0 && (
        <div style={{ marginTop: 24, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#7c3aed", textTransform: "uppercase", marginBottom: 8 }}>⚡ {sentEscalations.length} escalation{sentEscalations.length === 1 ? "" : "s"} sent to Paula · awaiting resolution</div>
          {sentEscalations.slice(0, 5).map((w, ix) => {
            const hrsOut = Math.round((Date.now() - new Date(w.sentAt).getTime()) / 3600000);
            return (
              <div key={ix} style={{ fontSize: 12, color: "#581c87", padding: "6px 0", borderTop: ix > 0 ? "1px solid #e9d5ff" : "none" }}>
                <strong>{w.patient}</strong> ({w.accountId}) · {w.payer} · sent {hrsOut}h ago
                <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 2 }}>{w.note}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Worked this session */}
      {worked.size > 0 && (
        <div style={{ marginTop: 16, fontSize: 11, color: "#94a3b8" }}>
          {worked.size} item{worked.size === 1 ? "" : "s"} worked this session
        </div>
      )}
    </div>
  );
}

// Low-frequency recipients (physicians, credentialing) get NO work-generating queue —
// just a lightweight "WorkLinks waiting on you" list with one-tap status. Easier than email.
function LightRecipientView({ area, worklinks, onResolve, roleLabel }) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const waiting = worklinks
    .filter(w => w.targetArea === area && w.status === "open")
    .sort((a, b) => new Date(a.slaDue) - new Date(b.slaDue));
  const resolvedToday = worklinks.filter(w => w.targetArea === area && w.status !== "open");

  const oneTap = (w, label) => onResolve(w.id, `${roleLabel}: ${label}`);

  return (
    <div style={{ padding: isMobile ? "16px 12px 80px" : "24px 32px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>WorkLinks waiting on you</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          {waiting.length === 0
            ? "You're all caught up — nothing waiting."
            : `${waiting.length} request${waiting.length > 1 ? "s" : ""} need your response. One tap to clear each.`}
        </div>
      </div>

      {waiting.length === 0 ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a" }}>All clear</div>
          <div style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>No open requests waiting on you.</div>
        </div>
      ) : (
        waiting.map(w => {
          const breached = new Date() > new Date(w.slaDue);
          return (
            <div key={w.id} style={{ background: "#fff", border: `1px solid ${breached ? "#fecaca" : "#e2e8f0"}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{w.patient}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{w.accountId} · {w.payer}{w.vertical ? ` · ${w.vertical}` : ""}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: breached ? "#dc2626" : "#0369a1", background: breached ? "#fef2f2" : "#e0f2fe", borderRadius: 8, padding: "3px 9px", whiteSpace: "nowrap" }}>
                  {breached ? "SLA breached" : "Awaiting you"}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5, marginBottom: 6 }}>{w.requestIcon} {w.note}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>
                From {w.sourceArea || "revenue cycle"} · sent {new Date(w.sentAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Answered", color: "#16a34a" },
                  { label: "Addendum signed", color: "#0369a1" },
                  { label: "Need more info", color: "#c2410c" },
                ].map(b => (
                  <button key={b.label} onClick={() => oneTap(w, b.label)}
                    style={{ flex: isMobile ? "1 1 100%" : "0 1 auto", padding: "9px 16px", background: "#fff", border: `1.5px solid ${b.color}`, borderRadius: 8, color: b.color, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}

      {resolvedToday.length > 0 && (
        <div style={{ marginTop: 20, fontSize: 12, color: "#94a3b8" }}>
          ✓ {resolvedToday.length} cleared this session
        </div>
      )}
    </div>
  );
}


// ─── CFO Dashboard V2 — refined, layered, cash-health-first ───────────────────
// Built behind the existing dashboard as a fresh design language (Apple-like:
// type-led, calm, color-as-signal, progressive disclosure). Old dashboard intact.

// ─── TrendChart ───────────────────────────────────────────────────────────────
// Chart card that sits beside a finding: the metric line + soft fill, a faint baseline,
// a min–max range label, the current endpoint value, and an OPTIONAL secondary overlay
// (used for ADR on the AR-days card — a near-flat reference line that shows revenue held
// steady while the primary metric moved, i.e. a collections problem not a volume problem).
// "A touch more detail" than a sparkline, but still no gridlines/ticks — scannable at a glance.
function TrendChart({ data, color, label, unit = "", endValue, overlay, overlayLabel, overlayColor, width = 168, height = 64, INK = "#0f172a", MUTE = "#64748b", FAINT = "#94a3b8", LINE = "#e2e8f0" }) {
  if (!data || data.length < 2) return null;
  const pad = 6, topPad = 6, botPad = 14;
  const w = width - pad * 2, h = height - topPad - botPad;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const xy = (arr, lo, hi) => arr.map((v, i) => {
    const x = pad + (i / (arr.length - 1)) * w;
    const y = topPad + h - ((v - lo) / ((hi - lo) || 1)) * h;
    return [x, y];
  });
  const pts = xy(data, min, max);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const [ex, ey] = pts[pts.length - 1];
  const area = `${d} L${ex.toFixed(1)},${(topPad + h).toFixed(1)} L${pad},${(topPad + h).toFixed(1)} Z`;
  // overlay scaled to its OWN range so a near-flat series reads as near-flat
  let oPath = null;
  if (overlay && overlay.length === data.length) {
    const omin = Math.min(...overlay), omax = Math.max(...overlay);
    const opad = (omax - omin) * 0.5 || 1; // pad so a flat line sits mid-card, visibly flat
    const op = xy(overlay, omin - opad, omax + opad);
    oPath = op.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  }
  return (
    <div style={{ width }}>
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
        {/* faint baseline */}
        <line x1={pad} y1={topPad + h} x2={width - pad} y2={topPad + h} stroke={LINE} strokeWidth="1" />
        <path d={area} fill={color} opacity="0.07" />
        {oPath && <path d={oPath} fill="none" stroke={overlayColor || FAINT} strokeWidth="1.3" strokeDasharray="3 2" opacity="0.9" />}
        <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={ex} cy={ey} r="2.6" fill={color} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
        <span style={{ fontSize: 9, color: FAINT, letterSpacing: "0.04em" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{endValue}{unit}</span>
      </div>
      {overlayLabel && (
        <div style={{ fontSize: 8.5, color: FAINT, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 0, borderTop: `1.3px dashed ${overlayColor || FAINT}` }} />
          {overlayLabel}
        </div>
      )}
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
// Minimal trend line for finding cards: no axes, no labels, just the shape + endpoint dot.
// Calm by design — conveys trajectory, not precision. color matches the finding's signal.
function Sparkline({ data, color, width = 96, height = 30 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const w = width - pad * 2, h = height - pad * 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return [x, y];
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const [ex, ey] = pts[pts.length - 1];
  // soft area fill under the line
  const area = `${d} L${ex.toFixed(1)},${(height - pad).toFixed(1)} L${pad},${(height - pad).toFixed(1)} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <path d={area} fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="2.4" fill={color} />
    </svg>
  );
}

// ─── Ranked Risk Engine ───────────────────────────────────────────────────────
// Pure function: computes ALL candidate findings, ranks them, returns sorted.
// As metrics move, ranking shifts so what matters most to Marcus is always on top.
//
// RANKING MODEL — two axes, deliberately separated:
//   rankClass: ordering priority, NOT color.
//     "lead"    = EV-aligned diagnostic (aging TREND). Its implied action — work
//                 deteriorating sites by expected value — REINFORCES the platform's
//                 EV-first thesis, so it is allowed to lead the briefing.
//     "context" = diagnostic risk (over-90 cliff, concentration, denial). Important
//                 to show, but its naive reading ("work oldest first") would CONTRADICT
//                 EV-first collection and reduce cash. So it ranks BELOW the lead and is
//                 framed as context, never as the top directive.
//     "good"    = positive finding (improving sites, strong NCR) for board/CEO wins.
//   severity: 0..100, drives COLOR band only (red/amber/quiet), not rank order.
//
// Every finding answers WHY (driver) and RECOMMENDATION (EV-first action / consequence).
// Recommendations must ALWAYS point to EV-first work, never "work your oldest accounts."
function computeRiskFindings({ ar, baseline, siteNpr, siteFilter, fmtUSD, horizon = "month", daily = null }) {
  const findings = [];
  const annualNPR = siteFilter ? (siteNpr[siteFilter] || 0) : Object.values(siteNpr).reduce((s, v) => s + v, 0);
  const dailyNPR = annualNPR / 365;
  const totalAR = ar.reduce((s, a) => s + a.amount, 0);
  const round10k = (n) => Math.round(n / 10000) * 10000;
  const isMonth = horizon === "month";

  // ---- LEAD: Portfolio AR aging trend (the EV-aligned diagnostic) ----
  const curDays = totalAR > 0 ? Math.round(ar.reduce((s, a) => s + a.amount * a.daysOut, 0) / totalAR) : 0;
  const priorDays = siteFilter
    ? (baseline.sites[siteFilter]?.prior.arDays ?? curDays)
    : baseline.portfolio.prior.arDays;
  const deltaDays = curDays - priorDays;
  const cashDrift = round10k(Math.abs(deltaDays) * dailyNPR);
  const deterioratingSites = Object.entries(baseline.sites)
    .filter(([, s]) => s.trend === "deteriorating")
    .sort((a, b) => b[1].delta.arDays - a[1].delta.arDays);
  if (deltaDays > 0) {
    findings.push({
      id: "aging_trend", tone: "risk", rankClass: "lead", series: "arDays",
      severity: Math.min(100, 40 + deltaDays * 7),
      headline: { pre: "AR slowed ", em: `${priorDays} → ${curDays} days`, mid: " this month, delaying roughly ", em2: fmtUSD(cashDrift), post: " of cash collection." },
      why: `Rising denials and slower follow-up at the sites below are pushing accounts deeper into aging.`,
      recommendation: `Direct collectors to the highest-EV accounts in ${deterioratingSites.slice(0, 3).map(([n]) => n).join(", ")} first — recovering the biggest dollars fastest pulls cash back in.`,
      drivers: deterioratingSites.slice(0, 3).map(([name, s]) => ({
        name, detail: `${s.prior.arDays} → ${s.current.arDays} days · denial +${s.delta.denialRate}pts · +${s.delta.over90Pct}pts over 90`,
        magnitude: `+${s.delta.arDays}d`,
      })),
    });
  } else if (deltaDays < 0) {
    findings.push({
      id: "aging_trend", tone: "good", rankClass: "good", series: "arDays",
      severity: 20,
      headline: { pre: "AR improved ", em: `${priorDays} → ${curDays} days`, mid: " this month, pulling roughly ", em2: fmtUSD(cashDrift), post: " of cash closer to collection." },
      why: `Recovery is broad-based across sites.`,
      recommendation: `Hold the gains by keeping the highest-EV accounts worked first.`,
      drivers: [],
    });
  }

  // ---- CONTEXT: Money aging past the recoverability cliff (>90 / >120) ----
  const over90 = ar.filter(a => a.daysOut > 90).reduce((s, a) => s + a.amount, 0);
  const over120 = ar.filter(a => a.daysOut > 120).reduce((s, a) => s + a.amount, 0);
  const over90Pct = totalAR > 0 ? Math.round(over90 / totalAR * 100) : 0;
  if (over90Pct > 10) {
    // Which sites are driving the aging — biggest over-90 increases this period
    const cliffDrivers = Object.entries(baseline.sites)
      .filter(([, s]) => (s.delta.over90Pct || 0) > 0)
      .sort((a, b) => b[1].delta.over90Pct - a[1].delta.over90Pct)
      .slice(0, 3).map(([n]) => n);
    findings.push({
      id: "aging_cliff", tone: "risk", rankClass: "context", series: "over90Pct",
      severity: Math.min(100, 45 + (over90Pct - 10) * 3),
      headline: { pre: "", em: fmtUSD(round10k(over90)), mid: " has aged past 90 days — ", em2: `${over90Pct}% of AR`, post: ", above the 10% PE target." },
      why: `Concentrated in ${cliffDrivers.join(", ")}, where aging accelerated most this month; ${fmtUSD(round10k(over120))} is already past 120.`,
      recommendation: `As collectors work by EV, flag high-EV accounts nearing 90 days so the biggest dollars are recovered before they slip toward write-off.`,
      drivers: [],
    });
  }

  // ---- CONTEXT: Concentration risk (single site = outsized exposure) ----
  const bySite = {};
  ar.forEach(a => { bySite[a.site] = (bySite[a.site] || 0) + a.amount; });
  const siteEntries = Object.entries(bySite).sort((a, b) => b[1] - a[1]);
  if (!siteFilter && siteEntries.length > 0) {
    const [topSite, topAR] = siteEntries[0];
    const topPct = Math.round(topAR / totalAR * 100);
    if (topPct >= 15) {
      findings.push({
        id: "concentration", tone: "risk", rankClass: "context",
        severity: Math.min(85, 30 + topPct * 1.5),
        headline: { pre: "", em: `${topPct}% of AR`, mid: " sits in a single site — ", em2: topSite, post: ` holds ${fmtUSD(round10k(topAR))}.` },
        why: `Concentrated exposure means one site's performance swings the whole portfolio.`,
        recommendation: `Keep ${topSite} staffed and worked first by EV; its trajectory is the portfolio's trajectory.`,
        drivers: [],
      });
    }
  }

  // ---- CONTEXT: Denial bleed (first-pass denials as recurring leakage) ----
  const deniedAccts = ar.filter(a => a.denialCode);
  const denialRate = ar.length > 0 ? Math.round(deniedAccts.length / ar.length * 100) : 0;
  const deniedBalance = deniedAccts.reduce((s, a) => s + a.amount, 0);
  if (denialRate >= 10) {
    // Where denials rose most this month (real baseline deltas)
    const denialRisers = Object.entries(baseline.sites)
      .filter(([, s]) => (s.delta.denialRate || 0) > 0)
      .sort((a, b) => b[1].delta.denialRate - a[1].delta.denialRate)
      .slice(0, 3).map(([n]) => n);
    findings.push({
      id: "denial_bleed", tone: "risk", rankClass: "context", series: "denialRate",
      severity: Math.min(80, 25 + denialRate * 2.2),
      headline: { pre: "First-pass denials at ", em: `${denialRate}%`, mid: " — ", em2: fmtUSD(round10k(deniedBalance)), post: " in denied balance, above the 10% line." },
      why: `Denial volume climbed this month, concentrated at ${denialRisers.join(", ")} — upstream coding, auth, and eligibility gaps feeding back as rework.`,
      recommendation: `Route high-EV denied accounts through WorkLink to the responsible area; each point of denial reduction is recurring margin, not a one-time recovery.`,
      drivers: [],
    });
  }

  // ---- GOOD: Improving sites (board/CEO success story) ----
  const improvingSites = Object.entries(baseline.sites)
    .filter(([, s]) => s.trend === "improving")
    .sort((a, b) => a[1].delta.arDays - b[1].delta.arDays); // most improved first
  // ---- GOOD: Improving sites + the recoverable cash they added (EV gain, scoped) ----
  // EV gain is only truthful where performance improved — NOT portfolio-wide (portfolio
  // net-deteriorated). Scope the EV win to the improving sites' share.
  if (improvingSites.length > 0) {
    const top = improvingSites.slice(0, 3);
    const bestDays = Math.abs(top[0][1].delta.arDays);
    // Recoverable-cash gain at improving sites: their AR share × |drift| applied to portfolio EV.
    const totalEV = ar.reduce((s, a) => s + a.expectedValue, 0);
    const impAR = improvingSites.reduce((s, [, st]) => s + st.current.ar, 0);
    const impDriftWeighted = improvingSites.reduce((s, [, st]) => s + Math.abs(st.evDriftPct) * st.current.ar, 0) / Math.max(1, impAR);
    const impEVShare = totalAR > 0 ? totalEV * (impAR / totalAR) : 0;
    const evGain = round10k(impEVShare * impDriftWeighted);
    findings.push({
      id: "improving_sites", tone: "good", rankClass: "good", series: "improving",
      severity: 16,
      headline: { pre: "", em: `${improvingSites.length} sites`, mid: " improved this month — ", em2: top.map(([n]) => n).join(", "), post: `, recovering AR up to ${bestDays} days faster${evGain > 0 ? ` and adding ~${fmtUSD(evGain)} of recoverable cash` : ""}.` },
      why: `Consistent EV-first follow-up and lower denials are compounding at the strongest sites.`,
      recommendation: `A repeatable playbook for the board — apply what's working here to the deteriorating sites.`,
      drivers: [],
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HORIZON-SPECIFIC FINDINGS (Today / This Week) — event-driven + root-cause.
  // The metric findings above are month-trend findings. For shorter horizons we
  // suppress those and surface what actually MOVED in the window plus the
  // operational root causes (the five-whys behind the deterioration). Same card
  // format: trigger in the headline, cause→effect chain as the "why".
  // ──────────────────────────────────────────────────────────────────────────
  const monthFindings = findings.splice(0); // remove all month findings; re-add if month
  const horizonFindings = [];

  if (isMonth) {
    horizonFindings.push(...monthFindings);
  } else if (daily) {
    const windowDays = horizon === "today" ? 1 : 7;
    const within = (offset) => Math.abs(offset) <= windowDays || (horizon === "today" && offset === 0);
    const evs = (daily.events || []).filter(e => within(e.dayOffset));

    // --- Event: accounts crossed the 90-day line in the window ---
    const crossings = evs.filter(e => e.type === "crossed_90");
    if (crossings.length) {
      const cnt = crossings.reduce((s, e) => s + e.count, 0);
      const amt = crossings.reduce((s, e) => s + e.amount, 0);
      horizonFindings.push({
        id: "ev_crossed_90", tone: "risk", rankClass: "lead", series: "over90Pct",
        severity: Math.min(100, 55 + cnt * 2),
        headline: { pre: "", em: `${cnt} accounts`, mid: horizon === "today" ? " crossed 90 days since yesterday — " : " crossed 90 days this week — ", em2: fmtUSD(round10k(amt)), post: " now past the collectability cliff." },
        why: `Aging accounts tipped over the 90-day line where collection probability drops sharply.`,
        recommendation: `Work these by EV immediately — they are the freshest additions to the over-90 cohort and the most recoverable.`,
        drivers: [],
      });
    }

    // --- Event: write-offs landed on the desk ---
    const wos = evs.filter(e => e.type === "writeoff_landed");
    if (wos.length) {
      const amt = wos.reduce((s, e) => s + e.amount, 0);
      horizonFindings.push({
        id: "ev_writeoff", tone: "risk", rankClass: "context",
        severity: 70,
        headline: { pre: `${wos.length} write-off${wos.length > 1 ? "s" : ""} ` , em: `${fmtUSD(round10k(amt))}`, mid: horizon === "today" ? " landed on your desk for decision" : " reached your desk this week", em2: "", post: "." },
        why: `${wos.map(w => `${w.accountId} (${w.payer}, ${fmtUSD(w.amount)})`).join("; ")} — recovery paths exhausted, recommended for write-off.`,
        recommendation: `Decide before timely-filing or appeal windows fully close; approving promptly frees the team to work recoverable EV instead.`,
        drivers: [],
      });
    }

    // --- Event: a site jumped overnight (today only) ---
    const jumps = evs.filter(e => e.type === "site_jump");
    if (jumps.length && horizon === "today") {
      const j = jumps[0];
      horizonFindings.push({
        id: "ev_site_jump", tone: "risk", rankClass: "context", series: "arDays",
        severity: 64,
        headline: { pre: "", em: j.site, mid: " jumped ", em2: `+${j.daysAdded} days`, post: ` overnight to ${j.current} AR days.` },
        why: `A sharp single-day move usually signals a batch event — a billing run, a denial cluster, or a posting delay at ${j.site}.`,
        recommendation: `Have ${j.site} confirm the cause today; if it is a denial cluster, route the high-EV accounts through WorkLink now.`,
        drivers: [],
      });
    }

    // --- Event: SLA breaches in the window ---
    const slas = evs.filter(e => e.type === "sla_breach");
    if (slas.length) {
      const cnt = slas.reduce((s, e) => s + e.count, 0);
      const areas = [...new Set(slas.map(e => e.area))];
      horizonFindings.push({
        id: "ev_sla", tone: "risk", rankClass: "context",
        severity: 50,
        headline: { pre: "", em: `${cnt} follow-up SLA breach${cnt > 1 ? "es" : ""}`, mid: horizon === "today" ? " today" : " this week", em2: "", post: ` in ${areas.join(", ")}.` },
        why: `Accounts past their scheduled follow-up date age unworked and drift toward the 90-day cliff.`,
        recommendation: `Reassign or escalate the breached accounts so the highest-EV ones are worked first.`,
        drivers: [],
      });
    }

    // --- Root causes (the five-whys) for this horizon ---
    const rcs = (daily.rootCauses || []).filter(r => r.horizon.includes(horizon));
    rcs.forEach((r, i) => {
      horizonFindings.push({
        id: r.id, tone: "risk", rankClass: i === 0 && crossings.length === 0 ? "lead" : "context",
        severity: r.severity === "high" ? 58 - i : 44 - i,
        rootCause: true,
        headline: { pre: r.site === "Portfolio" ? "" : `${r.site}: `, em: r.trigger, mid: "", em2: "", post: "." },
        why: r.chain + (r.impact?.note ? ` — ${r.impact.note}.` : "."),
        recommendation: `Address the root cause, not just the symptom: ${rootCauseFix(r.id)}`,
        drivers: [],
      });
    });

    // Honest quiet-day state
    if (horizonFindings.length === 0) {
      horizonFindings.push({
        id: "quiet", tone: "good", rankClass: "good",
        severity: 10,
        headline: { pre: "", em: horizon === "today" ? "No material change since yesterday" : "No material change this week", mid: " — the portfolio is holding.", em2: "", post: "" },
        why: `No accounts crossed 90 days, no write-offs landed, and no sites moved sharply in this window.`,
        recommendation: `Keep working the highest-EV accounts; the month view shows the longer trend.`,
        drivers: [],
      });
    }
  }

  // ---- RANK: lead first, then context (by severity), then good (by severity) ----
  const classRank = { lead: 0, context: 1, good: 2 };
  return horizonFindings.sort((a, b) => {
    if (classRank[a.rankClass] !== classRank[b.rankClass]) return classRank[a.rankClass] - classRank[b.rankClass];
    return b.severity - a.severity;
  });
}

// Short root-cause remediation phrases (the "fix the cause" half of the recommendation).
function rootCauseFix(id) {
  switch (id) {
    case "rc_billers_site5": return "backfill the biller roles and clear the DNFB backlog before it ages further.";
    case "rc_integration_site12": return "add a transmission-confirmation check to the interface so a failed batch is caught same-day.";
    case "rc_coding_site3": return "audit the changed HIM coding step and correct the modifier logic to stop the downstream denials.";
    case "rc_collectors_understaffed": return "rebalance collector capacity to denial volume so high-EV denials are worked within SLA.";
    default: return "trace the operational cause and correct it at the source.";
  }
}

// ──────────────────────────────────────────────────────────────────────────
// CONFIG-DRIVEN CFO KPIs
// The catalog (cfo-kpis.json) defines every KPI's group, thresholds, status.
// Built KPIs compute their live value from real AR data here, keyed by computeKey.
// Phase-2 KPIs render as calm "designed · pending data" placeholders until the
// named data source connects. Color discipline (neutral default, signal on
// exception) lives in one place — kpiColor — so it can never drift.
// ──────────────────────────────────────────────────────────────────────────

// Live value computations from real AR data. Returns { value, displayValue, detail }.
function computeKpiValue(computeKey, { ar, siteNpr, siteFilter, fmtUSD }) {
  const totalAR = ar.reduce((s, a) => s + a.amount, 0);
  const annualNPR = siteFilter ? (siteNpr[siteFilter] || 0) : Object.values(siteNpr).reduce((s, v) => s + v, 0);
  switch (computeKey) {
    case "ncr": {
      const totalEV = ar.reduce((s, a) => s + (a.expectedValue || 0), 0);
      const value = annualNPR > 0 ? Math.round(totalEV / (totalAR || 1) * 100) : 0;
      // NCR here is EV ÷ gross AR (collectable share of current AR)
      const v = totalAR > 0 ? Math.round(totalEV / totalAR * 100) : 0;
      return { value: v, displayValue: `${v}%`, detail: `Expected collections ${fmtUSD(totalEV)} of ${fmtUSD(totalAR)} net AR` };
    }
    case "denial": {
      const denied = ar.filter(a => a.denialCode);
      const deniedBal = denied.reduce((s, a) => s + a.amount, 0);
      const v = ar.length > 0 ? Math.round(denied.length / ar.length * 100) : 0;
      const balRate = totalAR > 0 ? Math.round(deniedBal / totalAR * 100) : 0;
      return { value: v, displayValue: `${v}%`, detail: `${denied.length} of ${ar.length} accounts · ${fmtUSD(deniedBal)} denied balance (${balRate}%)` };
    }
    case "badDebt": {
      const wo = ESCALATION_DATA.writeOffPending;
      const woTotal = wo.reduce((s, w) => s + w.amount, 0);
      const grossCharges = totalAR / 0.45;
      const v = grossCharges > 0 ? Math.round(woTotal / grossCharges * 100 * 10) / 10 : 0;
      return { value: v, displayValue: `${v}%`, detail: `${wo.length} write-offs · ${fmtUSD(woTotal)} pending · write-offs ÷ gross charges (est.)` };
    }
    case "ar90": {
      const bucket = ar.filter(a => a.daysOut > 90);
      const bal = bucket.reduce((s, a) => s + a.amount, 0);
      const v = totalAR > 0 ? Math.round(bal / totalAR * 100) : 0;
      return { value: v, displayValue: `${v}%`, detail: `${bucket.length} accounts · ${fmtUSD(bal)} of ${fmtUSD(totalAR)} total AR` };
    }
    case "ar120": {
      const bucket = ar.filter(a => a.daysOut > 120);
      const bal = bucket.reduce((s, a) => s + a.amount, 0);
      const v = totalAR > 0 ? Math.round(bal / totalAR * 100) : 0;
      return { value: v, displayValue: `${v}%`, detail: `${bucket.length} accounts · ${fmtUSD(bal)} of ${fmtUSD(totalAR)} total AR` };
    }
    case "selfPayEV": {
      const sp = ar.filter(a => a.payer === "Self-Pay");
      const ev = sp.reduce((s, a) => s + (a.expectedValue || 0), 0);
      const bal = sp.reduce((s, a) => s + a.amount, 0);
      return { value: ev, displayValue: fmtUSD(ev), detail: `${sp.length} accounts · ${fmtUSD(bal)} total balance` };
    }
    case "selfPayCollection": {
      const sp = ar.filter(a => a.payer === "Self-Pay");
      const bal = sp.reduce((s, a) => s + a.amount, 0);
      const collected = Math.round(bal * 0.20); // industry-typical ~20% realization
      const v = 20;
      return { value: v, displayValue: `${v}%`, detail: `${fmtUSD(collected)} collected of ${fmtUSD(bal)} billed` };
    }
    default:
      return { value: null, displayValue: "—", detail: "" };
  }
}

// The color discipline, enforced in ONE place. Neutral by default; amber/red only
// when a value crosses into watch/critical per the KPI's direction + thresholds.
function kpiColor(kpi, value) {
  const INK = "#0f172a", AMBER = "#d97706", RED = "#dc2626";
  if (value === null || kpi.direction === "neutral" || kpi.good == null) return INK;
  if (kpi.direction === "higher_better") {
    if (value >= kpi.good) return INK;       // healthy = neutral
    if (value >= kpi.watch) return AMBER;     // watch
    return RED;                               // critical
  } else { // lower_better
    if (value <= kpi.good) return INK;
    if (value <= kpi.watch) return AMBER;
    return RED;
  }
}

function kpiStatusLabel(kpi, value) {
  if (value === null || kpi.good == null || kpi.direction === "neutral") return "";
  const ok = kpi.direction === "higher_better" ? value >= kpi.good : value <= kpi.good;
  const watch = kpi.direction === "higher_better" ? value >= kpi.watch : value <= kpi.watch;
  return ok ? "On target" : watch ? "Watch" : "Needs attention";
}

function KpiCard({ kpi, computed, isMobile }) {
  const isPhase2 = kpi.status === "phase2";
  const color = isPhase2 ? "#94a3b8" : kpiColor(kpi, computed ? computed.value : null);
  const statusLabel = isPhase2 ? "" : kpiStatusLabel(kpi, computed ? computed.value : null);
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", opacity: isPhase2 ? 0.92 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{kpi.label}</div>
        {isPhase2 && <div style={{ fontSize: 9, fontWeight: 600, color: "#64748b", background: "#f1f5f9", borderRadius: 5, padding: "2px 7px", letterSpacing: "0.04em", textTransform: "uppercase", flexShrink: 0, marginLeft: 8 }}>Phase 2</div>}
      </div>
      {isPhase2 ? (
        <>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#cbd5e1", letterSpacing: "-0.02em" }}>—</div>
          <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 6 }}>{kpi.dependency}</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>Benchmark: {kpi.benchmark}</div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{computed.displayValue}</div>
            {statusLabel && <div style={{ fontSize: 12, color, fontWeight: 600 }}>{statusLabel}</div>}
          </div>
          <div style={{ fontSize: 11.5, color: "#475569", marginTop: 4 }}>{computed.detail}</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>Benchmark: {kpi.benchmark}</div>
        </>
      )}
    </div>
  );
}

function KpiGroup({ group, computeArgs, isMobile }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", margin: "8px 0 12px 4px" }}>{group.label}</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        {group.kpis.map(kpi => {
          const computed = kpi.status === "built" ? computeKpiValue(kpi.computeKey, computeArgs) : null;
          return <KpiCard key={kpi.key} kpi={kpi} computed={computed} isMobile={isMobile} />;
        })}
      </div>
    </div>
  );
}

function CFODashboardV2({ arFiltered, dnfbFiltered, siteFilter, SITE_NPR, isCollectorActionable, worklinks, horizon, setHorizon }) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  // Platform-native palette (matches existing app — no new fonts)
  const INK = "#0f172a", MUTE = "#64748b", FAINT = "#94a3b8", LINE = "#e2e8f0";
  const RED = "#dc2626", AMBER = "#d97706", GREEN = "#16a34a", BLUE = "#2563eb";

  // Run the ranked risk engine — findings reorder as the metrics move AND as the horizon changes.
  const findings = computeRiskFindings({
    ar: arFiltered, baseline: SITE_BASELINE, siteNpr: SITE_NPR, siteFilter, fmtUSD: fmt,
    horizon, daily: DAILY,
  });

  const label = { fontSize: 11, fontWeight: 600, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase" };
  // severity → signal color band. Good-news findings stay calm (no red).
  const bandColor = (f) => f.tone === "good" ? GREEN : f.severity >= 60 ? RED : f.severity >= 40 ? AMBER : FAINT;
  const emColor = (f) => f.tone === "good" ? GREEN : f.severity >= 60 ? RED : f.severity >= 40 ? AMBER : INK;

  const lead = findings[0];
  const supporting = findings.slice(1, 6);

  // Chart metadata per series — label, unit, and the current endpoint value (reconciles to truth).
  const ts = TIMESERIES.series;
  const last = (k) => ts[k] ? ts[k][ts[k].length - 1] : "";
  const CHART_META = {
    arDays:     { label: "AR DAYS · 12 WK", unit: "d",  end: () => last("arDays") },
    over90Pct:  { label: "OVER 90 · 12 WK", unit: "%",  end: () => last("over90Pct") },
    denialRate: { label: "DENIAL RATE · 12 WK", unit: "%", end: () => last("denialRate") },
    improving:  { label: "AR DAYS · 12 WK", unit: "d",  end: () => last("improving") },
  };

  return (
    <div style={{ fontFamily: "inherit", color: INK, background: "#fff", maxWidth: 940, margin: "0 auto", padding: isMobile ? "8px 4px 40px" : "24px 16px 60px" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14, paddingLeft: 4 }}>
        <div style={label}>Risk briefing{siteFilter ? ` · ${siteFilter}` : " · portfolio"} · {horizon === "today" ? "today" : horizon === "week" ? "this week" : "this month"}</div>
        <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 9, padding: 2 }}>
          {[["today", "Today"], ["week", "This Week"], ["month", "This Month"]].map(([key, lbl]) => (
            <button key={key} onClick={() => setHorizon(key)}
              style={{ padding: "6px 14px", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                background: horizon === key ? "#fff" : "transparent",
                color: horizon === key ? INK : MUTE,
                boxShadow: horizon === key ? "0 1px 2px rgba(15,23,42,0.08)" : "none" }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {!lead ? (
        <div style={{ padding: "32px 28px", border: `1px solid ${LINE}`, borderRadius: 14, borderLeft: `3px solid ${GREEN}` }}>
          <div style={{ fontSize: isMobile ? 19 : 23, fontWeight: 600 }}>No material risks this period.</div>
          <div style={{ fontSize: 14, color: MUTE, marginTop: 10 }}>AR aging, denial, and concentration are all within benchmark. Keep working the queue to hold position.</div>
        </div>
      ) : (
        <>
          {/* ── LEAD FINDING (largest) ── */}
          <div style={{ padding: isMobile ? "20px 16px" : "30px 28px", border: `1px solid ${LINE}`, borderRadius: 14, borderLeft: `3px solid ${bandColor(lead)}`, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
              <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 600, lineHeight: 1.34, letterSpacing: "-0.01em", flex: 1 }}>
                {lead.headline.pre}<span style={{ color: emColor(lead) }}>{lead.headline.em}</span>{lead.headline.mid}<span style={{ color: emColor(lead) }}>{lead.headline.em2}</span>{lead.headline.post}
              </div>
              {!isMobile && lead.series && TIMESERIES.series[lead.series] && (() => {
                const cm = CHART_META[lead.series] || {};
                const isAR = lead.series === "arDays";
                return (
                  <div style={{ flexShrink: 0 }}>
                    <TrendChart
                      data={TIMESERIES.series[lead.series]} color={bandColor(lead)}
                      label={cm.label} unit={cm.unit} endValue={cm.end ? cm.end() : ""}
                      overlay={isAR ? TIMESERIES.series.adrK : null}
                      overlayLabel={isAR ? "Avg daily revenue — steady" : null}
                      overlayColor={FAINT}
                      width={184} height={68}
                      INK={INK} MUTE={MUTE} FAINT={FAINT} LINE={LINE}
                    />
                  </div>
                );
              })()}
            </div>
            <div style={{ fontSize: 14, color: MUTE, marginTop: 14, lineHeight: 1.55 }}>
              <span style={{ color: INK, fontWeight: 600 }}>Why:</span> {lead.why}<br />
              <span style={{ color: INK, fontWeight: 600 }}>Recommendation:</span> {lead.recommendation}
            </div>
            {lead.drivers.length > 0 && (
              <div style={{ marginTop: 20, paddingLeft: isMobile ? 4 : 16 }}>
                {lead.drivers.map((d, i) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 52px" : "130px 1fr 52px", alignItems: "center", columnGap: 16, padding: "11px 0", borderTop: `1px solid ${LINE}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: bandColor(lead), flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{d.name}</span>
                    </div>
                    {!isMobile && <div style={{ fontSize: 13, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.detail}</div>}
                    <div style={{ fontSize: 15, fontWeight: 600, color: bandColor(lead), textAlign: "right", whiteSpace: "nowrap" }}>{d.magnitude}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── SUPPORTING FINDINGS (smaller, ranked) ── */}
          {supporting.map(f => (
            <div key={f.id} style={{ padding: isMobile ? "16px 16px" : "18px 24px", border: `1px solid ${LINE}`, borderRadius: 12, borderLeft: `3px solid ${bandColor(f)}`, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 600, lineHeight: 1.4, flex: 1 }}>
                  {f.headline.pre}<span style={{ color: emColor(f) }}>{f.headline.em}</span>{f.headline.mid}<span style={{ color: emColor(f) }}>{f.headline.em2}</span>{f.headline.post}
                </div>
              {!isMobile && f.series && TIMESERIES.series[f.series] && (() => {
                const cm = CHART_META[f.series] || {};
                return (
                  <div style={{ flexShrink: 0 }}>
                    <TrendChart
                      data={TIMESERIES.series[f.series]} color={bandColor(f)}
                      label={cm.label} unit={cm.unit} endValue={cm.end ? cm.end() : ""}
                      width={140} height={48}
                      INK={INK} MUTE={MUTE} FAINT={FAINT} LINE={LINE}
                    />
                  </div>
                );
              })()}
              </div>
              <div style={{ fontSize: 13, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>{f.recommendation}</div>
            </div>
          ))}
        </>
      )}

    </div>
  );
}


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

  // WorkLink-in-flight currency split — AR-origin carries net/EV, DNFB-origin carries gross.
  // These are DIFFERENT currencies and must never be summed into one headline.
  const arInFlight = open.filter(w => w.originType === "AR");
  const dnfbInFlight = open.filter(w => w.originType !== "AR"); // DNFB or legacy/unmarked
  const arInFlightEV = arInFlight.reduce((s,w) => s+w.expectedValue, 0);
  const dnfbInFlightGross = dnfbInFlight.reduce((s,w) => s+w.amount, 0);

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
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>WIP WorkLink — by area</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>Internal rework in flight · AR shown as net/EV, DNFB as gross charges · the two are different currencies and never summed</div>

      {/* Summary row — currency-split: AR (EV) and DNFB (gross) shown separately */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Open requests", value: open.length, color: "#0f172a" },
          { label: "AR in flight (EV)", value: fmt(arInFlightEV), color: "#0f172a", sub: `${arInFlight.length} accts` },
          { label: "DNFB in flight (gross)", value: fmt(dnfbInFlightGross), color: "#0f172a", sub: `${dnfbInFlight.length} accts` },
          { label: "SLA breached", value: totalBreached, color: totalBreached > 0 ? "#dc2626" : "#16a34a" },
          { label: "Resolved this session", value: resolved.length, color: "#16a34a" },
        ].map(m => (
          <div key={m.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: 9, color: "#cbd5e1", marginTop: 2 }}>{m.sub}</div>}
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

function CollectorAccountCard({ acc, onLog, onWorkLink, sentWorklinks = [] }) {
  const [approved, setApproved] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [overrideAction, setOverrideAction] = useState(null);
  const [otherActionText, setOtherActionText] = useState("");
  const [otherMode, setOtherMode] = useState(false);
  const [fieldValue, setFieldValue] = useState("");
  const [noteReady, setNoteReady] = useState(null);
  const [showWorkLink, setShowWorkLink] = useState(false);
  const [worklinkSent, setWorklinkSent] = useState(false);

  const sev = SEV[acc.cfg.severity];
  const tf = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  const tfColor = tf == null ? "#64748b" : tf < 0 ? "#64748b" : tf < 3 ? "#dc2626" : tf < 14 ? "#d97706" : tf < 30 ? "#0369a1" : "#16a34a";
  const tfText = tf == null ? null : tf < 0 ? `${acc.bindingLabel}: CLOSED (${Math.abs(tf)}d past)` : `${acc.bindingLabel}: ${tf}d remaining`;

  const os = outcome ? OUTCOME_STATUSES.find(o => o.value === outcome) : null;
  const fieldRequired = !!os?.requiresField;
  const fieldValid = !fieldRequired || fieldValue.trim().length > 0;
  const noteCharsRequired = os?.requiresNoteChars || 0;
  const noteCharsCount = noteReady && noteReady !== "__SKIPPED__" ? noteReady.length : 0;
  const noteCharsValid = noteCharsCount >= noteCharsRequired;
  const canLog = outcome && noteReady !== null && fieldValid && noteCharsValid;

  const handleLog = () => {
    if (!canLog || !os) return;
    onLog({
      id: acc.id, patient: acc.patient, amount: acc.amount,
      expectedValue: acc.expectedValue, outcome, outcomeLabel: os.label,
      followUpDate: os.pending ? "Pending CFO" : addBusinessDays(os.followUpDays),
      workNote: noteReady === "__SKIPPED__" ? null : noteReady,
      overrideAction: otherMode ? `Other: ${otherActionText}` : overrideAction,
      structuredField: fieldRequired ? { name: os.requiresField, label: os.requiresFieldLabel, value: fieldValue.trim() } : null,
      timestamp: new Date(),
    });
    // Outcomes with triggersWL → emit outbound WL
    if (os.triggersWL && onWorkLink) {
      const reqType = os.triggersWL === "escalate_lead" ? "escalate_collections_lead" : os.triggersWL;
      const reqDef = WORKLINK_REQUEST_TYPES.find(t => t.value === reqType);
      if (reqDef) {
        onWorkLink({
          id: `WL-OUT-${Date.now()}-${acc.id}`,
          accountId: acc.id, patient: acc.patient, payer: acc.payer,
          vertical: acc.vertical, site: acc.site,
          amount: acc.amount, expectedValue: acc.expectedValue,
          originType: "AR", sourceArea: "Collections", sourceRole: "commercial_collector",
          from: { name: "Collector", role: "Collector" },
          requestType: reqType, requestLabel: reqDef.label, requestIcon: reqDef.icon,
          targetRole: reqDef.targetRole || null, targetArea: reqDef.targetArea || null,
          note: noteReady === "__SKIPPED__" ? `${os.label} via outcome log` : noteReady,
          status: "open",
          sentAt: new Date(),
          slaHrs: WORKLINK_REQUEST_SLA_HRS[reqType] || 48,
          slaDue: new Date(Date.now() + (WORKLINK_REQUEST_SLA_HRS[reqType] || 48) * 3600 * 1000),
          slaSeverity: "MODERATE", slaTier: "medium",
          slaLabel: `${WORKLINK_REQUEST_SLA_HRS[reqType] || 48}h`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      {/* Account header */}
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 600, background: acc.cfg.color + "12", color: acc.cfg.color, border: `1px solid ${acc.cfg.color}30`, padding: "2px 8px", borderRadius: 4 }}>{acc.area === 'Collections' ? acc.cfg.label.split(' — ')[0].toUpperCase() : acc.area.toUpperCase()}</span>
              {tfText && (
                <span style={{ fontSize: 10, fontWeight: 600, background: tfColor + "12", color: tfColor, border: `1px solid ${tfColor}40`, padding: "2px 8px", borderRadius: 4 }}>⏱ {tfText}</span>
              )}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 4, letterSpacing: "-0.01em" }}>{acc.patient}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{acc.id} · {acc.site} · {acc.vertical}</div>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
              {acc.payer}{acc.subPayer ? <span style={{ color: "#94a3b8", fontWeight: 400 }}> — {acc.subPayer}</span> : ""}
              {(PAYER_PORTALS[acc.payer] || PAYER_PORTALS[acc.subPayer]) && (
                <a href={PAYER_PORTALS[acc.payer] || PAYER_PORTALS[acc.subPayer] || "https://www.availity.com"} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#2563eb", fontSize: 10, marginLeft: 2, textDecoration: "none" }} title="Open provider portal">↗</a>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{acc.cfg.label}</div>
            {/* Issue chips (Session 2 issues[] array) */}
            {acc.issues && acc.issues.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {acc.issues.map((iss, ix) => (
                  <span key={ix} style={{ fontSize: 10, fontWeight: 600, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", padding: "1px 7px", borderRadius: 4 }}>
                    {iss.code} · {iss.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            <ProbCircle prob={acc.prob} payer={acc.payer} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>Expected value</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "#2563eb", letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(acc.expectedValue)}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{fmt(acc.amount)} balance · {acc.daysOut}d out</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sent WL inline visibility — this account has open outbound WLs */}
      {sentWorklinks && sentWorklinks.length > 0 && (
        <div style={{ padding: "10px 22px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#92400e", textTransform: "uppercase", marginBottom: 6 }}>⇄ {sentWorklinks.length} WorkLink{sentWorklinks.length > 1 ? "s" : ""} in flight</div>
          {sentWorklinks.map((w, ix) => {
            const hrsOut = Math.round((Date.now() - new Date(w.sentAt).getTime()) / 3600000);
            const slaBreached = hrsOut > w.slaHrs;
            return (
              <div key={ix} style={{ fontSize: 11, color: "#78350f", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span>{w.requestIcon} {w.requestLabel} → {w.targetRole || w.targetArea}</span>
                <span style={{ color: slaBreached ? "#dc2626" : "#92400e", fontWeight: slaBreached ? 700 : 400 }}>
                  {slaBreached ? "SLA BREACHED" : `${hrsOut}h of ${w.slaHrs}h`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Account Summary */}
      <div style={{ padding: "12px 22px 0" }}><AccountSummary acc={acc} /></div>

      {/* Recommended Action card — Approve / Override / Other */}
      <div style={{ padding: "16px 22px", background: "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
        {!overriding && !otherMode ? (
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
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => setOverriding(true)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
                    ↺ Override with a canonical action
                  </button>
                  <span style={{ color: "#cbd5e1" }}>·</span>
                  <button onClick={() => setOtherMode(true)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
                    Other — log something else
                  </button>
                </div>
              </>
            )}
            {approved && (
              <div style={{ padding: "9px 20px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, color: "#16a34a", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                ✓ Action approved {overrideAction ? `(${overrideAction})` : ""}
              </div>
            )}
          </>
        ) : overriding ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 10 }}>Select canonical action taken</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
              {[
                { icon: "📞", label: "Outbound call" },
                { icon: "📋", label: "Appeal submission" },
                { icon: "⚡", label: "Internal escalation" },
                { icon: "📝", label: "Physician query" },
                { icon: "🔄", label: "Resubmit claim" },
                { icon: "✕", label: "Write-off recommendation" },
              ].map(at => (
                <button key={at.label} onClick={() => { setOverrideAction(at.label); setApproved(true); setOverriding(false); }} style={{ padding: "8px 10px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#334155", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{at.icon}</span> {at.label}
                </button>
              ))}
            </div>
            <button onClick={() => setOverriding(false)} style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Cancel — go back</button>
          </>
        ) : (
          // Other escape valve — non-canonical action capture
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>Describe what you did</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10, lineHeight: 1.5 }}>The canonical actions above didn't fit. Describe what you actually did in 1-2 sentences — this gets flagged for review so we can extend the canon if it's a recurring pattern.</div>
            <textarea
              value={otherActionText}
              onChange={e => setOtherActionText(e.target.value)}
              placeholder="e.g. Called payer 3-way with patient on the line to verify benefits..."
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#334155", fontFamily: "inherit", resize: "vertical", minHeight: 60, outline: "none", lineHeight: 1.6, marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { if (otherActionText.trim().length >= 10) { setApproved(true); setOtherMode(false); } }} disabled={otherActionText.trim().length < 10}
                style={{ flex: 1, padding: "8px 16px", background: otherActionText.trim().length >= 10 ? "#0f172a" : "#e2e8f0", border: "none", borderRadius: 6, color: otherActionText.trim().length >= 10 ? "#fff" : "#94a3b8", cursor: otherActionText.trim().length >= 10 ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                Continue — log outcome
              </button>
              <button onClick={() => { setOtherMode(false); setOtherActionText(""); }} style={{ padding: "8px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
            {otherActionText.trim().length > 0 && otherActionText.trim().length < 10 && (
              <div style={{ fontSize: 10, color: "#dc2626", marginTop: 6 }}>Minimum 10 characters — describe what you did.</div>
            )}
          </>
        )}
      </div>

      {/* Agentic WorkLink draft (Carlos preserves this from prior CollectorView pattern) */}
      {approved && !worklinkSent && (() => {
        const actionKey = otherMode ? null : (overrideAction || acc.action.value);
        const draft = actionKey ? WORKLINK_ACTION_MAP[actionKey] : null;
        const draftActive = draft && draft.targetArea !== acc.area;
        if (!draftActive && !showWorkLink) return null;
        return (
          <div style={{ padding: "10px 22px 0" }}>
            {draftActive && !showWorkLink && (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 6 }}>
                  ✦ AI WorkLink draft — {draftActive.requestIcon} {draftActive.requestLabel} → {draftActive.targetArea}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowWorkLink(true)} style={{ flex: 1, padding: "7px 14px", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Review & Send</button>
                  <button onClick={() => setShowWorkLink(false)} style={{ padding: "7px 12px", background: "#fff", border: "1px solid #bfdbfe", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Dismiss</button>
                </div>
              </div>
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
      {worklinkSent && (
        <div style={{ margin: "10px 22px 0", padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: "#0369a1", fontWeight: 600 }}>⇄ WorkLink sent — account suppressed from queue</span>
        </div>
      )}

      {/* Log outcome flow — appears after approval */}
      {approved && (
        <div style={{ padding: "16px 22px" }}>
          <LogOutcomeFlow
            acc={acc}
            outcome={outcome}
            setOutcome={(v) => { setOutcome(v); setFieldValue(""); setNoteReady(null); }}
            fieldValue={fieldValue}
            setFieldValue={setFieldValue}
            noteReady={noteReady}
            setNoteReady={setNoteReady}
          />
          {outcome && canLog && (
            <button
              onClick={handleLog}
              style={{ marginTop: 12, padding: "10px 20px", width: "100%", background: "#0f172a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}
            >
              Log outcome &amp; advance to next account →
            </button>
          )}
          {outcome && !canLog && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
              {!fieldValid && `${os?.requiresFieldLabel || os?.requiresField} required · `}
              {!noteCharsValid && noteReady !== null && `Note must be at least ${noteCharsRequired} characters (currently ${noteCharsCount}) · `}
              {noteReady === null && "Add a work note or skip to enable logging"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Carlos's LogOutcomeFlow — 5-group outcome picker (OUTCOME_GROUPS), structured
// field gates per outcome (e.g., appeal_filed → appealRef), then scratch→polish
// note via ScratchNoteGenerator. Replaces the old flat OutcomeSelector for the
// collector path; biller still uses the simpler OutcomeSelector.
function LogOutcomeFlow({ acc, outcome, setOutcome, fieldValue, setFieldValue, noteReady, setNoteReady }) {
  const os = outcome ? OUTCOME_STATUSES.find(o => o.value === outcome) : null;

  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Log outcome</div>
      <select
        value={outcome || ""}
        onChange={e => setOutcome(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: outcome ? "#0f172a" : "#94a3b8", fontFamily: "inherit", cursor: "pointer", outline: "none" }}
      >
        <option value="" disabled>Select outcome...</option>
        {OUTCOME_GROUPS.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.ids.map(id => {
              const o = OUTCOME_STATUSES.find(x => x.value === id);
              if (!o) return null;
              return <option key={id} value={id}>{o.label}</option>;
            })}
          </optgroup>
        ))}
      </select>

      {/* Follow-up preview — canon-aligned (pending CFO / payment_expected / standard) */}
      {os && <FollowUpPreview outcome={outcome} />}

      {/* Structured field gate — outcomes with requiresField reveal an input */}
      {os?.requiresField && (
        <div style={{ marginTop: 10, padding: "10px 14px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "#854d0e", display: "block", marginBottom: 6 }}>
            {os.requiresFieldLabel} (required)
          </label>
          <input
            type="text"
            value={fieldValue}
            onChange={e => setFieldValue(e.target.value)}
            placeholder={os.requiresField === "appealRef" ? "e.g. APL-2026-44218" : os.requiresField === "aljDocket" ? "e.g. ALJ-3-2026-0098" : "e.g. CLM-RESUB-99412"}
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 12, border: `1px solid ${fieldValue.trim() ? "#fde68a" : "#fca5a5"}`, borderRadius: 6, background: "#fff", color: "#0f172a", fontFamily: "inherit", outline: "none" }}
          />
          <div style={{ fontSize: 10, color: "#854d0e", marginTop: 4 }}>This number is recorded on the account and used to track the appeal/resubmission downstream.</div>
        </div>
      )}

      {/* Scratch → polish note (uses existing ScratchNoteGenerator with canon-aware prompt) */}
      {outcome && <ScratchNoteGenerator acc={acc} outcome={outcome} onNoteReady={setNoteReady} />}

      {/* 20-char note gate notice for escalations */}
      {os?.requiresNoteChars && noteReady && noteReady !== "__SKIPPED__" && noteReady.length < os.requiresNoteChars && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#dc2626", padding: "6px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6 }}>
          Escalation note must be at least {os.requiresNoteChars} characters — currently {noteReady.length}. Add context about why this needs lead review.
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

// ─── Bucket classification (mixed priority: TF + WL SLA) ─────────────────────
// Account bucket is the WORSE of:
//   - native TF urgency (appealTfRemaining)
//   - any sent open WorkLink's SLA burning
// Past-TF accounts (tf<0) stay in routine with a "TF CLOSED" badge that
// prompts write-off review rather than work.
function classifyCollectorBucket(acc, openWlsForAccount) {
  const tf = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  const wlBreached = openWlsForAccount.some(w => {
    const hrsOut = (Date.now() - new Date(w.sentAt).getTime()) / 3600000;
    return hrsOut > w.slaHrs;
  });
  const wlNearBreach = openWlsForAccount.some(w => {
    const hrsOut = (Date.now() - new Date(w.sentAt).getTime()) / 3600000;
    return hrsOut > w.slaHrs * 0.75 && hrsOut <= w.slaHrs;
  });
  if (tf != null && tf < 0) return "routine"; // past TF — surfaces with badge in routine, not critical
  if ((tf != null && tf >= 0 && tf < 3) || wlBreached) return "critical";
  if ((tf != null && tf < 14) || wlNearBreach) return "urgent";
  if (tf != null && tf < 30) return "watch";
  return "routine";
}

function bucketReason(acc, openWlsForAccount) {
  const tf = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  const wlBreached = openWlsForAccount.some(w => {
    const hrsOut = (Date.now() - new Date(w.sentAt).getTime()) / 3600000;
    return hrsOut > w.slaHrs;
  });
  if (tf != null && tf < 0) return "TF CLOSED";
  if (wlBreached) return "WL breached";
  if (tf != null && tf >= 0 && tf < 30) return `TF ${tf}d`;
  return null;
}

const BUCKET_META = {
  critical: { label: "CRITICAL", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", desc: "TF closing in ≤3d or sent WorkLink SLA-breached — work these first" },
  urgent:   { label: "URGENT",   color: "#d97706", bg: "#fffbeb", border: "#fde68a", desc: "TF closing in ≤14d or WorkLink near SLA — work soon" },
  watch:    { label: "WATCH",    color: "#0369a1", bg: "#eff6ff", border: "#bfdbfe", desc: "TF closing in ≤30d — monitor" },
  routine:  { label: "ROUTINE",  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", desc: "Sufficient runway — work by expected value" },
};
const BUCKET_ORDER = ["critical", "urgent", "watch", "routine"];

// ═══════════════════════════════════════════════════════════════════════════
// PHASE B.1: CarlosCollectorView — Commercial Collector surface
// ═══════════════════════════════════════════════════════════════════════════
// Faithful port of Carlos's standalone main queue view, rendering against
// platform data (AR_DATA scored + live worklinks state) via the A-phase
// primitives.
//
// What this surface does:
//   • Reads role-filtered AR accounts (arScored — commercial vertical only)
//   • Applies STRATUM_FLOOR = $10K EV (Carlos's book scope)
//   • Suppresses accounts referenced by open inbound WLs (duplicate-suppression:
//     the WL row replaces the native row to avoid the same account appearing
//     twice — the WL row carries additional sender context)
//   • Enriches inbound WLs with hoursLeft + slaState
//   • Mixes native accounts and inbound WLs into one queue, sorted by EV descending
//     (TF ≤14d OR WL breached/critical), then EV descending within bucket
//   • Supports TF filter (All / ≤3d / ≤14d / ≤30d) with live counts
//   • Burning banner clickable to apply ≤14d filter
//
// B.1 click handler temporarily defers to the existing Session 4
// CollectorAccountCard for inline-expanded outcome logging. B.2 will replace
// that with Carlos's faithful DetailView (AccountSummary, PayerContactBlock,
// recommendAction, full-screen pattern).
//
// Used ONLY for the commercial_collector role. The other 4 collector roles
// (medicare_bc, medicaid, self_pay, wc) keep the existing CollectorView until
// they get their own design pass.
// ═══════════════════════════════════════════════════════════════════════════
// PHASE B.2.2: recommendAction + RecommendedActionCard
// ═══════════════════════════════════════════════════════════════════════════
// Ports standalone recommendAction (line 727) and the inline Recommended Action
// card render (lines 1363-1402) into CarlosDetailView. Adaptations from
// standalone for platform shape: bindingClock as number derived from
// appealTfRemaining ?? submissionTfRemaining; bindingLabel payer prefix
// stripped; followUp info read from platform's getFollowUpStore; wlSent
// derived from open outbound WLs in worklinks state; newDenialOverride branch
// skipped (no upstream signal for it in platform yet).

// Strip payer prefix from bindingLabel for in-prose use ('Aetna appeal TF' → 'Appeal TF').
const cleanBindingLabel = (rawLbl) => {
  if (!rawLbl) return "binding clock";
  const lower = rawLbl.toLowerCase();
  if (lower.includes("appeal")) return "Appeal TF";
  if (lower.includes("submission")) return "Submission TF";
  return rawLbl;
};

function recommendAction(acc, ctx) {
  const tf = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  const bindingLbl = cleanBindingLabel(acc.bindingLabel);
  const isDenied = acc.denialDate != null;
  const denialAge = isDenied ? Math.round((Date.now() - new Date(acc.denialDate).getTime()) / 86400000) : null;
  const followUpDate = ctx?.followUpDate || null;
  const followUpDaysAway = ctx?.followUpDaysAway;
  const openOutbound = ctx?.openOutbound || [];

  // Closed window → write-off recommendation
  if (tf != null && tf <= 0) {
    return {
      outcomeId: "writeoff_recommended",
      rationale: `Binding clock (${bindingLbl}) is closed. No further recovery possible at this level. Recommend opening the write-off chain.`,
      confidence: "high",
    };
  }

  // Awaiting another area's reply (platform check: open outbound WL exists)
  if (openOutbound.length > 0) {
    const wl = openOutbound[0];
    const targetName = wl.targetArea || wl.targetRole || "another area";
    const reqLabel = wl.requestLabel || wl.requestType || "open WorkLink";
    return {
      outcomeId: null,
      noAction: true,
      rationale: `Awaiting response from ${targetName} on ${reqLabel}. No collector action recommended until they reply.`,
      confidence: "high",
    };
  }

  // Payment expected — sleeping until cash posts or follow-up arrives
  if (acc.status === "payment_expected" && followUpDaysAway != null && followUpDaysAway > 0) {
    return {
      outcomeId: null,
      noAction: true,
      rationale: `Account in payment-expected sleep until ${prettyDate(followUpDate)}. Cash posting closes it when payment arrives. If no payment by the follow-up date, account resurfaces and you'll call ${acc.payer} for status.`,
      confidence: "high",
    };
  }

  // ── Pre-adjudication blockers (Q4 fix May 31) ─────────────────────────
  // Upstream-area blocks take precedence over urgent TF — the TF urgency
  // just shapes the rationale. If an account has both an upstream block
  // AND PENDING_SUBMISSION, the upstream block wins (root cause).
  const upstreamHold = acc.holdCode;
  const issueCode = acc.issues?.[0]?.code;
  const tfTight = tf != null && tf <= 30;
  const tfNote = tfTight ? ` Submission TF closes in ${tf}d — urgent.` : "";

  if (upstreamHold === "AUTH_MISSING" || upstreamHold === "AUTH_EXPIRED") {
    return {
      outcomeId: "auth_required",
      rationale: `Auth ${upstreamHold === "AUTH_MISSING" ? "not obtained" : "expired"} for ${acc.vertical || "service"} at ${acc.site}. Open WorkLink to Authorization team to chase retro-auth. ${acc.payer} retro-auth success ~45%.${tfNote}`,
      confidence: "high",
    };
  }
  if (upstreamHold === "CODING_UNASSIGNED" || upstreamHold === "CODING_COMPLEX") {
    return {
      outcomeId: "recode_required",
      rationale: `${upstreamHold === "CODING_UNASSIGNED" ? "Account unassigned to a coder" : "Complex coding hold"}. Open WorkLink to Coding team to assign or release.${tfNote}`,
      confidence: "high",
    };
  }
  if (upstreamHold === "CHARGE_MISSING" || upstreamHold === "CHARGE_LAG") {
    return {
      outcomeId: "charge_capture_gap",
      rationale: `Charge ${upstreamHold === "CHARGE_MISSING" ? "missing" : "entry lag"} at ${acc.site}. Open WorkLink to Charge Capture to enter and release.${tfNote}`,
      confidence: "high",
    };
  }
  if (upstreamHold === "CREDENTIALING") {
    return {
      outcomeId: "cred_gap",
      rationale: `Provider not credentialed at ${acc.site} with ${acc.payer}. Open WorkLink to Credentialing — request expedited resolution and estimated date.`,
      confidence: "high",
    };
  }
  if (issueCode === "PENDING_SUBMISSION") {
    return {
      outcomeId: "submission_pending",
      rationale: `Claim has not been submitted to ${acc.payer}. Open WorkLink to Billing/Scrubber to submit.${tfNote}`,
      confidence: "high",
    };
  }
  if (issueCode === "REJECTED") {
    return {
      outcomeId: "submission_pending",
      rationale: `Clearinghouse rejected the claim. Open WorkLink to Billing/Scrubber to fix and resubmit.${tfNote}`,
      confidence: "high",
    };
  }

  // Urgent binding clock → file appeal (denied) or resubmit (not yet denied)
  if (tf != null && tf <= 14) {
    if (isDenied) {
      return {
        outcomeId: "appeal_filed",
        rationale: `Denied claim — appeal window closes in ${tf}d. File appeal now; capture the appeal reference when payer issues it.`,
        confidence: "high",
      };
    }
    return {
      outcomeId: "resubmitted",
      rationale: `Submission TF window closes in ${tf}d. Resubmit before the window expires; capture the resubmission claim reference.`,
      confidence: "high",
    };
  }

  // Follow-up due
  if (followUpDaysAway != null && followUpDaysAway <= 0) {
    return {
      outcomeId: "payer_followup",
      rationale: `Follow-up date ${prettyDate(followUpDate)} has arrived. Call ${acc.payer} for status — log the rep name and any reference they provide.`,
      confidence: "high",
    };
  }

  // Denied account, no urgent TF → file appeal (default recovery path)
  // The collector can override if an appeal has already been filed.
  if (isDenied) {
    const denialCode = acc.issues?.[0]?.code || acc.denialCode;
    const codeRef = denialCode ? `${denialCode} ` : "";
    return {
      outcomeId: "appeal_filed",
      rationale: `${codeRef}denial${denialAge != null ? `, ${denialAge}d ago` : ""}. File appeal with clinical documentation; capture the appeal reference when ${acc.payer} issues it. If an appeal has already been filed, override and pick a follow-up outcome instead.`,
      confidence: "high",
    };
  }

  // ── Normal in-flight claim states ─────────────────────────────────────
  // Claims actively moving through the system don't need collector action
  // until they age past the normal window. IN_TRANSIT and AT_PAYER are
  // different from PENDING_SUBMISSION/REJECTED above — those need an
  // upstream area to act; these are the system working as expected.
  if (issueCode === "AT_PAYER") {
    if (acc.daysOut < 35) {
      return {
        outcomeId: null,
        noAction: true,
        rationale: `Claim with ${acc.payer} awaiting adjudication (${acc.daysOut}d out — within normal window). No collector action needed yet. If still no response by day 35, account will resurface for payer follow-up.`,
        confidence: "high",
      };
    }
    // Older than 35d at payer — overdue for follow-up
    return {
      outcomeId: "payer_followup",
      rationale: `Claim has been at ${acc.payer} ${acc.daysOut}d without adjudication — past the normal window. Call to verify status, capture rep name and reference number.`,
      confidence: "high",
    };
  }
  if (issueCode === "IN_TRANSIT") {
    if (acc.daysOut < 10) {
      return {
        outcomeId: null,
        noAction: true,
        rationale: `Claim in clearinghouse transit to ${acc.payer} (${acc.daysOut}d out). No action needed — typical clearinghouse handoff is 2-3 days. Account will resurface if it doesn't reach the payer.`,
        confidence: "high",
      };
    }
    // Stuck in transit beyond normal — needs Billing to check
    return {
      outcomeId: "submission_pending",
      rationale: `Claim stuck in clearinghouse transit for ${acc.daysOut}d (typical is 2-3d). Open WorkLink to Billing/Scrubber to investigate why it hasn't reached ${acc.payer}.`,
      confidence: "high",
    };
  }

  // Default: check status with payer
  return {
    outcomeId: "payer_followup",
    rationale: `Call ${acc.payer} to verify current claim status and confirm next-action timing.`,
    confidence: "medium",
  };
}

// Lookup helper — OUTCOME_STATUSES is an array of {value, label, ...}.
const outcomeLabel = (id) => OUTCOME_STATUSES.find(o => o.value === id)?.label || id;

function RecommendedActionCard({ rec, onApprove, onOverride, onOther }) {
  return (
    <div style={{ padding: "16px 20px", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: "0.08em", textTransform: "uppercase" }}>Recommended action</div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: PURPLE, background: "#faf5ff", border: `1px solid ${PURPLE}`, borderRadius: 6, padding: "2px 8px" }}>
          AI-SUGGESTED · YOU APPROVE
        </span>
      </div>
      {rec.noAction ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: MUTE, marginBottom: 4 }}>No action recommended right now</div>
          <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.5, marginBottom: 14 }}>{rec.rationale}</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>
            {outcomeLabel(rec.outcomeId)}
            <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, color: rec.confidence === "high" ? GREEN : rec.confidence === "medium" ? AMBER : MUTE, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              · {rec.confidence} confidence
            </span>
          </div>
          <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.55, marginBottom: 14 }}>{rec.rationale}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!rec.noAction && (
          <button onClick={onApprove}
            style={{ padding: "8px 16px", background: INK, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Approve →
          </button>
        )}
        <button onClick={onOverride}
          style={{ padding: "8px 16px", background: "#fff", color: INK, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Pick different outcome
        </button>
        <button onClick={onOther}
          style={{ padding: "8px 16px", background: "#fff", color: AMBER, border: `1px solid ${AMBER}`, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Doesn't fit any of these
        </button>
      </div>
    </div>
  );
}

const CONTACT_METHODS = ["Phone", "Portal", "Fax", "Email", "Manual"];

// Work request types Carlos can send via SendWorkLinkFlow.
// Filtered subset of WORKLINK_REQUEST_TYPES — only "work" requests
// (chase_auth / recode / etc.). Write-off + escalations go through
// Log Outcome → Terminal group, not bare WorkLinks. B.2.6 adds write-off
// compose path when triggered from outcome flow.
const CARLOS_WORK_WL_TYPES = ["chase_auth", "recode", "him_deficiency", "physician_query", "resubmit", "missing_charge", "cred_gap"];

// Lookup helper: maps a WL request type value to its config entry from
// WORKLINK_REQUEST_TYPES. Translates between the value-based ID and the
// label/icon/targetArea/targetRole metadata. Returns null if not found.
const getWlType = (value) => WORKLINK_REQUEST_TYPES.find(t => t.value === value) || null;

// Lookup helper for outcome metadata. Carlos's standalone uses dict access
// (OUTCOMES[id]); platform uses an array (OUTCOME_STATUSES). This bridges.
const getOutcome = (id) => OUTCOME_STATUSES.find(o => o.value === id) || null;

function CarlosLogOutcomeFlow({ acc, onSave, onTriggerWL, onCancel, preselectOutcome }) {
  const [method, setMethod] = useState("Phone");
  const [outcomeId, setOutcomeId] = useState(preselectOutcome || null);
  const [note, setNote] = useState("");
  const [overrideSleep, setOverrideSleep] = useState(null);
  const [fieldValue, setFieldValue] = useState("");
  const [polished, setPolished] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [originalScratch, setOriginalScratch] = useState("");

  const outcome = outcomeId ? getOutcome(outcomeId) : null;
  const effectiveSleep = overrideSleep != null ? overrideSleep : (outcome ? outcome.followUpDays : null);
  const isHandoff = outcomeId === "escalated" || outcomeId === "refer_specialist";
  const handoffTarget = outcomeId === "escalated" ? "Amara" : outcomeId === "refer_specialist" ? "Renata" : null;
  const minNoteLen = isHandoff ? 20 : 5;
  const fieldRequired = !!outcome?.requiresField;
  const fieldFilled = !fieldRequired || fieldValue.trim().length > 2;
  const canSave = outcomeId && note.trim().length > minNoteLen && fieldFilled;

  const pickOutcome = (id) => {
    setOutcomeId(id);
    setOverrideSleep(null);
    setFieldValue("");
    setPolished(false);
    setOriginalScratch("");
  };

  const polish = async () => {
    if (!note.trim()) return;
    setPolishing(true);
    setOriginalScratch(note);
    try {
      const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
      const triggersWL = outcome.triggersWL;
      const wlCfg = triggersWL ? getWlType(triggersWL) : null;
      const followUpClause = wlCfg
        ? `Opens ${wlCfg.label} WorkLink to ${wlCfg.targetArea || wlCfg.targetRole}; account sleeps until reply.`
        : effectiveSleep != null
          ? `Follow-up in ${effectiveSleep} business day${effectiveSleep === 1 ? "" : "s"}.`
          : "Status updated per outcome.";
      const prompt = `You are a healthcare revenue cycle documentation specialist. Convert the following scratch notes into a single professional work note for posting to an EHR account record.

Account: ${acc.id} | ${acc.patient} | ${acc.payer}
Balance: $${(acc.amount || 0).toLocaleString()} | ${acc.daysOut || 0} days outstanding
Touch method: ${method}
Outcome logged: ${outcome.label}
Next step: ${followUpClause}

Scratch notes: "${note.trim()}"

Requirements:
- Start with today's date: ${today}
- Include account ID, patient, and payer name
- Describe the action taken based on the scratch notes (preserve all reference numbers, rep names, dollar amounts, and dates from the scratch)
- State the outcome and the next step (use the "Next step" line above)
- 3-5 sentences maximum
- Professional clinical billing language — no bullet points, no markdown
- Do not invent information not present in the scratch notes or account context above`;

      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 350, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const polishedNote = data.content?.filter(b => b.type === "text").map(b => b.text).join("").trim() || "";
      if (polishedNote) {
        setNote(polishedNote);
        setPolished(true);
      } else {
        // Empty response — leave note alone, surface gracefully (user can still save scratch as-is)
        setOriginalScratch("");
      }
    } catch {
      // Network or API error — leave the user's note untouched so they can save manually
      setOriginalScratch("");
    }
    setPolishing(false);
  };

  const handleSave = () => {
    const fieldPayload = fieldRequired ? { [outcome.requiresField]: fieldValue.trim() } : {};
    const polishMeta = polished ? { polished: true, scratchOriginal: originalScratch } : { polished: false };
    if (outcome.triggersWL) {
      onTriggerWL({ wlType: outcome.triggersWL, contextNote: note, outcomeId, method, ...fieldPayload, ...polishMeta });
    } else {
      onSave({
        method, outcomeId, note,
        nextStatus: outcome.nextStatus,
        sleepDays: effectiveSleep,
        ...fieldPayload,
        ...polishMeta,
      });
    }
  };

  const placeholderForOutcome =
    outcomeId === "escalated"
      ? "Why are you escalating? What's blocking you that Amara can unblock? Be specific — this is the only context she has."
      : outcomeId === "refer_specialist"
      ? "Why does this need Renata? Describe the complexity (multi-payer, contested denial, unusual coding). She picks this up cold — give her the context."
      : method === "Phone" ? "Rep name, reference numbers, commitments... (you can polish with AI after)" : `What was the result of the ${method.toLowerCase()} touch?`;

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: "#fff", padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: "0.08em", textTransform: "uppercase" }}>Log outcome</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginTop: 3 }}>{acc.payer} · {acc.patient}</div>
        </div>
        <button onClick={onCancel} style={btnGhost}>cancel</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Touch method</div>
        <div style={{ display: "flex", gap: 5 }}>
          {CONTACT_METHODS.map(m => (
            <button key={m} onClick={() => setMethod(m)}
              style={{ padding: "6px 12px", border: `1px solid ${method === m ? INK : LINE}`, background: method === m ? INK : "#fff", color: method === m ? "#fff" : INK, borderRadius: 16, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 500 }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Outcome</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {OUTCOME_GROUPS.map(g => (
            <div key={g.label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: FAINT, marginBottom: 4 }}>{g.label.toUpperCase()}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4 }}>
                {g.ids.map(id => {
                  const o = getOutcome(id);
                  if (!o) return null;
                  const active = outcomeId === id;
                  return (
                    <button key={id} onClick={() => pickOutcome(id)}
                      style={{ padding: "7px 10px", textAlign: "left", border: `1px solid ${active ? g.color : LINE}`, borderLeft: `3px solid ${g.color}`, background: active ? PAPER : "#fff", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: INK, fontWeight: active ? 600 : 400 }}>
                      {o.label}
                      {o.followUpDays != null && <span style={{ color: FAINT, fontWeight: 400, marginLeft: 6 }}>· {o.followUpDays}d</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {outcomeId && outcome && (
        <>
          {fieldRequired && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                {outcome.requiresFieldLabel || outcome.requiresField}
                <span style={{ marginLeft: 8, color: fieldFilled ? GREEN : AMBER, fontWeight: 600 }}>
                  · {fieldFilled ? "captured" : "required"}
                </span>
              </div>
              <input
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                placeholder={`Enter ${(outcome.requiresFieldLabel || outcome.requiresField).toLowerCase()}`}
                style={{ width: "100%", padding: "10px 12px", border: `1px solid ${fieldFilled ? LINE : AMBER}`, borderRadius: 8, fontSize: 13, color: INK, fontFamily: "inherit", outline: "none", background: PAPER, boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>
                Required — captured for reporting and tracking.
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>
                Note
                {isHandoff && (
                  <span style={{ marginLeft: 8, color: note.trim().length > minNoteLen ? GREEN : AMBER, fontWeight: 600 }}>
                    · {note.trim().length}/{minNoteLen + 1}+ chars (travels to {handoffTarget})
                  </span>
                )}
                {polished && <span style={{ marginLeft: 8, color: PURPLE, fontWeight: 600 }}>· AI-POLISHED</span>}
              </span>
              {!polished && (
                <button onClick={polish} disabled={polishing || !note.trim()}
                  style={{ padding: "4px 10px", border: `1px solid ${LINE}`, background: note.trim() && !polishing ? "#fff" : PAPER, color: note.trim() && !polishing ? INK : FAINT, borderRadius: 6, cursor: note.trim() && !polishing ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 11, fontWeight: 600 }}>
                  {polishing ? "Polishing..." : "Polish with AI →"}
                </button>
              )}
              {polished && (
                <button onClick={() => { setNote(originalScratch); setPolished(false); setOriginalScratch(""); }}
                  style={{ padding: "4px 10px", border: `1px solid ${LINE}`, background: "#fff", color: MUTE, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600 }}>
                  ↩ Revert to scratch
                </button>
              )}
            </div>
            <textarea value={note} onChange={(e) => { setNote(e.target.value); if (polished) setPolished(false); }}
              placeholder={placeholderForOutcome}
              style={{ width: "100%", minHeight: polished ? 120 : 64, padding: "10px 12px", border: `1px solid ${polished ? PURPLE : LINE}`, borderRadius: 8, fontSize: 13, color: INK, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical", outline: "none", background: polished ? "#faf5ff" : PAPER, boxSizing: "border-box" }} />
            {polished && (
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>
                AI-structured from your scratch · edit further or save as is · original scratch preserved on the record
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14, padding: "12px 14px", background: outcome.triggersWL ? "#f3e8ff" : "#dcfce7", borderRadius: 10, border: `1px solid ${outcome.triggersWL ? PURPLE : GREEN}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: outcome.triggersWL ? PURPLE : GREEN, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>On save</div>
            {outcome.triggersWL ? (
              <div style={{ fontSize: 13, color: INK, lineHeight: 1.5 }}>
                Opens <strong>{getWlType(outcome.triggersWL)?.label || outcome.triggersWL}</strong> WorkLink → <strong>{getWlType(outcome.triggersWL)?.targetArea || getWlType(outcome.triggersWL)?.targetRole || "—"}</strong>. Status will become <strong>{STATUS[outcome.nextStatus]?.label || outcome.nextStatus}</strong> after send.
              </div>
            ) : (
              <div style={{ fontSize: 13, color: INK, lineHeight: 1.5 }}>
                Status → <strong>{STATUS[outcome.nextStatus]?.label || outcome.nextStatus}</strong>.
                {effectiveSleep != null && <> Sleeps <strong>{effectiveSleep} day{effectiveSleep !== 1 ? "s" : ""}</strong>.</>}
                {outcome.nextStatus === "payment_expected" && (
                  <div style={{ marginTop: 6, fontSize: 12, color: MUTE, fontStyle: "italic" }}>
                    Account closes when cash posts (backend). If cash hasn't arrived by the follow-up date, it resurfaces in your queue.
                  </div>
                )}
                {effectiveSleep != null && (
                  <div style={{ marginTop: 8, display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, color: FAINT, marginRight: 2 }}>override:</span>
                    {[1, 3, 7, 14, 30, 60].map(d => (
                      <button key={d} onClick={() => setOverrideSleep(d)}
                        style={{ padding: "3px 9px", border: `1px solid ${effectiveSleep === d ? INK : LINE}`, background: effectiveSleep === d ? INK : "#fff", color: effectiveSleep === d ? "#fff" : INK, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 500 }}>
                        {d}d
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onCancel} style={btnGhost}>cancel</button>
            <button onClick={handleSave} disabled={!canSave}
              style={{ padding: "10px 22px", background: canSave ? (outcome.triggersWL ? PURPLE : INK) : LINE, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: canSave ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              {outcome.triggersWL ? "Open WorkLink composer →" : "Save & apply"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function OtherFlow({ acc, onSave, onCancel }) {
  const [reason, setReason] = useState("");
  const [actionText, setActionText] = useState("");
  const canSave = reason.trim().length >= 10 && actionText.trim().length >= 10;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      method: "Manual",
      outcomeId: "other",
      outcomeLabel: "Other (flagged for review)",
      note: `WHY NO CANONICAL OUTCOME FITS:\n${reason.trim()}\n\nACTION TAKEN:\n${actionText.trim()}`,
      nextStatus: "in_progress",
      sleepDays: 1,
      needsReview: true,
    });
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: "#fff", padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: AMBER, letterSpacing: "0.08em", textTransform: "uppercase" }}>Other · flagged for review</div>
          <div style={{ fontSize: 13, color: MUTE, marginTop: 4, lineHeight: 1.5 }}>
            None of the 17 canonical outcomes fits this situation. Capture what you're seeing — your team lead will review and decide whether this needs a new canonical outcome.
          </div>
        </div>
        <button onClick={onCancel} style={btnGhost}>cancel</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
          Why doesn't a canonical outcome fit?
          <span style={{ marginLeft: 8, color: reason.trim().length >= 10 ? GREEN : AMBER, fontWeight: 600 }}>· {reason.trim().length}/10+ chars</span>
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Describe what the payer / portal / situation is doing that doesn't map to any of the 17 outcomes."
          style={{ width: "100%", minHeight: 60, padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, color: INK, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical", outline: "none", background: PAPER, boxSizing: "border-box" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
          What action are you taking?
          <span style={{ marginLeft: 8, color: actionText.trim().length >= 10 ? GREEN : AMBER, fontWeight: 600 }}>· {actionText.trim().length}/10+ chars</span>
        </div>
        <textarea value={actionText} onChange={(e) => setActionText(e.target.value)}
          placeholder="What are you doing for this account right now? What's the next step you expect?"
          style={{ width: "100%", minHeight: 60, padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, color: INK, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical", outline: "none", background: PAPER, boxSizing: "border-box" }} />
      </div>
      <div style={{ padding: "10px 12px", background: "#fffbeb", border: `1px solid ${AMBER}`, borderRadius: 8, fontSize: 12, color: INK, marginBottom: 14, lineHeight: 1.5 }}>
        <strong>On save:</strong> Account stays in your queue (1d sleep). A flag is set for team lead review. If this pattern repeats across accounts, it becomes a candidate for a new canonical outcome.
      </div>
      <button onClick={handleSave} disabled={!canSave}
        style={{ padding: "9px 18px", background: canSave ? INK : LINE, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: canSave ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
        Save & flag for review
      </button>
    </div>
  );
}

// WriteOffCompose — write-off-specific composer (B.2.6). When the user picks
// `writeoff_recommended` outcome, SendWorkLinkFlow routes here instead of the
// standard WorkCompose. Captures the structured write-off context (recovery
// attempts, amount, rationale, confirmation) and composes a single note that
// goes to the write-off queue (targetRole: cfo_writeoff).
function WriteOffCompose({ acc, contextNote, openOutbound = [], onSend, onBack }) {
  const [amount, setAmount] = useState(acc.amount);
  const [rationale, setRationale] = useState(contextNote || "");
  const [confirmed, setConfirmed] = useState(false);

  // Approval chain tiers — escalates by amount threshold. James (Supervisor)
  // always required; higher tiers gate on amount.
  const tiers = [
    { name: "James Walker (Supervisor)",  required: true,             threshold: "all"   },
    { name: "Collections Manager",         required: amount >= 5000,   threshold: "≥ $5K"  },
    { name: "RCM Director",                required: amount >= 25000,  threshold: "≥ $25K" },
    { name: "CFO",                         required: amount >= 100000, threshold: "≥ $100K"},
  ];

  // Recovery attempts — auto-derived from AR data + open WLs. The supervisor
  // reviewing the write-off needs to see what's been tried at the collector tier.
  const denialAge = acc.denialDate ? Math.floor((Date.now() - new Date(acc.denialDate).getTime()) / 86400000) : null;
  const tfRemaining = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  const tfClosed = tfRemaining != null && tfRemaining <= 0;
  const tfLabel = acc.appealTfRemaining != null ? "Appeal TF" : acc.submissionTfRemaining != null ? "Submission TF" : null;
  const attempts = [
    acc.lastContact && `Last payer contact ${prettyDate(acc.lastContact)}.`,
    openOutbound.length > 0 && `${openOutbound.length} open WorkLink${openOutbound.length > 1 ? "s" : ""} pending reply.`,
    acc.denialDate && `Denial received ${prettyDate(acc.denialDate)} (${denialAge}d ago).`,
    tfClosed && tfLabel && `${tfLabel} window CLOSED.`,
  ].filter(Boolean);

  const canSend = confirmed && rationale.trim().length >= 20;

  const handleSend = () => {
    if (!canSend) return;
    // Compose the note so the supervisor has full context. Embeds amount,
    // rationale, and recovery attempts in a single structured note.
    const partialPct = amount < acc.amount ? Math.round((amount / acc.amount) * 100) : 100;
    const composedNote = [
      "WRITE-OFF RECOMMENDATION",
      "",
      `Amount: $${amount.toLocaleString()}${amount < acc.amount ? ` (partial — ${partialPct}% of $${acc.amount.toLocaleString()} AR)` : " (full AR)"}`,
      "",
      "Rationale:",
      rationale.trim(),
      "",
      "Recovery attempts:",
      attempts.length > 0 ? attempts.map(a => `• ${a}`).join("\n") : "• None logged.",
    ].join("\n");

    onSend({
      accountId: acc.id,
      requestType: "write_off_request",
      requestLabel: "Write-off request",
      targetArea: "Write-off Queue",
      note: composedNote,
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <button onClick={onBack} style={btnGhostLink}>← change request type</button>
      </div>

      <div style={{ padding: "12px 14px", background: PAPER, borderRadius: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Recovery attempts</div>
        {attempts.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: INK, lineHeight: 1.7 }}>
            {attempts.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        ) : (
          <div style={{ fontSize: 12.5, color: MUTE, fontStyle: "italic" }}>No attempts logged — write-off may be premature.</div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase" }}>Write-off amount</label>
          <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>${Math.round(amount).toLocaleString()}</span>
        </div>
        <input type="range" min="0" max={acc.amount} step="50" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: "100%", accentColor: RED }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: FAINT, marginTop: 2 }}>
          <span>$0</span><span>full AR · ${Math.round(acc.amount).toLocaleString()}</span>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          Rationale (20+ chars)
          <span style={{ marginLeft: 8, color: rationale.trim().length >= 20 ? GREEN : AMBER, fontWeight: 600 }}>· {rationale.trim().length}/20+ chars</span>
        </label>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)}
          placeholder="e.g. 'CO-50 medical necessity; three appeals filed and denied; peer-to-peer denied; payer final.'"
          style={{ width: "100%", minHeight: 80, padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, color: INK, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical", outline: "none", background: PAPER, boxSizing: "border-box" }} />
      </div>

      <div style={{ padding: "12px 14px", background: "#fef3c7", borderRadius: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: AMBER, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Approval chain for ${Math.round(amount).toLocaleString()}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {tiers.map((tier, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: tier.required ? INK : FAINT }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, background: tier.required ? AMBER : LINE, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{tier.required ? "✓" : ""}</span>
              <span style={{ fontWeight: tier.required ? 600 : 400 }}>{tier.name}</span>
              <span style={{ color: FAINT, fontSize: 10.5 }}>· {tier.threshold}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>Each tier must <strong>attempt to overturn</strong> before signing off. Audit trail captures every step.</div>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, cursor: "pointer", padding: "10px 12px", background: confirmed ? "#dcfce7" : PAPER, borderRadius: 8, border: `1px solid ${confirmed ? GREEN : LINE}` }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2, accentColor: GREEN, cursor: "pointer" }} />
        <span style={{ fontSize: 12.5, color: INK, lineHeight: 1.5 }}>I confirm I have <strong>exhausted recovery options at the collector tier</strong>. The attempts above are accurate and complete.</span>
      </label>

      <div style={{ padding: "10px 12px", background: PAPER, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12, color: MUTE, marginBottom: 14, lineHeight: 1.5 }}>
        <strong style={{ color: INK }}>On send:</strong> Account status → Write-off pending. Account sleeps until supervisor responds via WorkLink resolution.
      </div>

      <button onClick={handleSend} disabled={!canSend}
        style={{ width: "100%", padding: "11px 22px", background: canSend ? RED : LINE, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: canSend ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
        Send to James (Tier 2) →
      </button>
    </div>
  );
}

function WorkCompose({ acc, t, contextNote, autoDraft = false, onSend, onBack }) {
  const [note, setNote] = useState(contextNote || "");
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const autoDraftFired = useRef(false);
  const minLen = 10;
  const canSend = note.trim().length >= minLen;

  const handleSend = () => {
    if (!canSend) return;
    onSend({
      accountId: acc.id,
      requestType: t.requestType,
      requestLabel: t.requestLabel,
      targetArea: t.targetArea,
      note: note.trim(),
    });
  };

  // AI draft — generates a professional WL request note from account context.
  // Uses any existing `note` (scratch, or carried-over from an outcome's
  // rationale via contextNote) as sender notes. Same prompt pattern as
  // WorkLinkForm.generateNote (line 3702). Optional — user can write manually.
  const draft = async () => {
    setDrafting(true);
    const scratch = note.trim();
    const targetArea = t.targetArea || t.targetRole || "destination team";
    const prompt = `You are a healthcare revenue cycle specialist creating a structured internal work request. Generate a concise, professional work request note in 2-3 sentences.

Account: ${acc.id} · ${acc.patient} · ${acc.payer} · Balance: $${(acc.amount || 0).toLocaleString()} · EV: $${Math.round(acc.expectedValue || 0).toLocaleString()}
Hold / issue: ${acc.cfg?.label || acc.issues?.[0]?.label || acc.area || "—"}
Request type: ${t.label}
Target area: ${targetArea}
${scratch ? `Sender notes: "${scratch}"` : "Sender notes: none (use account context only)"}

Write as a direct communication to the ${targetArea} team. Be specific about what action is needed and why it matters (dollar value, time pressure, downstream impact). Preserve any reference numbers, dates, or rep names from the sender notes. Return only the note text — no preamble, no bullet points, no markdown.`;
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 250, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("").trim() || "";
      if (text) {
        setNote(text);
        setDrafted(true);
      }
    } catch {
      // Fallback template — sensible default the user can edit and send.
      const fallback = `${t.label} needed for ${acc.patient} (${acc.id}, ${acc.payer}). Balance $${(acc.amount || 0).toLocaleString()}, expected value $${Math.round(acc.expectedValue || 0).toLocaleString()}. ${scratch || "Please review and take action."}`;
      setNote(fallback);
      setDrafted(true);
    }
    setDrafting(false);
  };

  // Agentic flow: auto-fire draft once on mount when autoDraft is true.
  // Used by handleAgenticReviewSend in CarlosDetailView — user clicked
  // "Review & Send" on the AI WL draft card, so we draft immediately and
  // they review the result. Ref guard prevents re-firing on re-render.
  useEffect(() => {
    if (autoDraft && !autoDraftFired.current) {
      autoDraftFired.current = true;
      draft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraft]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <button onClick={onBack} style={btnGhostLink}>← pick different request</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Note to {t.targetArea || t.targetRole || "target"}
            <span style={{ marginLeft: 8, color: canSend ? GREEN : AMBER, fontWeight: 600 }}>· {note.trim().length}/{minLen}+ chars</span>
            {drafted && <span style={{ marginLeft: 8, color: PURPLE, fontWeight: 600 }}>· AI-DRAFTED</span>}
          </div>
          <button onClick={draft} disabled={drafting}
            style={{ padding: "4px 10px", border: `1px solid ${LINE}`, background: drafting ? PAPER : "#fff", color: drafting ? FAINT : INK, borderRadius: 6, cursor: drafting ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600 }}>
            {drafting ? "Drafting..." : drafted ? "Redraft with AI" : "✦ Draft with AI"}
          </button>
        </div>
        <textarea value={note} onChange={(e) => { setNote(e.target.value); if (drafted) setDrafted(false); }}
          placeholder={`What does ${t.targetArea || t.targetRole} need to do? Include payer detail, dates, references. Or click "Draft with AI" to start from account context.`}
          style={{ width: "100%", minHeight: 100, padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, color: INK, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical", outline: "none", background: PAPER, boxSizing: "border-box" }} />
      </div>
      <div style={{ padding: "10px 12px", background: PAPER, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12, color: MUTE, marginBottom: 14, lineHeight: 1.5 }}>
        <strong style={{ color: INK }}>On send:</strong> Account status → Awaiting WorkLink. Sits in queue with WL pending indicator until {t.targetArea || t.targetRole} responds.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={handleSend} disabled={!canSend}
          style={{ padding: "10px 22px", background: canSend ? INK : LINE, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: canSend ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          Send WorkLink →
        </button>
      </div>
    </div>
  );
}

function SendWorkLinkFlow({ acc, preselectedType, contextNote, openOutbound = [], autoDraft = false, onSend, onCancel }) {
  const [type, setType] = useState(preselectedType || null);
  const t = type ? getWlType(type) : null;

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: "#fff", padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: type === "write_off_request" ? RED : FAINT, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {type === "write_off_request" ? "Write-off chain" : t ? `Send to area · ${t.targetArea || t.targetRole}` : "Send WorkLink — pick request type"}
          </div>
          {t && <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginTop: 3 }}>{t.label}</div>}
        </div>
        <button onClick={onCancel} style={btnGhost}>cancel</button>
      </div>

      {!type && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Work request</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
            {CARLOS_WORK_WL_TYPES.map(wId => {
              const w = getWlType(wId);
              if (!w) return null;
              const sla = WORKLINK_REQUEST_SLA_HRS[wId] || 48;
              return (
                <button key={wId} onClick={() => setType(wId)}
                  style={{ padding: "12px 10px", border: `1px solid ${LINE}`, borderRadius: 8, background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = INK; e.currentTarget.style.background = PAPER; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.background = "#fff"; }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{w.label}</div>
                  <div style={{ fontSize: 10, color: MUTE, marginTop: 2 }}>→ {w.targetArea} · {sla}h</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: MUTE, padding: "10px 12px", background: PAPER, border: `1px solid ${LINE}`, borderRadius: 8, lineHeight: 1.5 }}>
            <strong style={{ color: INK }}>Escalating, handing off to Renata, or recommending write-off?</strong> Those go through <strong>Log outcome</strong> → Terminal group. Anything that changes the account's state needs a logged outcome, not a bare WorkLink.
          </div>
        </div>
      )}

      {type === "write_off_request" && (
        <WriteOffCompose acc={acc} contextNote={contextNote} openOutbound={openOutbound} onSend={onSend} onBack={() => setType(null)} />
      )}
      {type && type !== "write_off_request" && t && (
        <WorkCompose acc={acc} t={t} contextNote={contextNote} autoDraft={autoDraft} onSend={onSend} onBack={() => setType(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE B.2.1: CarlosDetailView — Header card slice
// ═══════════════════════════════════════════════════════════════════════════
// Faithful port of Carlos's standalone DetailView header card. This slice
// renders ONLY the back button, optional jump-from-inbound notice, and the
// header card. The Recommended Action card, Send WorkLink shortcut, Account
// Summary, and Payer Contact block land in B.2.2 → B.2.5. Write-off flow +
// sleeping state in B.2.6.
//
// Ported verbatim from standalone lines 1294-1314 with two data-shape
// adjustments: (1) urgent computed from appealTfRemaining ?? submissionTfRemaining
// (platform shape) instead of bindingClock (standalone shape, which collapsed
// both into one numeric field); (2) STATUS[acc.status] guarded with ?. since
// platform data may have statuses the standalone didn't have.
function CarlosDetailView({ acc, onBack, jumpFromInbound, openOutbound = [], onWorkLink }) {
  const tf = acc.appealTfRemaining ?? acc.submissionTfRemaining;
  const urgent = tf != null && tf <= 14;
  const borderColor = urgent ? RED : (STATUS[acc.status]?.color || MUTE);
  const primaryIssue = acc.issues?.find(i => i.primary) || acc.issues?.[0];
  const additionalIssues = acc.issues?.filter(i => !i.primary && i !== primaryIssue) || [];

  // Follow-up context for recommendation
  const followUpRaw = (() => {
    try { return getFollowUpStore()[acc.id]; } catch { return null; }
  })();
  const followUpDate = (typeof followUpRaw === "string" && followUpRaw !== "closed" && followUpRaw !== "pending_cfo") ? followUpRaw : null;
  const followUpDaysAway = followUpDate ? Math.round((new Date(followUpDate + "T00:00:00Z").getTime() - Date.now()) / 86400000) : null;

  // Filter openOutbound to WLs Carlos originated. Other roles' WLs on this
  // account (e.g., Diane's chase_auth, auth team escalations) aren't his
  // to wait on — they're parallel tracks. Without this filter recommendAction
  // incorrectly says "Awaiting response from auth_team_lead" on accounts where
  // the WL came from a different role.
  const carlosOpenOutbound = openOutbound.filter(wl => wl.sourceRole === "commercial_collector");

  const rec = recommendAction(acc, { openOutbound: carlosOpenOutbound, followUpDate, followUpDaysAway });

  // Action state — null | "log_outcome" | "send_wl" | "other"
  const [action, setAction] = useState(null);
  const [preselectOutcome, setPreselectOutcome] = useState(null);
  const [wlPreselect, setWlPreselect] = useState(null);
  const [wlContextNote, setWlContextNote] = useState(null);
  // When an outcome's triggersWL routes us to the WL composer, we hold the
  // outcome payload here. handleSendWL reads it on send to log the outcome
  // alongside the WL — closing the audit gap (Q4 fix May 31). If user
  // cancels the composer, this is discarded (no orphan outcome).
  const [pendingOutcomeLog, setPendingOutcomeLog] = useState(null);
  // Agentic shortcut flag — when true, WorkCompose auto-runs the AI draft on
  // mount. Set by handleAgenticReviewSend (one-click from recommendation to
  // pre-drafted WL). Cleared by handleSendWL/cancel along with the rest of the
  // WL composer state.
  const [autoDraft, setAutoDraft] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (text) => { setToast(text); setTimeout(() => setToast(null), 3000); };

  // Recommendation outcome that triggers an agentic WL shortcut. Excludes
  // write_off_request — write-offs need the full WriteOffCompose flow
  // (approval chain, amount slider, confirmation checkbox), the agentic
  // shortcut would skip the confirmation gate.
  const recOutcome = rec.outcomeId ? getOutcome(rec.outcomeId) : null;
  const agenticWL = recOutcome?.triggersWL && recOutcome.triggersWL !== "write_off_request"
    ? getWlType(recOutcome.triggersWL)
    : null;

  const handleApprove = () => { setPreselectOutcome(rec.outcomeId); setAction("log_outcome"); };
  const handleOverride = () => { setPreselectOutcome(null); setAction("log_outcome"); };
  const handleOther = () => setAction("other");
  const handleSendWLShortcut = () => { setWlPreselect(null); setWlContextNote(null); setAutoDraft(false); setAction("send_wl"); };

  // Agentic Review & Send — one click from recommendation to pre-drafted WL.
  // Bypasses LogOutcomeFlow: outcome rationale is auto-set to rec.rationale,
  // WL composer opens with the type preselected, and WorkCompose auto-runs
  // the AI draft on mount. User reviews and sends; outcome + WL log together.
  const handleAgenticReviewSend = () => {
    if (!recOutcome || !agenticWL) return;
    setPendingOutcomeLog({
      method: "System",
      outcomeId: rec.outcomeId,
      note: rec.rationale,
      nextStatus: recOutcome.nextStatus,
      sleepDays: recOutcome.followUpDays,
    });
    setWlPreselect(recOutcome.triggersWL);
    setWlContextNote(rec.rationale);
    setAutoDraft(true);
    setAction("send_wl");
  };

  const handleLogSave = (log) => {
    setAction(null); setPreselectOutcome(null);
    // Persist follow-up date to platform store (account resurfaces at that date)
    if (log.sleepDays != null && log.sleepDays > 0) {
      const fuDate = new Date(Date.now() + log.sleepDays * 86400000).toISOString().split("T")[0];
      try { setFollowUpDate(acc.id, fuDate); } catch {}
    }
    // Notify CFO dashboard + any other listeners that this account has been worked
    try { window.dispatchEvent(new CustomEvent("d4_account_logged", { detail: { id: acc.id } })); } catch {}
    const outcome = getOutcome(log.outcomeId);
    showToast(`Logged: ${outcome?.label || log.outcomeId}${log.sleepDays ? `. Sleeps ${log.sleepDays}d.` : ""}`);
    setTimeout(() => onBack(), 400);
  };

  const handleTriggerWL = ({ wlType, contextNote, outcomeId, method, ...rest }) => {
    setWlPreselect(wlType); setWlContextNote(contextNote); setAction("send_wl");
    setPreselectOutcome(null);
    setAutoDraft(false);
    // Capture the outcome payload so handleSendWL can log it alongside the WL.
    // If user cancels the composer, this is discarded by handleCancelWL.
    if (outcomeId) {
      const oc = getOutcome(outcomeId);
      setPendingOutcomeLog({
        method, outcomeId, note: contextNote,
        nextStatus: oc?.nextStatus,
        sleepDays: oc?.followUpDays,
        ...rest,
      });
    } else {
      setPendingOutcomeLog(null);
    }
  };

  const handleSendWL = (wl) => {
    setAction(null); setWlPreselect(null); setWlContextNote(null);
    if (typeof onWorkLink === "function") {
      // Build full platform WL payload — WorkCompose only sends partial.
      // Reference shape: CollectorAccountCard onWorkLink call (line ~4002).
      const slaHrs = WORKLINK_REQUEST_SLA_HRS[wl.requestType] || 48;
      const reqIcon = getWlType(wl.requestType)?.icon || "📋";
      const targetRole = getWlType(wl.requestType)?.targetRole || null;
      const fullPayload = {
        id: `WL-OUT-${Date.now()}-${acc.id}`,
        accountId: acc.id,
        patient: acc.patient,
        payer: acc.payer,
        vertical: acc.vertical,
        site: acc.site,
        amount: acc.amount,
        expectedValue: acc.expectedValue,
        originType: "AR",
        sourceArea: "Collections",
        sourceRole: "commercial_collector",
        from: { name: "Carlos Mendez", role: "Collector" },
        requestType: wl.requestType,
        requestLabel: wl.requestLabel,
        requestIcon: reqIcon,
        targetRole,
        targetArea: wl.targetArea,
        note: wl.note,
        status: "open",
        sentAt: new Date(),
        slaHrs,
        slaDue: new Date(Date.now() + slaHrs * 3600 * 1000),
        slaSeverity: "MODERATE",
        slaTier: "medium",
        slaLabel: `${slaHrs}h`,
        createdAt: new Date().toISOString(),
      };
      try { onWorkLink(fullPayload); } catch {}
    }
    // If this WL was triggered by an outcome with triggersWL, log the outcome
    // now (Q4 fix May 31 — closes audit gap so account history shows both).
    // Use the outcome's followUpDays (area-appropriate timing) instead of the
    // default 3-day "awaiting WL" sleep.
    let fuDays = 3; // default for shortcut-WL path
    if (pendingOutcomeLog) {
      try {
        if (pendingOutcomeLog.sleepDays != null && pendingOutcomeLog.sleepDays > 0) {
          fuDays = pendingOutcomeLog.sleepDays;
        }
      } catch {}
      setPendingOutcomeLog(null);
    }
    setAutoDraft(false);
    try { setFollowUpDate(acc.id, new Date(Date.now() + fuDays * 86400000).toISOString().split("T")[0]); } catch {}
    // Notify CFO dashboard + any other listeners that this account has been worked
    try { window.dispatchEvent(new CustomEvent("d4_account_logged", { detail: { id: acc.id } })); } catch {}
    const oc = pendingOutcomeLog ? getOutcome(pendingOutcomeLog.outcomeId) : null;
    showToast(oc ? `Logged: ${oc.label} · ${wl.requestLabel} sent to ${wl.targetArea}` : `${wl.requestLabel} sent to ${wl.targetArea}`);
    setTimeout(() => onBack(), 400);
  };

  const handleOtherSave = (log) => {
    setAction(null);
    if (log.sleepDays != null && log.sleepDays > 0) {
      const fuDate = new Date(Date.now() + log.sleepDays * 86400000).toISOString().split("T")[0];
      try { setFollowUpDate(acc.id, fuDate); } catch {}
    }
    // Notify CFO dashboard + any other listeners that this account has been worked
    try { window.dispatchEvent(new CustomEvent("d4_account_logged", { detail: { id: acc.id } })); } catch {}
    showToast("Logged as Other — flagged for team lead review");
    setTimeout(() => onBack(), 400);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button onClick={onBack} style={{ ...btnGhost, alignSelf: "flex-start" }}>← back to worklist</button>

      {jumpFromInbound && (
        <div style={{ padding: "10px 14px", background: "#f0f7ff", border: `1px solid ${BLUE}`, borderRadius: 8, fontSize: 12, color: INK }}>
          <strong style={{ color: BLUE }}>From inbound:</strong>{" "}
          {jumpFromInbound.from?.name || "—"} ({jumpFromInbound.from?.role || jumpFromInbound.fromArea || "—"}) —{" "}
          {jumpFromInbound.requestLabel || jumpFromInbound.requestType || "WorkLink"}
          {jumpFromInbound.note ? <> · {jumpFromInbound.note}</> : null}
        </div>
      )}

      {/* Header card */}
      <div style={{ padding: "18px 22px", background: "#fff", border: `1px solid ${LINE}`, borderLeft: `3px solid ${borderColor}`, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{acc.id}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>
              {primaryIssue
                ? (CLAIM_STATE_CODES.has(primaryIssue.code)
                    ? primaryIssue.label
                    : `${primaryIssue.code} · ${primaryIssue.label}`)
                : "—"}
            </div>
            {additionalIssues.length > 0 && (
              <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>
                + also {additionalIssues.map(i => `${i.code} · ${i.label}`).join("; ")}
              </div>
            )}
            <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>
              {acc.patient} · {acc.payer}{acc.site ? ` · ${acc.site}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: FAINT, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Expected value</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: INK, letterSpacing: "-0.03em" }}>
              {"$" + Math.round(acc.expectedValue || acc.ev || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: MUTE }}>{"$" + Math.round(acc.amount || 0).toLocaleString()} AR</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          <StatusPill status={acc.status} />
          <CollectorDeadlinePill acc={acc} />
        </div>
      </div>

      {/* B.2.4 — Account summary prose block (collapsed by default, expands on
          click; real /api/claude call pulls SAMPLE_NOTES if any exist). Stays
          visible above the action panel so the user can reference work history
          while logging an outcome. */}
      <AccountSummary acc={acc} />

      {/* B.2.5 — Payer contact reference (phone / portal / fax / email). Always
          visible when the payer has data. Skipped for government payers and
          Self-Pay (contactFor returns null). Click-to-dial gated by CLIENT_CAPS
          (currently false — reference-only until telephony integration). */}
      <PayerContactBlock payer={acc.payer} />

      {/* Action panels — swap in based on action state */}
      {action === "log_outcome" && (
        <CarlosLogOutcomeFlow
          acc={acc}
          preselectOutcome={preselectOutcome}
          onSave={handleLogSave}
          onTriggerWL={handleTriggerWL}
          onCancel={() => { setAction(null); setPreselectOutcome(null); }}
        />
      )}
      {action === "send_wl" && (
        <SendWorkLinkFlow
          acc={acc}
          preselectedType={wlPreselect}
          contextNote={wlContextNote}
          openOutbound={openOutbound}
          autoDraft={autoDraft}
          onSend={handleSendWL}
          onCancel={() => { setAction(null); setWlPreselect(null); setWlContextNote(null); setPendingOutcomeLog(null); setAutoDraft(false); }}
        />
      )}
      {action === "other" && (
        <OtherFlow
          acc={acc}
          onSave={handleOtherSave}
          onCancel={() => setAction(null)}
        />
      )}

      {!action && (
        <>
          {/* Recommended Action card */}
          <RecommendedActionCard rec={rec} onApprove={handleApprove} onOverride={handleOverride} onOther={handleOther} />

          {/* Agentic WL draft card — surfaces when the recommended outcome
              triggers a WL (excluding write-off, which needs the structured
              flow). One click drops the user into a pre-drafted WL composer
              with outcome rationale carried over as scratch. Outcome + WL log
              together on send. */}
          {agenticWL && (
            <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontSize: 11, color: PURPLE, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>✦ AI WorkLink draft ready</span>
                <span style={{ fontSize: 12, color: INK }}>
                  {agenticWL.icon} {agenticWL.label} → <strong>{agenticWL.targetArea || agenticWL.targetRole}</strong>
                </span>
              </div>
              <button onClick={handleAgenticReviewSend}
                style={{ padding: "7px 16px", background: PURPLE, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                Review & Send →
              </button>
            </div>
          )}

          {/* Send WorkLink shortcut */}
          <div style={{ padding: "10px 14px", background: PAPER, border: `1px solid ${LINE}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: MUTE }}>Or send a work request to another area directly →</span>
            <button onClick={handleSendWLShortcut}
              style={{ padding: "6px 14px", background: "#fff", color: INK, border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Send WorkLink
            </button>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", padding: "12px 22px", background: INK, color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>{toast}</div>
      )}
    </div>
  );
}

function CarlosCollectorView({ arScored, worklinks, onWorkLink }) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const STRATUM_FLOOR = 10000;

  const [tfFilter, setTfFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [workedAccounts, setWorkedAccounts] = useState([]);

  // Listen for d4_account_logged window event — fires when an outcome is logged
  // (CarlosDetailView dispatches it from handleLogSave / handleSendWL / handleOtherSave).
  // Adding the account to workedAccounts triggers workedSet → actionable memo re-run,
  // so the worked account drops from the queue without a page refresh.
  useEffect(() => {
    const handler = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      setWorkedAccounts(prev => prev.some(w => w.id === id) ? prev : [...prev, { id }]);
    };
    window.addEventListener("d4_account_logged", handler);
    return () => window.removeEventListener("d4_account_logged", handler);
  }, []);

  // Open inbound WLs targeting commercial_collector. Index by account for
  // suppression + by ID for fast lookup.
  const inboundWls = useMemo(
    () => worklinks.filter(w => w.status === "open" && w.targetRole === "commercial_collector"),
    [worklinks]
  );
  const suppressedIds = useMemo(() => new Set(inboundWls.map(w => w.accountId)), [inboundWls]);

  // Open outbound WLs by account (so the expanded card can show "WL in flight").
  const openOutboundByAcc = useMemo(() => {
    const idx = {};
    for (const w of worklinks) {
      if (w.status !== "open") continue;
      if (w.targetRole === "commercial_collector") continue;     // inbound, not outbound
      if (w.requestType === "inbound_resolution" || w.requestType === "inbound_decline") continue;
      if (!w.accountId) continue;
      (idx[w.accountId] = idx[w.accountId] || []).push(w);
    }
    return idx;
  }, [worklinks]);

  // Account lookup for WL enrichment.
  const accountById = useMemo(() => Object.fromEntries(arScored.map(a => [a.id, a])), [arScored]);

  // Enrich each inbound WL with hoursLeft + slaState + referenced account snapshot.
  const enrichedWls = useMemo(() => inboundWls.map(wl => {
    const elapsed = Math.round((Date.now() - new Date(wl.sentAt).getTime()) / 3600000);
    const hoursLeft = (wl.slaHrs || 24) - elapsed;
    const window = wl.slaHrs || 24;
    const slaState =
      hoursLeft <= 0 ? "breached"
      : hoursLeft <= window * 0.25 ? "critical"
      : hoursLeft <= window * 0.5 ? "watch"
      : "normal";
    return {
      ...wl,
      account: accountById[wl.accountId] || null,
      hoursLeft, slaState, elapsed,
      isInbound: true,
    };
  }), [inboundWls, accountById]);

  // Native actionable queue:
  //   - in stratum (EV ≥ $10K)
  //   - not suppressed by an open inbound WL
  //   - not worked this session
  //   - actionable per follow-up store (isAccountActionable)
  const workedSet = useMemo(() => new Set(workedAccounts.map(w => w.id)), [workedAccounts]);
  const actionable = useMemo(() =>
    arScored.filter(a =>
      (a.expectedValue || 0) >= STRATUM_FLOOR &&
      !suppressedIds.has(a.id) &&
      !workedSet.has(a.id) &&
      isAccountActionable(a.id)
    ),
    [arScored, suppressedIds, workedSet]
  );

  // Urgency tests. Native: any TF/appeal ≤14d. WL: SLA breached or critical.
  const isUrgentNative = (a) => {
    const tf = a.appealTfRemaining ?? a.submissionTfRemaining;
    return tf != null && tf <= 14;
  };
  const isUrgentWl = (w) => w.slaState === "breached" || w.slaState === "critical";

  // TF filter — Carlos's standalone filter set, ported.
  const TF_FILTERS = [
    { id: "all",  label: "All",       test: () => true },
    { id: "tf14", label: "TF ≤ 14d",  test: (a) => { const tf = a.appealTfRemaining ?? a.submissionTfRemaining; return tf != null && tf <= 14; } },
    { id: "tf30", label: "TF ≤ 30d",  test: (a) => { const tf = a.appealTfRemaining ?? a.submissionTfRemaining; return tf != null && tf <= 30; } },
  ];
  const activeFilter = TF_FILTERS.find(f => f.id === tfFilter) || TF_FILTERS[0];

  // Filtered subsets.
  const filteredNative = useMemo(() => actionable.filter(activeFilter.test), [actionable, tfFilter]);
  const filteredInbound = useMemo(() => {
    if (tfFilter === "all") return enrichedWls;
    return enrichedWls.filter(w => w.account ? activeFilter.test(w.account) : true);
  }, [enrichedWls, tfFilter]);

  // Mixed sort: urgent first (priority 0), normal second (priority 1). Within
  // each, EV descending. WL EV = referenced account's EV.
  const getEv = (item) => item.isInbound
    ? (item.account?.expectedValue || item.account?.amount || 0)
    : (item.expectedValue || 0);
  // Sort: pure EV descending. Urgency still surfaces via burning banner,
  // 3px red left border on urgent rows, and TF filter pills.
  const sorted = useMemo(() => {
    const combined = [...filteredNative, ...filteredInbound];
    return combined.sort((a, b) => getEv(b) - getEv(a));
  }, [filteredNative, filteredInbound]);

  // Top-level summary numbers.
  const totalEV = actionable.reduce((s, a) => s + (a.expectedValue || 0), 0)
    + enrichedWls.reduce((s, w) => s + (w.account?.expectedValue || w.account?.amount || 0), 0);
  const totalAR = actionable.reduce((s, a) => s + (a.amount || 0), 0)
    + enrichedWls.reduce((s, w) => s + (w.account?.amount || 0), 0);

  // Burning calculation.
  const burningNative = actionable.filter(isUrgentNative);
  const burningWls = enrichedWls.filter(isUrgentWl);
  const burningCount = burningNative.length + burningWls.length;
  const burningEV = burningNative.reduce((s, a) => s + (a.expectedValue || 0), 0)
    + burningWls.reduce((s, w) => s + (w.account?.expectedValue || w.account?.amount || 0), 0);
  const burningBreakdown = (() => {
    const parts = [];
    if (burningNative.length > 0) parts.push(`${burningNative.length} within 14d of TF/appeal`);
    if (burningWls.length > 0) parts.push(`${burningWls.length} inbound WL${burningWls.length === 1 ? "" : "s"} at SLA risk`);
    return parts.join(" · ");
  })();
  const idleSecondary = `${actionable.length + enrichedWls.length} items ready to work, sorted by expected value.`;

  // Log handler — uses platform's follow-up store + tracks worked accounts in
  // session state. Same shape as the existing CollectorView's handleLog.
  const handleLog = useCallback(entry => {
    const os = OUTCOME_STATUSES.find(o => o.value === entry.outcome);
    if (os && !os.pending && os.followUpDays != null) {
      const storeValue = addBusinessDaysISO(os.followUpDays);
      setFollowUpDate(entry.id, storeValue);
    } else if (os?.pending) {
      setFollowUpDate(entry.id, "pending_cfo");
    }
    setWorkedAccounts(prev => [...prev, entry]);
    setExpandedId(null);
  }, []);

  // WL jump — when a user clicks an inbound WL row, route into the WL's
  // referenced account (jumpedFrom tracks the WL so the detail view can show
  // sender context). For B.1, this just expands the underlying account.
  const [jumpedFromWl, setJumpedFromWl] = useState(null);
  const handleSelectRow = (id) => { setJumpedFromWl(null); setExpandedId(id); };
  const handleSelectInbound = (wl) => {
    if (!wl.account) return;
    setJumpedFromWl(wl);
    setExpandedId(wl.account.id);
  };

  // Surface chrome
  const summary = (
    <>
      <div>
        <strong style={{ color: INK }}>{"$" + Math.round(totalEV).toLocaleString()}</strong> EV ·{" "}
        {actionable.length + enrichedWls.length} {(actionable.length + enrichedWls.length) === 1 ? "item" : "items"} ready
      </div>
      <div style={{ marginTop: 2, fontSize: 11 }}>
        {"$" + Math.round(totalAR).toLocaleString()} AR balance
        {enrichedWls.length > 0 && <> · {enrichedWls.length} inbound WL{enrichedWls.length === 1 ? "" : "s"}</>}
      </div>
    </>
  );

  return (
    <div style={{
      minHeight: "auto", background: PAPER, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", color: INK,
    }}>
      <PlatformStyles />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: isMobile ? "20px 16px 60px" : "28px 28px 60px" }}>
        <div style={{ fontSize: 11, color: FAINT, marginBottom: 10, animation: "fade 500ms ease both" }}>
          {prettyDateLong(new Date().toISOString().split("T")[0])}
        </div>
        <SurfaceHeader
          overline="Collections · Commercial · Carlos Mendez"
          title="Carlos's worklist"
          summary={summary}
        />

        {/* Book label — read-only stratum tag */}
        <div style={{ display: "inline-block", padding: "4px 10px", background: PAPER, border: `1px solid ${LINE}`, borderRadius: 14, fontSize: 11, color: MUTE, marginBottom: 14 }}>
          Book: commercial · EV ≥ $10K · {actionable.length + enrichedWls.length} items surfaced
        </div>

        {expandedId ? (
          (() => {
            const acc = accountById[expandedId];
            if (!acc) return <div style={{ padding: 20, color: MUTE }}>Account not found · <button onClick={() => setExpandedId(null)} style={btnGhostLink}>back to worklist</button></div>;
            return (
              <CarlosDetailView
                acc={acc}
                onBack={() => { setExpandedId(null); setJumpedFromWl(null); }}
                jumpFromInbound={jumpedFromWl}
                openOutbound={openOutboundByAcc[acc.id] || []}
                onWorkLink={onWorkLink}
              />
            );
          })()
        ) : (
          <>
        {/* Burning banner — clickable to apply ≤14d filter */}
        <div style={{ marginBottom: 14 }}>
          <BurningBanner
            variant="overline"
            burningCount={burningCount}
            burningEV={burningEV}
            breakdown={burningBreakdown}
            idleMessage="No deadline pressure."
            idleSecondary={idleSecondary}
            onClick={burningCount > 0 ? () => setTfFilter("tf14") : undefined}
          />
        </div>

        {/* TF filter pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, color: FAINT, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginRight: 4 }}>Filter</span>
          {TF_FILTERS.map(f => {
            const active = tfFilter === f.id;
            const nativeCount = actionable.filter(f.test).length;
            const wlCount = f.id === "all" ? enrichedWls.length : enrichedWls.filter(w => w.account ? f.test(w.account) : false).length;
            const count = nativeCount + wlCount;
            return (
              <button key={f.id} onClick={() => setTfFilter(f.id)}
                style={{
                  padding: "5px 11px",
                  border: `1px solid ${active ? INK : LINE}`,
                  background: active ? INK : "#fff",
                  color: active ? "#fff" : INK,
                  borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11.5, fontWeight: active ? 600 : 500,
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                {f.label}
                <span style={{ color: active ? "#fff" : FAINT, fontWeight: 400, fontSize: 10.5 }}>{count}</span>
              </button>
            );
          })}
          {tfFilter !== "all" && (
            <button onClick={() => setTfFilter("all")} style={{ ...btnGhostLink, marginLeft: 4 }}>clear filter</button>
          )}
        </div>

        {/* Sort note */}
        <div style={{ fontSize: 11, color: FAINT, marginBottom: 14 }}>
          Sorted by expected value · {sorted.length} {sorted.length === 1 ? "item" : "items"}
          {enrichedWls.length > 0 && <> ({filteredNative.length} native · {filteredInbound.length} inbound WL{filteredInbound.length === 1 ? "" : "s"})</>}
          {tfFilter !== "all" && <> · filter active</>}
        </div>

        {/* Queue */}
        {sorted.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: FAINT, fontSize: 13 }}>
            {tfFilter === "all"
              ? "Nothing ready to work right now. Sleeping accounts will resurface when their follow-up dates arrive."
              : "No accounts match this filter."}
          </div>
        ) : (
          <div>
            {sorted.map((item, idx) => {
              if (item.isInbound) {
                return (
                  <InboundWorkLinkRow key={item.id} wl={item} idx={idx} variant="card" onOpen={handleSelectInbound} />
                );
              }
              return (
                <CollectorAccountRow key={item.id} acc={item} idx={idx} onSelect={handleSelectRow} />
              );
            })}
          </div>
        )}

        {/* Session worked */}
        {workedAccounts.length > 0 && (
          <div style={{ marginTop: 24, fontSize: 11, color: FAINT, textAlign: "center" }}>
            {workedAccounts.length} {workedAccounts.length === 1 ? "account" : "accounts"} worked this session
          </div>
        )}
          </>
        )}
      </div>
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
  const [viewMode, setViewMode] = useState("worklist"); // "worklist" | "focus"
  const [expandedId, setExpandedId] = useState(null);
  const [collectorSiteFilter, setCollectorSiteFilter] = useState(null);
  const [collapsedBuckets, setCollapsedBuckets] = useState(new Set(["routine"])); // routine collapsed by default

  // Index open outbound WLs by account
  const openWlsByAccount = useMemo(() => {
    const idx = {};
    for (const w of worklinks) {
      if (w.status !== "open") continue;
      if (w.requestType === "inbound_resolution" || w.requestType === "inbound_decline") continue;
      if (!w.accountId) continue;
      (idx[w.accountId] = idx[w.accountId] || []).push(w);
    }
    return idx;
  }, [worklinks]);

  // Inbound WLs targeting this collector role (resolutions/declines coming back)
  const inboundWls = useMemo(() => worklinks.filter(w =>
    w.status === "open" &&
    (w.requestType === "inbound_resolution" || w.requestType === "inbound_decline") &&
    w.targetRole === "commercial_collector"
  ), [worklinks]);

  // Account IDs with open outbound WLs are suppressed from the main worklist
  // (collector is blocked on an internal dependency — work returns via inbound)
  const openWorklinkIds = new Set(Object.keys(openWlsByAccount));

  // Actionable queue, filtered by site, classified by bucket
  const actionableQueue = useMemo(() => arScored
    .filter(a => !openWorklinkIds.has(a.id) && isAccountActionable(a.id))
    .filter(a => !collectorSiteFilter || a.site === collectorSiteFilter),
    [arScored, openWorklinkIds, collectorSiteFilter]
  );

  const buckets = useMemo(() => {
    const out = { critical: [], urgent: [], watch: [], routine: [] };
    for (const acc of actionableQueue) {
      const wlsForAcc = openWlsByAccount[acc.id] || [];
      const b = classifyCollectorBucket(acc, wlsForAcc);
      out[b].push(acc);
    }
    // Sort within each bucket by EV desc
    for (const k of BUCKET_ORDER) out[k].sort((a, b) => b.expectedValue - a.expectedValue);
    return out;
  }, [actionableQueue, openWlsByAccount]);

  const currentAccount = searchResult || buckets.critical[0] || buckets.urgent[0] || buckets.watch[0] || buckets.routine[0] || null;

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
    const os = OUTCOME_STATUSES.find(o => o.value === entry.outcome);
    if (os) {
      const storeValue = os.pending ? "pending_cfo" : addBusinessDaysISO(os.followUpDays);
      setFollowUpDate(entry.id, storeValue);
      window.dispatchEvent(new CustomEvent("d4_account_logged", { detail: { id: entry.id } }));
    }
    setWorkedAccounts(prev => [...prev, entry]);
    setSearchResult(null);
    setSearchQuery("");
    setExpandedId(null);
  }, []);

  const toggleBucket = (b) => setCollapsedBuckets(prev => {
    const next = new Set(prev);
    if (next.has(b)) next.delete(b); else next.add(b);
    return next;
  });

  const totalEV = workedAccounts.reduce((s, w) => s + w.expectedValue, 0);
  const totalQueueEV = actionableQueue.reduce((s, a) => s + a.expectedValue, 0);

  return (
    <div style={{ padding: isMobile ? "16px 12px 80px" : isTablet ? "20px 20px" : "24px 32px" }}>
      {/* Productivity metrics — preserved from prior CollectorView */}
      <div style={{ display: "grid", gridTemplateColumns: cols("repeat(4, 1fr)", "repeat(2, 1fr)", "repeat(2, 1fr)"), gap: 12, marginBottom: 24 }}>
        {[
          { label: "Accounts worked today", value: workedAccounts.length, sub: `${Math.max(0, DAILY_GOAL - workedAccounts.length)} remaining to goal (${DAILY_GOAL}/day)`, color: "#0f172a" },
          { label: "EV worked", value: fmt(totalEV), sub: "expected recovery logged", color: "#2563eb" },
          { label: "Payment commitments", value: workedAccounts.filter(w => w.outcomeLabel && (w.outcomeLabel.toLowerCase().includes("promis") || w.outcomeLabel.toLowerCase().includes("paid"))).length, sub: "accounts with payment expected", color: "#16a34a" },
          { label: "Dollars per hour", value: (() => { const hrs = (Date.now() - sessionStart) / 3600000; return hrs > 0.01 && totalEV > 0 ? fmt(Math.round(totalEV / Math.max(hrs, 0.1))) : "—"; })(), sub: "EV worked ÷ session time", color: "#7c3aed" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: "-0.01em" }}>{value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Inbound WorkLink rail — resolutions/declines coming back to this collector */}
      {inboundWls.length > 0 && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#1e40af", textTransform: "uppercase", marginBottom: 8 }}>
            ⇄ {inboundWls.length} inbound {inboundWls.length === 1 ? "resolution" : "resolutions"} · click an account to act
          </div>
          {inboundWls.slice(0, 5).map((w, ix) => (
            <div key={ix} onClick={() => { handleSearch(w.accountId); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 4, background: "#fff", border: "1px solid #dbeafe", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              <span style={{ fontSize: 14 }}>{w.requestIcon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {w.requestLabel} · {w.patient} ({w.accountId})
                </div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{w.note}</div>
              </div>
              <span style={{ color: "#2563eb", fontSize: 11 }}>→ open</span>
            </div>
          ))}
          {inboundWls.length > 5 && (
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>+ {inboundWls.length - 5} more inbound — search or scroll the worklist to find them</div>
          )}
        </div>
      )}

      {/* Site filter */}
      {(() => {
        const sites = [...new Set(arScored.map(a => a.site))].sort((a,b) => parseInt(a.replace(/\D/g,"")) - parseInt(b.replace(/\D/g,"")));
        if (sites.length <= 1) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>My sites:</span>
            <button onClick={() => setCollectorSiteFilter(null)}
              style={{ padding: "3px 10px", fontSize: 11, fontWeight: !collectorSiteFilter ? 600 : 400, border: `1px solid ${!collectorSiteFilter ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: !collectorSiteFilter ? "#2563eb" : "#fff", color: !collectorSiteFilter ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>All</button>
            {sites.map(s => (
              <button key={s} onClick={() => setCollectorSiteFilter(collectorSiteFilter === s ? null : s)}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: collectorSiteFilter === s ? 600 : 400, border: `1px solid ${collectorSiteFilter === s ? "#2563eb" : "#e2e8f0"}`, borderRadius: 20, background: collectorSiteFilter === s ? "#2563eb" : "#fff", color: collectorSiteFilter === s ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
            ))}
          </div>
        );
      })()}

      {/* View mode toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: 3 }}>
          <button onClick={() => setViewMode("worklist")}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: viewMode === "worklist" ? 600 : 400, border: "none", borderRadius: 6, background: viewMode === "worklist" ? "#fff" : "transparent", color: viewMode === "worklist" ? "#0f172a" : "#64748b", cursor: "pointer", fontFamily: "inherit", boxShadow: viewMode === "worklist" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>☰ Worklist</button>
          <button onClick={() => setViewMode("focus")}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: viewMode === "focus" ? 600 : 400, border: "none", borderRadius: 6, background: viewMode === "focus" ? "#fff" : "transparent", color: viewMode === "focus" ? "#0f172a" : "#64748b", cursor: "pointer", fontFamily: "inherit", boxShadow: viewMode === "focus" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>⊙ Focus</button>
        </div>
      </div>

      {/* Search */}
      <SearchBar value={searchQuery} onChange={handleSearch} placeholder="Search by account ID, patient, or payer..." />
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

      {/* Queue summary — total + bucket distribution */}
      {!searchResult && actionableQueue.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, fontSize: 12, color: "#64748b" }}>
          <div>{actionableQueue.length.toLocaleString()} accounts actionable · {fmt(totalQueueEV)} EV</div>
          <div>
            {BUCKET_ORDER.map(b => buckets[b].length > 0 ? (
              <span key={b} style={{ marginLeft: 8, color: BUCKET_META[b].color, fontWeight: 600 }}>
                {buckets[b].length} {BUCKET_META[b].label}
              </span>
            ) : null)}
          </div>
        </div>
      )}

      {/* Focus mode — single account at a time */}
      {viewMode === "focus" && (currentAccount ? (
        <CollectorAccountCard key={currentAccount.id + workedAccounts.length} acc={currentAccount} onLog={handleLog} onWorkLink={onWorkLink} sentWorklinks={openWlsByAccount[currentAccount.id] || []} />
      ) : !searchQuery ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a", marginBottom: 6 }}>Queue complete</div>
          <div style={{ fontSize: 13, color: "#166534" }}>All actionable accounts worked this session. {fmt(totalEV)} expected recovery logged.</div>
        </div>
      ) : null)}

      {/* Worklist mode — bucketed sections (Critical → Urgent → Watch → Routine) */}
      {viewMode === "worklist" && !searchResult && (
        <div style={{ marginBottom: 16 }}>
          {BUCKET_ORDER.map(bucketKey => {
            const accs = buckets[bucketKey];
            if (accs.length === 0) return null;
            const meta = BUCKET_META[bucketKey];
            const isCollapsed = collapsedBuckets.has(bucketKey);
            const bucketEV = accs.reduce((s, a) => s + a.expectedValue, 0);
            return (
              <div key={bucketKey} style={{ marginBottom: 14 }}>
                <div onClick={() => toggleBucket(bucketKey)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 8, cursor: "pointer", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, letterSpacing: "0.08em" }}>{isCollapsed ? "▶" : "▼"} {meta.label}</span>
                  <span style={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>{accs.length} account{accs.length === 1 ? "" : "s"} · {fmt(bucketEV)} EV</span>
                  <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6, flex: 1 }}>{meta.desc}</span>
                </div>
                {!isCollapsed && accs.slice(0, 100).map(acc => {
                  const isExpanded = expandedId === acc.id;
                  const reason = bucketReason(acc, openWlsByAccount[acc.id] || []);
                  return (
                    <div key={acc.id} style={{ marginBottom: 4 }}>
                      {!isExpanded ? (
                        <div onClick={() => setExpandedId(acc.id)}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                          onMouseLeave={e => e.currentTarget.style.background="#fff"}>
                          {reason && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, flexShrink: 0 }}>{reason}</span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acc.patient}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>{acc.id} · {acc.payer}{acc.subPayer ? ` — ${acc.subPayer}` : ""} · {acc.daysOut}d out</div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>{fmt(acc.expectedValue)}</div>
                          </div>
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>▼</span>
                        </div>
                      ) : (
                        <div>
                          <button onClick={() => setExpandedId(null)} style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: "0 0 4px 0" }}>▲ collapse</button>
                          <CollectorAccountCard key={acc.id + workedAccounts.length} acc={acc} onLog={handleLog} onWorkLink={onWorkLink} sentWorklinks={openWlsByAccount[acc.id] || []} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {!isCollapsed && accs.length > 100 && (
                  <div style={{ textAlign: "center", padding: "10px", fontSize: 11, color: "#94a3b8" }}>
                    Showing top 100 of {accs.length.toLocaleString()} in this bucket · search for specific accounts
                  </div>
                )}
              </div>
            );
          })}
          {actionableQueue.length === 0 && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#16a34a", marginBottom: 6 }}>Queue complete</div>
              <div style={{ fontSize: 13, color: "#166534" }}>All actionable accounts worked this session. {fmt(totalEV)} expected recovery logged.</div>
            </div>
          )}
        </div>
      )}

      {/* Worklist mode — search result inline (single card) */}
      {viewMode === "worklist" && searchResult && (
        <div style={{ marginBottom: 16 }}>
          <CollectorAccountCard key={searchResult.id} acc={searchResult} onLog={handleLog} onWorkLink={onWorkLink} sentWorklinks={openWlsByAccount[searchResult.id] || []} />
        </div>
      )}

      <WorkedList worked={workedAccounts} />
      <WorkLinkSuppressedPanel suppressed={Object.values(openWlsByAccount).flat()} />
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
  const [approved, setApproved] = useState({});
  const [showOverrides, setShowOverrides] = useState(false);
  const [showEscalations, setShowEscalations] = useState(false);
  const pendingCount = ESCALATION_DATA.writeOffPending.filter(w => !approved[w.accountId]).length;
  const pendingTotal = ESCALATION_DATA.writeOffPending.filter(w => !approved[w.accountId]).reduce((s,w) => s + w.amount, 0);
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", marginBottom: 8 }}>
      {/* Decision queue — write-offs awaiting CFO sign-off */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b" }}>Write-offs awaiting your sign-off</div>
        {pendingCount > 0
          ? <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{pendingCount} pending · {fmt(pendingTotal)}</div>
          : <div style={{ fontSize: 12, color: "#64748b" }}>All cleared</div>}
      </div>
      <div style={{ padding: "12px 20px 16px" }}>
        {ESCALATION_DATA.writeOffPending.map(w => {
          const isApproved = approved[w.accountId];
          return (
            <div key={w.accountId} style={{ borderBottom: "1px solid #f1f5f9", padding: "14px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, opacity: isApproved ? 0.6 : 1 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{w.patient}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: isApproved ? "#64748b" : "#dc2626" }}>{fmt(w.amount)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 5 }}>{w.accountId} · {w.payer} · recommended by {w.recommendedBy} · {w.recommendedAt}</div>
                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{w.rationale}</div>
              </div>
              <div style={{ flexShrink: 0, paddingTop: 2 }}>
                {isApproved ? (
                  <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ Approved</span>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setApproved(p => ({...p, [w.accountId]: true}))} style={{ padding: "7px 16px", background: "#0f172a", border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Approve</button>
                    <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 7, color: "#475569", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Return</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Supporting context — calm neutral metrics with drill-down */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: "1px solid #f1f5f9" }}>
        <div style={{ borderRight: "1px solid #f1f5f9" }}>
          <div onClick={() => setShowOverrides(o => !o)} style={{ padding: "14px 20px", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>Override rate this period</div>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{showOverrides ? "▲" : "▼"}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>8%</div>
            <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>Within normal range — target under 15%</div>
          </div>
          {showOverrides && (
            <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 20px" }}>
              {ESCALATION_DATA.overrideReview.map(o => (
                <div key={o.accountId} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f8fafc" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0f172a" }}>{o.patient} · {o.accountId}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11 }}>
                    <span style={{ color: "#64748b", background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>AI: {o.aiRecommended}</span>
                    <span style={{ color: "#334155", background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>Chose: {o.collectorChose}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#475569", marginTop: 4 }}>{o.collectorName}: "{o.note}"</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div onClick={() => setShowEscalations(o => !o)} style={{ padding: "14px 20px", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>Open escalations</div>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{showEscalations ? "▲" : "▼"}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>{ESCALATION_DATA.escalated.length}</div>
            <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>Pending supervisor resolution</div>
          </div>
          {showEscalations && (
            <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 20px" }}>
              {ESCALATION_DATA.escalated.map(e => (
                <div key={e.accountId} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0f172a" }}>{e.patient} · {e.accountId}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{e.payer} · escalated by {e.escalatedBy} · {e.escalatedAt}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>${(e.expectedValue/1000).toFixed(0)}K EV</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#475569", marginTop: 4 }}>{e.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
  const [accountsExpanded, setAccountsExpanded] = useState(false); // CFO detail: account list collapsed by default
  const [aiText, setAiText] = useState(null);
  const [critFilter, setCritFilter] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [execSummary, setExecSummary] = useState(null);
  const [execLoading, setExecLoading] = useState(false);
  const [horizon, setHorizon] = useState("month"); // month | week | today — shared by briefing + exec summary
  const [donutExpanded, setDonutExpanded] = useState(false);
  const [worklinks, setWorklinks] = useState(() => seedWorklinks());
  const [siteFilter, setSiteFilter] = useState(null);
  const [activeTier, setActiveTier] = useState(null);

  // Tracks worked account IDs in React state so donuts re-render when accounts are logged
  const [workedIdSet, setWorkedIdSet] = useState(() => new Set(Object.keys(getFollowUpStore())));

  // Accounts with an open WorkLink are blocked on an internal dependency — suppressed from
  // the originator's active WIP (collector Follow-up WIP, area native queue) until resolved.
  const openWorkLinkAcctIds = useMemo(
    () => new Set(worklinks.filter(w => w.status === "open").map(w => w.accountId)),
    [worklinks]
  );
  // Collector-actionable AR = unworked in platform AND no open WorkLink blocking it.
  const isCollectorActionable = (a) => !workedIdSet.has(a.id) && !openWorkLinkAcctIds.has(a.id);

  useEffect(() => {
    const handler = (e) => setWorkedIdSet(prev => new Set([...prev, e.detail.id]));
    window.addEventListener("d4_account_logged", handler);
    return () => window.removeEventListener("d4_account_logged", handler);
  }, []);

  const handleSendWorklink = (req) => setWorklinks(prev => [...prev, req]);

  // Resolve a WorkLink with one of three kinds (Session 3):
  //   - resolved: completion. Optional authNumber for auth resolutions.
  //               Emits inbound WL back to originator with the resolution context.
  //   - reassigned: handed off to another worker in the same role/area.
  //                 WL stays open (status unchanged), recipient changes via reassignedTo.
  //                 No inbound emitted (stays internal to receiving role).
  //   - declined: pushed back to originator with a reason.
  //               Emits inbound WL back to originator.
  //
  // Backward compat: if `resolution` is a string, treated as {kind:"resolved", note:string}.
  const handleResolveWorklink = (id, resolution) => {
    const r = typeof resolution === "string" ? { kind: "resolved", note: resolution } : (resolution || {});
    const kind = r.kind || "resolved";
    setWorklinks(prev => {
      const wl = prev.find(w => w.id === id);
      const updated = prev.map(w => {
        if (w.id !== id) return w;
        const update = {
          ...w,
          status: kind === "reassigned" ? "open" : kind === "declined" ? "returned" : "resolved",
          resolvedAt: new Date(),
          resolutionNote: r.note || "",
          resolutionKind: kind,
        };
        if (r.authNumber) update.authNumber = r.authNumber;
        if (r.reassignTo) update.reassignedTo = r.reassignTo;
        return update;
      });
      // Emit inbound WL back to originator for resolved/declined (NOT reassigned)
      if (wl && (kind === "resolved" || kind === "declined") && (wl.from || wl.sourceRole || wl.sourceArea)) {
        const targetRole = wl.from?.role === "Collector" ? "commercial_collector"
                         : wl.from?.role === "Auth Specialist" ? "authorization"
                         : wl.sourceRole || null;
        const targetArea = !targetRole ? (wl.sourceArea || null) : null;
        const inboundId = `WL-INBOUND-${Date.now()}-${id}`;
        const inboundWl = {
          id: inboundId,
          parentId: id,
          accountId: wl.accountId, patient: wl.patient, payer: wl.payer,
          vertical: wl.vertical, site: wl.site, cpt: wl.cpt,
          amount: wl.amount, expectedValue: wl.expectedValue,
          originType: "INBOUND",
          sourceArea: wl.targetArea || null,
          sourceRole: wl.targetRole || null,
          from: { name: wl.targetRole === "auth_team_lead" ? "Paula" : wl.targetRole || wl.targetArea, role: wl.targetRole || wl.targetArea },
          requestType: kind === "resolved" ? "inbound_resolution" : "inbound_decline",
          requestLabel: kind === "resolved"
            ? `Resolved by ${wl.targetRole === "auth_team_lead" ? "Paula" : wl.targetRole || wl.targetArea}`
            : `Declined by ${wl.targetRole === "auth_team_lead" ? "Paula" : wl.targetRole || wl.targetArea}`,
          requestIcon: kind === "resolved" ? "✓" : "↩",
          targetRole, targetArea,
          note: `${kind === "resolved" ? "Resolved" : "Declined"}: ${r.note || ""}${r.authNumber ? ` · Auth: ${r.authNumber}` : ""}`,
          authNumber: r.authNumber || null,
          status: "open",
          sentAt: new Date(),
          slaDue: new Date(Date.now() + 24 * 3600 * 1000),
          slaHrs: 24,
          slaSeverity: "ROUTINE",
          slaTier: "low",
          slaLabel: "24h",
          createdAt: new Date().toISOString(),
        };
        return [...updated, inboundWl];
      }
      return updated;
    });
  };
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
      const pd = (a) => !workedIdSet.has(a.id) && !openWorkLinkAcctIds.has(a.id); // collector-actionable
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
  }, [current, areaFilter, activeTier, severityFilter, searchQuery, tab, workedIdSet, openWorkLinkAcctIds]);

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

  // Navigate to a Detail-tab section anchor (used by AI summary links — every claim
  // is one click from the verifiable data, which also keeps the model honest).
  const scrollToDetail = (anchorId) => {
    setTab("detail"); setSeverityFilter(null); setActiveTier(null); setAreaFilter(null);
    setTimeout(() => {
      const el = document.getElementById(anchorId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  // AI Executive Summary — findings-FED (option A). The ranked risk engine owns the
  // numbers (reconciled truth); the model only writes the prose + points into the Detail
  // tab. It must NOT restate the findings — it adds nuance and tells Marcus where to verify.
  const runExecSummary = async () => {
    setExecLoading(true);
    const findings = computeRiskFindings({
      ar: arFiltered, baseline: SITE_BASELINE, siteNpr: SITE_NPR, siteFilter, fmtUSD: fmt,
      horizon, daily: DAILY,
    });
    // Compact, already-reconciled finding summaries for the model (numbers are fixed).
    const findingLines = findings.map((f, i) => {
      const h = `${f.headline.pre}${f.headline.em}${f.headline.mid}${f.headline.em2}${f.headline.post}`;
      return `${i + 1}. [${f.rankClass}/${f.tone}${f.rootCause ? "/root-cause" : ""}] ${h} — why: ${f.why}`;
    }).join("\n");
    const horizonLabel = horizon === "today" ? "today (since yesterday)" : horizon === "week" ? "this week (last 7 days)" : "this month (last 30 days)";
    // The honest ADR nuance — most relevant on the month view (the trend story).
    const ts = TIMESERIES.series;
    const adrNote = horizon === "month"
      ? `Average daily revenue held roughly steady (~$${(ts.adrK[ts.adrK.length-1]/1000).toFixed(2)}M/day, ~${Math.round((ts.adrK[ts.adrK.length-1]-ts.adrK[0])/ts.adrK[0]*100)}% over 12 weeks) while AR days rose ${SITE_BASELINE.portfolio.prior.arDays}→${SITE_BASELINE.portfolio.current.arDays}. Because AR days = AR balance ÷ daily revenue, AR days rising while revenue was flat-to-up means the uncollected balance grew FASTER than the topline — the collection gap is worse than the days figure alone suggests.`
      : `On shorter horizons, the story is operational: focus on what moved in the window and the root causes behind it (staffing gaps, an EHR integration transmission gap, an HIM coding change creating lagged denials). Connect the discrete events to those root causes.`;

    // REAL write-off / decision data (so Decisions names actual accounts, not invented ones).
    const woLines = ESCALATION_DATA.writeOffPending.map(w =>
      `${w.accountId} · ${w.patient} · ${w.payer} · ${fmt(w.amount)} — ${w.rationale}`
    ).join("\n");

    const prompt = `You are a healthcare revenue cycle expert writing a brief executive note for a multisite CFO. The CFO is viewing the "${horizonLabel}" horizon of a ranked risk briefing (the findings below) directly above your note.

DO NOT restate or list the findings verbatim — the CFO can already see them. Your job: (1) a short connective narrative for THIS horizon with the ONE non-obvious insight, (2) three tight action sections, (3) pointers to the detail data to verify.

HORIZON: ${horizonLabel}

RECONCILED FINDINGS (numbers are fixed truth — do not alter them):
${findingLines}

KEY NUANCE / FRAMING FOR THIS HORIZON:
${adrNote}

WRITE-OFFS PENDING CFO DECISION (use these REAL accounts/amounts in "decisions" — do not invent others):
${woLines}

Available detail sections (use these exact anchor ids in pointers):
- "detail-sites" (site performance table)
- "detail-kpis" (headline KPIs: NPR, AR, AR days, NCR)
- "detail-payers" (expected recovery by payer group)
- "detail-wip" (Billing WIP + Collections WIP stratification)

Return ONLY valid JSON (no markdown, no code fences) with exactly:
{
  "narrative": "2-3 sentences. Lead with the balance-vs-revenue insight, connect the findings into one cash-risk story, frame next step around working highest-EV accounts first. Calm, board-ready. Do NOT repeat finding headlines verbatim.",
  "priorities": ["2-3 short imperative actions, EV-first (work highest-value accounts first), each naming a site/area and the point of leverage. No invented dollar figures."],
  "risks": ["2-3 short risk flags drawn from the findings — what threatens cash if not addressed. Concise."],
  "decisions": ["1-2 items needing CFO sign-off, using the REAL write-off accounts above (account id + amount + one-line rationale). Frame as a decision to make, not a loss already taken."],
  "pointers": [{"label": "short verb phrase e.g. 'Verify the deteriorating sites'", "anchor": "detail-sites"}]
}
Keep every item to one line. Limit pointers to 2-3.`;

    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1100, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      if (!res.ok) {
        setExecSummary({ narrative: `API error ${res.status}: ${data.error || "Unknown error"}`, priorities: [], risks: [], decisions: [], pointers: [] });
        setExecLoading(false);
        return;
      }
      const raw = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "{}";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      try {
        const parsed = JSON.parse(cleaned);
        // guard against model drift: keep only valid anchors; ensure sections are arrays
        const valid = new Set(["detail-sites", "detail-kpis", "detail-payers", "detail-wip"]);
        parsed.pointers = (parsed.pointers || []).filter(p => valid.has(p.anchor)).slice(0, 3);
        parsed.priorities = Array.isArray(parsed.priorities) ? parsed.priorities.slice(0, 3) : [];
        parsed.risks = Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3) : [];
        parsed.decisions = Array.isArray(parsed.decisions) ? parsed.decisions.slice(0, 2) : [];
        setExecSummary(parsed);
      } catch {
        setExecSummary({ narrative: raw.slice(0, 500), priorities: [], risks: [], decisions: [], pointers: [] });
      }
    } catch (err) {
      console.error("Exec summary error:", err);
      setExecSummary({ narrative: "Executive summary temporarily unavailable — check that ANTHROPIC_API_KEY is set in Vercel environment variables.", priorities: [], risks: [], decisions: [], pointers: [] });
    }
    setExecLoading(false);
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
  const isLightRecipientMode = roleConfig?.mode === "light_recipient";
  const isTeamLeadMode = roleConfig?.mode === "team_lead";
  if (isLightRecipientMode) {
    return (
      <LightRecipientView
        area={roleConfig.area}
        worklinks={worklinks}
        onResolve={handleResolveWorklink}
        roleLabel={roleConfig.label}
      />
    );
  }
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
                      {seg("Auth Lead", "auth_team_lead")}
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
        {role === "commercial_collector" ? (
          <CarlosCollectorView arScored={arForRole} worklinks={worklinks} onWorkLink={handleSendWorklink} />
        ) : (
          <CollectorView arScored={arForRole} dnfbScored={dnfbForRole} isMedicareBc={roleConfig?.mode === "medicare_bc"} worklinks={worklinks} onWorkLink={handleSendWorklink} />
        )}
      </div>
    );
  }

  if (isAreaMode || isTeamLeadMode) {
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
                      {seg("Auth Lead", "auth_team_lead")}
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
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {isTeamLeadMode ? roleConfig.paneLabel : "DNFB holds + WorkLink requests · sorted by expected value"}
          </span>
          {isAreaMode && worklinks.filter(w => w.targetArea === roleConfig.area && w.status === "open").length > 0 && (
            <span style={{ background: "#0369a1", color: "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>
              {worklinks.filter(w => w.targetArea === roleConfig.area && w.status === "open").length} WorkLink
            </span>
          )}
        </div>
        {isTeamLeadMode ? (
          <WorkLinkPaula embedded />
        ) : roleConfig.area === "Authorization" ? (
          <DianeAuthView dnfbScored={dnfbForRole} worklinks={worklinks} onResolve={handleResolveWorklink} onSendWorklink={handleSendWorklink} onReturn={handleReturnWorklink} />
        ) : (
          <AreaWorklist area={roleConfig.area} dnfbScored={dnfbForRole} worklinks={worklinks} onResolve={handleResolveWorklink} onReturn={handleReturnWorklink} onWorkLink={handleSendWorklink} />
        )}
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
                    {seg("Physician", "physician")}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Management</div>
                  <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
                    {seg("Supervisor", "supervisor")}
                    {seg("Auth Lead", "auth_team_lead")}
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
          {role === "cfo" && (
            <button style={tabStyle(tab === "detail")} onClick={() => { setTab("detail"); setSeverityFilter(null); setActiveTier(null); setAreaFilter(null); }}>Detail</button>
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
        {role === "cfo" && (tab === "metrics" || tab === "detail") ? (
          <div>
            {/* DASHBOARD TAB: risk briefing + AI executive summary */}
            {tab === "metrics" && (
              <CFODashboardV2 arFiltered={arFiltered} dnfbFiltered={dnfbFiltered} siteFilter={siteFilter} SITE_NPR={SITE_NPR} isCollectorActionable={isCollectorActionable} worklinks={worklinks} horizon={horizon} setHorizon={(h) => { setHorizon(h); setExecSummary(null); }} />
            )}
            {tab === "metrics" && (
              <div style={{ maxWidth: 940, margin: "0 auto", padding: isMobile ? "0 4px 40px" : "0 16px 40px" }}>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, borderLeft: "3px solid #334155", padding: isMobile ? "18px 16px" : "22px 28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: execSummary ? 14 : 0 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Executive summary</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>AI-written · {horizon === "today" ? "today" : horizon === "week" ? "this week" : "this month"} · grounded in the briefing above · verify in Detail</div>
                    </div>
                    <button onClick={runExecSummary} disabled={execLoading}
                      style={{ flexShrink: 0, padding: "8px 16px", background: execLoading ? "#f1f5f9" : "#0f172a", border: "none", borderRadius: 8, color: execLoading ? "#64748b" : "#fff", cursor: execLoading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                      {execLoading ? "Writing…" : execSummary ? "Regenerate" : "Generate summary"}
                    </button>
                  </div>
                  {execSummary && (
                    <>
                      <div style={{ fontSize: 15, color: "#0f172a", lineHeight: 1.6 }}>{execSummary.narrative}</div>
                      {(execSummary.priorities?.length || execSummary.risks?.length || execSummary.decisions?.length) > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: isMobile ? 14 : 22, marginTop: 18 }}>
                          {[
                            { key: "priorities", label: "Priorities", color: "#334155", items: execSummary.priorities },
                            { key: "risks", label: "Risks", color: "#d97706", items: execSummary.risks },
                            { key: "decisions", label: "Decisions", color: "#dc2626", items: execSummary.decisions },
                          ].map(sec => (
                            <div key={sec.key}>
                              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: sec.color, marginBottom: 8 }}>{sec.label}</div>
                              {(sec.items || []).length === 0 ? (
                                <div style={{ fontSize: 12.5, color: "#cbd5e1" }}>—</div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                  {sec.items.map((it, i) => (
                                    <div key={i} style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5, paddingLeft: 10, borderLeft: `2px solid ${sec.color}22` }}>{it}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {execSummary.pointers && execSummary.pointers.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
                          {execSummary.pointers.map((p, i) => (
                            <button key={i} onClick={() => scrollToDetail(p.anchor)}
                              style={{ padding: "6px 12px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, color: "#334155", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                              {p.label} <span style={{ fontSize: 13 }}>→</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            {/* DETAIL TAB: full data dashboard */}
            {tab === "detail" && (<>

            {/* ── group: OVERVIEW ── */}
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", margin: "0 0 12px 4px" }}>Overview</div>
            <div id="detail-kpis" style={{ scrollMarginTop: 80 }} />
            {/* Headline KPIs */}
            {(() => {
              const grossAR = arFiltered.reduce((s,a) => s+a.amount, 0);
              const arDays = grossAR > 0 ? Math.round(arFiltered.reduce((s,a) => s + a.amount * a.daysOut, 0) / grossAR) : 0;
              const annualNPR = siteFilter
                ? (SITE_NPR[siteFilter] || 0)
                : Object.values(SITE_NPR).reduce((s,v) => s+v, 0);
              // Color discipline: neutral by default, signal only on exception. AR-days only colors when it crosses into watch/critical.
              const arDaysColor = arDays < 55 ? "#0f172a" : arDays < 65 ? "#d97706" : "#dc2626";
              return (
                <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 20 }}>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Net Patient Revenue</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>{fmt(annualNPR)}</div>
                    <div style={{ fontSize: 11.5, color: "#475569", marginTop: 3 }}>Annual · from accounting system{siteFilter ? ` · ${siteFilter}` : ""}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Total AR</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>{fmt(grossAR)}</div>
                    <div style={{ fontSize: 11.5, color: "#475569", marginTop: 3 }}>{arFiltered.length} billed accounts{siteFilter ? ` · ${siteFilter}` : ""}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>AR Days Outstanding</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: arDaysColor, letterSpacing: "-0.02em" }}>{arDays}</div>
                      <div style={{ fontSize: 13, color: arDaysColor, fontWeight: 600 }}>days</div>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#475569", marginTop: 3 }}>Dollar-weighted average age · &lt;40 excellent, &lt;55 good, &lt;65 watch</div>
                  </div>
                </div>
              );
            })()}

            {/* Cash Flow Forecast — 30/60/90 day · sits right under Overview (primary CFO lens) */}
            {(() => {
              const horizons = [
                { label: "30-Day Forecast", days: 30 },
                { label: "60-Day Forecast", days: 60 },
                { label: "90-Day Forecast", days: 90 },
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
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Cash flow forecast</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>Probability-weighted cash timing · payer timing weights (Phase 1)</div>
                  <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr 1fr", "1fr 1fr 1fr", "1fr"), gap: 12 }}>
                    {horizons.map(h => {
                      const forecast = computeForecast(h.days);
                      return (
                        <div key={h.days} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
                          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{h.label}</div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>{fmt(forecast)}</div>
                          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>Expected cash receipts · {h.days}d horizon</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 10 }}>
                    Medicare 60% in 30d · Commercial 35% · Medicaid 20% · WC 10% · DNFB applies hold-clearance probability · Phase 2: ERA-calibrated weights.
                  </div>
                </div>
              );
            })()}

            {/* Pre-Submission Denial Risk — forward-looking, pairs with cashflow */}
            {(() => {
              const highRisk = dnfbFiltered.filter(a => DENIAL_RISK_MAP[a.holdCode]?.risk === "high");
              const medRisk = dnfbFiltered.filter(a => DENIAL_RISK_MAP[a.holdCode]?.risk === "medium");
              const highEV = highRisk.reduce((s,a) => s+a.expectedValue, 0);
              const medEV = medRisk.reduce((s,a) => s+a.expectedValue, 0);
              const reworkCost = Math.round((highRisk.length * 118) + (medRisk.length * 65));
              if (highRisk.length === 0 && medRisk.length === 0) return null;
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Pre-submission denial risk</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>Rule-based prediction · accounts at risk before submission · Phase 1</div>
                  <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr 1fr", "1fr 1fr 1fr", "1fr"), gap: 12 }}>
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>High Risk</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#dc2626" }}>{highRisk.length}</div>
                      <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2, fontWeight: 600 }}>{fmt(highEV)} EV at risk</div>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Medium Risk</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#d97706" }}>{medRisk.length}</div>
                      <div style={{ fontSize: 11, color: "#d97706", marginTop: 2, fontWeight: 600 }}>{fmt(medEV)} EV at risk</div>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Projected Rework Cost</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{fmt(reworkCost)}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>If denied · $65–118/claim to rework</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── group: WHERE ── */}
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", margin: "8px 0 12px 4px" }}>Where it's happening</div>
            <div id="detail-sites" style={{ scrollMarginTop: 80 }} />
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
                const npr = SITE_NPR[s] || 0;
                // Net collection rate = expected collections / net billable AR (both net-of-contractual)
                const ncr = totalAR > 0 ? Math.round(totalEV / totalAR * 100) : 0;
                const deniedCount = siteAR.filter(a => a.denialCode !== null).length;
                const denialRate = siteAR.length > 0 ? Math.round(deniedCount / siteAR.length * 100) : 0;
                const openWL = worklinks.filter(w => w.status==="open" && [...siteAR,...siteDNFB].some(a => a.id===w.accountId)).length;
                return { site: s, npr, totalAR, totalDNFB, totalExposure, totalEV, avgDays, ncr, denialRate, openWL };
              });
              const siteStatsTableSorted = [...siteStats].sort((a,b) => b.totalEV - a.totalEV);
              const cols9 = "90px repeat(8, 1fr)";

              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
                  {/* Calm section label */}
                  <div style={{ padding: "16px 20px 0", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8" }}>Site performance</div>
                  {/* Filter chip bar */}
                  <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0, marginRight: 2 }}>Site:</span>
                    <button onClick={() => setSiteFilter(null)}
                      style={{ padding: "3px 10px", fontSize: 11, fontWeight: siteFilter===null ? 700 : 400, border: `1px solid ${siteFilter===null ? "#0f172a" : "#e2e8f0"}`, borderRadius: 20, background: siteFilter===null ? "#0f172a" : "#fff", color: siteFilter===null ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
                      All
                    </button>
                    {siteStats.map(s => (
                      <button key={s.site} onClick={() => setSiteFilter(siteFilter===s.site ? null : s.site)}
                        style={{ padding: "3px 10px", fontSize: 11, fontWeight: siteFilter===s.site ? 700 : 400, border: `1px solid ${siteFilter===s.site ? "#0f172a" : "#e2e8f0"}`, borderRadius: 20, background: siteFilter===s.site ? "#0f172a" : "#fff", color: siteFilter===s.site ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
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
                      <div style={{ display: "grid", gridTemplateColumns: cols9, minWidth: 820, fontSize: 9, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase", padding: "9px 20px", borderTop: "1px solid #f1f5f9" }}>
                        <span>Site</span>
                        <span style={{ textAlign:"right" }}>NPR</span>
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
                        const daysColor = s.avgDays < 55 ? "#0f172a" : s.avgDays < 65 ? "#d97706" : "#dc2626";
                        const ncrColor = s.ncr >= 95 ? "#0f172a" : s.ncr >= 85 ? "#d97706" : "#dc2626";
                        const denialColor = s.denialRate <= 5 ? "#0f172a" : s.denialRate <= 10 ? "#d97706" : "#dc2626";
                        return (
                          <div key={s.site} onClick={() => setSiteFilter(s.site)}
                            style={{ display: "grid", gridTemplateColumns: cols9, minWidth: 820, padding: "10px 20px", cursor: "pointer", borderTop: "1px solid #f8fafc", background: "transparent", alignItems: "center" }}
                            onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                            onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                            <span style={{ fontSize: 11, color: "#0f172a", fontWeight: 600 }}>{s.site}</span>
                            <span style={{ fontSize: 11, color: "#475569", textAlign:"right" }}>{fmt(s.npr)}</span>
                            <span style={{ fontSize: 11, color: "#475569", textAlign:"right" }}>{fmt(s.totalAR)}</span>
                            <span style={{ fontSize: 11, color: "#64748b", textAlign:"right" }}>{fmt(s.totalDNFB)}</span>
                            <span style={{ fontSize: 11, color: "#334155", fontWeight: 600, textAlign:"right" }}>{fmt(s.totalExposure)}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", textAlign:"right" }}>{fmt(s.totalEV)}</span>
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
                    <div style={{ padding: "10px 20px", fontSize: 11, color: "#334155", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid #f1f5f9" }}>
                      <span>Showing: {siteFilter}</span>
                      {(() => {
                        const s = siteStats.find(x => x.site === siteFilter);
                        if (!s) return null;
                        const daysColor = s.avgDays < 55 ? "#0f172a" : s.avgDays < 65 ? "#d97706" : "#dc2626";
                        const ncrColor = s.ncr >= 95 ? "#0f172a" : s.ncr >= 85 ? "#d97706" : "#dc2626";
                        return (
                          <span style={{ fontWeight: 400, color: "#64748b", fontSize: 11 }}>
                            · NPR {fmt(s.npr)} · AR {fmt(s.totalAR)} · DNFB {fmt(s.totalDNFB)} · EV <span style={{ color: "#0f172a", fontWeight: 600 }}>{fmt(s.totalEV)}</span> · AR Days <span style={{ color: daysColor, fontWeight: 600 }}>{s.avgDays}d</span> · NCR <span style={{ color: ncrColor, fontWeight: 600 }}>{s.ncr}%</span> · Denial <span style={{ color: s.denialRate <= 5 ? "#0f172a" : s.denialRate <= 10 ? "#d97706" : "#dc2626", fontWeight: 600 }}>{s.denialRate}%</span>
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })()}

            <CFOCriticalHolds accounts={arFiltered} />

            {/* ── group: WHY / diagnostic breakdown (payer recovery + WIP stratification) ── */}
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", margin: "8px 0 12px 4px" }}>Why it's happening</div>
            <div id="detail-payers" style={{ scrollMarginTop: 80 }} />
            {(() => {
              const groups = {
                Medicare:   { label: "Medicare",    accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "medicare") },
                Commercial: { label: "Commercial",  accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "commercial") },
                Medicaid:   { label: "Medicaid",    accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "medicaid") },
                "Self-Pay": { label: "Self-Pay",    accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "self_pay") },
                "Worker Comp": { label: "Worker's Comp", accounts: arFiltered.filter(a => PAYER_CATEGORY[a.payer] === "workers_comp") },
              };
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Expected recovery by payer group</div>
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
                      const color = rate >= bm.min ? "#0f172a" : gap <= 10 ? "#d97706" : "#dc2626";
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

            {/* ── group: IN MOTION (WIP inventory + WorkLink rework) ── */}
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", margin: "8px 0 12px 4px" }}>In motion</div>
            <div id="detail-wip" style={{ scrollMarginTop: 80 }} />
            {/* Billing WIP + its donut on row 1; Follow-up WIP + its donut on row 2 — each lever its own band */}
            <div style={{ display: "grid", gridTemplateColumns: cols("1fr 1fr", "1fr 1fr", "1fr"), gap: 12, marginBottom: 12 }}>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 18px" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Billing WIP — DNFB</div>
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
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 18px" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Follow-up WIP — Collections</div>
                {(() => {
                  const pastDue = arFiltered.filter(isCollectorActionable); // unworked in platform
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
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 6, paddingTop: 6, borderTop: "1px solid #f1f5f9" }}>{arFiltered.filter(isCollectorActionable).length.toLocaleString()} accounts unworked in platform</div>
              </div>
              <DonutChartPanel accounts={arFiltered.filter(isCollectorActionable)} title="Collections WIP — past due by area" onFilter={(area) => { setTab("ar"); setAreaFilter(area); setSeverityFilter(null); setSearchQuery(""); window.scrollTo(0,0); }} activeFilter={null} />
            </div>
            {/* WorkLink — rework in flight on the WIP inventory above (same In motion group) */}
            <WorkLinkReporting worklinks={worklinks} isMobile={isMobile} />
            {/* ── KPI DETAIL: config-driven from cfo-kpis.json (four documented groups).
                Built KPIs compute live from AR data; Phase 2 render as designed placeholders. */}
            <div id="detail-kpi-groups" style={{ scrollMarginTop: 80 }} />
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", margin: "20px 0 4px 4px" }}>KPI detail</div>
            <div style={{ fontSize: 11, color: "#64748b", margin: "0 0 14px 4px" }}>Complete financial picture · live metrics compute from current AR · Phase 2 metrics light up as data feeds connect</div>
            {CFO_KPIS.groups.map(group => (
              <KpiGroup key={group.id} group={group} isMobile={isMobile}
                computeArgs={{ ar: arFiltered, siteNpr: SITE_NPR, siteFilter, fmtUSD: fmt }} />
            ))}

            </>)}
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
          const pastDue = arForRole.filter(isCollectorActionable); // unworked in platform
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
                    {severityFilter ? `${tiers.find(t=>t.key===severityFilter)?.label}: ${fmt((tiers.find(t=>t.key===severityFilter)?.accs||[]).reduce((s,a)=>s+a.amount,0))} · ${(tiers.find(t=>t.key===severityFilter)?.accs||[]).length} accounts` : `${pastDue.length.toLocaleString()} accounts unworked in platform`}
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

        {!(role === "cfo" && tab === "metrics") && (<>
        {!(role === "cfo" && tab === "detail") && <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search by account ID, patient, payer, or site..." />}

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

        {!(role === "cfo" && tab === "detail") && (
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
        )}

        {role === "cfo" && tab === "detail" && (
          <div style={{ padding: isMobile ? "0 12px" : "0 32px", marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>Needs your decision</div>
          </div>
        )}
        {role === "cfo" && tab === "detail" && <CFOEscalationSection />}
        {role === "cfo" && tab === "detail" && (
          <div style={{ padding: isMobile ? "0 12px 80px" : "0 32px 40px" }}>
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, borderLeft: "3px solid #334155", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 3 }}>Executive analysis</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>AI-written · review the data first, then check your assessment</div>
                </div>
                <button onClick={runAI} disabled={aiLoading} style={{ flexShrink: 0, padding: "8px 16px", background: aiLoading ? "#f1f5f9" : "#0f172a", border: "none", borderRadius: 8, color: aiLoading ? "#64748b" : "#fff", cursor: aiLoading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                  {aiLoading ? (
                    <><span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span> Writing…</>
                  ) : aiText ? "Regenerate" : "Generate summary"}
                </button>
              </div>
              {aiText !== null && typeof aiText === "object" && (
                <div style={{ padding: "18px 20px" }}>
                  {aiText.status && <div style={{ fontSize: 14, color: "#0f172a", lineHeight: 1.6, marginBottom: 18 }}>{aiText.status}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? 14 : 22 }}>
                    {aiText.priorities?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Priorities</div>
                        {aiText.priorities.map((p, i) => <div key={i} style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid #33415522" }}>{p}</div>)}
                      </div>
                    )}
                    {aiText.risks?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Risks</div>
                        {aiText.risks.map((r, i) => <div key={i} style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid #d9770622" }}>{r}</div>)}
                      </div>
                    )}
                    {aiText.decisions?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Decisions</div>
                        {aiText.decisions.map((d, i) => <div key={i} style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid #dc262622" }}>{d}</div>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {aiText === null && !aiLoading && (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
                  Review the data above first, then generate the analysis to check your assessment.
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

        {role === "cfo" && tab === "detail" && (
          <div style={{ padding: isMobile ? "0 12px" : "0 32px", marginTop: 28 }}>
            <div onClick={() => setAccountsExpanded(e => !e)}
              style={{ borderTop: "2px solid #e2e8f0", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Account detail</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                  {filtered.length.toLocaleString()} accounts · {fmt(filtered.reduce((s,a) => s + a.expectedValue, 0))} expected recovery · the underlying evidence
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {accountsExpanded && (
                  <button onClick={(e) => { e.stopPropagation(); exportToExcel(); }} disabled={filtered.length === 0}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 6, color: "#334155", cursor: filtered.length === 0 ? "not-allowed" : "pointer" }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1 9v1.5A.5.5 0 001.5 11h9a.5.5 0 00.5-.5V9" stroke="#334155" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Export {filtered.length > 0 ? `(${filtered.length})` : ""}
                  </button>
                )}
                <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{accountsExpanded ? "Hide ▲" : "Show ▼"}</span>
              </div>
            </div>
          </div>
        )}

        {(!(role === "cfo" && tab === "detail") || accountsExpanded) && filtered.slice(0, 100).map(acc => (
          (role === "cfo" && tab === "dnfb") ? null :
          <BillerAccountCard key={acc.id} acc={acc} onSeverityFilter={setSeverityFilter} onWorkLink={handleSendWorklink} />
        ))}
        {(!(role === "cfo" && tab === "detail") || accountsExpanded) && (role !== "cfo" || tab !== "dnfb") && filtered.length > 100 && (
          <div style={{ textAlign: "center", padding: "16px", fontSize: 12, color: "#94a3b8" }}>
            Showing top 100 of {filtered.length.toLocaleString()} accounts by expected value · refine with search or filters
          </div>
        )}
        </>)}
      </div>
      )}

      <div style={{ borderTop: "1px solid #e2e8f0", padding: isMobile ? "12px 16px" : "14px 32px", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#cbd5e1" }}>
        <span>D4 Consulting Group — Proprietary</span>
        {!isMobile && <span>WIP Intelligence Platform v2.1 · Human-in-the-loop · Phase 1 Internal</span>}
      </div>
    </div>
  );
}
