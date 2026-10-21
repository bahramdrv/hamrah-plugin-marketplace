import { operationStatus } from '../../../../src/operations/status';
import { publicEvidenceStore } from '../../../../src/account/runtime';
import { createEvidenceApi } from '../../../../src/evidence/api';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;
async function handle(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const store = await publicEvidenceStore(); if (!store) throw new Error();
    return createEvidenceApi({ store, operations: operationStatus, adminSecret: process.env.KOOCH_EVIDENCE_ADMIN_SECRET, syncSecret: process.env.KOOCH_EVIDENCE_SYNC_SECRET }).handle(request, (await context.params).action);
  } catch { return Response.json({error:'evidence_unavailable'}, {status:503,headers:{'Cache-Control':'no-store','Vary':'Authorization'}}); }
}
export const GET = handle;
export const POST = handle;
