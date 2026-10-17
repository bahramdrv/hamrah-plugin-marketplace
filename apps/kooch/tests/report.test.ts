import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness, saveInput } from './helpers/account';
const enabled = Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL);
const checkedNow = () => new Date('2026-10-17T12:00:00Z');
type Client = ReturnType<Awaited<ReturnType<typeof harness>>['client']>;
const completeFacts = {
  application_scope: 'iran_entry_full_time_degree', passport: 'yes', cas: 'valid_unused',
  cas_issued_on: '2026-09-01', course_starts_on: '2027-01-01', application_on: '2026-10-20',
  english: 'cas_b2_all_skills', atas: 'not_required_confirmed', tb: 'not_required_after_check',
  finance_method: 'cash', location: 'london', course_months: 12,
  tuition_gbp: 20000, tuition_paid_gbp: 5000, sponsor_accommodation_paid_gbp: 1000,
  funds_held_days: 28, funds_period_ends_on: '2026-10-10', dependants: 0,
};
const fieldId = (key: string) => ['passport', 'dependants'].includes(key) ? key : `uk_student_${key}`;
async function answer(c: Client, revision: number, question_id: string, value: unknown) {
  return c.request('form', { expected_revision: revision, question_id, question_version: 1, request_id: randomUUID(), answer: value == null ? { state: 'unknown' } : { state: 'known', value } });
}
async function prepared(c: Client, budget = { amount: 30000, currency: 'GBP' }) {
  await c.request('case', { ...saveInput(), answers: { goal: 'study', age: 'under-30', budget } });
  for (const [id, value, revision] of [['age_exact', 27, 1], ['study_level', 'master', 2], ['study_offer', 'yes', 3]] as const)
    assert.equal((await answer(c, revision, id, value)).status, 200);
}
async function saveFacts(c: Client, facts: Record<string, unknown>) {
  let form = await (await c.request('form')).json();
  for (const key of [...Object.keys(completeFacts), 'atas_issued_on', 'tb_issued_on']) {
    if (!form.questions.some((q: any) => q.id === fieldId(key))) continue;
    const r = await answer(c, form.revision, fieldId(key), facts[key] ?? null);
    assert.equal(r.status, 200, `shared form field ${key}`); form = await r.json();
  }
  return form;
}
async function create(c: Client, facts: Record<string, unknown>) {
  const form = await saveFacts(c, facts);
  const response = await c.request('report', { expected_revision: form.revision, request_id: randomUUID() });
  assert.equal(response.status, 200); return (await response.json()).report;
}

test('one shared questionnaire supplies route gaps and one report without a second intake or repeated common answers', { skip: !enabled }, async () => {
  const h = await harness(checkedNow);
  try {
    const c = await h.verifiedClient(); await prepared(c);
    let form = await (await c.request('form')).json();
    assert.ok(form.questions.some((q: any) => q.id === 'uk_student_cas'));
    assert.ok(!form.missing.some((q: any) => q.id === 'age_exact' || q.id === 'budget'));
    assert.equal(form.questions.filter((q: any) => q.id === 'budget').length, 1);
    const response = await c.request('report', { expected_revision: form.revision, request_id: randomUUID() });
    assert.equal(response.status, 200);
    const { report } = await response.json();
    assert.equal(report.case_revision, form.revision);
    assert.equal(report.route_results[0].route_id, 'uk:student');
    assert.equal(report.route_results[0].status, 'needs_information');
    assert.equal(report.dependencies.case.id, form.case_id);
    assert.equal((await c.request('report', { expected_revision: form.revision, request_id: randomUUID(), facts: completeFacts })).status, 400);
    await c.request('case', { ...saveInput(form.revision), answers: { goal: 'study', destinations: ['de'] } });
    form = await (await c.request('form')).json();
    assert.ok(!form.questions.some((q: any) => q.id.startsWith('uk_student_')));
    const other = (await (await c.request('report', { expected_revision: form.revision, request_id: randomUUID() })).json()).report;
    assert.deepEqual(other.route_results, []); assert.equal(other.coverage, 'partial');
  } finally { await h.close(); }
});

test('incomplete shared answers yield a private preliminary snapshot with gaps and no invented cost or score', { skip: !enabled }, async () => {
  const h = await harness(checkedNow);
  try {
    const c = await h.verifiedClient(); await c.request('case', saveInput());
    const input = { expected_revision: 1, request_id: randomUUID() };
    const response = await c.request('report', input); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { report } = await response.json(); const route = report.route_results[0];
    assert.equal(report.kind, 'self_service_guidance'); assert.equal(report.assessment, 'preliminary');
    assert.equal(route.status, 'needs_information'); assert.equal(report.case_revision, 1);
    assert.equal(route.score, null); assert.equal(route.costs.maintenance.amount, null); assert.equal(route.costs.spending_total, null);
    assert.ok(route.conditions.some((r: any) => r.state === 'unknown'));
    assert.ok(route.conditions.every((r: any) => r.document_verified === false));
    assert.ok(route.sources.every((s: any) => s.url.startsWith('https://www.gov.uk/') && s.checked_at && s.expires_at));
    assert.deepEqual((await (await c.request(`report/${report.id}`)).json()).report, report);
    assert.deepEqual((await (await c.request('report', input)).json()).report, report);
  } finally { await h.close(); }
});

