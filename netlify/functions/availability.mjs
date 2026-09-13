import ical from "node-ical";

// ---------------------------------------------------------------------------
// Location classification
//
// Anything that is NOT clearly outside Ontario is treated as local. Ontario
// city names collide heavily with British and American ones (London, Windsor,
// Hamilton, Kingston, Cambridge, Chatham), so non-Ontario signals are tested
// FIRST and win outright.
// ---------------------------------------------------------------------------

const ONTARIO_POSTAL = /\b[KLMNP]\d[A-Z][ -]?\d[A-Z]\d\b/i;
const OTHER_CA_POSTAL = /\b[ABCEGHJRSTVXY]\d[A-Z][ -]?\d[A-Z]\d\b/i;
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const US_ZIP = /\b\d{5}(-\d{4})?\b/;

// "Toronto, ON" — comma-anchored so all-caps venue names don't false-positive.
const ON_PROVINCE_TOKEN = /,\s*ON\b/;
const OTHER_CA_PROVINCE = /,\s*(BC|AB|SK|MB|QC|QB|NB|NS|PE|PEI|NL|NF|YT|NT|NU)\b/;
const US_STATE = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;

const FOREIGN_WORDS = new RegExp(
  "\\b(" +
    [
      "usa", "u\\.s\\.a", "united states", "america",
      "uk", "u\\.k", "england", "scotland", "wales", "ireland", "britain",
      "mexico", "france", "germany", "spain", "italy", "netherlands",
      "japan", "china", "singapore", "australia", "new zealand",
      "dubai", "uae", "abu dhabi", "qatar", "india", "brazil",
      "jamaica", "bahamas", "bermuda", "barbados", "caribbean", "cuba",
      "dominican", "puerto rico", "costa rica", "panama", "aruba",
      "portugal", "belgium", "sweden", "norway", "denmark", "poland",
      "switzerland", "austria", "greece", "turkey", "israel", "egypt",
      "south africa", "kenya", "korea", "thailand", "vietnam", "taiwan",
      "hong kong", "malaysia", "indonesia", "philippines", "argentina",
      "chile", "colombia", "peru",
      "las vegas", "orlando", "anaheim", "nashville", "chicago",
      "new york", "los angeles", "san francisco", "atlanta", "boston",
      "miami", "denver", "seattle", "austin", "phoenix", "san diego",
      "vancouver", "calgary", "edmonton", "montreal", "montréal",
      "winnipeg", "halifax", "saskatoon", "regina", "quebec", "québec",
      "victoria", "banff", "whistler", "kelowna", "moncton", "st john's",
      "marco island", "columbus", "dallas", "houston", "philadelphia",
      "minneapolis", "new orleans", "palm springs", "scottsdale", "tampa",
      "charlotte", "detroit", "cleveland", "pittsburgh", "st louis",
      "indianapolis", "kansas city", "salt lake", "sacramento", "san jose",
      "san antonio", "fort worth", "jacksonville", "memphis", "louisville",
      "milwaukee", "oklahoma city", "omaha", "tucson", "albuquerque", "raleigh",
      "baltimore", "hartford", "buffalo", "rochester ny", "syracuse",
      "dublin", "cork", "galway", "belfast", "edinburgh", "glasgow",
      "manchester", "birmingham", "liverpool", "leeds", "amsterdam",
      "berlin", "munich", "rome", "milan", "madrid", "barcelona", "lisbon",
      "zurich", "geneva", "vienna", "prague", "budapest", "copenhagen",
      "stockholm", "oslo", "helsinki", "paris france", "paris, france",
      "tokyo", "osaka", "seoul", "beijing", "shanghai", "sydney", "melbourne",
      "auckland", "cancun", "cabo", "playa del carmen", "punta cana", "nassau",
      // caught by the unrecognised-location log against the live calendar
      "nyc", "n\\.y\\.c", "fort lauderdale", "ft lauderdale", "oakland",
      "napa", "nappa", "louisville", "louiville", "key biscayne", "boca raton",
      "sarasota", "naples florida", "fort myers", "savannah", "asheville",
      // spelled-out US states — no Ontario town shares these names
      "alabama", "alaska", "arizona", "arkansas", "colorado", "connecticut",
      "florida", "fla\\b", "georgia", "idaho", "illinois", "indiana", "iowa",
      "kansas", "kentucky", "louisiana", "maryland", "massachusetts",
      "michigan", "minnesota", "mississippi", "missouri", "montana",
      "nebraska", "nevada", "new jersey", "new mexico", "north carolina",
      "north dakota", "oklahoma", "pennsylvania", "south carolina",
      "south dakota", "tennessee", "texas", "utah", "virginia", "wisconsin",
      "wyoming",
    ].join("|") +
    ")\\b",
  "i"
);

