/** A local, read-only compatibility preview; never a profile validator or scoring engine. */
export const contractVersion = '1.0.0';
const mappings = [
  { path: 'applicant.age', factId: 'age', number: true },
  { path: 'applicant.current_country_of_residence', factId: 'profile.residence', choices: { Iran: 'iran', Germany: 'DE', Australia: 'AU' } },
  { path: 'household.relationship_status', factId: 'profile.maritalStatus', choices: { single: 'single', married: 'married', partner: 'partner', divorced: 'divorced', widowed: 'widowed' } },
  { path: 'goals.primary_goal', factId: 'profile.intent', choices: { work: 'work', study: 'study', both: 'both' } },
];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (value, path) => path.split('.').reduce((item, key) => object(item) && Object.hasOwn(item, key) ? item[key] : undefined, value);
const metadata = new Set(['schema_version', 'generated_at', 'intake_status', 'missing_information', 'ambiguities', 'contradictions', 'normalization_log', 'data_quality']);
function leaves(value, prefix = '') {
  if (!object(value) || Object.keys(value).length === 0) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

export function previewProfile(profile) {
  if (!object(profile) || profile.schema_version !== '1.0') throw new Error('Expected Hamrah profile schema_version 1.0');
  for (const key of ['missing_information', 'ambiguities', 'contradictions']) {
    if (!Array.isArray(profile[key]) || profile[key].some(item => !object(item) || typeof item.field_path !== 'string')) {
      throw new Error(`Invalid ${key}`);
    }
  }
  const issues = [];
  const fields = mappings.map(mapping => {
    const raw = get(profile, mapping.path);
    const conflict = profile.contradictions.some(item => overlaps(item.field_path, mapping.path));
    const ambiguous = profile.ambiguities.some(item => overlaps(item.field_path, mapping.path));
    let value = null;
    if (!conflict && !ambiguous && raw !== null && raw !== undefined) {
      if (mapping.number && typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 110) value = raw;
      else if (mapping.choices && typeof raw === 'string' && Object.hasOwn(mapping.choices, raw)) value = mapping.choices[raw];
      else issues.push({ path: mapping.path, reason: 'unsupported-value' });
    }
    if (ambiguous) issues.push({ path: mapping.path, reason: 'ambiguous' });
    if (conflict) issues.push({ path: mapping.path, reason: 'conflicting' });
    const importance = profile.missing_information.find(item => item.field_path === mapping.path)?.importance ?? null;
    if (importance !== null && !['critical', 'high', 'medium', 'low'].includes(importance)) throw new Error('Invalid missing importance');
    return { sourcePath: mapping.path, factId: mapping.factId, value,
      state: conflict ? 'Conflicting' : value === null ? 'Unknown' : 'Known',
      provenance: 'applicant-reported', importance };
  });
  const unmappedPaths = Object.entries(profile).filter(([key]) => !metadata.has(key))
    .flatMap(([key, value]) => leaves(value, key)).filter(path => !mappings.some(mapping => mapping.path === path));
  return { contractVersion, fields, issues, unmappedPaths };
}

function overlaps(left, right) {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}
