import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewApplicationIntake } from '../intake-contract.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/synthetic-profile.json', import.meta.resolve('@immi/hamrah-intake-contract')), 'utf8'));

test('the local plugin facade maps the shared synthetic case without changing unknown or provenance', () => {
  const original = structuredClone(fixture);
  const result = previewApplicationIntake(fixture);
  assert.equal(result.contractVersion, '1.0.0');
  assert.deepEqual(result.fields.map(item => [item.factId, item.value, item.state, item.provenance]), [
    ['age', 34, 'Known', 'applicant-reported'],
    ['profile.residence', 'iran', 'Known', 'applicant-reported'],
    ['profile.maritalStatus', 'single', 'Known', 'applicant-reported'],
    ['profile.intent', null, 'Unknown', 'applicant-reported'],
  ]);
  assert.equal(result.fields[3].importance, 'critical');
  assert.ok(result.unmappedPaths.includes('household.accompanying_partner'));
  assert.deepEqual(fixture, original);
});

test('the plugin facade preserves a contradiction as unresolved and rejects another schema version', () => {
  const profile = structuredClone(fixture);
  profile.contradictions = [{ field_path: 'applicant.age', claims: ['34', '41'], suggested_question: 'Age?' }];
  assert.equal(previewApplicationIntake(profile).fields[0].state, 'Conflicting');
  assert.equal(previewApplicationIntake(profile).fields[0].value, null);
  assert.throws(() => previewApplicationIntake({ ...profile, schema_version: '2.0' }));
});
