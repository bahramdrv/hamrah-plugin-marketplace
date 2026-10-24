// Visa Atlas uses both ISO aliases and dataset-specific destination/route fields.
const country = value => typeof value === "string" ? value.toUpperCase().replace(/_DEST$/, "").replace(/^GB$/, "UK") : null;
export function scopePublicRecord(record, countryCode, slug, partial = false) {
  if (!record || typeof record !== "object") return null;
  const codes = [record.destinationIso, record.countryCode, record.countryIso, record.iso2, record.iso,
    record.destination, record.country, record.destination?.iso, record.destination?.code, record.route?.destinationIso];
  if (countryCode && !codes.some(code => country(code) === country(countryCode))) return null;
  if (!slug) return record;
  const match = value => typeof value === "string" && (partial ? value.toLowerCase().includes(slug.toLowerCase()) : value === slug);
  if (Array.isArray(record.thresholds)) {
    const thresholds = record.thresholds.filter(item => match(item.visaSlug) || match(item.routeSlug) || match(item.slug));
    return thresholds.length ? { ...record, thresholds } : null;
  }
  const slugs = [record.slug, record.routeSlug, record.visaSlug, record.route?.slug, record.visa?.slug,
    ...(Array.isArray(record.affectedVisas) ? record.affectedVisas.map(visa => typeof visa === "string" ? visa : visa?.slug) : [])];
  return slugs.some(match) ? record : null;
}