// "Ontario" also names a city in California and one in Oregon.
const ONTARIO_ELSEWHERE = /ontario[,\s]+(ca|california|or|oregon)\b/i;

const ONTARIO_CITIES = new RegExp(
  "\\b(" +
    [
      "toronto", "ottawa", "mississauga", "brampton", "hamilton", "london",
      "markham", "vaughan", "kitchener", "windsor", "richmond hill", "oakville",
      "burlington", "greater sudbury", "sudbury", "oshawa", "barrie", "guelph",
      "whitby", "cambridge", "milton", "ajax", "waterloo", "terrace bay",
      "thunder bay", "st\\. catharines", "st catharines", "niagara falls",
      "pickering", "newmarket", "peterborough", "kawartha", "brantford",
      "kingston", "chatham", "clarington", "pipestone", "sarnia", "belleville",
      "north bay", "cornwall", "timmins", "orillia", "stratford", "woodstock",
      "collingwood", "huntsville", "muskoka", "gravenhurst", "bracebridge",
      "cobourg", "port hope", "orangeville", "georgetown", "bolton",
      "aurora", "king city", "caledon", "uxbridge", "stouffville",
      "scarborough", "etobicoke", "north york", "york region", "durham region",
      "peel region", "halton", "niagara", "kanata", "nepean", "orleans",
      "gloucester", "vanier", "sault ste", "elliot lake", "kenora",
      "fort frances", "dryden", "owen sound", "goderich", "leamington",
      "tillsonburg", "simcoe", "paris ontario", "fergus", "elora",
      "gta", "golden horseshoe",
    ].join("|") +
    ")\\b",
  "i"
);

// A hold is marked at the START of the title AND followed by a separator, so
// the marker can't be confused with prose. "HOLD - Client", "HOLD: Client",
// "[HOLD] Client" and "TENTATIVE: Client" match; "Hold for load-in at 4" and
// "Hold for Great Games Challenge" — both real entries in this calendar, and
// both confirmed work — do not. iCal's own STATUS:TENTATIVE counts too.
const TENTATIVE_TITLE =
  /^\s*(?:\[\s*(?:hold|tentative|tent|pencilled)\s*\]|\(\s*(?:hold|tentative|tent|pencilled)\s*\)|(?:hold|tentative|tent|pencilled)\s*[-–—:|])/i;

// All-day entries that are admin rather than work. These would otherwise mark a
// day busy that is actually free, which costs bookings rather than causing
// double-bookings. Hotel stays and vacation are NOT here: those days really are
// unavailable.
// Deliberately conservative. Skipping a real show makes a working day read as
// OPEN, which invites a double-booking; over-blocking only costs one booking.
// So anything that could plausibly name a job stays in.
//   - "anniversary" removed: "CFL 100th Anniversary" is a show, not admin.
//   - "follow up" / "review" / "submit" removed: too easy to name real work.
const NON_SHOW_TITLE = /\b(deadline|due date|reminder|invoice|renewal|renew|expires?|birthday)\b/i;

const MEETING_LINK = /(meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|zoom\.us|webex\.com|gotomeeting|whereby\.com|plus\.google\.com\/hangouts|hangouts\.google|bluejeans|chime\.aws)/i;

/**
 * Shows are all-day entries; meetings, calls, flights and hotel bookings are
 * timed. That split is exact across the source calendar, so a timed entry is
 * never treated as a show. The link test additionally catches an all-day
 * entry that is really a meeting.
 *
 * Ignoring a meeting never frees a day: if a show covers the same date, the
 * show's own entry still marks it busy.
 */
export function isMeeting(ev) {
  if (ev.datetype !== "date") return true;
  return MEETING_LINK.test(
    `${textOf(ev.location)} ${textOf(ev.description)} ${textOf(ev.url)}`
  );
}

