import pg from 'pg';
import snapshot from '../../data/iran-start-snapshot.json';
import { EvidenceStore } from '../evidence/store';
import { AuthProvider } from './auth';
import { AccountStore } from './store';
import { createAccountApi } from './api';
import { GoogleOAuth } from './google';
import { AiBudgetLedger } from '../ai/budget';
import { productionAcceptanceProfile, productionExplanationActivation } from '../ai/production-acceptance';
import { fixedQuestion, type QuestionAssistance } from '../ai/question-assistance';
import { policyGate } from '../ai/policy';
import { createGatewayReportExplanation } from '../ai/report-explanation';
import { createGatewayAnswerInterpretation } from '../ai/answer-interpretation';
import aiPolicy from '../../data/ai-gateway-policy.json';
type Runtime = ReturnType<typeof createAccountApi>;
let runtime: Promise<Runtime> | undefined;
let evidenceStore: EvidenceStore | undefined;
export async function publicEvidenceStore() { await accountRuntime(); return evidenceStore; }
export function accountConfigured() {
  return ['local', 'hosted'].includes(process.env.KOOCH_ACCOUNT_MODE ?? '') &&
    Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL && process.env.KOOCH_AUTH_SERVICE_KEY && process.env.KOOCH_SESSION_ENCRYPTION_KEY && process.env.KOOCH_APP_ORIGIN);
}
export async function accountRuntime() {
  if (!accountConfigured()) return null;
  if (!runtime) runtime = (async () => {
    const mode = process.env.KOOCH_ACCOUNT_MODE as 'local' | 'hosted';
    const origin = new URL(process.env.KOOCH_APP_ORIGIN!).origin;
    const authUrl = new URL(process.env.KOOCH_AUTH_URL!);
    const databaseUrl = new URL(process.env.KOOCH_DATABASE_URL!);
    const localHosts = ['127.0.0.1', 'localhost', '[::1]'];
    if (mode === 'local' && [new URL(origin).hostname, authUrl.hostname, databaseUrl.hostname].some(host => !localHosts.includes(host))) throw new Error('Local mode requires loopback services.');
    if (mode === 'hosted' && (new URL(origin).protocol !== 'https:' || authUrl.protocol !== 'https:')) throw new Error('Hosted mode requires HTTPS.');
    if (mode === 'hosted') {
      // Prevent URL options from silently disabling certificate verification in pg.
      for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) databaseUrl.searchParams.delete(key);
    }
    const pool = new pg.Pool({ connectionString: databaseUrl.href, ...(mode === 'hosted' ? { ssl: {
      rejectUnauthorized: true,
      ...(process.env.KOOCH_DATABASE_CA_CERT ? { ca: process.env.KOOCH_DATABASE_CA_CERT } : {}),
    } } : {}), max: 5, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    evidenceStore = new EvidenceStore({ pool, baseline: snapshot });
    const accountingKey = process.env.KOOCH_AI_ACCOUNTING_KEY;
    const stableKey = /^[a-f0-9]{64}$/.test(accountingKey ?? '');
    const ledger = new AiBudgetLedger(pool, stableKey ? accountingKey! : process.env.KOOCH_SESSION_ENCRYPTION_KEY!);
    const store = new AccountStore(pool, process.env.KOOCH_SESSION_ENCRYPTION_KEY!, undefined, async (owner, saved, client) => {
      const draft = saved.form?.draft;
      if (draft?.accounting_policy) await ledger.detachOperation(owner, `answer-interpretation:${saved.id}:${draft.revision}:${draft.id}`, draft.accounting_policy, client);
    }, client => evidenceStore!.reportReview(client));
    await store.validateRole();
    const auth = new AuthProvider({ url: authUrl.href.replace(/\/$/, ''),
      key: process.env.KOOCH_AUTH_PUBLISHABLE_KEY, serviceKey: process.env.KOOCH_AUTH_SERVICE_KEY!, origin });
    const google = process.env.KOOCH_GOOGLE_AUTH_ENABLED === 'true' ? new GoogleOAuth({ auth, origin,
      key: process.env.KOOCH_SESSION_ENCRYPTION_KEY!, secure: mode === 'hosted' }) : undefined;
    const release = productionAcceptanceProfile(aiPolicy, process.env, new Date());
    const effectivePolicy = release?.policy ?? aiPolicy;
    const interpret = createGatewayAnswerInterpretation({ policy: effectivePolicy, ledger,
      getCredential: () => stableKey ? process.env.KOOCH_ARVAN_API_KEY : undefined });
    // A fixed question needs no paid wording call. Keep inference for interpreting
    // the submitted answer and explaining the saved report.
    const questionAssistance: QuestionAssistance = view => Promise.resolve(fixedQuestion(view, 'fixed_wording'));
    const answerInterpretation: typeof interpret = (request, context) => release?.mode === 'synthetic' && request.draft.case_id !== release.caseId ? Promise.resolve({ status: 'capability_unaccepted' }) : interpret(request, context);
    const explanationActivation = productionExplanationActivation(aiPolicy, process.env, new Date());
    const explanationRelease = explanationActivation.status === 'accepted' ? explanationActivation.profile : undefined;
    const explain = createGatewayReportExplanation({ policy: explanationRelease?.policy ?? aiPolicy, ledger, getCredential: () => stableKey ? process.env.KOOCH_ARVAN_API_KEY : undefined });
    const reportExplanation: typeof explain = (report, operation, context) => !explanationRelease || (explanationRelease.mode === 'synthetic' && !explanationRelease.caseIds.includes(report.dependencies.case.id)) ? Promise.resolve({ status: 'capability_unaccepted' }) : explain(report, operation, context);
    const interpretationGate = policyGate(effectivePolicy, new Date(), 'answer-interpretation');
    const interpretationDisclosure = interpretationGate.status === 'accepted' ? { ...interpretationGate.policy.interpretation!, acceptance_notice: interpretationGate.policy.interpretation?.acceptance_basis?.kind === 'owner_accepted_unknowns' ? 'محل پردازش، گیرندهٔ بالادست و حدود نگهداری محتوایی احراز نشده‌اند؛ استفاده با پذیرش این نامعلومی‌ها توسط مالک سرویس فعال شده است. می‌توانی پاسخ ساختارمند بدهی.' : undefined } : null;
    return createAccountApi({ store, mode, origin, auth, google, questionAssistance, answerInterpretation, reportExplanation, interpretationDisclosure, pilotReportAi: () => explanationRelease?.mode === 'public' && policyGate(explanationRelease.policy, new Date(), 'report-explanation').status === 'accepted' && stableKey && Boolean(process.env.KOOCH_ARVAN_API_KEY) ? 'bounded_arvan' : 'not_enabled', pilotAi: () => release?.mode === 'public' && policyGate(release.policy, new Date()).status === 'accepted' && stableKey && Boolean(process.env.KOOCH_ARVAN_API_KEY) ? 'bounded_arvan' : 'disabled', accounting: stableKey ? ledger : undefined });
  })().catch(error => { runtime = undefined; throw error; });
  return runtime;
}
