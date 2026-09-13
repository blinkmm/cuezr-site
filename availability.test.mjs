// Run with:  node availability.test.mjs      (needs `npm install node-ical`)
//
// Cases are drawn from the live Work calendar, not invented. The two that
// matter most are the ones that were wrong before: "Hold for Great Games
// Challenge" is confirmed work rather than a soft hold, and "CFL 100th
// Anniversary" is a show rather than an admin entry.

import { buildAvailability, isTentative, isNonShow } from "./netlify/functions/availability.mjs";

// Regressions from real entries in the live calendar.
const marker = [
  ["HOLD: PLK US+C Rehearsals",            true ],
  ["HOLD - Client Name",                   true ],
  ["[HOLD] Client Name",                   true ],
  ["TENTATIVE: Client Name",               true ],
  ["Hold for Great Games Challenge",       false],  // confirmed work
  ["Hold for load-in at 4",                false],
];
const admin = [
  ["CRA - Deadline",                       true ],
  ["F1 ticket renew deadline",             true ],
  ["CFL 100th Anniversary",                false],  // this is a show
  ["NHL Follow up/Recap",                  false],
];
let mbad = 0;
for (const [t, want] of marker) {
  const got = isTentative({ summary: t });
  if (got !== want) { mbad++; console.log(`FAIL  hold marker: "${t}" -> ${got}, want ${want}`); }
}
for (const [t, want] of admin) {
  const got = isNonShow({ summary: t });
  if (got !== want) { mbad++; console.log(`FAIL  admin: "${t}" -> ${got}, want ${want}`); }
}
console.log(mbad ? `${mbad} marker tests FAILING\n` : `title markers: ${marker.length + admin.length}/${marker.length + admin.length} pass\n`);

const D = (s) => new Date(s + "T00:00:00Z");
const ev = (summary, from, toExcl, opts = {}) => ({
  type: "VEVENT", datetype: "date", summary,
  location: opts.loc || "", start: D(from), end: D(toExcl), ...opts,
});

const NOW = new Date("2026-09-12T12:00:00Z");
const parsed = {
  a: ev("Solepower show", "2026-10-05", "2026-10-06"),                  // local
  b: ev("CISC - Vancouver", "2026-11-01", "2026-11-06"),                // travel + buffer
  c: ev("HOLD - Acme Corp", "2026-10-20", "2026-10-23"),                // hold
  d: ev("[HOLD] Beta Inc", "2026-10-05", "2026-10-06"),                 // hold UNDER the local show
  e: ev("Deadline for content", "2026-10-09", "2026-10-10"),            // admin -> ignored
  f: { type:"VEVENT", datetype:"date-time", summary:"Flight: AC1701",
       start:new Date("2026-10-12T14:00:00Z"), end:new Date("2026-10-12T18:00:00Z") },
  g: ev("TENTATIVE: Away job - Boston", "2026-12-01", "2026-12-03"),    // hold, travel city
};

const { result, diagnostics } = buildAvailability(parsed, NOW);
const d = result.days;
const show = (k) => `${k} -> ${d[k] || "open"}`;

const checks = [
  ["local show blocks its day",        show("2026-10-05"), "2026-10-05 -> local"],
  ["hold under a show reads booked",   show("2026-10-05"), "2026-10-05 -> local"],
  ["hold blocks its own days",         show("2026-10-21"), "2026-10-21 -> tentative"],
  ["travel show blocks",               show("2026-11-03"), "2026-11-03 -> travel"],
  ["day before travel stays OPEN",     show("2026-10-31"), "2026-10-31 -> open"],
  ["day after travel stays OPEN",      show("2026-11-06"), "2026-11-06 -> open"],
  ["travel span ends where it ends",   show("2026-11-05"), "2026-11-05 -> travel"],
  ["admin entry ignored",              show("2026-10-09"), "2026-10-09 -> open"],
  ["timed entry ignored",              show("2026-10-12"), "2026-10-12 -> open"],
  ["hold does not bleed either side",  show("2026-11-30"), "2026-11-30 -> open"],
  ["tentative travel still tentative", show("2026-12-01"), "2026-12-01 -> tentative"],
];
let bad = 0;
for (const [name, got, want] of checks) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${got}${ok ? "" : "   want: " + want}`);
}
console.log(`\ndiagnostics: ${JSON.stringify({e:diagnostics.eventCount,timed:diagnostics.skipped,admin:diagnostics.admin,holds:diagnostics.tentative})}`);
console.log("spans:"); for (const s of result.spans) console.log(`  ${s.from} .. ${s.to}  ${s.type}`);
console.log(bad ? `\n${bad} FAILING` : "\nall green");
