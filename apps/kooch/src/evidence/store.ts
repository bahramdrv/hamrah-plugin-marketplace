import type { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { snapshotSchema, type Snapshot } from '../snapshot';
import { z } from 'zod';
import type { EvidenceReview } from '../report/contract';
import { manifestSchema, publicPageSchema, shaSchema, type ReviewItem } from './contract';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export type EvidenceState = {
  schema_version: 1; active: { id: string; snapshot: Snapshot }; candidate: { id: string; snapshot: Snapshot } | null; reviews: ReviewItem[];
  checkpoint: { id: string; manifest_payload: string; page_payloads: string[] } | null;
  last_attempt_at: string | null; last_success_at: string | null;
  state: 'idle' | 'fetching' | 'ok' | 'review_required' | 'error'; code: string | null;
};
export function decodeCheckpoint(checkpoint: NonNullable<EvidenceState['checkpoint']>) {
  if (digest(checkpoint.manifest_payload) !== checkpoint.id) throw new Error('Invalid checkpoint hash');
  const manifest = manifestSchema.parse(JSON.parse(checkpoint.manifest_payload));
  if (checkpoint.page_payloads.length > manifest.pages.length || Buffer.byteLength(JSON.stringify(checkpoint.page_payloads)) > 8_000_000) throw new Error('Invalid checkpoint size');
  const pages = checkpoint.page_payloads.map((raw, index) => {
    if (digest(raw) !== manifest.pages[index].sha256) throw new Error('Invalid checkpoint page hash');
    const page = publicPageSchema.parse(JSON.parse(raw));
    if (page.index !== index || page.routes.length !== manifest.pages[index].count) throw new Error('Invalid checkpoint page');
    return page;
  });
  return { manifest, pages };
}
const version = z.object({ id: shaSchema, snapshot: snapshotSchema }).strict();
const stateSchema = z.object({ schema_version: z.literal(1), active: version, candidate: version.nullable(),
  reviews: z.array(z.object({ route_id: z.string().max(200), reason: z.enum(['added','removed','evidence_changed']), fields: z.array(z.string().max(80)).max(10), candidate_id: shaSchema }).strict()).max(1000),
  checkpoint: z.object({ id: shaSchema, manifest_payload: z.string().max(2_000_000), page_payloads: z.array(z.string().max(2_000_000)).max(25) }).strict().nullable(),
  last_attempt_at: z.iso.datetime({offset:true}).nullable(), last_success_at: z.iso.datetime({offset:true}).nullable(),
  state: z.enum(['idle','fetching','ok','review_required','error']), code: z.string().max(80).nullable(),
}).strict();
export class EvidenceStore {
  readonly baseline: Snapshot; readonly now: () => Date;
  private namespace: string;
  constructor(private options: { pool: Pool; baseline: unknown; namespace?: string; now?: () => Date }) {
    this.baseline = snapshotSchema.parse(options.baseline); this.namespace = options.namespace ?? 'public-iran-start-v1'; this.now = options.now ?? (() => new Date());
  }
  private initial(): EvidenceState {
    return { schema_version: 1, active: { id: digest(JSON.stringify(this.baseline)), snapshot: this.baseline }, candidate: null, reviews: [], checkpoint: null,
      last_attempt_at: null, last_success_at: null, state: 'idle', code: null };
  }
  private async load(client: Pick<PoolClient, 'query'>): Promise<EvidenceState> {
    const { rows } = await client.query('SELECT document FROM kooch.evidence_sync_state WHERE id=$1', [this.namespace]);
    if (!rows.length) return this.initial();
    const document = stateSchema.parse(rows[0].document);
    if (document.checkpoint) decodeCheckpoint(document.checkpoint);
    return document;
  }
  async read(client?: Pick<PoolClient, 'query'>): Promise<EvidenceState> { return this.load(client ?? this.options.pool); }
  async reportReview(client?: Pick<PoolClient, 'query'>): Promise<EvidenceReview> {
    const state = await this.read(client);
    return { routeIds: state.reviews.map(r => r.route_id), retrievalFailed: state.state === 'error' };
  }
  async advance(run: (state: EvidenceState) => Promise<EvidenceState>): Promise<EvidenceState | null> {
    const client = await this.options.pool.connect();
    try {
      await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout='28s'");
      const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired', [`kooch-evidence:${this.namespace}`]);
      if (!lock.rows[0].acquired) { await client.query('ROLLBACK'); return null; }
      const state = await run(await this.load(client));
      await client.query('INSERT INTO kooch.evidence_sync_state(id,document) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document', [this.namespace, state]);
      await client.query('COMMIT'); return state;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}