test('primary rules consume saved shared answers with provenance and separate GBP funds from spending', { skip: !enabled }, async () => {
  const h = await harness(checkedNow);
  try {
    const c = await h.verifiedClient(); await prepared(c);
    const report = await create(c, completeFacts); const route = report.route_results[0];
    assert.equal(route.status, 'preliminary_conditions_met'); assert.equal(route.coverage, 'partial');
    assert.equal(route.official_eligibility, 'not_determined');
    assert.equal(route.costs.maintenance.amount, 27761); assert.equal(route.costs.maintenance.living_before_deduction, 13761);
    assert.equal(route.costs.maintenance.tuition_outstanding, 15000); assert.equal(route.costs.government_fee.amount, 558);
    assert.equal(route.costs.healthcare.annual_rate, 776); assert.equal(route.costs.healthcare.amount, null); assert.equal(route.costs.spending_total, null);
    assert.equal(route.conditions.find((r: any) => r.id === 'cash_funds').state, 'self_reported_met');
    assert.equal(route.conditions.find((r: any) => r.id === 'english').rule.value, 'B2 in all four skills');
    assert.ok(route.conditions.every((r: any) => !r.document_verified && r.source_ids.length)); assert.ok(route.next_actions.length >= 3);
    assert.equal(report.dependencies.case.form.answers.age_exact.source, 'self_reported');
    assert.equal(report.dependencies.case.form.answers.uk_student_cas.source, 'self_reported');
    assert.equal(route.dependencies.facts.cas, 'valid_unused');
    const resumed = await (await c.request('form')).json();
    assert.ok(!resumed.missing.some((q: any) => q.id === 'uk_student_cas' || q.id === 'budget'));
  } finally { await h.close(); }
});

test('editing the amount of required funds reopens holding-period answers in the same questionnaire', { skip: !enabled }, async () => {
  const h = await harness(checkedNow);
  try {
    const c = await h.verifiedClient(); await prepared(c); const initial = await saveFacts(c, completeFacts);
    const changed = await (await answer(c, initial.revision, 'uk_student_location', 'outside_london')).json();
    assert.ok(changed.review_required.includes('uk_student_funds_held_days'));
    assert.ok(changed.review_required.includes('uk_student_funds_period_ends_on'));
    const report = (await (await c.request('report', { expected_revision: changed.revision, request_id: randomUUID() })).json()).report;
    const holding = report.route_results[0].conditions.find((r: any) => r.id === 'holding_period');
    assert.equal(holding.state, 'unknown'); assert.equal(report.route_results[0].status, 'needs_review');
  } finally { await h.close(); }
});

test('missing, unmet, conflicting and expired answers cannot activate a definitive result or convert foreign money', { skip: !enabled }, async () => {
  const h = await harness(checkedNow);
  try {
    const c = await h.verifiedClient(); await prepared(c, { amount: 1e9, currency: 'IRR' });
    const make = async (facts: Record<string, unknown>) => (await create(c, facts)).route_results[0];
    const foreign = await make(completeFacts); assert.equal(foreign.status, 'needs_information');
    assert.equal(foreign.conditions.find((r: any) => r.id === 'cash_funds').state, 'unknown');
    const absent = await make({ ...completeFacts, cas: 'absent' }); assert.equal(absent.status, 'action_needed');
    const conflict = await make({ ...completeFacts, tuition_paid_gbp: 21000 }); assert.equal(conflict.status, 'needs_review'); assert.equal(conflict.costs.maintenance.amount, null);
    const future = await make({ ...completeFacts, application_on: '2027-01-01' }); assert.equal(future.status, 'needs_review');
    assert.ok(future.conditions.some((r: any) => r.id === 'evidence_window' && r.state === 'needs_review'));
    const historical = await make({ ...completeFacts, application_on: '2025-01-01' }); assert.equal(historical.status, 'needs_review');
    const cert = await make({ ...completeFacts, atas: 'valid_certificate', atas_issued_on: '2026-01-01' });
    assert.equal(cert.conditions.find((r: any) => r.id === 'atas').state, 'action_needed');
    const hold = await make({ ...completeFacts, funds_period_ends_on: '2026-09-18' }); assert.equal(hold.conditions.find((r: any) => r.id === 'holding_period').state, 'action_needed');
    const form = await (await c.request('form')).json();
    assert.equal((await answer(c, form.revision, 'uk_student_course_months', 1.2)).status, 400);
    assert.equal((await answer(c, form.revision, 'uk_student_application_on', '2026-02-30')).status, 400);
  } finally { await h.close(); }
});