/**
 * An all-day entry that is admin rather than work — a deadline, a reminder, a
 * renewal. Verified against the live calendar: roughly one all-day entry in
 * twenty. Left in, these mark a free day as busy and quietly cost bookings.
 */
export function isNonShow(ev) {
  return NON_SHOW_TITLE.test(textOf(ev.summary));
}

/**
 * A soft hold — pencilled in, not confirmed. Marked at the start of the title,
 * or carried by iCal's own STATUS field.
 */
export function isTentative(ev) {
  if (String(ev.status || "").toUpperCase() === "TENTATIVE") return true;
  return TENTATIVE_TITLE.test(textOf(ev.summary));
}

/**
 * @returns {"local"|"travel"|"unknown"}
 *   "unknown" is reported separately but rendered as local, per config.
 */
/** node-ical returns some properties as {params, val} rather than a string. */
export function textOf(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.val === "string") return v.val;
  return "";
}

export function classifyLocation(raw) {
  if (!raw || !String(raw).trim()) return "unknown";
  const s = String(raw).replace(/\s+/g, " ").trim();

  // --- Non-Ontario signals win outright -----------------------------------
  if (ONTARIO_ELSEWHERE.test(s)) return "travel";
  if (OTHER_CA_POSTAL.test(s)) return "travel";
  if (OTHER_CA_PROVINCE.test(s)) return "travel";
  if (US_ZIP.test(s) && !ONTARIO_POSTAL.test(s)) return "travel";
  if (US_STATE.test(s)) return "travel";
  if (FOREIGN_WORDS.test(s)) return "travel";
  if (UK_POSTCODE.test(s) && !ONTARIO_POSTAL.test(s)) return "travel";

  // --- Ontario signals ----------------------------------------------------
  if (ONTARIO_POSTAL.test(s)) return "local";
  if (ON_PROVINCE_TOKEN.test(s)) return "local";
  if (/\bontario\b/i.test(s)) return "local";
  if (ONTARIO_CITIES.test(s)) return "local";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Date helpers — everything keyed as YYYY-MM-DD in local (Toronto) terms
// ---------------------------------------------------------------------------

const TZ = "America/Toronto";
const DAY_MS = 86400000;

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
});

/**
 * Day key for an instant.
 * All-day ICS values carry no real time, so they are read in UTC exactly as
 * written. Timed events are read in Toronto time — a 9pm show is 1am UTC the
 * next day, and Netlify's runtime is UTC.
 */
function toKey(d, isAllDay) {
  if (isAllDay) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate()
    ).padStart(2, "0")}`;
  }
  return dayFmt.format(d);
}

/** Midnight-in-Toronto check, used so an event ending at 00:00 doesn't claim the next day. */
function isMidnightLocal(d) {
  return timeFmt.format(d) === "00:00" || timeFmt.format(d) === "24:00";
}

/** Day arithmetic on YYYY-MM-DD keys, anchored at UTC noon so DST can't shift it. */
function shiftKey(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  const moved = new Date(anchor.getTime() + n * DAY_MS);
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}-${String(
    moved.getUTCDate()
  ).padStart(2, "0")}`;
}

function addDays(d, n) {
  return new Date(d.getTime() + n * DAY_MS);
}

/**
 * Expand an event to the calendar days it occupies.
 * ICS all-day DTEND is exclusive; timed DTEND is an instant.
 */
