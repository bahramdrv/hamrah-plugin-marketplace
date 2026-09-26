import { readFileSync } from "node:fs";

// The scorecard validator (hamrah-scorecard-engine/scripts/freshness.py) reads this same file.
// There is one versioned policy; this module only ports its date parsing and assessment logic.
const FRESHNESS_POLICY = JSON.parse(
  readFileSync(
    new URL("../skills/hamrah-scorecard-engine/references/freshness_policy.json", import.meta.url),
    "utf8"
  )
);

export const FRESHNESS_POLICY_VERSION = FRESHNESS_POLICY.policy_version;
export const FRESHNESS_FACT_TYPES = Object.keys(FRESHNESS_POLICY.fact_types);

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|([+-])(\d{2}):(\d{2}))$/;
const DAY_MS = 86_400_000;

function epochMs(year, month, day, hour = 0, minute = 0, second = 0) {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(hour, minute, second, 0);
  return value;
}

function validCalendarDate(year, month, day) {
  if (year < 1) return false;
  const value = epochMs(year, month, day);
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

/**
 * Return the UTC calendar day (days since 1970-01-01) of a strict ISO date or zoned
 * date-time, or null when the value is not a real calendar date/time.
 */
export function parseIsoDay(value, { allowDate = true, allowDateTime = true } = {}) {
  if (typeof value !== "string") return null;
  const dateMatch = allowDate ? DATE_PATTERN.exec(value) : null;
  if (dateMatch) {
    const [year, month, day] = dateMatch.slice(1, 4).map(Number);
    return validCalendarDate(year, month, day) ? Math.floor(epochMs(year, month, day).getTime() / DAY_MS) : null;
  }
  const timeMatch = allowDateTime ? DATE_TIME_PATTERN.exec(value) : null;
  if (!timeMatch) return null;
  const [year, month, day, hour, minute, second] = timeMatch.slice(1, 7).map(Number);
  if (!validCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  let offsetMinutes = 0;
  if (timeMatch[7] !== "Z") {
    const offsetHours = Number(timeMatch[9]);
    const offsetMins = Number(timeMatch[10]);
    if (offsetHours > 23 || offsetMins > 59) return null;
    offsetMinutes = (timeMatch[8] === "-" ? -1 : 1) * (offsetHours * 60 + offsetMins);
  }
  const utc = epochMs(year, month, day, hour, minute, second).getTime() - offsetMinutes * 60_000;
  return Math.floor(utc / DAY_MS);
}

/**
 * Assess one requirement check against the versioned fact-type freshness policy.
 * Age is measured from retrievedAt (a zoned date-time) to the reference instant's UTC day.
 */
export function assessFreshness(check, referenceInstant, policy = FRESHNESS_POLICY) {
  const factType = typeof check.factType === "string" ? check.factType : null;
  const rule = factType && Object.hasOwn(policy.fact_types, factType) ? policy.fact_types[factType] : null;
  const referenceMs = Date.parse(referenceInstant);
  const referenceDay = Number.isFinite(referenceMs) ? Math.floor(referenceMs / DAY_MS) : null;
  const retrievedDay = parseIsoDay(check.retrievedAt, { allowDate: false });
  const ageDays = retrievedDay !== null && referenceDay !== null ? referenceDay - retrievedDay : null;
  const result = {
    policy_version: policy.policy_version,
    fact_type: check.factType ?? null,
    status: "unknown",
    age_days: ageDays,
    max_age_days: rule ? rule.max_age_days : null
  };
  if (!rule || ageDays === null) return result;
  const effectiveUntil = parseIsoDay(check.effectiveUntil, { allowDateTime: false });
  if (ageDays > rule.max_age_days || (effectiveUntil !== null && effectiveUntil < referenceDay)) {
    result.status = "stale";
  } else if (ageDays > rule.aging_after_days) {
    result.status = "aging";
  } else {
    result.status = "current";
  }
  return result;
}
