export {};
// The same bounded worker endpoint is used by the daily schedule and manual recovery.
// Never print the credential, request headers, response payload, or server error text.
const workerOrigin = process.env.KOOCH_EVIDENCE_ORIGIN ?? 'https://my.kooch.app';
const secret = process.env.KOOCH_EVIDENCE_SYNC_SECRET;
if (!['https://my.kooch.app','http://127.0.0.1:3100'].includes(workerOrigin) || !secret || secret.length < 43) throw new Error('Evidence worker configuration is missing or invalid.');
let completed = false;
for (let step=0;step<26;step++) {
  let response: Response;
  try { response = await fetch(`${workerOrigin}/api/evidence/sync`, { method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(30000) }); }
  catch { throw new Error('Evidence worker connection failed; checkpoint remains available for manual recovery.'); }
  if (!response.ok) throw new Error(`Evidence worker returned HTTP ${response.status}; no automatic retry.`);
  const result=await response.json();
  console.log(JSON.stringify({state:result.state,checkpoint:result.checkpoint,expected_pages:result.expected_pages,review_required:result.coverage?.review_required}));
  if(result.state==='error')throw new Error('Source retrieval failed; previous reviewed data remains unchanged.');
  if(result.state!=='fetching') {completed=true;if(result.state==='review_required')process.exitCode=2;break;}
}
if(!completed)throw new Error('Evidence checkpoint requires a later manual continuation.');
