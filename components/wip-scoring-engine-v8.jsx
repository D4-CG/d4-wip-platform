import { useState, useMemo, useCallback } from "react";

const PAYER_BASELINES = {
  "Medicare": 88, "Blue Cross": 84, "Blue Shield": 82, "Aetna": 79,
  "United Health": 76, "Cigna": 74, "Humana": 72, "Medicaid": 56, "Worker Comp": 40,
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


const PAYER_CATEGORY = {
  "Medicare": "medicare",
  "Blue Cross": "commercial", "Blue Shield": "commercial",
  "Aetna": "commercial", "United Health": "commercial",
  "Cigna": "commercial", "Humana": "commercial",
  "Medicaid": "medicaid",
  "Worker Comp": "workers_comp",
};

const ROLE_DEFS = {
  commercial_collector: { label: "Commercial Collector", paneLabel: "Commercial accounts only", filter: ["commercial"], mode: "collector" },
  medicare_bc:          { label: "Medicare B/C",          paneLabel: "Medicare only — portal workflow", filter: ["medicare"], mode: "medicare_bc" },
  medicaid:             { label: "Medicaid Specialist",    paneLabel: "Medicaid accounts only", filter: ["medicaid"], mode: "biller" },
  wc:                   { label: "Worker's Comp",          paneLabel: "Worker's Comp accounts only", filter: ["workers_comp"], mode: "biller" },
  biller:               { label: "Biller — All Payers",    paneLabel: "All payer types", filter: ["all"], mode: "biller" },
  supervisor:           { label: "Supervisor",             paneLabel: "All payer types", filter: ["all"], mode: "supervisor" },
  cfo:                  { label: "CFO",                    paneLabel: "All payer types", filter: ["all"], mode: "cfo" },
};

const ESCALATION_DATA = {
  escalated: [
    { accountId: "AR-005",  patient: "Metro Behavioral Health",   payer: "Cigna",    amount: 37000,  expectedValue: 4440,   escalatedBy: "T.Jones",   escalatedAt: "Today 8:42 AM",    note: "CO-50 denial — payer refusing retro auth after two attempts. Need clinical review and appeal strategy.", severity: "URGENT" },
    { accountId: "DNFB-002",patient: "Coastal Infusion Center",   payer: "Blue Cross",amount: 128400, expectedValue: 102720, escalatedBy: "J.Smith",   escalatedAt: "Today 9:15 AM",    note: "Infusion drug charge still missing after routing to charge capture twice. Site 7 unresponsive — $128K at risk.", severity: "CRITICAL" },
    { accountId: "AR-001",  patient: "Metro Behavioral Health",   payer: "Medicaid", amount: 78400,  expectedValue: 9408,   escalatedBy: "R.Garcia",  escalatedAt: "Yesterday 4:30 PM",note: "Medicaid CO-4 — three retro auth attempts exhausted. Payer final on denial. Recommend write-off review.", severity: "URGENT" },
  ],
  slaBreach: [
    { accountId: "AR-020",  patient: "Alliance Infusion Services", payer: "Worker Comp",assignedTo: "M.Williams", scheduledDate: "May 13", daysOverdue: 3, amount: 169000 },
    { accountId: "AR-035",  patient: "Regional Orthopedic Group",  payer: "Blue Cross", assignedTo: "J.Smith",    scheduledDate: "May 12", daysOverdue: 4, amount: 124000 },
    { accountId: "DNFB-007",patient: "Coastal Infusion Center",    payer: "Blue Shield",assignedTo: "T.Jones",    scheduledDate: "May 14", daysOverdue: 2, amount: 89700 },
    { accountId: "AR-012",  patient: "Genesis Home Health",         payer: "Worker Comp",assignedTo: "R.Garcia",   scheduledDate: "May 13", daysOverdue: 3, amount: 162000 },
  ],
  writeOffPending: [
    { accountId: "AR-009",  patient: "Harbor Home Health",         payer: "Medicaid", amount: 47200, recommendedBy: "J.Smith",  recommendedAt: "Today 10:20 AM",    rationale: "15% collection probability after 203 days. Timely filing window closed with Medicaid." },
    { accountId: "AR-005",  patient: "Metro Behavioral Health",    payer: "Cigna",    amount: 37000, recommendedBy: "R.Garcia", recommendedAt: "Yesterday 2:15 PM", rationale: "12% probability. CO-50 medical necessity denial — all appeal paths exhausted after 206 days." },
  ],
  overrideReview: [
    { accountId: "AR-003",  patient: "Harbor Home Health",  payer: "Medicaid",    collectorName: "J.Smith",  aiRecommended: "Appeal submission", collectorChose: "Outbound call",    note: "Payer rep confirmed CO-97 fixable with modifier 59 — faster than full appeal process." },
    { accountId: "AR-007",  patient: "MedCore Infusion",    payer: "Medicaid",    collectorName: "T.Jones",  aiRecommended: "Outbound call",    collectorChose: "Appeal submission", note: "COB not resolvable by phone — obtained primary EOB and filed formal appeal directly." },
  ],
};

const AREAS = ["Coding","Physician/Doc","Charge Capture","Credentialing","Authorization","Clinical/HIM","Billing/Scrubber","Pending"];

const DNFB_DATA = [
  { id:"DNFB-001", patient:"Coastal Infusion Center", payer:"United Health", amount:62000, daysInDNFB:5, serviceDate:"2026-05-11", lastContact:"2026-05-15", holdCode:"PHYSICIAN_QUERY", site:"Site 10", vertical:"Infusion" },
  { id:"DNFB-002", patient:"Metro Behavioral Health", payer:"Blue Cross", amount:64000, daysInDNFB:17, serviceDate:"2026-04-29", lastContact:"2026-05-09", holdCode:"PHYSICIAN_QUERY", site:"Site 12", vertical:"Behavioral Health" },
  { id:"DNFB-003", patient:"Genesis Home Health", payer:"United Health", amount:199000, daysInDNFB:26, serviceDate:"2026-04-19", lastContact:"2026-05-05", holdCode:"CODING_UNASSIGNED", site:"Site 5", vertical:"Home Health" },
  { id:"DNFB-004", patient:"Comfort Home Services", payer:"Blue Cross", amount:102000, daysInDNFB:4, serviceDate:"2026-05-11", lastContact:"2026-05-13", holdCode:"CODING_COMPLEX", site:"Site 5", vertical:"Home Health" },
  { id:"DNFB-005", patient:"Regional Urology Associates", payer:"Blue Cross", amount:25000, daysInDNFB:18, serviceDate:"2026-04-26", lastContact:"2026-05-04", holdCode:"CREDENTIALING", site:"Site 10", vertical:"Urology" },
  { id:"DNFB-006", patient:"Coastal Infusion Center", payer:"Aetna", amount:25000, daysInDNFB:28, serviceDate:"2026-04-18", lastContact:"2026-05-03", holdCode:"CHARGE_MISSING", site:"Site 5", vertical:"Infusion" },
  { id:"DNFB-007", patient:"Comfort Home Services", payer:"Blue Cross", amount:167000, daysInDNFB:6, serviceDate:"2026-05-09", lastContact:"2026-05-14", holdCode:"HIM_DEFICIENCY", site:"Site 8", vertical:"Home Health" },
  { id:"DNFB-008", patient:"Smile Partners DSO", payer:"Cigna", amount:63000, daysInDNFB:27, serviceDate:"2026-04-19", lastContact:"2026-05-03", holdCode:"CODING_UNASSIGNED", site:"Site 5", vertical:"Dental" },
  { id:"DNFB-009", patient:"Comfort Home Services", payer:"Aetna", amount:132000, daysInDNFB:13, serviceDate:"2026-04-30", lastContact:"2026-05-13", holdCode:"SCRUBBER_EDIT", site:"Site 5", vertical:"Home Health" },
  { id:"DNFB-010", patient:"Comfort Home Services", payer:"Humana", amount:107000, daysInDNFB:12, serviceDate:"2026-05-04", lastContact:"2026-05-07", holdCode:"HIM_DEFICIENCY", site:"Site 8", vertical:"Home Health" },
  { id:"DNFB-011", patient:"Harborview BH", payer:"Blue Cross", amount:165000, daysInDNFB:6, serviceDate:"2026-05-07", lastContact:"2026-05-11", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 2", vertical:"Behavioral Health" },
  { id:"DNFB-012", patient:"Heartland Hospice", payer:"Worker Comp", amount:146000, daysInDNFB:28, serviceDate:"2026-04-18", lastContact:"2026-04-24", holdCode:"CHARGE_MISSING", site:"Site 9", vertical:"Hospice" },
  { id:"DNFB-013", patient:"Peak MSK Partners", payer:"Medicare", amount:133000, daysInDNFB:25, serviceDate:"2026-04-21", lastContact:"2026-04-25", holdCode:"CHARGE_MISSING", site:"Site 5", vertical:"Orthopedics" },
  { id:"DNFB-014", patient:"Regional Orthopedic Group", payer:"Blue Shield", amount:140000, daysInDNFB:30, serviceDate:"2026-04-16", lastContact:"2026-04-30", holdCode:"AUTH_EXPIRED", site:"Site 1", vertical:"Orthopedics" },
  { id:"DNFB-015", patient:"Regional Eye Associates", payer:"Aetna", amount:66000, daysInDNFB:29, serviceDate:"2026-04-17", lastContact:"2026-05-13", holdCode:"CODING_UNASSIGNED", site:"Site 12", vertical:"Ophthalmology" },
  { id:"DNFB-016", patient:"Cardiology Associates", payer:"United Health", amount:160000, daysInDNFB:14, serviceDate:"2026-05-02", lastContact:"2026-05-04", holdCode:"AUTH_EXPIRED", site:"Site 5", vertical:"Cardiology" },
  { id:"DNFB-017", patient:"Summit Ophthalmology", payer:"Worker Comp", amount:35000, daysInDNFB:8, serviceDate:"2026-05-08", lastContact:"2026-05-13", holdCode:"AUTH_MISSING", site:"Site 1", vertical:"Ophthalmology" },
  { id:"DNFB-018", patient:"Harbor Home Health", payer:"Blue Cross", amount:20000, daysInDNFB:8, serviceDate:"2026-05-08", lastContact:"2026-05-09", holdCode:"SCRUBBER_EDIT", site:"Site 6", vertical:"Home Health" },
  { id:"DNFB-019", patient:"Cardiology Associates", payer:"United Health", amount:129000, daysInDNFB:7, serviceDate:"2026-05-08", lastContact:"2026-05-10", holdCode:"SCRUBBER_EDIT", site:"Site 10", vertical:"Cardiology" },
  { id:"DNFB-020", patient:"Genesis Home Health", payer:"Humana", amount:29000, daysInDNFB:4, serviceDate:"2026-05-09", lastContact:"2026-05-14", holdCode:"PHYSICIAN_QUERY", site:"Site 7", vertical:"Home Health" },
  { id:"DNFB-021", patient:"Regional Urology Associates", payer:"Medicare", amount:172000, daysInDNFB:21, serviceDate:"2026-04-25", lastContact:"2026-05-03", holdCode:"SCRUBBER_EDIT", site:"Site 12", vertical:"Urology" },
  { id:"DNFB-022", patient:"Peak MSK Partners", payer:"Blue Shield", amount:123000, daysInDNFB:8, serviceDate:"2026-05-08", lastContact:"2026-05-09", holdCode:"CHARGE_MISSING", site:"Site 9", vertical:"Orthopedics" },
  { id:"DNFB-023", patient:"Northgate Psychiatry", payer:"Worker Comp", amount:28000, daysInDNFB:30, serviceDate:"2026-04-16", lastContact:"2026-05-02", holdCode:"CODING_UNASSIGNED", site:"Site 8", vertical:"Behavioral Health" },
  { id:"DNFB-024", patient:"Legacy Hospice Group", payer:"Medicaid", amount:113000, daysInDNFB:23, serviceDate:"2026-04-19", lastContact:"2026-04-24", holdCode:"CHARGE_MISSING", site:"Site 12", vertical:"Hospice" },
  { id:"DNFB-025", patient:"Heart Partners", payer:"Cigna", amount:17000, daysInDNFB:19, serviceDate:"2026-04-26", lastContact:"2026-05-14", holdCode:"CODING_UNASSIGNED", site:"Site 9", vertical:"Cardiology" },
  { id:"DNFB-026", patient:"Summit Orthopedics", payer:"Blue Cross", amount:65000, daysInDNFB:13, serviceDate:"2026-05-03", lastContact:"2026-05-06", holdCode:"SCRUBBER_EDIT", site:"Site 10", vertical:"Orthopedics" },
  { id:"DNFB-027", patient:"MedCore Infusion", payer:"Worker Comp", amount:71000, daysInDNFB:7, serviceDate:"2026-05-04", lastContact:"2026-05-13", holdCode:"CHARGE_LAG", site:"Site 4", vertical:"Infusion" },
  { id:"DNFB-028", patient:"Comfort Care Partners", payer:"United Health", amount:85000, daysInDNFB:30, serviceDate:"2026-04-16", lastContact:"2026-05-01", holdCode:"AUTH_MISSING", site:"Site 10", vertical:"Hospice" },
  { id:"DNFB-029", patient:"Premier Infusion Partners", payer:"Worker Comp", amount:38000, daysInDNFB:30, serviceDate:"2026-04-16", lastContact:"2026-04-17", holdCode:"CHARGE_MISSING", site:"Site 4", vertical:"Infusion" },
  { id:"DNFB-030", patient:"Northgate Psychiatry", payer:"Worker Comp", amount:174000, daysInDNFB:4, serviceDate:"2026-05-11", lastContact:"2026-05-15", holdCode:"CHARGE_MISSING", site:"Site 2", vertical:"Behavioral Health" },
  { id:"DNFB-031", patient:"Bright Dental Alliance", payer:"Aetna", amount:57000, daysInDNFB:22, serviceDate:"2026-04-22", lastContact:"2026-04-29", holdCode:"CHARGE_LAG", site:"Site 8", vertical:"Dental" },
  { id:"DNFB-032", patient:"Summit Mental Health", payer:"Blue Shield", amount:72000, daysInDNFB:6, serviceDate:"2026-05-07", lastContact:"2026-05-11", holdCode:"SCRUBBER_EDIT", site:"Site 12", vertical:"Behavioral Health" },
  { id:"DNFB-033", patient:"Heart Partners", payer:"Blue Cross", amount:181000, daysInDNFB:29, serviceDate:"2026-04-17", lastContact:"2026-04-19", holdCode:"CODING_COMPLEX", site:"Site 6", vertical:"Cardiology" },
  { id:"DNFB-034", patient:"Comfort Care Partners", payer:"Medicare", amount:98000, daysInDNFB:29, serviceDate:"2026-04-17", lastContact:"2026-05-09", holdCode:"CHARGE_MISSING", site:"Site 11", vertical:"Hospice" },
  { id:"DNFB-035", patient:"Alliance Infusion Services", payer:"Worker Comp", amount:163000, daysInDNFB:24, serviceDate:"2026-04-22", lastContact:"2026-05-10", holdCode:"CREDENTIALING", site:"Site 3", vertical:"Infusion" },
  { id:"DNFB-036", patient:"Smile Partners DSO", payer:"Blue Cross", amount:14000, daysInDNFB:28, serviceDate:"2026-04-17", lastContact:"2026-05-09", holdCode:"CREDENTIALING", site:"Site 8", vertical:"Dental" },
  { id:"DNFB-037", patient:"Legacy Hospice Group", payer:"United Health", amount:76000, daysInDNFB:12, serviceDate:"2026-04-30", lastContact:"2026-05-09", holdCode:"CODING_COMPLEX", site:"Site 11", vertical:"Hospice" },
  { id:"DNFB-038", patient:"Metro Behavioral Health", payer:"United Health", amount:153000, daysInDNFB:9, serviceDate:"2026-05-07", lastContact:"2026-05-09", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 6", vertical:"Behavioral Health" },
  { id:"DNFB-039", patient:"Serenity Hospice", payer:"Humana", amount:53000, daysInDNFB:9, serviceDate:"2026-05-07", lastContact:"2026-05-15", holdCode:"HIM_DEFICIENCY", site:"Site 9", vertical:"Hospice" },
  { id:"DNFB-040", patient:"Summit Ophthalmology", payer:"Blue Cross", amount:89000, daysInDNFB:20, serviceDate:"2026-04-24", lastContact:"2026-05-12", holdCode:"SCRUBBER_EDIT", site:"Site 12", vertical:"Ophthalmology" },
  { id:"DNFB-041", patient:"Smile Partners DSO", payer:"Aetna", amount:175000, daysInDNFB:13, serviceDate:"2026-04-28", lastContact:"2026-05-13", holdCode:"CREDENTIALING", site:"Site 10", vertical:"Dental" },
  { id:"DNFB-042", patient:"Serenity Hospice", payer:"United Health", amount:58000, daysInDNFB:14, serviceDate:"2026-04-28", lastContact:"2026-05-05", holdCode:"CHARGE_MISSING", site:"Site 6", vertical:"Hospice" },
  { id:"DNFB-043", patient:"Metro Urology Group", payer:"Aetna", amount:126000, daysInDNFB:26, serviceDate:"2026-04-19", lastContact:"2026-04-24", holdCode:"AUTH_EXPIRED", site:"Site 2", vertical:"Urology" },
  { id:"DNFB-044", patient:"Comfort Home Services", payer:"Aetna", amount:42000, daysInDNFB:1, serviceDate:"2026-05-15", lastContact:"2026-05-15", holdCode:"PHYSICIAN_QUERY", site:"Site 8", vertical:"Home Health" },
  { id:"DNFB-045", patient:"Metro Urology Group", payer:"Aetna", amount:131000, daysInDNFB:13, serviceDate:"2026-05-03", lastContact:"2026-05-05", holdCode:"CREDENTIALING", site:"Site 12", vertical:"Urology" },
  { id:"DNFB-046", patient:"MedCore Infusion", payer:"Aetna", amount:183000, daysInDNFB:17, serviceDate:"2026-04-29", lastContact:"2026-05-08", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 2", vertical:"Infusion" },
  { id:"DNFB-047", patient:"Peak MSK Partners", payer:"Worker Comp", amount:157000, daysInDNFB:11, serviceDate:"2026-05-02", lastContact:"2026-05-07", holdCode:"AUTH_EXPIRED", site:"Site 8", vertical:"Orthopedics" },
  { id:"DNFB-048", patient:"Metro Urology Group", payer:"United Health", amount:168000, daysInDNFB:9, serviceDate:"2026-05-04", lastContact:"2026-05-12", holdCode:"PHYSICIAN_QUERY", site:"Site 5", vertical:"Urology" },
  { id:"DNFB-049", patient:"Alliance Infusion Services", payer:"Aetna", amount:90000, daysInDNFB:11, serviceDate:"2026-05-05", lastContact:"2026-05-13", holdCode:"CHARGE_MISSING", site:"Site 3", vertical:"Infusion" },
  { id:"DNFB-050", patient:"Comfort Care Partners", payer:"Aetna", amount:111000, daysInDNFB:14, serviceDate:"2026-04-30", lastContact:"2026-05-08", holdCode:"CODING_COMPLEX", site:"Site 7", vertical:"Hospice" },
  { id:"DNFB-051", patient:"Genesis Home Health", payer:"Humana", amount:183000, daysInDNFB:1, serviceDate:"2026-05-12", lastContact:"2026-05-12", holdCode:"HIM_DEFICIENCY", site:"Site 8", vertical:"Home Health" },
  { id:"DNFB-052", patient:"Regional Eye Associates", payer:"Humana", amount:142000, daysInDNFB:24, serviceDate:"2026-04-18", lastContact:"2026-04-26", holdCode:"CREDENTIALING", site:"Site 4", vertical:"Ophthalmology" },
  { id:"DNFB-053", patient:"Summit Ophthalmology", payer:"Blue Shield", amount:37000, daysInDNFB:20, serviceDate:"2026-04-26", lastContact:"2026-05-03", holdCode:"AUTH_MISSING", site:"Site 10", vertical:"Ophthalmology" },
  { id:"DNFB-054", patient:"MedCore Infusion", payer:"Blue Shield", amount:51000, daysInDNFB:2, serviceDate:"2026-05-13", lastContact:"2026-05-15", holdCode:"AUTH_MISSING", site:"Site 4", vertical:"Infusion" },
  { id:"DNFB-055", patient:"Regional Eye Associates", payer:"Humana", amount:197000, daysInDNFB:27, serviceDate:"2026-04-17", lastContact:"2026-05-13", holdCode:"CHARGE_MISSING", site:"Site 8", vertical:"Ophthalmology" },
  { id:"DNFB-056", patient:"Heart Partners", payer:"Cigna", amount:171000, daysInDNFB:3, serviceDate:"2026-05-13", lastContact:"2026-05-15", holdCode:"PHYSICIAN_QUERY", site:"Site 4", vertical:"Cardiology" },
  { id:"DNFB-057", patient:"Lakeside Behavioral", payer:"Blue Shield", amount:37000, daysInDNFB:16, serviceDate:"2026-04-30", lastContact:"2026-05-06", holdCode:"PHYSICIAN_QUERY", site:"Site 4", vertical:"Behavioral Health" },
  { id:"DNFB-058", patient:"Bright Dental Alliance", payer:"Blue Shield", amount:160000, daysInDNFB:24, serviceDate:"2026-04-22", lastContact:"2026-05-10", holdCode:"HIM_DEFICIENCY", site:"Site 5", vertical:"Dental" },
  { id:"DNFB-059", patient:"Summit Mental Health", payer:"Humana", amount:188000, daysInDNFB:7, serviceDate:"2026-05-09", lastContact:"2026-05-15", holdCode:"CREDENTIALING", site:"Site 12", vertical:"Behavioral Health" },
  { id:"DNFB-060", patient:"Coastal Infusion Center", payer:"Cigna", amount:114000, daysInDNFB:22, serviceDate:"2026-04-24", lastContact:"2026-04-29", holdCode:"AUTH_EXPIRED", site:"Site 11", vertical:"Infusion" },
  { id:"DNFB-061", patient:"Regional Urology Associates", payer:"Blue Shield", amount:50000, daysInDNFB:24, serviceDate:"2026-04-20", lastContact:"2026-04-26", holdCode:"CREDENTIALING", site:"Site 9", vertical:"Urology" },
  { id:"DNFB-062", patient:"Alliance Infusion Services", payer:"Medicaid", amount:197000, daysInDNFB:15, serviceDate:"2026-04-27", lastContact:"2026-05-05", holdCode:"PHYSICIAN_QUERY", site:"Site 7", vertical:"Infusion" },
  { id:"DNFB-063", patient:"Coastal Recovery", payer:"Cigna", amount:129000, daysInDNFB:7, serviceDate:"2026-05-08", lastContact:"2026-05-13", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 5", vertical:"Behavioral Health" },
  { id:"DNFB-064", patient:"Heart Partners", payer:"Worker Comp", amount:26000, daysInDNFB:8, serviceDate:"2026-05-05", lastContact:"2026-05-12", holdCode:"PHYSICIAN_QUERY", site:"Site 9", vertical:"Cardiology" },
  { id:"DNFB-065", patient:"Regional Urology Associates", payer:"Medicaid", amount:9000, daysInDNFB:3, serviceDate:"2026-05-13", lastContact:"2026-05-14", holdCode:"AUTH_MISSING", site:"Site 12", vertical:"Urology" },
  { id:"DNFB-066", patient:"Bright Dental Alliance", payer:"Medicaid", amount:140000, daysInDNFB:12, serviceDate:"2026-05-02", lastContact:"2026-05-10", holdCode:"AUTH_EXPIRED", site:"Site 12", vertical:"Dental" },
  { id:"DNFB-067", patient:"Bright Dental Alliance", payer:"United Health", amount:35000, daysInDNFB:24, serviceDate:"2026-04-21", lastContact:"2026-05-12", holdCode:"PHYSICIAN_QUERY", site:"Site 12", vertical:"Dental" },
  { id:"DNFB-068", patient:"VitalCaring Home", payer:"Medicaid", amount:190000, daysInDNFB:19, serviceDate:"2026-04-23", lastContact:"2026-05-06", holdCode:"CHARGE_MISSING", site:"Site 2", vertical:"Home Health" },
  { id:"DNFB-069", patient:"Smile Partners DSO", payer:"Cigna", amount:82000, daysInDNFB:1, serviceDate:"2026-05-11", lastContact:"2026-05-11", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 3", vertical:"Dental" },
  { id:"DNFB-070", patient:"Metro Behavioral Health", payer:"Worker Comp", amount:183000, daysInDNFB:5, serviceDate:"2026-05-08", lastContact:"2026-05-15", holdCode:"CHARGE_MISSING", site:"Site 1", vertical:"Behavioral Health" },
  { id:"DNFB-071", patient:"Metro Urology Group", payer:"Medicaid", amount:52000, daysInDNFB:2, serviceDate:"2026-05-13", lastContact:"2026-05-15", holdCode:"CHARGE_LAG", site:"Site 2", vertical:"Urology" },
  { id:"DNFB-072", patient:"Advanced Urology Partners", payer:"Medicare", amount:43000, daysInDNFB:26, serviceDate:"2026-04-18", lastContact:"2026-05-13", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 4", vertical:"Urology" },
  { id:"DNFB-073", patient:"Metro Heart Institute", payer:"Aetna", amount:102000, daysInDNFB:15, serviceDate:"2026-04-29", lastContact:"2026-05-02", holdCode:"AUTH_EXPIRED", site:"Site 10", vertical:"Cardiology" },
  { id:"DNFB-074", patient:"Lakeside Dental Group", payer:"Blue Cross", amount:165000, daysInDNFB:7, serviceDate:"2026-05-07", lastContact:"2026-05-15", holdCode:"PHYSICIAN_QUERY", site:"Site 3", vertical:"Dental" },
  { id:"DNFB-075", patient:"Summit Orthopedics", payer:"Blue Shield", amount:109000, daysInDNFB:15, serviceDate:"2026-04-27", lastContact:"2026-05-08", holdCode:"CODING_UNASSIGNED", site:"Site 5", vertical:"Orthopedics" },
  { id:"DNFB-076", patient:"Comfort Home Services", payer:"United Health", amount:23000, daysInDNFB:22, serviceDate:"2026-04-23", lastContact:"2026-04-25", holdCode:"AUTH_MISSING", site:"Site 10", vertical:"Home Health" },
  { id:"DNFB-077", patient:"Serenity Hospice", payer:"Worker Comp", amount:170000, daysInDNFB:5, serviceDate:"2026-05-11", lastContact:"2026-05-15", holdCode:"PHYSICIAN_QUERY", site:"Site 1", vertical:"Hospice" },
  { id:"DNFB-078", patient:"Bright Dental Alliance", payer:"Medicaid", amount:124000, daysInDNFB:23, serviceDate:"2026-04-21", lastContact:"2026-05-03", holdCode:"CODING_COMPLEX", site:"Site 5", vertical:"Dental" },
  { id:"DNFB-079", patient:"Lakeside Dental Group", payer:"Blue Cross", amount:177000, daysInDNFB:27, serviceDate:"2026-04-15", lastContact:"2026-05-15", holdCode:"PHYSICIAN_QUERY", site:"Site 11", vertical:"Dental" },
  { id:"DNFB-080", patient:"Smile Partners DSO", payer:"Humana", amount:130000, daysInDNFB:3, serviceDate:"2026-05-11", lastContact:"2026-05-14", holdCode:"SCRUBBER_EDIT", site:"Site 6", vertical:"Dental" },
  { id:"DNFB-081", patient:"Premier Infusion Partners", payer:"Cigna", amount:182000, daysInDNFB:16, serviceDate:"2026-04-28", lastContact:"2026-05-09", holdCode:"CREDENTIALING", site:"Site 9", vertical:"Infusion" },
  { id:"DNFB-082", patient:"Advanced Urology Partners", payer:"Cigna", amount:87000, daysInDNFB:4, serviceDate:"2026-05-12", lastContact:"2026-05-13", holdCode:"CHARGE_MISSING", site:"Site 9", vertical:"Urology" },
  { id:"DNFB-083", patient:"Serenity Hospice", payer:"Aetna", amount:97000, daysInDNFB:20, serviceDate:"2026-04-23", lastContact:"2026-05-14", holdCode:"AUTH_EXPIRED", site:"Site 4", vertical:"Hospice" },
  { id:"DNFB-084", patient:"Coastal Infusion Center", payer:"Aetna", amount:84000, daysInDNFB:18, serviceDate:"2026-04-28", lastContact:"2026-05-13", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 4", vertical:"Infusion" },
  { id:"DNFB-085", patient:"Advanced Urology Partners", payer:"Blue Shield", amount:188000, daysInDNFB:10, serviceDate:"2026-05-04", lastContact:"2026-05-09", holdCode:"AUTH_MISSING", site:"Site 8", vertical:"Urology" },
  { id:"DNFB-086", patient:"Genesis Home Health", payer:"Worker Comp", amount:103000, daysInDNFB:7, serviceDate:"2026-05-05", lastContact:"2026-05-10", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 3", vertical:"Home Health" },
  { id:"DNFB-087", patient:"Premier Dental Group", payer:"Cigna", amount:73000, daysInDNFB:27, serviceDate:"2026-04-19", lastContact:"2026-04-22", holdCode:"AUTH_EXPIRED", site:"Site 5", vertical:"Dental" },
  { id:"DNFB-088", patient:"Metro Heart Institute", payer:"Medicaid", amount:53000, daysInDNFB:23, serviceDate:"2026-04-22", lastContact:"2026-05-08", holdCode:"CHARGE_LAG", site:"Site 7", vertical:"Cardiology" },
  { id:"DNFB-089", patient:"Summit Ophthalmology", payer:"Humana", amount:174000, daysInDNFB:26, serviceDate:"2026-04-19", lastContact:"2026-04-30", holdCode:"CREDENTIALING", site:"Site 1", vertical:"Ophthalmology" },
  { id:"DNFB-090", patient:"Regional Cardiac Group", payer:"Blue Cross", amount:30000, daysInDNFB:17, serviceDate:"2026-04-29", lastContact:"2026-05-11", holdCode:"AUTH_MISSING", site:"Site 7", vertical:"Cardiology" },
  { id:"DNFB-091", patient:"MedCore Infusion", payer:"United Health", amount:164000, daysInDNFB:23, serviceDate:"2026-04-23", lastContact:"2026-05-05", holdCode:"CHARGE_LAG", site:"Site 11", vertical:"Infusion" },
  { id:"DNFB-092", patient:"Premier Infusion Partners", payer:"United Health", amount:196000, daysInDNFB:3, serviceDate:"2026-05-13", lastContact:"2026-05-15", holdCode:"PHYSICIAN_QUERY", site:"Site 8", vertical:"Infusion" },
  { id:"DNFB-093", patient:"Lakeside Dental Group", payer:"Medicare", amount:19000, daysInDNFB:10, serviceDate:"2026-05-05", lastContact:"2026-05-09", holdCode:"CHARGE_LAG", site:"Site 3", vertical:"Dental" },
  { id:"DNFB-094", patient:"Metro Heart Institute", payer:"Blue Shield", amount:49000, daysInDNFB:3, serviceDate:"2026-05-10", lastContact:"2026-05-15", holdCode:"PHYSICIAN_UNSIGNED", site:"Site 8", vertical:"Cardiology" },
  { id:"DNFB-095", patient:"Genesis Home Health", payer:"United Health", amount:70000, daysInDNFB:22, serviceDate:"2026-04-24", lastContact:"2026-05-06", holdCode:"AUTH_MISSING", site:"Site 11", vertical:"Home Health" },
  { id:"DNFB-096", patient:"MedCore Infusion", payer:"Cigna", amount:81000, daysInDNFB:21, serviceDate:"2026-04-23", lastContact:"2026-05-01", holdCode:"HIM_DEFICIENCY", site:"Site 5", vertical:"Infusion" },
  { id:"DNFB-097", patient:"Heartland Hospice", payer:"Blue Cross", amount:102000, daysInDNFB:19, serviceDate:"2026-04-25", lastContact:"2026-05-06", holdCode:"PHYSICIAN_QUERY", site:"Site 12", vertical:"Hospice" },
  { id:"DNFB-098", patient:"Harborview BH", payer:"Humana", amount:7000, daysInDNFB:19, serviceDate:"2026-04-22", lastContact:"2026-05-14", holdCode:"CHARGE_MISSING", site:"Site 10", vertical:"Behavioral Health" },
  { id:"DNFB-099", patient:"Smile Partners DSO", payer:"Cigna", amount:167000, daysInDNFB:7, serviceDate:"2026-05-07", lastContact:"2026-05-10", holdCode:"PHYSICIAN_QUERY", site:"Site 12", vertical:"Dental" },
  { id:"DNFB-100", patient:"Coastal Infusion Center", payer:"United Health", amount:13000, daysInDNFB:19, serviceDate:"2026-04-25", lastContact:"2026-05-11", holdCode:"AUTH_MISSING", site:"Site 2", vertical:"Infusion" }
];

const AR_DATA = [
  { id:"AR-001", patient:"Summit Ophthalmology", payer:"Blue Shield", amount:38000, daysOut:206, serviceDate:"2025-10-09", lastContact:"2026-01-07", denialCode:"CO-50", site:"Site 5", vertical:"Ophthalmology" },
  { id:"AR-002", patient:"Legacy Hospice Group", payer:"Blue Cross", amount:8000, daysOut:72, serviceDate:"2026-02-25", lastContact:"2026-03-29", denialCode:null, site:"Site 11", vertical:"Hospice" },
  { id:"AR-003", patient:"Harbor Home Health", payer:"Medicaid", amount:171000, daysOut:109, serviceDate:"2026-01-21", lastContact:"2026-05-10", denialCode:"CO-97", site:"Site 1", vertical:"Home Health" },
  { id:"AR-004", patient:"Serenity Hospice", payer:"Medicaid", amount:109000, daysOut:76, serviceDate:"2026-02-23", lastContact:"2026-04-18", denialCode:null, site:"Site 8", vertical:"Hospice" },
  { id:"AR-005", patient:"Metro Behavioral Health", payer:"Cigna", amount:37000, daysOut:206, serviceDate:"2025-10-17", lastContact:"2025-11-01", denialCode:"CO-50", site:"Site 9", vertical:"Behavioral Health" },
  { id:"AR-006", patient:"ClearVision Partners", payer:"Cigna", amount:49000, daysOut:72, serviceDate:"2026-02-28", lastContact:"2026-03-23", denialCode:"CO-4", site:"Site 9", vertical:"Ophthalmology" },
  { id:"AR-007", patient:"MedCore Infusion", payer:"Medicaid", amount:136000, daysOut:156, serviceDate:"2025-12-03", lastContact:"2026-01-07", denialCode:null, site:"Site 4", vertical:"Infusion" },
  { id:"AR-008", patient:"Regional Cardiac Group", payer:"Medicaid", amount:20000, daysOut:127, serviceDate:"2025-12-29", lastContact:"2026-02-17", denialCode:"CO-4", site:"Site 2", vertical:"Cardiology" },
  { id:"AR-009", patient:"Premier Dental Group", payer:"Worker Comp", amount:115000, daysOut:30, serviceDate:"2026-04-10", lastContact:"2026-05-02", denialCode:null, site:"Site 8", vertical:"Dental" },
  { id:"AR-010", patient:"Legacy Hospice Group", payer:"Medicaid", amount:111000, daysOut:191, serviceDate:"2025-10-30", lastContact:"2026-01-26", denialCode:null, site:"Site 6", vertical:"Hospice" },
  { id:"AR-011", patient:"Summit Mental Health", payer:"United Health", amount:31000, daysOut:152, serviceDate:"2025-12-09", lastContact:"2026-01-12", denialCode:null, site:"Site 4", vertical:"Behavioral Health" },
  { id:"AR-012", patient:"Genesis Home Health", payer:"Worker Comp", amount:162000, daysOut:177, serviceDate:"2025-11-15", lastContact:"2026-05-08", denialCode:null, site:"Site 3", vertical:"Home Health" },
  { id:"AR-013", patient:"Coastal Infusion Center", payer:"Blue Shield", amount:163000, daysOut:17, serviceDate:"2026-04-23", lastContact:"2026-05-01", denialCode:"CO-22", site:"Site 11", vertical:"Infusion" },
  { id:"AR-014", patient:"Regional Urology Associates", payer:"Medicaid", amount:74000, daysOut:60, serviceDate:"2026-03-10", lastContact:"2026-04-18", denialCode:null, site:"Site 2", vertical:"Urology" },
  { id:"AR-015", patient:"Smile Partners DSO", payer:"Blue Shield", amount:79000, daysOut:88, serviceDate:"2026-02-12", lastContact:"2026-03-13", denialCode:"CO-97", site:"Site 12", vertical:"Dental" },
  { id:"AR-016", patient:"Heartland Hospice", payer:"Humana", amount:34000, daysOut:108, serviceDate:"2026-01-23", lastContact:"2026-04-24", denialCode:"CO-97", site:"Site 10", vertical:"Hospice" },
  { id:"AR-017", patient:"Comfort Home Services", payer:"Blue Shield", amount:135000, daysOut:167, serviceDate:"2025-11-24", lastContact:"2026-02-15", denialCode:"CO-16", site:"Site 6", vertical:"Home Health" },
  { id:"AR-018", patient:"Regional Urology Associates", payer:"Medicaid", amount:169000, daysOut:167, serviceDate:"2025-11-15", lastContact:"2026-02-24", denialCode:null, site:"Site 3", vertical:"Urology" },
  { id:"AR-019", patient:"Advanced Urology Partners", payer:"Cigna", amount:134000, daysOut:170, serviceDate:"2025-11-22", lastContact:"2026-03-13", denialCode:"CO-16", site:"Site 12", vertical:"Urology" },
  { id:"AR-020", patient:"Alliance Infusion Services", payer:"Worker Comp", amount:169000, daysOut:207, serviceDate:"2025-10-14", lastContact:"2025-11-25", denialCode:null, site:"Site 12", vertical:"Infusion" },
  { id:"AR-021", patient:"VitalCaring Home", payer:"United Health", amount:54000, daysOut:99, serviceDate:"2026-01-25", lastContact:"2026-04-09", denialCode:null, site:"Site 7", vertical:"Home Health" },
  { id:"AR-022", patient:"Peak MSK Partners", payer:"Blue Cross", amount:120000, daysOut:94, serviceDate:"2026-02-06", lastContact:"2026-05-09", denialCode:"CO-50", site:"Site 7", vertical:"Orthopedics" },
  { id:"AR-023", patient:"Summit Mental Health", payer:"Aetna", amount:145000, daysOut:191, serviceDate:"2025-10-31", lastContact:"2026-03-03", denialCode:"CO-22", site:"Site 4", vertical:"Behavioral Health" },
  { id:"AR-024", patient:"Comfort Care Partners", payer:"Blue Cross", amount:97000, daysOut:22, serviceDate:"2026-04-19", lastContact:"2026-04-30", denialCode:null, site:"Site 1", vertical:"Hospice" },
  { id:"AR-025", patient:"ClearVision Partners", payer:"Blue Cross", amount:90000, daysOut:39, serviceDate:"2026-04-01", lastContact:"2026-04-11", denialCode:null, site:"Site 6", vertical:"Ophthalmology" },
  { id:"AR-026", patient:"Regional Urology Associates", payer:"Medicaid", amount:39000, daysOut:21, serviceDate:"2026-04-20", lastContact:"2026-05-06", denialCode:"CO-22", site:"Site 4", vertical:"Urology" },
  { id:"AR-027", patient:"Harbor Home Health", payer:"Cigna", amount:136000, daysOut:106, serviceDate:"2026-01-17", lastContact:"2026-05-11", denialCode:"CO-97", site:"Site 11", vertical:"Home Health" },
  { id:"AR-028", patient:"Summit Ophthalmology", payer:"Humana", amount:103000, daysOut:91, serviceDate:"2026-02-06", lastContact:"2026-02-16", denialCode:null, site:"Site 8", vertical:"Ophthalmology" },
  { id:"AR-029", patient:"Valley Eye Care", payer:"Blue Cross", amount:174000, daysOut:80, serviceDate:"2026-02-13", lastContact:"2026-02-27", denialCode:null, site:"Site 12", vertical:"Ophthalmology" },
  { id:"AR-030", patient:"Summit Orthopedics", payer:"Blue Shield", amount:178000, daysOut:205, serviceDate:"2025-10-18", lastContact:"2026-04-13", denialCode:null, site:"Site 2", vertical:"Orthopedics" },
  { id:"AR-031", patient:"Summit Ophthalmology", payer:"Cigna", amount:68000, daysOut:34, serviceDate:"2026-04-07", lastContact:"2026-04-14", denialCode:"CO-97", site:"Site 9", vertical:"Ophthalmology" },
  { id:"AR-032", patient:"Comfort Home Services", payer:"Medicaid", amount:36000, daysOut:39, serviceDate:"2026-04-01", lastContact:"2026-05-04", denialCode:"CO-50", site:"Site 12", vertical:"Home Health" },
  { id:"AR-033", patient:"Smile Partners DSO", payer:"Blue Shield", amount:135000, daysOut:62, serviceDate:"2026-03-09", lastContact:"2026-03-26", denialCode:null, site:"Site 3", vertical:"Dental" },
  { id:"AR-034", patient:"Summit Ophthalmology", payer:"Worker Comp", amount:161000, daysOut:27, serviceDate:"2026-04-13", lastContact:"2026-05-03", denialCode:"CO-22", site:"Site 12", vertical:"Ophthalmology" },
  { id:"AR-035", patient:"Regional Orthopedic Group", payer:"Blue Cross", amount:124000, daysOut:179, serviceDate:"2025-11-11", lastContact:"2025-12-25", denialCode:null, site:"Site 11", vertical:"Orthopedics" },
  { id:"AR-036", patient:"Regional Eye Associates", payer:"Blue Cross", amount:55000, daysOut:167, serviceDate:"2025-11-23", lastContact:"2025-12-06", denialCode:"CO-97", site:"Site 5", vertical:"Ophthalmology" },
  { id:"AR-037", patient:"Metro Urology Group", payer:"Aetna", amount:160000, daysOut:41, serviceDate:"2026-03-26", lastContact:"2026-04-23", denialCode:null, site:"Site 7", vertical:"Urology" },
  { id:"AR-038", patient:"Valley Eye Care", payer:"Cigna", amount:124000, daysOut:36, serviceDate:"2026-03-29", lastContact:"2026-04-30", denialCode:"CO-50", site:"Site 3", vertical:"Ophthalmology" },
  { id:"AR-039", patient:"Summit Mental Health", payer:"Humana", amount:112000, daysOut:68, serviceDate:"2026-03-02", lastContact:"2026-04-05", denialCode:null, site:"Site 4", vertical:"Behavioral Health" },
  { id:"AR-040", patient:"Metro Behavioral Health", payer:"Humana", amount:122000, daysOut:66, serviceDate:"2026-03-02", lastContact:"2026-03-31", denialCode:null, site:"Site 1", vertical:"Behavioral Health" },
  { id:"AR-041", patient:"Premier Dental Group", payer:"Medicaid", amount:142000, daysOut:7, serviceDate:"2026-05-01", lastContact:"2026-05-01", denialCode:"CO-97", site:"Site 3", vertical:"Dental" },
  { id:"AR-042", patient:"Summit Ophthalmology", payer:"Cigna", amount:107000, daysOut:18, serviceDate:"2026-04-21", lastContact:"2026-05-06", denialCode:"CO-4", site:"Site 2", vertical:"Ophthalmology" },
  { id:"AR-043", patient:"Metro Heart Institute", payer:"Worker Comp", amount:164000, daysOut:179, serviceDate:"2025-11-12", lastContact:"2026-04-21", denialCode:"CO-97", site:"Site 7", vertical:"Cardiology" },
  { id:"AR-044", patient:"Metro Heart Institute", payer:"United Health", amount:9000, daysOut:99, serviceDate:"2026-01-22", lastContact:"2026-05-01", denialCode:null, site:"Site 7", vertical:"Cardiology" },
  { id:"AR-045", patient:"Lakeside Behavioral", payer:"Blue Cross", amount:9000, daysOut:117, serviceDate:"2026-01-08", lastContact:"2026-04-26", denialCode:"CO-50", site:"Site 7", vertical:"Behavioral Health" },
  { id:"AR-046", patient:"Comfort Home Services", payer:"United Health", amount:130000, daysOut:86, serviceDate:"2026-02-03", lastContact:"2026-03-05", denialCode:"CO-50", site:"Site 12", vertical:"Home Health" },
  { id:"AR-047", patient:"Summit Ophthalmology", payer:"United Health", amount:59000, daysOut:56, serviceDate:"2026-03-08", lastContact:"2026-04-01", denialCode:null, site:"Site 5", vertical:"Ophthalmology" },
  { id:"AR-048", patient:"Premier Infusion Partners", payer:"Aetna", amount:176000, daysOut:140, serviceDate:"2025-12-19", lastContact:"2026-05-02", denialCode:"CO-4", site:"Site 2", vertical:"Infusion" },
  { id:"AR-049", patient:"Metro Behavioral Health", payer:"United Health", amount:159000, daysOut:32, serviceDate:"2026-04-05", lastContact:"2026-05-01", denialCode:null, site:"Site 11", vertical:"Behavioral Health" },
  { id:"AR-050", patient:"Harbor Home Health", payer:"Cigna", amount:122000, daysOut:170, serviceDate:"2025-11-20", lastContact:"2026-05-12", denialCode:"CO-22", site:"Site 12", vertical:"Home Health" },
  { id:"AR-051", patient:"ClearVision Partners", payer:"Medicare", amount:124000, daysOut:83, serviceDate:"2026-02-14", lastContact:"2026-03-12", denialCode:"CO-16", site:"Site 12", vertical:"Ophthalmology" },
  { id:"AR-052", patient:"Summit Ophthalmology", payer:"Worker Comp", amount:142000, daysOut:210, serviceDate:"2025-10-07", lastContact:"2026-03-13", denialCode:null, site:"Site 11", vertical:"Ophthalmology" },
  { id:"AR-053", patient:"Harborview BH", payer:"Worker Comp", amount:56000, daysOut:151, serviceDate:"2025-12-10", lastContact:"2026-02-21", denialCode:null, site:"Site 9", vertical:"Behavioral Health" },
  { id:"AR-054", patient:"Summit Ophthalmology", payer:"Medicaid", amount:101000, daysOut:25, serviceDate:"2026-04-14", lastContact:"2026-05-12", denialCode:null, site:"Site 3", vertical:"Ophthalmology" },
  { id:"AR-055", patient:"Heartland Hospice", payer:"Aetna", amount:122000, daysOut:93, serviceDate:"2026-02-05", lastContact:"2026-04-21", denialCode:"CO-50", site:"Site 12", vertical:"Hospice" },
  { id:"AR-056", patient:"Harborview BH", payer:"Humana", amount:9000, daysOut:66, serviceDate:"2026-03-06", lastContact:"2026-05-03", denialCode:null, site:"Site 10", vertical:"Behavioral Health" },
  { id:"AR-057", patient:"Regional Urology Associates", payer:"Medicare", amount:16000, daysOut:107, serviceDate:"2026-01-21", lastContact:"2026-03-07", denialCode:"CO-50", site:"Site 4", vertical:"Urology" },
  { id:"AR-058", patient:"Regional Orthopedic Group", payer:"Aetna", amount:86000, daysOut:152, serviceDate:"2025-12-07", lastContact:"2026-02-27", denialCode:null, site:"Site 3", vertical:"Orthopedics" },
  { id:"AR-059", patient:"Regional Cardiac Group", payer:"Humana", amount:43000, daysOut:81, serviceDate:"2026-02-17", lastContact:"2026-03-08", denialCode:null, site:"Site 8", vertical:"Cardiology" },
  { id:"AR-060", patient:"Cardiology Associates", payer:"Humana", amount:70000, daysOut:57, serviceDate:"2026-03-05", lastContact:"2026-05-10", denialCode:"CO-50", site:"Site 8", vertical:"Cardiology" },
  { id:"AR-061", patient:"Harborview BH", payer:"Blue Cross", amount:155000, daysOut:190, serviceDate:"2025-10-30", lastContact:"2026-03-23", denialCode:"CO-50", site:"Site 6", vertical:"Behavioral Health" },
  { id:"AR-062", patient:"Metro Urology Group", payer:"Blue Cross", amount:86000, daysOut:57, serviceDate:"2026-03-10", lastContact:"2026-04-19", denialCode:null, site:"Site 1", vertical:"Urology" },
  { id:"AR-063", patient:"Smile Partners DSO", payer:"Aetna", amount:63000, daysOut:102, serviceDate:"2026-01-22", lastContact:"2026-03-06", denialCode:null, site:"Site 11", vertical:"Dental" },
  { id:"AR-064", patient:"Metro Urology Group", payer:"Medicare", amount:168000, daysOut:175, serviceDate:"2025-11-02", lastContact:"2026-05-11", denialCode:null, site:"Site 1", vertical:"Urology" },
  { id:"AR-065", patient:"Summit Orthopedics", payer:"Medicaid", amount:170000, daysOut:205, serviceDate:"2025-10-09", lastContact:"2026-04-21", denialCode:null, site:"Site 9", vertical:"Orthopedics" },
  { id:"AR-066", patient:"VitalCaring Home", payer:"Medicaid", amount:16000, daysOut:24, serviceDate:"2026-04-09", lastContact:"2026-04-27", denialCode:"CO-97", site:"Site 11", vertical:"Home Health" },
  { id:"AR-067", patient:"Regional Orthopedic Group", payer:"Medicare", amount:155000, daysOut:41, serviceDate:"2026-03-30", lastContact:"2026-04-26", denialCode:"CO-50", site:"Site 3", vertical:"Orthopedics" },
  { id:"AR-068", patient:"Metro Behavioral Health", payer:"Humana", amount:24000, daysOut:92, serviceDate:"2026-01-27", lastContact:"2026-04-04", denialCode:"CO-50", site:"Site 1", vertical:"Behavioral Health" },
  { id:"AR-069", patient:"Alliance Infusion Services", payer:"Aetna", amount:26000, daysOut:73, serviceDate:"2026-02-24", lastContact:"2026-04-26", denialCode:"CO-16", site:"Site 12", vertical:"Infusion" },
  { id:"AR-070", patient:"Metro Heart Institute", payer:"Blue Cross", amount:27000, daysOut:95, serviceDate:"2026-02-03", lastContact:"2026-02-28", denialCode:"CO-4", site:"Site 6", vertical:"Cardiology" },
  { id:"AR-071", patient:"Summit Orthopedics", payer:"Blue Shield", amount:75000, daysOut:112, serviceDate:"2026-01-12", lastContact:"2026-02-04", denialCode:null, site:"Site 2", vertical:"Orthopedics" },
  { id:"AR-072", patient:"Coastal Recovery", payer:"Cigna", amount:102000, daysOut:210, serviceDate:"2025-10-06", lastContact:"2026-02-19", denialCode:null, site:"Site 7", vertical:"Behavioral Health" },
  { id:"AR-073", patient:"Comfort Home Services", payer:"Humana", amount:105000, daysOut:98, serviceDate:"2026-02-01", lastContact:"2026-03-01", denialCode:"CO-97", site:"Site 9", vertical:"Home Health" },
  { id:"AR-074", patient:"Genesis Home Health", payer:"United Health", amount:109000, daysOut:177, serviceDate:"2025-11-11", lastContact:"2025-12-04", denialCode:"CO-16", site:"Site 5", vertical:"Home Health" },
  { id:"AR-075", patient:"Premier Infusion Partners", payer:"Cigna", amount:170000, daysOut:161, serviceDate:"2025-11-30", lastContact:"2026-02-20", denialCode:"CO-22", site:"Site 7", vertical:"Infusion" },
  { id:"AR-076", patient:"Cardiology Associates", payer:"Medicaid", amount:105000, daysOut:123, serviceDate:"2026-01-06", lastContact:"2026-05-12", denialCode:null, site:"Site 8", vertical:"Cardiology" },
  { id:"AR-077", patient:"Premier Dental Group", payer:"Blue Cross", amount:41000, daysOut:94, serviceDate:"2026-02-01", lastContact:"2026-03-18", denialCode:"CO-16", site:"Site 4", vertical:"Dental" },
  { id:"AR-078", patient:"Metro Heart Institute", payer:"Medicaid", amount:108000, daysOut:166, serviceDate:"2025-11-25", lastContact:"2025-12-03", denialCode:"CO-50", site:"Site 11", vertical:"Cardiology" },
  { id:"AR-079", patient:"Regional Eye Associates", payer:"Medicaid", amount:49000, daysOut:177, serviceDate:"2025-11-06", lastContact:"2025-12-15", denialCode:null, site:"Site 2", vertical:"Ophthalmology" },
  { id:"AR-080", patient:"Peak MSK Partners", payer:"Humana", amount:129000, daysOut:167, serviceDate:"2025-11-21", lastContact:"2026-04-03", denialCode:"CO-22", site:"Site 8", vertical:"Orthopedics" },
  { id:"AR-081", patient:"Coastal Infusion Center", payer:"Aetna", amount:13000, daysOut:75, serviceDate:"2026-02-21", lastContact:"2026-04-24", denialCode:"CO-97", site:"Site 8", vertical:"Infusion" },
  { id:"AR-082", patient:"Lakeside Dental Group", payer:"Medicaid", amount:94000, daysOut:27, serviceDate:"2026-04-01", lastContact:"2026-05-12", denialCode:"CO-97", site:"Site 4", vertical:"Dental" },
  { id:"AR-083", patient:"Summit Ophthalmology", payer:"Blue Shield", amount:40000, daysOut:205, serviceDate:"2025-10-12", lastContact:"2026-03-24", denialCode:null, site:"Site 1", vertical:"Ophthalmology" },
  { id:"AR-084", patient:"Premier Dental Group", payer:"Humana", amount:24000, daysOut:167, serviceDate:"2025-11-24", lastContact:"2026-01-04", denialCode:null, site:"Site 12", vertical:"Dental" },
  { id:"AR-085", patient:"Bright Dental Alliance", payer:"United Health", amount:145000, daysOut:152, serviceDate:"2025-12-06", lastContact:"2026-01-11", denialCode:null, site:"Site 6", vertical:"Dental" },
  { id:"AR-086", patient:"Metro Behavioral Health", payer:"Medicaid", amount:36000, daysOut:45, serviceDate:"2026-03-20", lastContact:"2026-05-15", denialCode:"CO-4", site:"Site 7", vertical:"Behavioral Health" },
  { id:"AR-087", patient:"Regional Orthopedic Group", payer:"Blue Shield", amount:28000, daysOut:172, serviceDate:"2025-11-16", lastContact:"2026-04-24", denialCode:"CO-97", site:"Site 6", vertical:"Orthopedics" },
  { id:"AR-088", patient:"Premier Infusion Partners", payer:"Aetna", amount:179000, daysOut:118, serviceDate:"2026-01-13", lastContact:"2026-02-15", denialCode:null, site:"Site 6", vertical:"Infusion" },
  { id:"AR-089", patient:"Comfort Care Partners", payer:"Medicaid", amount:63000, daysOut:103, serviceDate:"2026-01-26", lastContact:"2026-05-02", denialCode:"CO-16", site:"Site 2", vertical:"Hospice" },
  { id:"AR-090", patient:"Lakeside Behavioral", payer:"Blue Shield", amount:94000, daysOut:189, serviceDate:"2025-10-29", lastContact:"2026-04-07", denialCode:null, site:"Site 7", vertical:"Behavioral Health" },
  { id:"AR-091", patient:"Coastal Infusion Center", payer:"Cigna", amount:38000, daysOut:104, serviceDate:"2026-01-22", lastContact:"2026-03-07", denialCode:null, site:"Site 11", vertical:"Infusion" },
  { id:"AR-092", patient:"Coastal Infusion Center", payer:"United Health", amount:15000, daysOut:20, serviceDate:"2026-04-13", lastContact:"2026-05-06", denialCode:"CO-50", site:"Site 11", vertical:"Infusion" },
  { id:"AR-093", patient:"Cardiology Associates", payer:"United Health", amount:84000, daysOut:25, serviceDate:"2026-04-10", lastContact:"2026-05-11", denialCode:"CO-16", site:"Site 9", vertical:"Cardiology" },
  { id:"AR-094", patient:"Premier Dental Group", payer:"Aetna", amount:67000, daysOut:27, serviceDate:"2026-04-13", lastContact:"2026-05-01", denialCode:"CO-4", site:"Site 10", vertical:"Dental" },
  { id:"AR-095", patient:"Smile Partners DSO", payer:"Blue Cross", amount:40000, daysOut:184, serviceDate:"2025-11-08", lastContact:"2026-01-08", denialCode:"CO-4", site:"Site 6", vertical:"Dental" },
  { id:"AR-096", patient:"Summit Orthopedics", payer:"Worker Comp", amount:62000, daysOut:87, serviceDate:"2026-02-07", lastContact:"2026-04-05", denialCode:null, site:"Site 5", vertical:"Orthopedics" },
  { id:"AR-097", patient:"Valley Eye Care", payer:"Worker Comp", amount:50000, daysOut:62, serviceDate:"2026-03-09", lastContact:"2026-05-11", denialCode:"CO-4", site:"Site 8", vertical:"Ophthalmology" },
  { id:"AR-098", patient:"Smile Partners DSO", payer:"Medicaid", amount:156000, daysOut:131, serviceDate:"2025-12-26", lastContact:"2026-03-14", denialCode:null, site:"Site 3", vertical:"Dental" },
  { id:"AR-099", patient:"Serenity Hospice", payer:"Aetna", amount:93000, daysOut:167, serviceDate:"2025-11-25", lastContact:"2026-05-15", denialCode:null, site:"Site 11", vertical:"Hospice" },
  { id:"AR-100", patient:"Summit Ophthalmology", payer:"United Health", amount:24000, daysOut:56, serviceDate:"2026-03-12", lastContact:"2026-05-09", denialCode:"CO-50", site:"Site 3", vertical:"Ophthalmology" }
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

function ProbCircle({ prob }) {
  const color = prob >= 70 ? "#16a34a" : prob >= 40 ? "#d97706" : "#dc2626";
  const label = prob >= 70 ? "Strong" : prob >= 40 ? "Fair" : "At Risk";
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
  "DNFB-006": [
      { date:"2026-04-25", user:"M.Williams", outcome:"resubmitted", text:"payer confirmed receipt. ref #33041778753." }
  ],
  "DNFB-012": [
      { date:"2026-04-21", user:"M.Williams", outcome:"needs_documentation", text:"credentialing team notified." }
  ],
  "DNFB-015": [
      { date:"2026-04-19", user:"K.Brown", outcome:"promised_payment", text:"called. left vm." }
  ],
  "DNFB-021": [
      { date:"2026-05-12", user:"S.Chen", outcome:"promised_payment", text:"called. denied CO-4. need to appeal." }
  ],
  "DNFB-023": [
      { date:"2026-05-09", user:"R.Garcia", outcome:"left_voicemail", text:"payer confirmed receipt. ref #31726673616." }
  ],
  "DNFB-024": [
      { date:"2026-05-11", user:"J.Smith", outcome:"physician_query", text:"called. denied CO-4. need to appeal." }
  ],
  "DNFB-029": [
      { date:"2026-05-06", user:"K.Brown", outcome:"coding_assigned", text:"called. in adjudication. est 30 days." }
  ],
  "DNFB-031": [
      { date:"2026-05-14", user:"M.Williams", outcome:"left_voicemail", text:"called. left vm." }
  ],
  "DNFB-035": [
      { date:"2026-05-15", user:"K.Brown", outcome:"appeal_filed", text:"called. in adjudication. est 30 days." }
  ],
  "DNFB-036": [
      { date:"2026-05-06", user:"J.Smith", outcome:"appeal_filed", text:"payer confirmed receipt. ref #41042286266." }
  ],
  "DNFB-040": [
      { date:"2026-04-29", user:"M.Williams", outcome:"needs_documentation", text:"called. rep said claim processing. ref #68698858057." }
  ],
  "DNFB-043": [
      { date:"2026-04-29", user:"M.Williams", outcome:"no_response", text:"credentialing team notified." }
  ],
  "DNFB-052": [
      { date:"2026-05-08", user:"J.Smith", outcome:"needs_documentation", text:"called. rep said claim processing. ref #76296410718." }
  ],
  "DNFB-060": [
      { date:"2026-05-15", user:"R.Garcia", outcome:"resubmitted", text:"payer confirmed receipt. ref #24990302189." }
  ],
  "DNFB-061": [
      { date:"2026-05-01", user:"M.Williams", outcome:"appeal_filed", text:"appeal filed. waiting response." }
  ],
  "DNFB-078": [
      { date:"2026-05-01", user:"R.Garcia", outcome:"resubmitted", text:"called. left vm." }
  ],
  "DNFB-079": [
      { date:"2026-04-27", user:"S.Chen", outcome:"promised_payment", text:"called. no answer." }
  ],
  "DNFB-083": [
      { date:"2026-04-28", user:"R.Garcia", outcome:"promised_payment", text:"called. in adjudication. est 30 days." }
  ],
  "DNFB-087": [
      { date:"2026-05-11", user:"M.Williams", outcome:"resubmitted", text:"resubmitted with modifier." }
  ],
  "DNFB-091": [
      { date:"2026-05-05", user:"S.Chen", outcome:"left_voicemail", text:"credentialing team notified." }
  ],
  "AR-001": [
      { date:"2026-03-11", user:"K.Brown", outcome:"resubmitted", text:"called. out of timely filing window per payer." },
      { date:"2026-04-16", user:"T.Jones", outcome:"appeal_filed", text:"resubmitted with modifier." }
  ],
  "AR-002": [
      { date:"2026-03-16", user:"M.Williams", outcome:"physician_query", text:"called. no answer." },
      { date:"2026-03-28", user:"K.Brown", outcome:"appeal_filed", text:"payer confirmed receipt. ref #24480369027." }
  ],
  "AR-003": [
      { date:"2026-03-13", user:"S.Chen", outcome:"in_adjudication", text:"called. left vm." },
      { date:"2026-03-27", user:"S.Chen", outcome:"in_adjudication", text:"resubmitted with modifier." }
  ],
  "AR-004": [
      { date:"2026-03-07", user:"R.Garcia", outcome:"escalated", text:"called. out of timely filing window per payer." },
      { date:"2026-04-15", user:"K.Brown", outcome:"resubmitted", text:"payer confirmed receipt. ref #24442626586." },
      { date:"2026-04-21", user:"J.Smith", outcome:"appeal_filed", text:"called. left vm." }
  ],
  "AR-005": [
      { date:"2025-12-16", user:"T.Jones", outcome:"physician_query", text:"called. denied CO-50. need to appeal." },
      { date:"2026-04-17", user:"T.Jones", outcome:"left_voicemail", text:"credentialing team notified." },
      { date:"2026-05-15", user:"M.Williams", outcome:"in_adjudication", text:"called. rep said claim processing. ref #83572755989." }
  ],
  "AR-008": [
      { date:"2026-02-13", user:"J.Smith", outcome:"resubmitted", text:"called. out of timely filing window per payer." },
      { date:"2026-02-23", user:"S.Chen", outcome:"coding_assigned", text:"physician query sent re documentation." },
      { date:"2026-02-27", user:"M.Williams", outcome:"physician_query", text:"called. in adjudication. est 30 days." }
  ],
  "AR-010": [
      { date:"2025-11-25", user:"K.Brown", outcome:"needs_documentation", text:"called. left vm." },
      { date:"2026-02-09", user:"J.Smith", outcome:"no_response", text:"called. in adjudication. est 30 days." },
      { date:"2026-04-22", user:"T.Jones", outcome:"coding_assigned", text:"appeal filed. waiting response." },
      { date:"2026-04-30", user:"S.Chen", outcome:"resubmitted", text:"physician query sent re documentation." }
  ],
  "AR-011": [
      { date:"2026-02-15", user:"J.Smith", outcome:"escalated", text:"payer confirmed receipt. ref #59633782273." }
  ],
  "AR-012": [
      { date:"2025-12-04", user:"R.Garcia", outcome:"needs_documentation", text:"called. no answer." },
      { date:"2026-01-19", user:"M.Williams", outcome:"resubmitted", text:"called. payer requested EOB." },
      { date:"2026-02-25", user:"J.Smith", outcome:"in_adjudication", text:"called. out of timely filing window per payer." },
      { date:"2026-04-09", user:"J.Smith", outcome:"in_adjudication", text:"physician query sent re documentation." }
  ],
  "AR-014": [
      { date:"2026-04-02", user:"S.Chen", outcome:"escalated", text:"credentialing team notified." },
      { date:"2026-05-13", user:"J.Smith", outcome:"appeal_filed", text:"called. denied CO-4. need to appeal." }
  ],
  "AR-015": [
      { date:"2026-03-12", user:"J.Smith", outcome:"needs_documentation", text:"escalated to clinical denials." },
      { date:"2026-04-23", user:"K.Brown", outcome:"appeal_filed", text:"called. in adjudication. est 30 days." },
      { date:"2026-05-10", user:"J.Smith", outcome:"resubmitted", text:"appeal filed. waiting response." }
  ],
  "AR-016": [
      { date:"2026-01-29", user:"J.Smith", outcome:"needs_documentation", text:"charge capture alerted." },
      { date:"2026-05-02", user:"R.Garcia", outcome:"coding_assigned", text:"called. denied CO-97. need to appeal." },
      { date:"2026-05-05", user:"K.Brown", outcome:"resubmitted", text:"appeal filed. waiting response." }
  ],
  "AR-017": [
      { date:"2025-12-12", user:"T.Jones", outcome:"promised_payment", text:"called. in adjudication. est 30 days." },
      { date:"2026-03-16", user:"T.Jones", outcome:"in_adjudication", text:"called. left vm." }
  ],
  "AR-018": [
      { date:"2025-12-15", user:"J.Smith", outcome:"escalated", text:"called. no answer." },
      { date:"2026-01-06", user:"S.Chen", outcome:"left_voicemail", text:"appeal filed. waiting response." },
      { date:"2026-01-17", user:"M.Williams", outcome:"escalated", text:"resubmitted with modifier." },
      { date:"2026-01-20", user:"K.Brown", outcome:"appeal_filed", text:"called. out of timely filing window per payer." },
      { date:"2026-02-22", user:"T.Jones", outcome:"left_voicemail", text:"physician query sent re documentation." },
      { date:"2026-04-26", user:"S.Chen", outcome:"physician_query", text:"credentialing team notified." },
      { date:"2026-04-28", user:"M.Williams", outcome:"escalated", text:"resubmitted with modifier." }
  ],
  "AR-019": [
      { date:"2025-11-29", user:"T.Jones", outcome:"physician_query", text:"charge capture alerted." },
      { date:"2025-12-13", user:"K.Brown", outcome:"resubmitted", text:"called. no answer." },
      { date:"2026-01-23", user:"T.Jones", outcome:"resubmitted", text:"escalated to clinical denials." },
      { date:"2026-02-09", user:"R.Garcia", outcome:"resubmitted", text:"called. out of timely filing window per payer." },
      { date:"2026-03-04", user:"T.Jones", outcome:"resubmitted", text:"called. rep said claim processing. ref #95497090876." },
      { date:"2026-04-25", user:"M.Williams", outcome:"escalated", text:"physician query sent re documentation." },
      { date:"2026-04-29", user:"K.Brown", outcome:"needs_documentation", text:"called. payer requested EOB." }
  ],
  "AR-020": [
      { date:"2025-11-23", user:"M.Williams", outcome:"promised_payment", text:"charge capture alerted." },
      { date:"2026-01-11", user:"J.Smith", outcome:"escalated", text:"called. denied CO-4. need to appeal." },
      { date:"2026-02-08", user:"K.Brown", outcome:"physician_query", text:"called. in adjudication. est 30 days." },
      { date:"2026-04-03", user:"R.Garcia", outcome:"resubmitted", text:"charge capture alerted." },
      { date:"2026-04-20", user:"K.Brown", outcome:"coding_assigned", text:"escalated to clinical denials." },
      { date:"2026-04-22", user:"S.Chen", outcome:"resubmitted", text:"credentialing team notified." },
      { date:"2026-05-06", user:"T.Jones", outcome:"physician_query", text:"credentialing team notified." },
      { date:"2026-05-11", user:"T.Jones", outcome:"resubmitted", text:"called. payer requested EOB." }
  ],
  "AR-021": [
      { date:"2026-03-09", user:"T.Jones", outcome:"physician_query", text:"appeal filed. waiting response." },
      { date:"2026-03-29", user:"K.Brown", outcome:"coding_assigned", text:"escalated to clinical denials." },
      { date:"2026-04-28", user:"K.Brown", outcome:"promised_payment", text:"payer confirmed receipt. ref #15368722928." },
      { date:"2026-04-30", user:"R.Garcia", outcome:"coding_assigned", text:"called. rep said claim processing. ref #45048274619." }
  ],
  "AR-022": [
      { date:"2026-02-14", user:"J.Smith", outcome:"no_response", text:"resubmitted with modifier." },
      { date:"2026-03-29", user:"T.Jones", outcome:"left_voicemail", text:"called. denied CO-50. need to appeal." },
      { date:"2026-04-05", user:"M.Williams", outcome:"in_adjudication", text:"called. out of timely filing window per payer." },
      { date:"2026-04-28", user:"K.Brown", outcome:"in_adjudication", text:"called. no answer." }
  ],
  "AR-023": [
      { date:"2026-01-18", user:"S.Chen", outcome:"coding_assigned", text:"called. left vm." },
      { date:"2026-03-02", user:"M.Williams", outcome:"appeal_filed", text:"appeal filed. waiting response." },
      { date:"2026-04-14", user:"K.Brown", outcome:"physician_query", text:"called. no answer." },
      { date:"2026-05-11", user:"T.Jones", outcome:"in_adjudication", text:"credentialing team notified." }
  ],
  "AR-024": [
      { date:"2026-05-04", user:"M.Williams", outcome:"no_response", text:"called. rep said claim processing. ref #13209700340." }
  ],
  "AR-027": [
      { date:"2026-04-09", user:"M.Williams", outcome:"no_response", text:"called. payer requested EOB." }
  ],
  "AR-028": [
      { date:"2026-03-10", user:"K.Brown", outcome:"needs_documentation", text:"called. rep said claim processing. ref #22030839426." },
      { date:"2026-05-05", user:"S.Chen", outcome:"escalated", text:"appeal filed. waiting response." }
  ],
  "AR-029": [
      { date:"2026-03-31", user:"M.Williams", outcome:"left_voicemail", text:"physician query sent re documentation." },
      { date:"2026-04-24", user:"R.Garcia", outcome:"left_voicemail", text:"charge capture alerted." },
      { date:"2026-05-06", user:"M.Williams", outcome:"coding_assigned", text:"credentialing team notified." }
  ],
  "AR-030": [
      { date:"2025-12-01", user:"S.Chen", outcome:"left_voicemail", text:"called. payer requested EOB." },
      { date:"2025-12-12", user:"M.Williams", outcome:"resubmitted", text:"called. in adjudication. est 30 days." },
      { date:"2026-01-22", user:"T.Jones", outcome:"coding_assigned", text:"coding supervisor escalated." }
  ],
  "AR-031": [
      { date:"2026-05-08", user:"K.Brown", outcome:"promised_payment", text:"called. rep said claim processing. ref #47688185477." }
  ],
  "AR-032": [
      { date:"2026-05-10", user:"S.Chen", outcome:"escalated", text:"coding supervisor escalated." }
  ],
  "AR-033": [
      { date:"2026-03-26", user:"S.Chen", outcome:"physician_query", text:"resubmitted with modifier." }
  ],
  "AR-034": [
      { date:"2026-04-29", user:"S.Chen", outcome:"no_response", text:"appeal filed. waiting response." }
  ],
  "AR-035": [
      { date:"2026-04-06", user:"M.Williams", outcome:"appeal_filed", text:"called. rep said claim processing. ref #32182033264." },
      { date:"2026-04-12", user:"J.Smith", outcome:"coding_assigned", text:"appeal filed. waiting response." }
  ],
  "AR-036": [
      { date:"2026-01-08", user:"M.Williams", outcome:"escalated", text:"called. out of timely filing window per payer." },
      { date:"2026-01-12", user:"M.Williams", outcome:"promised_payment", text:"called. denied CO-97. need to appeal." },
      { date:"2026-02-18", user:"J.Smith", outcome:"left_voicemail", text:"payer confirmed receipt. ref #91277659280." },
      { date:"2026-03-23", user:"S.Chen", outcome:"left_voicemail", text:"coding supervisor escalated." },
      { date:"2026-04-06", user:"K.Brown", outcome:"physician_query", text:"called. in adjudication. est 30 days." },
      { date:"2026-04-22", user:"S.Chen", outcome:"physician_query", text:"escalated to clinical denials." },
      { date:"2026-04-25", user:"S.Chen", outcome:"escalated", text:"called. no answer." },
      { date:"2026-04-27", user:"R.Garcia", outcome:"needs_documentation", text:"charge capture alerted." }
  ],
  "AR-039": [
      { date:"2026-03-13", user:"M.Williams", outcome:"promised_payment", text:"escalated to clinical denials." }
  ],
  "AR-043": [
      { date:"2025-12-12", user:"J.Smith", outcome:"left_voicemail", text:"escalated to clinical denials." },
      { date:"2026-01-19", user:"M.Williams", outcome:"physician_query", text:"called. in adjudication. est 30 days." },
      { date:"2026-02-18", user:"T.Jones", outcome:"appeal_filed", text:"escalated to clinical denials." },
      { date:"2026-02-23", user:"S.Chen", outcome:"resubmitted", text:"called. in adjudication. est 30 days." },
      { date:"2026-05-06", user:"R.Garcia", outcome:"coding_assigned", text:"called. in adjudication. est 30 days." }
  ],
  "AR-044": [
      { date:"2026-02-12", user:"T.Jones", outcome:"coding_assigned", text:"called. no answer." },
      { date:"2026-02-24", user:"T.Jones", outcome:"appeal_filed", text:"charge capture alerted." },
      { date:"2026-04-06", user:"S.Chen", outcome:"promised_payment", text:"coding supervisor escalated." },
      { date:"2026-04-12", user:"S.Chen", outcome:"appeal_filed", text:"credentialing team notified." }
  ],
  "AR-045": [
      { date:"2026-02-26", user:"S.Chen", outcome:"escalated", text:"resubmitted with modifier." },
      { date:"2026-03-07", user:"K.Brown", outcome:"escalated", text:"called. payer requested EOB." },
      { date:"2026-03-09", user:"S.Chen", outcome:"resubmitted", text:"appeal filed. waiting response." },
      { date:"2026-03-10", user:"K.Brown", outcome:"promised_payment", text:"called. denied CO-50. need to appeal." },
      { date:"2026-04-19", user:"K.Brown", outcome:"in_adjudication", text:"appeal filed. waiting response." }
  ],
  "AR-046": [
      { date:"2026-04-09", user:"R.Garcia", outcome:"resubmitted", text:"called. left vm." },
      { date:"2026-04-27", user:"K.Brown", outcome:"no_response", text:"called. rep said claim processing. ref #48835379845." }
  ],
  "AR-048": [
      { date:"2026-01-13", user:"M.Williams", outcome:"escalated", text:"credentialing team notified." },
      { date:"2026-02-20", user:"K.Brown", outcome:"in_adjudication", text:"charge capture alerted." },
      { date:"2026-03-17", user:"R.Garcia", outcome:"in_adjudication", text:"escalated to clinical denials." },
      { date:"2026-04-30", user:"K.Brown", outcome:"physician_query", text:"called. out of timely filing window per payer." },
      { date:"2026-05-06", user:"K.Brown", outcome:"escalated", text:"payer confirmed receipt. ref #33602494123." },
      { date:"2026-05-14", user:"K.Brown", outcome:"promised_payment", text:"escalated to clinical denials." }
  ],
  "AR-049": [
      { date:"2026-04-17", user:"R.Garcia", outcome:"escalated", text:"called. in adjudication. est 30 days." }
  ],
  "AR-050": [
      { date:"2026-01-26", user:"R.Garcia", outcome:"no_response", text:"escalated to clinical denials." },
      { date:"2026-02-27", user:"J.Smith", outcome:"escalated", text:"physician query sent re documentation." },
      { date:"2026-03-01", user:"S.Chen", outcome:"needs_documentation", text:"physician query sent re documentation." },
      { date:"2026-03-10", user:"M.Williams", outcome:"resubmitted", text:"appeal filed. waiting response." },
      { date:"2026-03-29", user:"T.Jones", outcome:"left_voicemail", text:"called. in adjudication. est 30 days." }
  ],
  "AR-051": [
      { date:"2026-04-17", user:"R.Garcia", outcome:"physician_query", text:"called. in adjudication. est 30 days." },
      { date:"2026-04-30", user:"S.Chen", outcome:"appeal_filed", text:"credentialing team notified." }
  ],
  "AR-052": [
      { date:"2026-01-01", user:"S.Chen", outcome:"no_response", text:"resubmitted with modifier." }
  ],
  "AR-053": [
      { date:"2026-01-21", user:"T.Jones", outcome:"coding_assigned", text:"coding supervisor escalated." },
      { date:"2026-01-29", user:"S.Chen", outcome:"promised_payment", text:"resubmitted with modifier." },
      { date:"2026-02-26", user:"M.Williams", outcome:"left_voicemail", text:"charge capture alerted." },
      { date:"2026-03-21", user:"R.Garcia", outcome:"resubmitted", text:"physician query sent re documentation." },
      { date:"2026-04-16", user:"J.Smith", outcome:"coding_assigned", text:"credentialing team notified." },
      { date:"2026-04-29", user:"J.Smith", outcome:"promised_payment", text:"escalated to clinical denials." },
      { date:"2026-05-07", user:"T.Jones", outcome:"needs_documentation", text:"called. rep said claim processing. ref #33230906602." }
  ],
  "AR-054": [
      { date:"2026-04-29", user:"K.Brown", outcome:"coding_assigned", text:"called. in adjudication. est 30 days." }
  ],
  "AR-058": [
      { date:"2026-01-30", user:"S.Chen", outcome:"physician_query", text:"called. rep said claim processing. ref #15476744406." },
      { date:"2026-04-01", user:"S.Chen", outcome:"promised_payment", text:"credentialing team notified." },
      { date:"2026-05-03", user:"K.Brown", outcome:"needs_documentation", text:"called. payer requested EOB." }
  ],
  "AR-059": [
      { date:"2026-04-17", user:"R.Garcia", outcome:"needs_documentation", text:"called. rep said claim processing. ref #83261936957." }
  ],
  "AR-060": [
      { date:"2026-05-10", user:"M.Williams", outcome:"needs_documentation", text:"escalated to clinical denials." }
  ],
  "AR-061": [
      { date:"2025-11-30", user:"M.Williams", outcome:"coding_assigned", text:"called. payer requested EOB." },
      { date:"2026-01-13", user:"T.Jones", outcome:"coding_assigned", text:"called. out of timely filing window per payer." },
      { date:"2026-02-22", user:"R.Garcia", outcome:"coding_assigned", text:"coding supervisor escalated." },
      { date:"2026-05-12", user:"K.Brown", outcome:"no_response", text:"called. denied CO-50. need to appeal." }
  ],
  "AR-062": [
      { date:"2026-03-21", user:"J.Smith", outcome:"escalated", text:"called. denied CO-4. need to appeal." },
      { date:"2026-04-10", user:"K.Brown", outcome:"needs_documentation", text:"called. out of timely filing window per payer." }
  ],
  "AR-063": [
      { date:"2026-02-19", user:"R.Garcia", outcome:"in_adjudication", text:"called. no answer." },
      { date:"2026-02-24", user:"T.Jones", outcome:"coding_assigned", text:"called. denied CO-4. need to appeal." },
      { date:"2026-03-14", user:"J.Smith", outcome:"no_response", text:"called. in adjudication. est 30 days." },
      { date:"2026-03-18", user:"T.Jones", outcome:"coding_assigned", text:"called. in adjudication. est 30 days." },
      { date:"2026-04-02", user:"K.Brown", outcome:"promised_payment", text:"called. rep said claim processing. ref #99007003643." }
  ],
  "AR-064": [
      { date:"2025-11-29", user:"R.Garcia", outcome:"needs_documentation", text:"payer confirmed receipt. ref #18726018516." },
      { date:"2025-12-25", user:"S.Chen", outcome:"escalated", text:"appeal filed. waiting response." },
      { date:"2025-12-29", user:"K.Brown", outcome:"needs_documentation", text:"called. rep said claim processing. ref #78793103630." },
      { date:"2026-01-18", user:"M.Williams", outcome:"no_response", text:"physician query sent re documentation." },
      { date:"2026-02-08", user:"K.Brown", outcome:"left_voicemail", text:"escalated to clinical denials." },
      { date:"2026-03-08", user:"M.Williams", outcome:"needs_documentation", text:"coding supervisor escalated." },
      { date:"2026-03-15", user:"M.Williams", outcome:"resubmitted", text:"called. denied CO-4. need to appeal." },
      { date:"2026-03-31", user:"S.Chen", outcome:"in_adjudication", text:"called. left vm." }
  ],
  "AR-067": [
      { date:"2026-04-30", user:"M.Williams", outcome:"needs_documentation", text:"physician query sent re documentation." },
      { date:"2026-05-07", user:"S.Chen", outcome:"resubmitted", text:"coding supervisor escalated." }
  ],
  "AR-068": [
      { date:"2026-03-19", user:"S.Chen", outcome:"needs_documentation", text:"resubmitted with modifier." },
      { date:"2026-03-21", user:"K.Brown", outcome:"needs_documentation", text:"called. in adjudication. est 30 days." }
  ],
  "AR-069": [
      { date:"2026-03-20", user:"J.Smith", outcome:"in_adjudication", text:"called. payer requested EOB." },
      { date:"2026-04-05", user:"J.Smith", outcome:"escalated", text:"called. payer requested EOB." },
      { date:"2026-05-04", user:"S.Chen", outcome:"coding_assigned", text:"called. in adjudication. est 30 days." }
  ],
  "AR-070": [
      { date:"2026-04-14", user:"K.Brown", outcome:"needs_documentation", text:"physician query sent re documentation." },
      { date:"2026-04-24", user:"M.Williams", outcome:"promised_payment", text:"called. in adjudication. est 30 days." },
      { date:"2026-05-14", user:"J.Smith", outcome:"coding_assigned", text:"called. rep said claim processing. ref #63316908259." }
  ],
  "AR-071": [
      { date:"2026-02-26", user:"T.Jones", outcome:"escalated", text:"called. denied CO-4. need to appeal." },
      { date:"2026-04-13", user:"R.Garcia", outcome:"physician_query", text:"called. denied CO-4. need to appeal." }
  ],
  "AR-072": [
      { date:"2026-02-28", user:"R.Garcia", outcome:"resubmitted", text:"called. payer requested EOB." },
      { date:"2026-03-31", user:"M.Williams", outcome:"promised_payment", text:"appeal filed. waiting response." }
  ],
  "AR-073": [
      { date:"2026-02-17", user:"K.Brown", outcome:"promised_payment", text:"coding supervisor escalated." }
  ],
  "AR-074": [
      { date:"2025-12-27", user:"K.Brown", outcome:"no_response", text:"called. no answer." },
      { date:"2026-01-13", user:"S.Chen", outcome:"needs_documentation", text:"physician query sent re documentation." },
      { date:"2026-03-12", user:"R.Garcia", outcome:"physician_query", text:"credentialing team notified." }
  ],
  "AR-075": [
      { date:"2026-05-13", user:"S.Chen", outcome:"coding_assigned", text:"called. left vm." }
  ],
  "AR-077": [
      { date:"2026-03-15", user:"R.Garcia", outcome:"promised_payment", text:"called. payer requested EOB." },
      { date:"2026-04-05", user:"K.Brown", outcome:"no_response", text:"called. left vm." },
      { date:"2026-04-14", user:"T.Jones", outcome:"resubmitted", text:"escalated to clinical denials." },
      { date:"2026-05-13", user:"J.Smith", outcome:"in_adjudication", text:"payer confirmed receipt. ref #97372854493." }
  ],
  "AR-078": [
      { date:"2025-12-14", user:"S.Chen", outcome:"no_response", text:"appeal filed. waiting response." },
      { date:"2025-12-15", user:"K.Brown", outcome:"appeal_filed", text:"appeal filed. waiting response." },
      { date:"2026-02-03", user:"T.Jones", outcome:"promised_payment", text:"called. no answer." },
      { date:"2026-03-09", user:"S.Chen", outcome:"resubmitted", text:"credentialing team notified." },
      { date:"2026-03-24", user:"J.Smith", outcome:"coding_assigned", text:"called. rep said claim processing. ref #87578120578." },
      { date:"2026-03-29", user:"R.Garcia", outcome:"no_response", text:"called. payer requested EOB." }
  ],
  "AR-079": [
      { date:"2026-02-09", user:"R.Garcia", outcome:"needs_documentation", text:"charge capture alerted." },
      { date:"2026-02-24", user:"J.Smith", outcome:"in_adjudication", text:"called. left vm." }
  ],
  "AR-080": [
      { date:"2026-01-06", user:"K.Brown", outcome:"promised_payment", text:"credentialing team notified." },
      { date:"2026-01-29", user:"R.Garcia", outcome:"in_adjudication", text:"charge capture alerted." },
      { date:"2026-04-10", user:"J.Smith", outcome:"resubmitted", text:"called. in adjudication. est 30 days." },
      { date:"2026-05-13", user:"R.Garcia", outcome:"coding_assigned", text:"resubmitted with modifier." }
  ],
  "AR-081": [
      { date:"2026-03-06", user:"J.Smith", outcome:"escalated", text:"escalated to clinical denials." },
      { date:"2026-03-07", user:"S.Chen", outcome:"left_voicemail", text:"payer confirmed receipt. ref #61500495937." },
      { date:"2026-03-20", user:"K.Brown", outcome:"appeal_filed", text:"escalated to clinical denials." }
  ],
  "AR-083": [
      { date:"2025-11-29", user:"T.Jones", outcome:"resubmitted", text:"called. in adjudication. est 30 days." },
      { date:"2025-12-30", user:"T.Jones", outcome:"resubmitted", text:"called. rep said claim processing. ref #85577928274." },
      { date:"2026-03-02", user:"S.Chen", outcome:"no_response", text:"called. rep said claim processing. ref #46819618962." },
      { date:"2026-03-13", user:"T.Jones", outcome:"physician_query", text:"coding supervisor escalated." },
      { date:"2026-04-11", user:"J.Smith", outcome:"escalated", text:"coding supervisor escalated." }
  ],
  "AR-084": [
      { date:"2025-12-04", user:"J.Smith", outcome:"coding_assigned", text:"credentialing team notified." },
      { date:"2026-02-03", user:"T.Jones", outcome:"promised_payment", text:"called. denied CO-4. need to appeal." },
      { date:"2026-02-10", user:"M.Williams", outcome:"physician_query", text:"resubmitted with modifier." },
      { date:"2026-05-15", user:"K.Brown", outcome:"promised_payment", text:"payer confirmed receipt. ref #21736960320." }
  ],
  "AR-087": [
      { date:"2026-01-26", user:"T.Jones", outcome:"promised_payment", text:"credentialing team notified." },
      { date:"2026-05-02", user:"K.Brown", outcome:"appeal_filed", text:"appeal filed. waiting response." }
  ],
  "AR-089": [
      { date:"2026-02-22", user:"S.Chen", outcome:"physician_query", text:"credentialing team notified." },
      { date:"2026-03-29", user:"R.Garcia", outcome:"in_adjudication", text:"called. out of timely filing window per payer." }
  ],
  "AR-090": [
      { date:"2025-11-28", user:"S.Chen", outcome:"physician_query", text:"called. out of timely filing window per payer." },
      { date:"2025-12-16", user:"R.Garcia", outcome:"resubmitted", text:"charge capture alerted." },
      { date:"2025-12-25", user:"K.Brown", outcome:"left_voicemail", text:"physician query sent re documentation." },
      { date:"2026-01-05", user:"M.Williams", outcome:"left_voicemail", text:"called. denied CO-4. need to appeal." },
      { date:"2026-03-15", user:"T.Jones", outcome:"promised_payment", text:"resubmitted with modifier." },
      { date:"2026-03-21", user:"T.Jones", outcome:"no_response", text:"called. left vm." },
      { date:"2026-04-10", user:"J.Smith", outcome:"appeal_filed", text:"called. denied CO-4. need to appeal." }
  ],
  "AR-091": [
      { date:"2026-02-07", user:"J.Smith", outcome:"physician_query", text:"resubmitted with modifier." }
  ],
  "AR-092": [
      { date:"2026-05-02", user:"K.Brown", outcome:"coding_assigned", text:"charge capture alerted." }
  ],
  "AR-093": [
      { date:"2026-05-03", user:"K.Brown", outcome:"no_response", text:"physician query sent re documentation." }
  ],
  "AR-095": [
      { date:"2025-12-06", user:"S.Chen", outcome:"resubmitted", text:"called. left vm." },
      { date:"2026-01-03", user:"M.Williams", outcome:"in_adjudication", text:"coding supervisor escalated." },
      { date:"2026-01-26", user:"M.Williams", outcome:"physician_query", text:"called. rep said claim processing. ref #20839871323." },
      { date:"2026-03-08", user:"J.Smith", outcome:"resubmitted", text:"charge capture alerted." },
      { date:"2026-03-14", user:"R.Garcia", outcome:"in_adjudication", text:"called. no answer." },
      { date:"2026-03-18", user:"J.Smith", outcome:"left_voicemail", text:"charge capture alerted." },
      { date:"2026-04-05", user:"S.Chen", outcome:"no_response", text:"called. rep said claim processing. ref #26206324472." },
      { date:"2026-05-01", user:"T.Jones", outcome:"resubmitted", text:"resubmitted with modifier." }
  ],
  "AR-097": [
      { date:"2026-03-27", user:"J.Smith", outcome:"coding_assigned", text:"payer confirmed receipt. ref #54284109746." },
      { date:"2026-04-16", user:"M.Williams", outcome:"physician_query", text:"called. no answer." }
  ],
  "AR-099": [
      { date:"2025-12-18", user:"K.Brown", outcome:"needs_documentation", text:"called. left vm." },
      { date:"2026-01-02", user:"K.Brown", outcome:"no_response", text:"appeal filed. waiting response." },
      { date:"2026-01-10", user:"J.Smith", outcome:"appeal_filed", text:"called. no answer." },
      { date:"2026-02-26", user:"T.Jones", outcome:"needs_documentation", text:"called. left vm." },
      { date:"2026-03-16", user:"K.Brown", outcome:"resubmitted", text:"called. rep said claim processing. ref #64979089627." },
      { date:"2026-04-26", user:"R.Garcia", outcome:"in_adjudication", text:"physician query sent re documentation." }
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
      const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    const prompt = `You are a healthcare revenue cycle documentation specialist. Convert the following scratch notes into a single professional work note for posting to an EHR account record.

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
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 300, messages: [{ role: "user", content: prompt }] })
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

function CollectorAccountCard({ acc, onLog }) {
  const [approved, setApproved] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [overrideAction, setOverrideAction] = useState(null);
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
            <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 3 }}>{acc.patient}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{acc.id} · {acc.site} · {acc.vertical} · {acc.payer}</div>
            <div style={{ fontSize: 12, color: "#475569" }}>{acc.cfg.label}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            <ProbCircle prob={acc.prob} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>Expected value</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#2563eb", letterSpacing: "-0.02em" }}>{fmt(acc.expectedValue)}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{fmt(acc.amount)} balance</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{acc.daysOut} days out</div>
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
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setApproved(true)} style={{ flex: 1, padding: "9px 20px", background: "#2563eb", border: "1px solid #2563eb", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                  Approve action
                </button>
                <button onClick={() => setOverriding(true)} style={{ padding: "9px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                  Override
                </button>
              </div>
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
  const [noteReady, setNoteReady] = useState(null);
  const sev = SEV[acc.cfg.severity];

  const handleLog = () => { if (outcome && noteReady !== null) setLogged(true); };

  return (
    <div style={{ background: logged ? "#f0fdf4" : "#fff", border: `1px solid ${logged ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "14px 18px", cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 16, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 600, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, padding: "1px 7px", borderRadius: 4 }}>{acc.cfg.severity}</span>
            <span style={{ fontSize: 10, fontWeight: 600, background: acc.cfg.color + "12", color: acc.cfg.color, border: `1px solid ${acc.cfg.color}30`, padding: "1px 7px", borderRadius: 4 }}>{acc.area === 'Collections' ? acc.cfg.label.split(' — ')[0].toUpperCase() : acc.area.toUpperCase()}</span>
            {logged && <span style={{ fontSize: 10, fontWeight: 600, background: "#dcfce7", color: "#16a34a", border: "1px solid #bbf7d0", padding: "1px 7px", borderRadius: 4 }}>✓ LOGGED</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.patient}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{acc.id} · {acc.site} · {acc.vertical} · {acc.payer}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{acc.cfg.label}</div>
        </div>
        <ProbCircle prob={acc.prob} />
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


function EscalationQueue({ arScored, dnfbScored }) {
  const [section, setSection] = useState("escalated");
  const [dismissed, setDismissed] = useState({});

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

  const escCard = (e) => (
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
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <button onClick={() => setDismissed(p => ({...p, [e.accountId+"_resolve"]: true}))} style={{ padding: "7px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, color: "#16a34a", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
            {dismissed[e.accountId+"_resolve"] ? "✓ Resolved" : "Resolve"}
          </button>
          <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Reassign</button>
        </div>
      </div>
    </div>
  );

  const slaCard = (s) => (
    <div key={s.accountId} style={{ background: "#fff", border: "1px solid #fed7aa", borderLeft: "3px solid #f97316", borderRadius: 8, padding: "14px 18px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 3 }}>{s.patient}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{s.accountId} · {s.payer} · {fmt(s.amount)}</div>
          <div style={{ fontSize: 11, color: "#c2410c", marginTop: 4 }}>Scheduled {s.scheduledDate} — <strong>{s.daysOverdue} days overdue</strong> · Assigned to {s.assignedTo}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setDismissed(p => ({...p, [s.accountId+"_ack"]: true}))} style={{ padding: "7px 14px", background: dismissed[s.accountId+"_ack"] ? "#f0fdf4" : "#fff7ed", border: `1px solid ${dismissed[s.accountId+"_ack"] ? "#86efac" : "#fed7aa"}`, borderRadius: 6, color: dismissed[s.accountId+"_ack"] ? "#16a34a" : "#c2410c", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
            {dismissed[s.accountId+"_ack"] ? "✓ Acknowledged" : "Acknowledge"}
          </button>
          <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Reassign</button>
        </div>
      </div>
    </div>
  );

  const writeOffCard = (w) => (
    <div key={w.accountId} style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: "3px solid #64748b", borderRadius: 8, padding: "14px 18px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 2 }}>{w.patient}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{w.accountId} · {w.payer} · {fmt(w.amount)}</div>
          <div style={{ fontSize: 11, color: "#475569", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 6, padding: "7px 10px" }}>{w.rationale}</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Recommended by {w.recommendedBy} · {w.recommendedAt}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <button onClick={() => setDismissed(p => ({...p, [w.accountId+"_approve"]: true}))} style={{ padding: "7px 14px", background: dismissed[w.accountId+"_approve"] ? "#f1f5f9" : "#eff6ff", border: `1px solid ${dismissed[w.accountId+"_approve"] ? "#e2e8f0" : "#bfdbfe"}`, borderRadius: 6, color: dismissed[w.accountId+"_approve"] ? "#94a3b8" : "#2563eb", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
            {dismissed[w.accountId+"_approve"] ? "↗ Sent to CFO" : "Approve to CFO"}
          </button>
          <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Return to biller</button>
        </div>
      </div>
    </div>
  );

  const overrideCard = (o) => (
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
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <button onClick={() => setDismissed(p => ({...p, [o.accountId+"_ack"]: true}))} style={{ padding: "7px 14px", background: dismissed[o.accountId+"_ack"] ? "#f0fdf4" : "#fff", border: `1px solid ${dismissed[o.accountId+"_ack"] ? "#86efac" : "#e2e8f0"}`, borderRadius: 6, color: dismissed[o.accountId+"_ack"] ? "#16a34a" : "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
            {dismissed[o.accountId+"_ack"] ? "✓ Acknowledged" : "Acknowledge"}
          </button>
          <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Flag for coaching</button>
        </div>
      </div>
    </div>
  );

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

export default function WIPPlatform() {
  const [tab, setTab] = useState("dnfb");
  const [role, setRole] = useState("commercial_collector");
  const [areaFilter, setAreaFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

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

  const current = tab === "dnfb" ? dnfbForRole : arForRole;

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
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }) });
      const data = await res.json();
      setAiText(data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "Analysis unavailable.");
    } catch { setAiText("AI analysis temporarily unavailable."); }
    setAiLoading(false);
  };

  const seg = (label, val) => (
    <button onClick={() => { setRole(val); setAiText(""); setSearchQuery(""); setAreaFilter(null); }} style={{ padding: "6px 14px", cursor: "pointer", fontSize: 11, fontWeight: role === val ? 600 : 400, border: "none", borderRadius: 6, fontFamily: "inherit", background: role === val ? "#2563eb" : "transparent", color: role === val ? "#fff" : "#64748b" }}>{label}</button>
  );

  const tabStyle = active => ({ padding: "12px 20px", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, border: "none", borderBottom: active ? "2px solid #2563eb" : "2px solid transparent", background: "transparent", color: active ? "#2563eb" : "#64748b", fontFamily: "inherit" });

  const isCollectorMode = roleConfig?.mode === "collector" || roleConfig?.mode === "medicare_bc";
  if (isCollectorMode) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>D4 Consulting Group</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>WIP Intelligence Platform <span style={{ fontSize: 11, color: "#2563eb", marginLeft: 6 }}>v2.0</span></div>
          </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center" }}>Collectors & Billers</div>
              <div style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
                {seg("Commercial", "commercial_collector")}
                {seg("Medicare B/C", "medicare_bc")}
                {seg("Medicaid", "medicaid")}
                {seg("WC", "wc")}
                {seg("Biller", "biller")}
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
          {roleConfig.paneLabel && (
            <div style={{ fontSize: 10, color: "#94a3b8" }}>
              <span style={{ color: "#2563eb", fontWeight: 500 }}>{roleConfig.label}</span> — {roleConfig.paneLabel}
            </div>
          )}
        </div>
        </div>
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "10px 32px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>{roleConfig?.label} — {roleConfig?.mode === "medicare_bc" ? "Unified DNFB + AR" : "Collections Queue"}</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>· {arForRole.length} accounts · sorted by expected value</span>
        </div>
        <CollectorView arScored={arForRole} dnfbScored={dnfbForRole} isMedicareBc={roleConfig?.mode === "medicare_bc"} />
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
          <button style={tabStyle(tab === "dnfb")} onClick={() => { setTab("dnfb"); setAreaFilter(null); setSearchQuery(""); setAiText(""); }}>DNFB — Unbilled ({dnfbForRole.length})</button>
          <button style={tabStyle(tab === "ar")} onClick={() => { setTab("ar"); setAreaFilter(null); setSearchQuery(""); setAiText(""); }}>Collections Queue ({arForRole.length})</button>
          {role === "supervisor" && (
            <button style={{...tabStyle(tab === "escalation"), color: tab === "escalation" ? "#dc2626" : "#64748b", borderBottomColor: tab === "escalation" ? "#dc2626" : "transparent"}} onClick={() => { setTab("escalation"); setAreaFilter(null); setSearchQuery(""); }}>
              Escalation Queue <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700, marginLeft: 4 }}>{ESCALATION_DATA.escalated.length + ESCALATION_DATA.slaBreach.length}</span>
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ fontSize: 10, color: "#94a3b8" }}>LIVE</span>
        </div>
      </div>

      {tab === "escalation" && role === "supervisor" && (
        <EscalationQueue arScored={arForRole} dnfbScored={dnfbForRole} />
      )}
      {tab !== "escalation" && ( 
        <div style={{ padding: "24px 32px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            <MetricCard label="Total WIP" value={fmt(totalWIP)} sub={`${current.length} accounts`} />
            <MetricCard label="Expected recovery" value={fmt(totalEV)} sub={`${Math.round(totalEV/totalWIP*100)}% collection rate`} accent="#2563eb" />
            <MetricCard label="Critical holds" value={critCount} sub="require immediate action" accent="#b91c1c" />
          </div>
        </div>
      )}

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

        {(role === "supervisor" || role === "cfo" || role === "biller") && <AreaChart accounts={current} onFilter={setAreaFilter} activeFilter={areaFilter} />}

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
