import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness, saveInput } from './helpers/account';
const enabled = Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL);
const now = () => new Date('2026-10-21T12:00:00Z');
type Client = ReturnType<Awaited<ReturnType<typeof harness>>['client']>;
async function answer(c: Client, id: string, value: unknown) {
  const f = await (await c.request('form')).json();
  const r = await c.request('form', { expected_revision: f.revision, question_id: id, question_version: 1, request_id: randomUUID(), answer: value == null ? { state: 'unknown' } : { state: 'known', value } });
  assert.equal(r.status, 200, id); return r.json();
}
async function report(c: Client) {
  const f = await (await c.request('form')).json();
  const r = await c.request('report', { expected_revision: f.revision, request_id: randomUUID() });
  assert.equal(r.status, 200); return r.json();
}
test('one case produces UK and Canada results and shared answers are asked once, with private Persian print', { skip: !enabled }, async () => {
  const h = await harness(now);
  try {
    const c = await h.verifiedClient();
    await c.request('case', { ...saveInput(), answers: { goal: 'study', destinations: ['uk', 'ca'], age: 'under-30', budget: { amount: 60000, currency: 'CAD' } } });
    await answer(c, 'age_exact', 27); await answer(c, 'study_level', 'master');
    await answer(c, 'study_offer', 'yes'); await answer(c, 'passport', 'yes'); await answer(c, 'dependants', 0);
    const f = await (await c.request('form')).json();
    assert.ok(f.questions.some((q: any) => q.id === 'ca_study_loa'));
    for (const id of ['age_exact', 'study_level', 'study_offer', 'language', 'budget', 'passport', 'dependants']) {
      assert.equal(f.questions.filter((q: any) => q.id === id).length, 1);
      if (id !== 'language') assert.ok(!f.missing.some((q: any) => q.id === id));
    }
    const { report: saved, report_state } = await report(c);
    assert.deepEqual(saved.route_results.map((r: any) => r.route_id), ['uk:student', 'ca:study-permit-ca']);
    const ca = saved.route_results[1];
    assert.equal(ca.status, 'needs_information'); assert.equal(ca.score, null);
    assert.equal(ca.costs.maintenance.amount, null); assert.equal(report_state.current, true);
    assert.equal(saved.dependencies.case.id, f.case_id);
    const html = await (await c.request(`report/${saved.id}/print`)).text();
    assert.match(html, /مجوز تحصیل کانادا/); assert.match(html, /تحصیل بریتانیا/); assert.match(html, /دلار کانادا/);
    assert.match(html, /www.canada.ca/);
    const bob = await h.verifiedClient(); assert.equal((await bob.request(`report/${saved.id}`)).status, 404);
    await c.request('case', { ...saveInput(f.revision), answers: { goal: 'study', destinations: ['ca'] } });
    const caOnly = await (await c.request('form')).json();
    assert.ok(!caOnly.questions.some((q: any) => q.id.startsWith('uk_student_')));
    assert.deepEqual((await report(c)).report.route_results.map((r: any) => r.route_id), ['ca:study-permit-ca']);
  } finally { await h.close(); }
});
const complete = {
  scope: 'iran_initial_degree', application_on: '2026-10-22', province: 'outside_quebec', loa: 'unconditional_dli', institution: 'public',
  duration_months: 24, tuition_cad: 20000, tuition_paid_cad: 5000, return_transport_cad: 2000,
  finance_method: 'available_funds', funds_access: 'documented', later_years: 'documented_plan', biometrics: 'valid_or_exempt',
};
async function prepare(c: Client, overrides: Record<string, unknown> = {}, budget = { amount: 60000, currency: 'CAD' }, dependants = 0, level = 'master') {
  await c.request('case', { ...saveInput(), answers: { goal: 'study', destinations: ['ca'], age: 'under-30', budget } });
  for (const [id, v] of Object.entries({ age_exact: 27, study_level: level, study_offer: 'yes', passport: 'yes', dependants })) await answer(c, id, v);
  for (const [id, v] of Object.entries({ ...complete, ...overrides })) {
    const f = await (await c.request('form')).json();
    if (f.questions.some((q: any) => q.id === `ca_study_${id}`)) await answer(c, `ca_study_${id}`, v);
  }
}
test('current Canadian financial rules use annual family bands and CAD, separately from spending and dependent permission', { skip: !enabled }, async () => {
  const h = await harness(now);
  try {
    const c = await h.verifiedClient(); await prepare(c);
    const saved = (await report(c)).report; const r = saved.route_results[0];
    assert.equal(r.status, 'preliminary_conditions_met'); assert.equal(r.score, null); assert.equal(r.official_eligibility, 'not_determined');
    assert.equal(r.costs.maintenance.amount, 40448); assert.equal(r.costs.maintenance.living_before_deduction, 23448);
    assert.equal(r.costs.maintenance.tuition_outstanding, 15000); assert.equal(r.costs.government_fee.amount, 150);
    assert.equal(r.costs.other.find((x: any) => x.id === 'biometrics').amount, null);
    assert.equal(r.costs.spending_total, null); assert.equal(r.conditions.find((x: any) => x.id === 'pal').state, 'not_applicable');
    assert.ok(r.conditions.every((x: any) => !x.document_verified && x.source_ids.every((id: string) => r.sources.some((s: any) => s.id === id))));
    await answer(c, 'dependants', 1); await answer(c, 'ca_study_return_transport_cad', 3000); await answer(c, 'ca_study_funds_access', 'documented');
    const family = (await report(c)).report.route_results[0];
    assert.equal(family.costs.maintenance.living_before_deduction, 29192); assert.equal(family.costs.maintenance.amount, 47192);
    assert.equal(family.costs.dependants.permission, 'not_determined'); assert.equal(family.costs.dependants.visa_fees, null);
    assert.equal(family.status, 'needs_review');
    await answer(c, 'ca_study_biometrics', 'required');
    const bio = (await report(c)).report.route_results[0];
    assert.equal(bio.costs.other.find((x: any) => x.id === 'biometrics').amount, 85);
    assert.equal(bio.conditions.find((x: any) => x.id === 'biometrics').state, 'action_needed');
    await answer(c, 'dependants', 7); await answer(c, 'ca_study_return_transport_cad', 8000); await answer(c, 'ca_study_funds_access', 'documented');
    assert.equal((await report(c)).report.route_results[0].costs.maintenance.living_before_deduction, 68372);
    assert.deepEqual((await (await c.request(`report/${saved.id}`)).json()).report, saved);
  } finally { await h.close(); }
});
test('PAL branches distinguish public graduate degrees, private degrees, expiry and unsupported exceptions', { skip: !enabled }, async () => {
  const h = await harness(now);
  try {
    const c = await h.verifiedClient(); await prepare(c, { institution: 'private', pal: 'missing' });
    let r = (await report(c)).report.route_results[0];
    assert.equal(r.conditions.find((x: any) => x.id === 'pal').state, 'action_needed');
    await answer(c, 'ca_study_pal', 'valid_2026'); await answer(c, 'ca_study_pal_expires_on', '2026-10-21');
    r = (await report(c)).report.route_results[0]; assert.equal(r.conditions.find((x: any) => x.id === 'pal').state, 'action_needed');
    await answer(c, 'ca_study_pal_expires_on', '2026-12-31');
    r = (await report(c)).report.route_results[0]; assert.equal(r.conditions.find((x: any) => x.id === 'pal').state, 'self_reported_met');
    await answer(c, 'ca_study_pal', 'other_exemption');
    assert.equal((await report(c)).report.route_results[0].conditions.find((x: any) => x.id === 'pal').state, 'needs_review');
    await answer(c, 'ca_study_institution', 'public');
    let f = await (await c.request('form')).json(); assert.ok(!f.questions.some((q: any) => q.id === 'ca_study_pal'));
    assert.equal((await report(c)).report.route_results[0].conditions.find((x: any) => x.id === 'pal').state, 'not_applicable');
    await answer(c, 'study_level', 'bachelor'); f = await (await c.request('form')).json();
    assert.ok(f.questions.some((q: any) => q.id === 'ca_study_pal'));
    assert.equal((await report(c)).report.route_results[0].conditions.find((x: any) => x.id === 'pal').state, 'unknown');
  } finally { await h.close(); }
});
test('unknown facts, currency, Quebec, conditional admission and non-initial scopes cannot produce conclusive amounts', { skip: !enabled }, async () => {
  const h = await harness(now);
  try {
    const c = await h.verifiedClient(); await prepare(c);
    await answer(c, 'budget', { amount: 1e9, currency: 'GBP' });
    let r = (await report(c)).report.route_results[0]; assert.equal(r.conditions.find((x: any) => x.id === 'funds').state, 'unknown');
    await answer(c, 'ca_study_tuition_paid_cad', 21000);
    r = (await report(c)).report.route_results[0]; assert.equal(r.status, 'needs_review'); assert.equal(r.costs.maintenance.amount, null);
    await answer(c, 'ca_study_tuition_paid_cad', 5000);
    await answer(c, 'ca_study_province', 'quebec'); await answer(c, 'ca_study_caq', 'valid');
    r = (await report(c)).report.route_results[0]; assert.equal(r.status, 'needs_review'); assert.equal(r.costs.maintenance.amount, null);
    assert.equal(r.dependencies.facts.caq, 'valid');
    await answer(c, 'ca_study_province', 'outside_quebec'); await answer(c, 'ca_study_scope', 'pgwp');
    r = (await report(c)).report.route_results[0]; assert.equal(r.status, 'needs_review'); assert.equal(r.costs.maintenance.amount, null);
    await answer(c, 'ca_study_scope', 'extension');
    assert.equal((await report(c)).report.route_results[0].conditions.find((x: any) => x.id === 'scope').state, 'needs_review');
    await answer(c, 'ca_study_scope', 'iran_initial_degree'); await answer(c, 'ca_study_loa', 'conditional');
    assert.equal((await report(c)).report.route_results[0].conditions.find((x: any) => x.id === 'loa').state, 'needs_review');
    await answer(c, 'ca_study_duration_months', 6);
    assert.equal((await report(c)).report.route_results[0].costs.maintenance.amount, null);
    await answer(c, 'ca_study_duration_months', 24); await answer(c, 'ca_study_finance_method', 'loan_scholarship_support');
    assert.equal((await report(c)).report.route_results[0].costs.maintenance.amount, null);
    const f = await (await c.request('form')).json();
    for (const [id, v] of [['ca_study_tuition_cad', 1.001], ['ca_study_application_on', '2026-02-30'], ['ca_study_duration_months', 0]] as const) {
      assert.equal((await c.request('form', { expected_revision: f.revision, question_id: id, question_version: 1, request_id: randomUUID(), answer: { state: 'known', value: v } })).status, 400);
    }
  } finally { await h.close(); }
});
test('source expiry or pending Canadian review stops new conclusions while saved two-route evidence stays immutable', { skip: !enabled }, async () => {
  let clock = now(); let routeIds: string[] = []; let retrievalFailed = false;
  const h = await harness(() => clock, undefined, undefined, undefined, async () => ({ routeIds, retrievalFailed }));
  try {
    const c = await h.verifiedClient(); await prepare(c);
    const first = (await report(c)).report;
    routeIds = ['ca:study-permit-ca'];
    assert.equal((await (await c.request(`report/${first.id}`)).json()).report_state.evidence_current, false);
    let r = (await report(c)).report.route_results[0]; assert.equal(r.status, 'needs_review'); assert.equal(r.costs.government_fee.amount, null);
    routeIds = []; retrievalFailed = true;
    r = (await report(c)).report.route_results[0]; assert.equal(r.costs.maintenance.amount, null);
    retrievalFailed = false; clock = new Date('2026-10-28T00:00:00Z');
    await c.request('signin', { email: c.email, password: c.password });
    r = (await report(c)).report.route_results[0]; assert.equal(r.status, 'needs_review');
    assert.equal(r.costs.government_fee.amount, null); assert.equal(r.costs.maintenance.amount, null);
    assert.ok(!r.conditions.some((x: any) => x.state === 'self_reported_met' || x.state === 'not_applicable'));
    assert.deepEqual((await (await c.request(`report/${first.id}`)).json()).report, first);
  } finally { await h.close(); }
});
test('an eighteen-year-old needs provincial majority review and expired policy never exposes a fresh derived CAD threshold', { skip: !enabled }, async () => {
  let clock = now(); const h = await harness(() => clock);
  try {
    const c = await h.verifiedClient(); await prepare(c);
    await answer(c, 'age_exact', 18);
    let r = (await report(c)).report.route_results[0];
    assert.equal(r.conditions.find((x: any) => x.id === 'adult_scope').state, 'needs_review');
    assert.equal(r.costs.maintenance.amount, null);
    await answer(c, 'age_exact', 27); clock = new Date('2026-10-28T00:00:00Z');
    await c.request('signin', { email: c.email, password: c.password });
    r = (await report(c)).report.route_results[0];
    assert.equal(r.conditions.find((x: any) => x.id === 'funds').rule.value, null);
  } finally { await h.close(); }
});