test('calendar boundaries, money deductions, family scope and shared-form conflicts stay visible', { skip: !enabled }, async () => {
  const h = await harness(checkedNow);
  try {
    const c = await h.verifiedClient(); await prepared(c);
    const make = async (facts: Record<string, unknown>) => (await create(c, facts)).route_results[0];
    const boundary = await make({ ...completeFacts, cas_issued_on: '2026-04-20', course_starts_on: '2027-04-20', funds_period_ends_on: '2026-09-19' });
    assert.equal(boundary.status, 'preliminary_conditions_met');
    const staleCas = await make({ ...completeFacts, cas_issued_on: '2026-04-19' }); assert.equal(staleCas.conditions.find((r: any) => r.id === 'cas').state, 'action_needed');
    const outside = await make({ ...completeFacts, location: 'outside_london', sponsor_accommodation_paid_gbp: 5000, dependants: 2 });
    assert.equal(outside.costs.maintenance.amount, 24010); assert.equal(outside.costs.dependants.maintenance, null); assert.equal(outside.costs.dependants.monthly_rate, 680);
    assert.equal(outside.costs.dependants.visa_fees, 1116); assert.equal(outside.costs.dependants.permission, 'not_determined'); assert.equal(outside.status, 'needs_review');
    const loan = await make({ ...completeFacts, finance_method: 'loan_or_sponsorship' }); assert.equal(loan.costs.maintenance.amount, null); assert.equal(loan.status, 'needs_review');
    const end = await make({ ...completeFacts, application_on: '2027-02-28', course_starts_on: '2027-08-31' }); assert.equal(end.conditions.find((r: any) => r.id === 'application_window').state, 'self_reported_met');
    const casEnd = await make({ ...completeFacts, cas_issued_on: '2027-02-28', application_on: '2027-08-31', course_starts_on: '2027-09-01', dependants: 1, course_months: 6 });
    assert.equal(casEnd.conditions.find((r: any) => r.id === 'cas').state, 'self_reported_met'); assert.equal(casEnd.costs.dependants.maintenance, null);
    const form = await (await c.request('form')).json(); await answer(c, form.revision, 'age_exact', 38);
    const conflicted = await make(completeFacts); assert.equal(conflicted.status, 'needs_review');
    assert.equal(conflicted.conditions.find((r: any) => r.id === 'age').state, 'unknown'); assert.ok(conflicted.conditions.some((r: any) => r.id === 'answer_conflict'));
  } finally { await h.close(); }
});

test('shared reports remain private and immutable across retries, edits, expiry, export and deletion', { skip: !enabled }, async () => {
  let now = checkedNow(); const h = await harness(() => now);
  try {
    const alice = await h.verifiedClient(), bob = await h.verifiedClient(); await prepared(alice); await bob.request('case', saveInput());
    const form = await saveFacts(alice, completeFacts); const input = { expected_revision: form.revision, request_id: randomUUID() };
    const [a, b] = await Promise.all([alice.request('report', input), alice.request('report', input)]); assert.equal(a.status, 200); assert.equal(b.status, 200);
    const first = (await a.json()).report; assert.deepEqual((await b.json()).report, first);
    assert.equal((await bob.request(`report/${first.id}`)).status, 404); assert.equal((await (await bob.request('report')).json()).report, null);
    assert.equal((await alice.request('report', { ...input, expected_revision: 1 })).status, 409);
    assert.equal((await alice.request('report', { ...input, request_id: randomUUID(), expected_revision: 1 })).status, 409);
    assert.equal((await alice.request('report', { ...input, owner: 'fake' })).status, 400);
    assert.equal((await alice.request('report', input, 'POST', 'https://foreign.example')).status, 403);
    assert.equal((await (await alice.request(`report/${first.id}`)).json()).report_state.current, true);
    await answer(alice, form.revision, 'budget', { amount: 100, currency: 'GBP' });
    let viewed = await (await alice.request(`report/${first.id}`)).json(); assert.deepEqual(viewed.report, first); assert.equal(viewed.report_state.current, false);
    const second = await create(alice, completeFacts); assert.equal(second.version, 2); assert.equal(second.route_results[0].status, 'action_needed');
    assert.equal((await (await alice.request('report', input)).json()).report_state.current, false);
    const exported = await (await alice.request('export')).json(); assert.equal(exported.reports.length, 2); assert.deepEqual(exported.reports[0], first);
    now = new Date('2026-10-25T12:00:00Z'); await alice.request('signin', { email: alice.email, password: alice.password });
    viewed = await (await alice.request(`report/${first.id}`)).json(); assert.deepEqual(viewed.report, first); assert.equal(viewed.report_state.evidence_current, false);
    const expired = (await create(alice, completeFacts)).route_results[0]; assert.equal(expired.status, 'needs_review');
    assert.equal(expired.costs.government_fee.amount, null); assert.equal(expired.costs.maintenance.amount, null); assert.ok(!expired.conditions.some((r: any) => r.state === 'self_reported_met'));
    assert.equal((await alice.request('delete', { password: alice.password, confirmation: 'حذف حساب' })).status, 200); assert.equal((await alice.request(`report/${first.id}`)).status, 401);
    await bob.request('signin', { email: bob.email, password: bob.password }); assert.equal((await (await bob.request('export')).json()).reports.length, 0);
  } finally { await h.close(); }
});
