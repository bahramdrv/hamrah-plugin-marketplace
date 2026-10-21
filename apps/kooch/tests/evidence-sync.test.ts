import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import baseline from '../data/iran-start-snapshot.json';
import { createEvidenceApi } from '../src/evidence/api';
import { EvidenceStore } from '../src/evidence/store';
const enabled = Boolean(process.env.KOOCH_DATABASE_URL);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const adminSecret = 'a'.repeat(64), syncSecret = 'b'.repeat(64);
function sourceFixture(routes = baseline.routes) {
  const pages = [routes.slice(0, 15), routes.slice(15)].filter(p => p.length).map((routes, index) => JSON.stringify({ index, routes }));
  const payload = JSON.stringify({ contract_version: 1, mapping_version: 'iran-start-route-key-1', scope: 'iran-start',
    generated_at: '2026-10-21T00:00:00Z', expires_at: '2026-10-23T00:00:00Z', freshness_policy: 'iran-channel-14-days-1',
    total: routes.length, coverage: { ...baseline.coverage, documented_start: routes.length }, sources: baseline.sources,
    pages: pages.map((p, index) => ({ index, sha256: hash(p), count: JSON.parse(p).routes.length })) });
  const id = hash(payload);
  return { id, fetch: async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined); assert.equal(init?.redirect, 'error');
    const path = new URL(String(url)); assert.equal(path.origin, 'https://kooch.app');
    if (path.pathname.endsWith('/evidence-manifest')) return Response.json({ snapshot_id: id, payload });
    assert.match(path.pathname, new RegExp(`/evidence-page/${id}/[01]$`));
    const index = Number(path.pathname.split('/').at(-1));
    return Response.json({ snapshot_id: id, index, payload: pages[index] });
  } };
}
async function setup(fetcher: typeof fetch, now: () => Date = () => new Date('2026-10-21T12:00:00Z')) {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const namespace = randomUUID();
  const store = new EvidenceStore({ pool, namespace, baseline, now });
  const api = createEvidenceApi({ store, fetch: fetcher, adminSecret, syncSecret });
  const request = (path: string, secret = path === 'sync' ? syncSecret : adminSecret, method = path === 'sync' ? 'POST' : 'GET') =>
    api.handle(new Request(`http://localhost/api/evidence/${path}`, { method, headers: { authorization: `Bearer ${secret}` } }), path);
  return { store, request, pool, namespace, close: async () => { await pool.query('DELETE FROM kooch.evidence_sync_state WHERE id=$1', [namespace]); await pool.end(); } };
}
test('complete immutable public pages activate atomically and a failed page resumes without replacing the healthy snapshot', { skip: !enabled }, async () => {
  const fixture = sourceFixture(); let fail = true;
  const h = await setup(async (url, init) => {
    if (String(url).endsWith('/1') && fail) throw new Error('network detail must not leak');
    return fixture.fetch(url, init);
  });
  try {
    let r = await h.request('sync'); assert.equal(r.status, 200);
    let data = await r.json(); assert.equal(data.state, 'fetching'); assert.equal(data.checkpoint, 1);
    const first = await h.store.read(); assert.equal(first.active.snapshot.retrieved_at, baseline.retrieved_at);
    r = await h.request('sync'); data = await r.json(); assert.equal(data.state, 'error');
    assert.ok(!JSON.stringify(data).includes('network detail')); assert.equal(data.checkpoint, 1);
    fail = false; data = await (await h.request('sync')).json(); assert.equal(data.state, 'ok');
    const after = await h.store.read(); assert.equal(after.active.id, fixture.id);
    assert.equal(after.active.snapshot.routes.length, 29); assert.deepEqual(after.active.snapshot.sources, baseline.sources);
    assert.deepEqual(after.active.snapshot.routes[0].application, baseline.routes[0].application);
    const retry = await (await h.request('sync')).json(); assert.equal(retry.state, 'ok');
    assert.equal((await h.store.read()).active.id, fixture.id);
  } finally { await h.close(); }
});

