import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AccountError, unauthorized, type CaseInput, type SavedCase } from './contract';
import type { InterpretationInput, InterpretationResult } from '../form/interpretation';
import type { FormInput } from '../form/contract';
import { formRecords, relevantQuestions, validateAnswer, applyFormAnswer, reconcileCompass } from '../form/workflow';
import { buildReport, type GuidanceReport } from '../report/evaluate';
import type { ReportHistoryItem, ReportInput } from '../report/contract';
import { reportState, reportChanges } from '../report/history';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export type AppSession = { owner: string; accessToken: string; purpose: 'account' | 'recovery'; deleted: boolean; expiresAt: Date };

export class AccountStore {
  private key: Buffer;
  constructor(private pool: Pool, key: string, private now: () => Date = () => new Date(), private detachDraft?: (owner: string, saved: SavedCase, client: PoolClient) => Promise<void>) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Session encryption key must be 32 bytes in hex.');
    this.key = Buffer.from(key, 'hex');
  }
  private encrypt(token: string) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const value = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), value]).toString('base64');
  }
  private decrypt(value: string) {
    const buffer = Buffer.from(value, 'base64'); const cipher = createDecipheriv('aes-256-gcm', this.key, buffer.subarray(0, 12));
    cipher.setAuthTag(buffer.subarray(12, 28)); return Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString('utf8');
  }
  async validateRole() {
    const { rows } = await this.pool.query(`SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication,
      session_user=current_user AS direct_login,
      CASE WHEN current_user='kooch_preview_account_api' THEN
        rolcanlogin AND rolvaliduntil IS NOT NULL AND rolvaliduntil>now() AND rolvaliduntil<>'infinity'::timestamptz
        AND pg_has_role(current_user,'kooch_account_api','USAGE')
        AND NOT pg_has_role(current_user,'kooch_account_api','SET')
        AND pg_has_role(current_user,'kooch_runtime','SET')
      ELSE false END AS preview_scoped
      FROM pg_roles WHERE rolname=current_user`);
    const role = rows[0];
    if (!role?.direct_login || role.rolsuper || role.rolbypassrls || role.rolcreaterole || role.rolcreatedb || role.rolreplication ||
      !(role.rolname === 'kooch_account_api' || (role.rolname === 'kooch_preview_account_api' && role.preview_scoped))) {
      throw new Error('Application connection must use the restricted account role.');
    }
  }
  async createSession(owner: string, accessToken: string, expiresIn: number, purpose: AppSession['purpose']) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO kooch.account_state(owner) VALUES($1) ON CONFLICT DO NOTHING', [owner]);
      const state = await client.query('SELECT deleted_at FROM kooch.account_state WHERE owner=$1 FOR UPDATE', [owner]);
      if (state.rows[0].deleted_at) throw unauthorized();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(this.now().getTime() + Math.min(expiresIn, purpose === 'recovery' ? 600 : 3600) * 1000);
      await client.query('INSERT INTO kooch.sessions(token_hash,owner,provider_session,purpose,expires_at) VALUES($1,$2,$3,$4,$5)',
        [hash(token), owner, this.encrypt(accessToken), purpose, expiresAt]);
      await client.query('COMMIT'); return { token, expiresAt };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async session(token: string | undefined, allowDeleted = false): Promise<AppSession> {
    if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) throw unauthorized();
    const { rows } = await this.pool.query(`SELECT s.owner,s.provider_session,s.purpose,s.expires_at,a.deleted_at FROM kooch.sessions s
      JOIN kooch.account_state a ON a.owner=s.owner WHERE s.token_hash=$1 AND s.expires_at>$2`, [hash(token), this.now()]);
    const row = rows[0]; if (!row || (row.deleted_at && !allowDeleted)) throw unauthorized();
    return { owner: row.owner, accessToken: this.decrypt(row.provider_session), purpose: row.purpose, deleted: !!row.deleted_at, expiresAt: row.expires_at };
  }
  async revoke(owner: string) { await this.pool.query('DELETE FROM kooch.sessions WHERE owner=$1', [owner]); }
  async rateLimit(identity: string) {
    const key = createHmac('sha256', this.key).update(identity).digest('hex');
    const now = this.now();
    const { rows } = await this.pool.query(`INSERT INTO kooch.rate_limits(key,count,reset_at) VALUES($1,1,$3)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN kooch.rate_limits.reset_at<=$2 THEN 1 ELSE kooch.rate_limits.count+1 END,
      reset_at=CASE WHEN kooch.rate_limits.reset_at<=$2 THEN $3 ELSE kooch.rate_limits.reset_at END RETURNING count`, [key, now, new Date(now.getTime() + 10 * 60000)]);
    if (rows[0].count > (identity === 'global' ? 200 : 20)) throw new AccountError('rate_limited', 429, 'تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کن.');
  }
  private async owned<T>(owner: string, action: (client: PoolClient) => Promise<T>, allowDeleted = false) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const state = await client.query('SELECT deleted_at FROM kooch.account_state WHERE owner=$1 FOR UPDATE', [owner]);
      if (!state.rows[0] || (state.rows[0].deleted_at && !allowDeleted)) throw unauthorized();
      await client.query('SET LOCAL ROLE kooch_runtime');
      await client.query("SELECT set_config('kooch.owner',$1,true)", [owner]);
      const expired = await client.query('SELECT * FROM kooch.cases WHERE owner=$1 AND delete_after<=$2', [owner, this.now()]);
      for (const row of expired.rows) await this.detachDraft?.(owner, this.visible(row), client);
      await client.query('DELETE FROM kooch.cases WHERE owner=$1 AND delete_after<=$2', [owner, this.now()]);
      const result = await action(client);
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  private visible(row: Record<string, any>): SavedCase {
    return { form: row.form, id: row.id, revision: row.revision, answers: row.answers, step: row.step,
      consent_version: row.consent_version, last_activity_at: row.last_activity_at.toISOString(), delete_after: row.delete_after.toISOString() };
  }
  async read(owner: string, id?: string) {
    return this.owned(owner, async client => {
      const { rows } = await client.query('SELECT * FROM kooch.cases WHERE owner=$1 AND ($2::uuid IS NULL OR id=$2)', [owner, id ?? null]);
      if (id && !rows[0]) throw new AccountError('not_found', 404, 'پرونده در دسترس نیست.');
      return rows[0] ? this.visible(rows[0]) : null;
    });
  }
  async save(owner: string, input: CaseInput) {
    return this.owned(owner, async client => {
      const payloadHash = hash(JSON.stringify(input));
      const receipt = await client.query('SELECT * FROM kooch.requests WHERE owner=$1 AND request_id=$2', [owner, input.request_id]);
      const { rows } = await client.query('SELECT * FROM kooch.cases WHERE owner=$1', [owner]);
      const current = rows[0];
      if (receipt.rows[0]) {
        if (receipt.rows[0].payload_hash !== payloadHash) throw new AccountError('request_conflict', 409, 'این درخواست قبلاً با پاسخ دیگری ثبت شده است.');
        if (!current || receipt.rows[0].revision !== current.revision) throw new AccountError('revision_conflict', 409, 'پاسخ‌ها تغییر کرده‌اند؛ نسخهٔ تازه را دریافت کن.');
        return this.visible(current);
      }
      if ((current?.revision ?? 0) !== input.expected_revision) throw new AccountError('revision_conflict', 409, 'پاسخ‌ها در جای دیگری تغییر کرده‌اند؛ نسخهٔ تازه را دریافت کن.');
      if (current) await this.detachDraft?.(owner, this.visible(current), client);
      const now = this.now(); const deleteAfter = new Date(now.getTime() + 90 * 86400000);
      const saved = await client.query(`INSERT INTO kooch.cases(owner,answers,step,consent_version,consented_at,last_activity_at,delete_after)
        VALUES($1,$2,$3,$4,$5,$5,$6) ON CONFLICT(owner) DO UPDATE SET answers=$2,step=$3,
        revision=kooch.cases.revision+1,consent_version=$4,last_activity_at=$5,delete_after=$6,form=$7 RETURNING *`,
      [owner, input.answers, input.step, input.consent, now, deleteAfter, current ? reconcileCompass(this.visible(current), input.answers) : { schema_version: 1, answers: {} }]);
      const row = saved.rows[0];
      await client.query('INSERT INTO kooch.requests(owner,request_id,payload_hash,case_id,revision) VALUES($1,$2,$3,$4,$5)',
        [owner, input.request_id, payloadHash, row.id, row.revision]);
      return this.visible(row);
    });
  }
  async saveForm(owner: string, input: FormInput, draftId?: string) {
    return this.owned(owner, async client => {
      const payloadHash = hash(JSON.stringify({ operation: 'form', ...(draftId ? { draftId } : {}), ...input }));
      const { rows } = await client.query('SELECT * FROM kooch.cases WHERE owner=$1', [owner]);
      const current = rows[0];
      if (!current) throw new AccountError('not_found', 404, 'ابتدا پاسخ‌های قطب‌نما را ذخیره کن.');
      const receipt = await client.query('SELECT * FROM kooch.requests WHERE owner=$1 AND request_id=$2', [owner, input.request_id]);
      if (receipt.rows[0]) {
        if (receipt.rows[0].payload_hash !== payloadHash) throw new AccountError('request_conflict', 409, 'این درخواست قبلاً با پاسخ دیگری ثبت شده است.');
        if (receipt.rows[0].revision !== current.revision) throw new AccountError('revision_conflict', 409, 'پاسخ‌ها تغییر کرده‌اند؛ نسخهٔ تازه را دریافت کن.');
        return this.visible(current);
      }
      if (current.revision !== input.expected_revision) throw new AccountError('revision_conflict', 409, 'پاسخ‌ها تغییر کرده‌اند؛ نسخهٔ تازه را دریافت کن.');
      if (draftId && (current.form?.draft?.id !== draftId || current.form.draft.status !== 'proposed' || current.form.draft.question_id !== input.question_id || current.form.draft.question_version !== input.question_version)) throw new AccountError('draft_conflict', 409, 'برداشت قابل تأیید نیست؛ فرم تازه را دریافت کن.');
      const records = formRecords(this.visible(current));
      const question = relevantQuestions(records, current.answers.destinations).find(q => q.id === input.question_id);
      if (!question) throw new AccountError('invalid_question', 400, 'این سؤال در وضعیت فعلی مرتبط نیست.');
      if (question.version !== input.question_version) throw new AccountError('question_conflict', 409, 'نسخهٔ سؤال تغییر کرده است؛ فرم تازه را دریافت کن.');
      if (!validateAnswer(question, input.answer)) throw new AccountError('invalid_answer', 400, 'پاسخ با گزینه‌ها یا واحد این سؤال سازگار نیست.');
      const now = this.now();
      await this.detachDraft?.(owner, this.visible(current), client);
      const { form, answers } = applyFormAnswer(this.visible(current), input, now);
      const saved = await client.query(`UPDATE kooch.cases SET form=$2,revision=revision+1,last_activity_at=$3,delete_after=$4,answers=$5
        WHERE owner=$1 RETURNING *`, [owner, form, now, new Date(now.getTime() + 90 * 86400000), answers]);
      const row = saved.rows[0];
      await client.query('INSERT INTO kooch.requests(owner,request_id,payload_hash,case_id,revision) VALUES($1,$2,$3,$4,$5)',
        [owner, input.request_id, payloadHash, row.id, row.revision]);
      return this.visible(row);
    });
  }
  async startInterpretation(owner: string, input: Extract<InterpretationInput, { action: 'submit' }>) {
    return this.owned(owner, async client => {
      const { rows } = await client.query('SELECT * FROM kooch.cases WHERE owner=$1', [owner]);
      if (!rows[0]) throw new AccountError('not_found', 404, 'ابتدا قطب‌نما را ذخیره کن.');
      const saved = this.visible(rows[0]);
      const payloadHash = hash(JSON.stringify({ operation: 'interpretation', ...input }));
      const receipt = await client.query('SELECT * FROM kooch.requests WHERE owner=$1 AND request_id=$2', [owner, input.request_id]);
      if (receipt.rows[0]) {
        if (receipt.rows[0].payload_hash !== payloadHash || receipt.rows[0].revision !== saved.revision) throw new AccountError('request_conflict', 409, 'نسخه یا متن درخواست تغییر کرده؛ فرم تازه را دریافت کن.');
        return { saved, started: false };
      }
      if (saved.revision !== input.expected_revision) throw new AccountError('revision_conflict', 409, 'نسخهٔ تازهٔ فرم را دریافت کن.');
      const question = relevantQuestions(formRecords(saved), saved.answers.destinations).find(q => q.id === input.question_id);
      if (!question) throw new AccountError('invalid_question', 400, 'این سؤال مرتبط نیست.');
      if (question.version !== input.question_version) throw new AccountError('question_conflict', 409, 'نسخهٔ سؤال تغییر کرده است.');
      const form = structuredClone(saved.form ?? { schema_version: 1 as const, answers: {} });
      await this.detachDraft?.(owner, saved, client);
      form.draft = { id: input.request_id, revision: saved.revision + 1, question_id: question.id, question_version: question.version, text: input.text, disclosure: input.disclosure, status: 'pending' };
      const now = this.now();
      const result = await client.query('UPDATE kooch.cases SET form=$2,revision=revision+1,last_activity_at=$3,delete_after=$4 WHERE owner=$1 RETURNING *', [owner, form, now, new Date(now.getTime() + 90 * 86400000)]);
      await client.query('INSERT INTO kooch.requests(owner,request_id,payload_hash,case_id,revision) VALUES($1,$2,$3,$4,$5)', [owner, input.request_id, payloadHash, saved.id, saved.revision + 1]);
      return { saved: this.visible(result.rows[0]), started: true };
    });
  }
  async finishInterpretation(owner: string, caseId: string, revision: number, draftId: string, result: InterpretationResult) {
    return this.owned(owner, async client => {
      const { rows } = await client.query('SELECT * FROM kooch.cases WHERE owner=$1', [owner]);
      if (!rows[0]) throw new AccountError('not_found', 404, 'پرونده در دسترس نیست.');
      const saved = this.visible(rows[0]);
      if (saved.id !== caseId || saved.revision !== revision || saved.form?.draft?.id !== draftId || saved.form.draft.status !== 'pending') return saved;
      const form = structuredClone(saved.form);
      form.draft = { ...form.draft!, ...result };
      await client.query('UPDATE kooch.cases SET form=$2 WHERE owner=$1', [owner, form]);
      return { ...saved, form };
    });
  }
  async resolveInterpretation(owner: string, input: Exclude<InterpretationInput, { action: 'submit' }>) {
    // Confirmation goes through the same answer validation, conflict and receipt path as fixed inputs.
    if (input.action === 'confirm') {
      // The draft check and revision check happen under the saveForm owner lock.
      // Retried confirmations use their stored receipt even after the draft is gone.
      return this.saveForm(owner, { expected_revision: input.expected_revision, request_id: input.request_id, question_id: input.question_id, question_version: input.question_version, answer: input.answer, confirm_conflict: input.confirm_conflict }, input.draft_id);
    }
    return this.owned(owner, async client => {
      const { rows } = await client.query('SELECT * FROM kooch.cases WHERE owner=$1', [owner]);
      const payloadHash = hash(JSON.stringify({ operation: 'interpretation-reject', ...input }));
      const receipt = await client.query('SELECT * FROM kooch.requests WHERE owner=$1 AND request_id=$2', [owner, input.request_id]);
      if (receipt.rows[0]) {
        if (!rows[0] || receipt.rows[0].payload_hash !== payloadHash || receipt.rows[0].revision !== rows[0].revision) throw new AccountError('request_conflict', 409, 'نسخهٔ درخواست تغییر کرده است.');
        return this.visible(rows[0]);
      }
      if (!rows[0] || rows[0].revision !== input.expected_revision || rows[0].form?.draft?.id !== input.draft_id) throw new AccountError('draft_conflict', 409, 'پیش‌نویس تغییر کرده است؛ فرم تازه را دریافت کن.');
      await this.detachDraft?.(owner, this.visible(rows[0]), client);
      const form = structuredClone(rows[0].form); delete form.draft;
      const result = await client.query('UPDATE kooch.cases SET form=$2,revision=revision+1 WHERE owner=$1 RETURNING *', [owner, form]);
      await client.query('INSERT INTO kooch.requests(owner,request_id,payload_hash,case_id,revision) VALUES($1,$2,$3,$4,$5)', [owner, input.request_id, payloadHash, rows[0].id, result.rows[0].revision]);
      return this.visible(result.rows[0]);
    });
  }
  async beginDelete(owner: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE kooch.account_state SET deleted_at=COALESCE(deleted_at,$2) WHERE owner=$1', [owner, this.now()]);
      await client.query('SET LOCAL ROLE kooch_runtime'); await client.query("SELECT set_config('kooch.owner',$1,true)", [owner]);
      await client.query('DELETE FROM kooch.cases WHERE owner=$1', [owner]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async readReport(owner: string, id?: string) {
    return this.owned(owner, async client => {
      const result = await client.query('SELECT id,version,snapshot FROM kooch.reports WHERE owner=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY version DESC LIMIT 1', [owner, id ?? null]);
      if (id && !result.rows[0]) throw new AccountError('not_found', 404, 'کارنامه در دسترس نیست.');
      const row = result.rows[0];
      if (!row) return { report: null, report_state: null };
      const report = { ...row.snapshot, id: row.id, version: row.version } as GuidanceReport;
      const current = await client.query('SELECT revision FROM kooch.cases WHERE owner=$1', [owner]);
      const latest = await client.query('SELECT max(version)::int AS version FROM kooch.reports WHERE owner=$1', [owner]);
      return { report, report_state: reportState(report, current.rows[0]?.revision, latest.rows[0].version, this.now()) };
    });
  }
  async listReports(owner: string): Promise<ReportHistoryItem[]> {
    return this.owned(owner, async client => {
      const { rows } = await client.query('SELECT id,version,snapshot FROM kooch.reports WHERE owner=$1 ORDER BY version', [owner]);
      const current = await client.query('SELECT revision FROM kooch.cases WHERE owner=$1', [owner]);
      const reports = rows.map(row => ({ ...row.snapshot, id: row.id, version: row.version }) as GuidanceReport);
      const latest = reports.at(-1)?.version ?? 0; const now = this.now();
      return reports.map((report, index) => ({ id: report.id, version: report.version, created_at: report.created_at,
        case_revision: report.case_revision, coverage: report.coverage, changes: reportChanges(report, reports[index - 1]),
        report_state: reportState(report, current.rows[0]?.revision, latest, now) })).reverse();
    });
  }
  async exportReports(owner: string): Promise<GuidanceReport[]> {
    return this.owned(owner, async client => {
      const { rows } = await client.query('SELECT id,version,snapshot FROM kooch.reports WHERE owner=$1 ORDER BY version', [owner]);
      return rows.map(row => ({ ...row.snapshot, id: row.id, version: row.version }));
    });
  }
  async saveReport(owner: string, input: ReportInput) {
    return this.owned(owner, async client => {
      const payloadHash = hash(JSON.stringify({ operation: 'report', ...input }));
      const receipt = await client.query('SELECT * FROM kooch.reports WHERE owner=$1 AND request_id=$2', [owner, input.request_id]);
      if (receipt.rows[0]) {
        const row = receipt.rows[0];
        if (row.payload_hash !== payloadHash) throw new AccountError('request_conflict', 409, 'این درخواست قبلاً با اطلاعات دیگری ثبت شده است.');
        return { ...row.snapshot, id: row.id, version: row.version } as GuidanceReport;
      }
      const current = await client.query('SELECT * FROM kooch.cases WHERE owner=$1', [owner]);
      if (!current.rows[0]) throw new AccountError('not_found', 404, 'ابتدا پاسخ‌های قطب‌نما را ذخیره کن.');
      const saved = this.visible(current.rows[0]);
      if (saved.revision !== input.expected_revision) throw new AccountError('revision_conflict', 409, 'پاسخ‌ها تغییر کرده‌اند؛ نسخهٔ تازه را دریافت کن.');
      const count = await client.query('SELECT count(*)::int AS count FROM kooch.reports WHERE owner=$1', [owner]);
      if (count.rows[0].count >= 100) throw new AccountError('report_limit', 429, 'سقف نسخه‌های کارنامهٔ این پرونده پر شده است؛ نسخه‌های موجود در دسترس‌اند.');
      const now = this.now();
      const snapshot = buildReport(saved, now);
      const result = await client.query('INSERT INTO kooch.reports(owner,case_id,version,request_id,payload_hash,snapshot) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version',
        [owner, saved.id, count.rows[0].count + 1, input.request_id, payloadHash, snapshot]);
      await client.query('UPDATE kooch.cases SET last_activity_at=$2,delete_after=$3 WHERE owner=$1', [owner, now, new Date(now.getTime() + 90 * 86400000)]);
      return { ...snapshot, ...result.rows[0] } as GuidanceReport;
    });
  }
  async finishDelete(owner: string) {
    await this.pool.query('UPDATE kooch.account_state SET auth_deleted=true WHERE owner=$1', [owner]);
    await this.revoke(owner);
  }
  async purgeInactive() {
    const { rows } = await this.pool.query('SELECT owner FROM kooch.account_state WHERE deleted_at IS NULL');
    for (const row of rows) await this.owned(row.owner, async () => {});
    await this.pool.query('DELETE FROM kooch.sessions WHERE expires_at<=$1', [this.now()]);
    await this.pool.query('DELETE FROM kooch.rate_limits WHERE reset_at<=$1', [this.now()]);
  }
}