function daysCovered(start, end, isAllDay) {
  const firstKey = toKey(start, isAllDay);
  let lastKey;

  if (!end || end <= start) {
    lastKey = firstKey;
  } else if (isAllDay) {
    lastKey = shiftKey(toKey(end, true), -1);
    if (lastKey < firstKey) lastKey = firstKey;
  } else {
    // A 9am-5pm job and a 6pm-11pm job each occupy one whole day.
    const endKey = toKey(end, false);
    lastKey = isMidnightLocal(end) ? shiftKey(endKey, -1) : endKey;
    if (lastKey < firstKey) lastKey = firstKey;
  }

  const days = [];
  for (let k = firstKey; k <= lastKey; k = shiftKey(k, 1)) {
    days.push(k);
    if (days.length > 400) break; // guard against a malformed feed
  }
  return days;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const YEARS_AHEAD = 3;

// Zero, because the all-day show entries already span the travel days: a job
// entered as Sep 13-19 means "leave the 13th, home the 19th". Padding on top
// of that blocks days that are genuinely free — it was marking Sep 20 as
// travel while a CPB show sat booked on that very date. Raise this only if the
// convention changes to entering show dates without the road days.
const TRAVEL_BUFFER_DAYS = 0;

export function buildAvailability(parsed, now = new Date()) {
  const startKey = dayFmt.format(now);
  const [wy, wm, wd] = startKey.split("-").map(Number);
  const endKey = `${wy + YEARS_AHEAD}-${String(wm).padStart(2, "0")}-${String(wd).padStart(2, "0")}`;
  const windowStart = new Date(Date.UTC(wy, wm - 1, wd, 12));
  const windowEnd = new Date(Date.UTC(wy + YEARS_AHEAD, wm - 1, wd, 12));

  /** @type {Record<string, "local"|"travel">} */
  const days = {};
  /** One entry per booking, so adjacent shows stay visually distinct. */
  const rawSpans = [];
  const unparsedLocations = [];
  let eventCount = 0;
  let skipped = 0;
  let admin = 0;
  let tentative = 0;

  // Confirmed work always outranks a hold, so a hold that firms up reads as
  // booked rather than soft. Travel outranks local when two jobs share a day.
  const RANK = { tentative: 1, local: 2, travel: 3 };
  const mark = (key, type) => {
    const held = days[key];
    if (held && RANK[held] >= RANK[type]) return;
    days[key] = type;
  };

  for (const k of Object.keys(parsed)) {
    const ev = parsed[k];
    if (!ev || ev.type !== "VEVENT") continue;
    if (ev.status === "CANCELLED") continue;
    if (!ev.start) continue;
    if (isMeeting(ev)) { skipped++; continue; }
    if (isNonShow(ev)) { admin++; continue; }

    const summary = textOf(ev.summary);
    const location = textOf(ev.location);
    const rawType = classifyLocation(`${summary} | ${location}`);
    if (rawType === "unknown" && ev.location !== undefined) {
      unparsedLocations.push(location || "(blank)");
    }

    // A hold is its own state regardless of where it is: nothing is confirmed,
    // so there is no travel to pad for. Otherwise anything unrecognised reads
    // as local, which blocks the day without claiming a buffer it can't justify.
    let type;
    if (isTentative(ev)) { type = "tentative"; tentative++; }
    else type = rawType === "travel" ? "travel" : "local";

    const isAllDay = true; // only all-day entries reach this point
    const durationMs = ev.end ? ev.end.getTime() - ev.start.getTime() : 0;

    /** @type {Array<{start: Date, end: Date}>} */
    let instances = [];

    if (ev.rrule) {
      const occurrences = ev.rrule.between(
        addDays(windowStart, -400),
        windowEnd,
        true
      );
      const exdates = new Set(
        Object.keys(ev.exdate || {}).map((d) => toKey(new Date(d), isAllDay))
      );
      for (const occ of occurrences) {
        if (exdates.has(toKey(occ, isAllDay))) continue;
        instances.push({ start: occ, end: new Date(occ.getTime() + durationMs) });
      }
      for (const key of Object.keys(ev.recurrences || {})) {
        const r = ev.recurrences[key];
        if (r?.start) instances.push({ start: r.start, end: r.end });
      }
    } else {
      instances.push({ start: ev.start, end: ev.end });
    }

    for (const inst of instances) {
      eventCount++;
      const covered = daysCovered(inst.start, inst.end, isAllDay);
      if (!covered.length) continue;

      for (const key of covered) mark(key, type);

      let from = covered[0];
      let to = covered[covered.length - 1];

      // Travel jobs pad either side for road days and load-out.
      if (type === "travel" && TRAVEL_BUFFER_DAYS > 0) {
        for (let i = 1; i <= TRAVEL_BUFFER_DAYS; i++) {
          mark(shiftKey(from, -i), "travel");
          mark(shiftKey(to, i), "travel");
        }
        from = shiftKey(from, -TRAVEL_BUFFER_DAYS);
        to = shiftKey(to, TRAVEL_BUFFER_DAYS);
      }
      rawSpans.push({ from, to, type });
    }
  }

  // Trim to the published window. Nothing before today, nothing past 3 years.
  const trimmed = {};
  for (const [key, val] of Object.entries(days)) {
    if (key >= startKey && key <= endKey) trimmed[key] = val;
  }

  // One bar per booking. Bookings that merely touch stay separate, so three
  // back-to-back shows read as three blocks rather than one long stripe.
  // Bookings that genuinely overlap are merged, and travel outranks local on
  // any shared day, so local bars are clipped around travel.
  const expand = (sp) => {
    const out = [];
    for (let k = sp.from; k <= sp.to; k = shiftKey(k, 1)) out.push(k);
    return out;
  };
  const runs = (keys) => {
    const sorted = [...new Set(keys)].sort();
    const out = [];
    for (const k of sorted) {
      const last = out[out.length - 1];
      if (last && shiftKey(last.to, 1) === k) last.to = k;
      else out.push({ from: k, to: k });
    }
    return out;
  };

  const daysOfType = (t) =>
    Object.entries(trimmed).filter(([, v]) => v === t).map(([k]) => k);

  // Bars are drawn strongest tier first. A weaker bar gives up any day a
  // stronger one already owns, so a hold sitting under a confirmed show simply
  // isn't drawn there and the day reads booked. Bookings that merely touch stay
  // separate, so three back-to-back shows read as three blocks rather than one
  // long stripe; ones that genuinely overlap merge.
  const spans = [];
  const blocked = new Set();

  for (const tier of ["travel", "local", "tentative"]) {
    const kept = [];
    for (const sp of rawSpans.filter((r) => r.type === tier)) {
      const free = expand(sp).filter((k) => !blocked.has(k));
      for (const r of runs(free)) kept.push({ ...r, type: tier });
    }
    kept.sort((a, b) => (a.from < b.from ? -1 : 1));

    const merged = [];
    for (const sp of kept) {
      const last = merged[merged.length - 1];
      if (last && sp.from <= last.to) {
        if (sp.to > last.to) last.to = sp.to;
      } else merged.push({ ...sp });
    }
    spans.push(...merged);
    for (const k of daysOfType(tier)) blocked.add(k);
  }

  const clipped = spans
    .filter((sp) => sp.to >= startKey && sp.from <= endKey)
    .map((sp) => ({
      from: sp.from < startKey ? startKey : sp.from,
      to: sp.to > endKey ? endKey : sp.to,
      type: sp.type,
    }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  return {
    result: {
      generatedAt: new Date().toISOString(),
      windowStart: startKey,
      windowEnd: endKey,
      days: trimmed,
      spans: clipped,
    },
    diagnostics: { eventCount, skipped, admin, tentative, unparsedLocations },
  };
}

export default async function handler() {
  const feed = process.env.ICLOUD_CALENDAR_URL;

  if (!feed) {
    return new Response(
      JSON.stringify({ error: "Calendar feed is not configured." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const url = feed.replace(/^webcal:\/\//i, "https://");

  try {
    const parsed = await ical.async.fromURL(url);
    const { result, diagnostics } = buildAvailability(parsed);

    // Location strings stay server-side only — they can name venues and
    // therefore clients. These land in the Netlify function log.
    if (diagnostics.unparsedLocations.length) {
      console.log(
        "[availability] unrecognised locations (defaulted to local):",
        diagnostics.unparsedLocations
      );
    }
    console.log(
      `[availability] ${diagnostics.eventCount} events, ` +
      `${diagnostics.skipped} timed entries skipped, ` +
      `${diagnostics.admin} admin entries skipped, ` +
      `${diagnostics.tentative} holds -> ` +
      `${Object.keys(result.days).length} busy days in ${result.spans.length} blocks`
    );

    return new Response(
      JSON.stringify({ ...result, unrecognisedCount: diagnostics.unparsedLocations.length }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          // Read the calendar on every page view. A cached answer could show a
          // date as open minutes after it was booked, and the whole point of
          // the page is that it reflects the calendar right now. The cost is
          // roughly a second per visit and one feed fetch per visitor, which is
          // nothing at this traffic level. If it ever needs throttling,
          // "public, max-age=0, s-maxage=60" reads as live to a human while
          // collapsing a burst of refreshes into one fetch.
          "cache-control": "no-store, max-age=0",
          "x-robots-tag": "noindex, nofollow",
        },
      }
    );
  } catch (err) {
    console.error("[availability] feed fetch failed:", err);
    return new Response(
      JSON.stringify({ error: "Could not read the calendar feed." }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}

export const config = { path: "/api/availability" };