test('a changed condition is quarantined, visible only to the independent administrator, and excluded from matching', { skip: !enabled }, async () => {
  const changed = structuredClone(baseline.routes);
  changed.find(r => r.id === 'uk:student')!.application.reason_fa = 'شرط تصمیم‌ساز تازه نیازمند بررسی رسمی است.';
  const fixture = sourceFixture(changed); const h = await setup(fixture.fetch);
  try {
    assert.equal((await h.request('status', '')).status, 401);
    assert.equal((await h.request('status', syncSecret)).status, 401);
    assert.equal((await h.request('sync', adminSecret)).status, 401);
    await h.request('sync'); const completed = await (await h.request('sync')).json();
    assert.equal(completed.state, 'review_required');
    const status = await h.request('status'); assert.equal(status.headers.get('cache-control'), 'no-store');
    const body = await status.json(); assert.equal(body.coverage.current, 28);
    assert.equal(body.reviews[0].route_id, 'uk:student'); assert.deepEqual(body.reviews[0].fields, ['application']);
    const { consumableSnapshot } = await import('../src/evidence/sync');
    const { createCompassApi } = await import('../src/api');
    const response = await createCompassApi({ snapshot: consumableSnapshot(await h.store.read()), now: () => new Date('2026-10-21T12:00:00Z') }).POST(new Request('http://localhost/api/compass', {
      method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({goal:'study',destinations:['uk']}),
    }));
    assert.equal((await response.json()).routes.length, 0);
    assert.equal((await h.store.read()).active.snapshot.routes.find(r=>r.id==='uk:student')!.application.reason_fa, baseline.routes.find(r=>r.id==='uk:student')!.application.reason_fa);
  } finally { await h.close(); }
});

test('known source changes mark consuming saved reports for review and never mutate their snapshots', { skip: !enabled }, async () => {
  const { harness, saveInput } = await import('./helpers/account');
  let blocked: readonly string[] = [];
  const h = await harness(() => new Date('2026-10-21T12:00:00Z'), undefined, undefined, undefined, async () => ({routeIds:blocked,retrievalFailed:false}));
  try {
    const c = await h.verifiedClient(); await c.request('case', saveInput());
    const first = (await (await c.request('report', { expected_revision: 1, request_id: randomUUID() })).json()).report;
    blocked = ['uk:student'];
    const viewed = await (await c.request(`report/${first.id}`)).json();
    assert.deepEqual(viewed.report, first); assert.equal(viewed.report_state.evidence_current, false);
    const next = (await (await c.request('report', { expected_revision: 1, request_id: randomUUID() })).json()).report;
    assert.equal(next.route_results[0].status, 'needs_review'); assert.equal(next.route_results[0].costs.government_fee.amount, null);
    assert.ok(next.route_results[0].conditions.some((c: any) => c.id === 'source_change'));
    assert.deepEqual((await (await c.request('reports')).json()).reports[0].changes, ['evidence_changed']);
    assert.deepEqual((await (await c.request(`report/${first.id}`)).json()).report, first);
  } finally { await h.close(); }
});

test('one operation deadline also bounds a stalled response stream and retains the healthy version', { skip: !enabled }, async () => {
  const pool = new pg.Pool({connectionString:process.env.KOOCH_DATABASE_URL}); const namespace=randomUUID();
  const store=new EvidenceStore({pool,namespace,baseline});
  const api=createEvidenceApi({store,adminSecret,syncSecret,deadlineMs:40,fetch:async()=>new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}})});
  try {
    const started=Date.now();
    const r=await api.handle(new Request('http://localhost/api/evidence/sync',{method:'POST',headers:{authorization:`Bearer ${syncSecret}`}}),'sync');
    assert.equal((await r.json()).state,'error'); assert.ok(Date.now()-started<1000);
    assert.equal((await store.read()).active.snapshot.retrieved_at,baseline.retrieved_at);
  } finally {await pool.query('DELETE FROM kooch.evidence_sync_state WHERE id=$1',[namespace]);await pool.end();}
});

