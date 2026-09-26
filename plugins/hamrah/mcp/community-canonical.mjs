// Shared helpers for canonical internal Community Dataset artifacts. Canonical artifacts use the
// version 4 field names; values an older contract cannot express are null or "unknown", never invented.

export const LEGACY_VALIDATION = Object.freeze({ status: "legacy_import", privacy_status: "pass", validated_at: null });

export function localized(en, fa = null) {
  return { en: en || null, fa: fa || null };
}

export function schemaErrorMessages(errors = [], limit = 8) {
  return errors.slice(0, limit).map((error) => {
    const extra = error.params?.additionalProperty ? ` (${error.params.additionalProperty})` : "";
    return `schema ${error.instancePath || "<root>"}: ${error.message}${extra}`;
  });
}

export function privacyErrors(privacy) {
  return privacy.status === "pass"
    ? []
    : [`privacy ${privacy.status}: ${privacy.findings.map((item) => `${item.path} (${item.rule})`).join(", ")}`];
}

export function duplicateErrors(values, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) (seen.has(value) ? duplicates : seen).add(value);
  return duplicates.size ? [`duplicate ${label} values: ${[...duplicates].join(", ")}`] : [];
}