test('corrupt hashes, mixed captures, duplicate identities and private fields cannot replace reviewed data', { skip: !enabled }, async () => {
  for (const kind of ['hash','mixed','duplicate','private'] as const) {
    const routes=structuredClone(baseline.routes);
    if(kind==='duplicate')routes[15]=routes[0];
    if(kind==='private')Object.assign(routes[0],{owner:'not-public',email:'private@example.test'});
    const fixture=sourceFixture(routes);
    const h=await setup(async(url,init)=>{
      const response=await fixture.fetch(url,init);
      if(!String(url).endsWith('manifest')&&(kind==='hash'||kind==='mixed')) {
        const body=await response.json();if(kind==='hash')body.payload+=' ';else body.snapshot_id='0'.repeat(64);return Response.json(body);
      }
      return response;
    });
    try {
      let body=await (await h.request('sync')).json();
      if(body.state==='fetching')body=await (await h.request('sync')).json();
      assert.equal(body.state,'error',kind);assert.equal((await h.store.read()).active.snapshot.retrieved_at,baseline.retrieved_at);
    } finally {await h.close();}
  }
});

test('freshness is enforced when consumed without cron and an expired checkpoint never mixes with a new capture', { skip: !enabled }, async () => {
  let now=new Date('2026-10-21T12:00:00Z');const fixture=sourceFixture();const h=await setup(fixture.fetch,()=>now);
  try {
    await h.request('sync');now=new Date('2026-10-24T12:00:00Z');
    assert.equal((await (await h.request('sync')).json()).state,'error');
    assert.equal((await h.store.read()).active.snapshot.retrieved_at,baseline.retrieved_at);
    now=new Date('2026-10-30T12:00:00Z');
    const status=await (await h.request('status')).json();assert.equal(status.coverage.current,0);assert.equal(status.coverage.expired,29);
    const {createCompassApi}=await import('../src/api');
    const result=await (await createCompassApi({snapshot:(await h.store.read()).active.snapshot,now:()=>now}).GET()).json();
    assert.equal(result.data.coverage.current,0);
  } finally {await h.close();}
});

test('concurrent workers return busy without duplicating a page or losing the checkpoint', { skip: !enabled }, async () => {
  const fixture=sourceFixture();let release!:()=>void;let started!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve),began=new Promise<void>(resolve=>started=resolve);
  let calls=0;
  const h=await setup(async(url,init)=>{calls++;if(calls===1){started();await gate;}return fixture.fetch(url,init);});
  try {
    const first=h.request('sync');await began;
    assert.equal((await h.request('sync')).status,409);assert.equal(calls,1);release();
    assert.equal((await (await first).json()).checkpoint,1);
    assert.equal((await (await h.request('sync')).json()).state,'ok');
  } finally {release();await h.close();}
});

test('only a separately reviewed baseline release clears the candidate review queue', { skip: !enabled }, async () => {
  const routes=structuredClone(baseline.routes);routes[0].application.reason_fa='قاعدهٔ بازبینی‌شدهٔ تازه';
  const fixture=sourceFixture(routes),h=await setup(fixture.fetch);
  try {
    await h.request('sync');assert.equal((await (await h.request('sync')).json()).state,'review_required');
    assert.equal((await (await h.request('sync')).json()).state,'review_required');
    const candidate=await (await h.request('candidate')).json();assert.equal(candidate.candidate.id,fixture.id);
    assert.equal(candidate.candidate.snapshot.routes[0].application.reason_fa,'قاعدهٔ بازبینی‌شدهٔ تازه');
    const reviewed=new EvidenceStore({pool:h.pool,namespace:h.namespace,baseline:{...baseline,routes},now:()=>new Date('2026-10-21T12:00:00Z')});
    const api=createEvidenceApi({store:reviewed,adminSecret,syncSecret,fetch:fixture.fetch});
    const r=await api.handle(new Request('http://localhost/api/evidence/sync',{method:'POST',headers:{authorization:`Bearer ${syncSecret}`}}),'sync');
    assert.equal((await r.json()).state,'ok');assert.equal((await reviewed.read()).reviews.length,0);
  } finally {await h.close();}
});

test('report creation can read public evidence with a one-connection pool without inventing review warnings', { skip: !enabled }, async () => {
  const {harness,saveInput}=await import('./helpers/account');let evidence!:EvidenceStore;
  const h=await harness(()=>new Date('2026-10-21T12:00:00Z'),undefined,undefined,undefined,client=>evidence.reportReview(client),{max:1,connectionTimeoutMillis:100});
  evidence=new EvidenceStore({pool:h.pool,namespace:randomUUID(),baseline});
  try {
    const c=await h.verifiedClient();await c.request('case',saveInput());
    const created=await (await c.request('report',{expected_revision:1,request_id:randomUUID()})).json();
    assert.equal(created.report_state.evidence_current,true);
    assert.ok(!created.report.route_results[0].conditions.some((r:any)=>r.id==='source_change'));
  } finally {await h.close();}
});

test('a missing immutable page resets only its checkpoint and the next run starts a fresh capture', { skip: !enabled }, async () => {
  const old=sourceFixture(),routes=structuredClone(baseline.routes);routes[0].name_fa='برچسب توصیفی تازهٔ مسیر';const next=sourceFixture(routes);let vanished=false;
  const h=await setup(async(url,init)=>{
    if(String(url).endsWith('manifest'))return (vanished?next:old).fetch(url,init);
    if(String(url).includes(old.id)&&String(url).endsWith('/1')){vanished=true;return Response.json({error:'snapshot_expired'},{status:410});}
    return (String(url).includes(next.id)?next:old).fetch(url,init);
  });
  try {
    await h.request('sync');const failed=await (await h.request('sync')).json();
    assert.equal(failed.state,'error');assert.equal(failed.code,'snapshot_expired');assert.equal(failed.checkpoint,null);
    assert.equal((await h.store.read()).active.snapshot.retrieved_at,baseline.retrieved_at);
    assert.equal((await (await h.request('sync')).json()).checkpoint,1);
    assert.equal((await (await h.request('sync')).json()).active_id,next.id);
  } finally {await h.close();}
});

test('network failure puts consuming reports under review without claiming that a condition changed', { skip: !enabled }, async () => {
  const fixture=sourceFixture();let offline=false;
  const sync=await setup(async(url,init)=>{if(offline)throw Error('offline');return fixture.fetch(url,init);});
  const {harness,saveInput}=await import('./helpers/account');
  const h=await harness(()=>new Date('2026-10-21T12:00:00Z'),undefined,undefined,undefined,()=>sync.store.reportReview());
  try {
    const c=await h.verifiedClient();await c.request('case',saveInput());
    const first=(await (await c.request('report',{expected_revision:1,request_id:randomUUID()})).json()).report;
    offline=true;assert.equal((await (await sync.request('sync')).json()).state,'error');
    const viewed=await (await c.request(`report/${first.id}`)).json();assert.deepEqual(viewed.report,first);assert.equal(viewed.report_state.current,false);
    const created=await (await c.request('report',{expected_revision:1,request_id:randomUUID()})).json();
    assert.equal(created.report.route_results[0].status,'needs_review');
    assert.ok(created.report.route_results[0].conditions.some((r:any)=>r.id==='source_sync'));
    assert.ok(!created.report.route_results[0].conditions.some((r:any)=>r.id==='source_change'));
  } finally {await h.close();await sync.close();}
});
