// Extension-origin IndexedDB only; no requests, cookies or merchant login state.
export const HISTORY_LIMIT=200, HISTORY_DAYS=30, HISTORY_BYTES=5*1024*1024;
export function historyEntry(data,assessment,shopLabel){
 const shop=String(shopLabel||'').trim().slice(0,80);if(!shop)throw Error('请填写店铺备注后保存历史');
 const scope={shop,origin:data.origin,mode:data.activeMode||'未识别',dates:data.selectedDateRange||[],filter:data.scopeFingerprint||''};
 const result={id:crypto.randomUUID(),at:data.capturedAt,scope,scopeKey:JSON.stringify(scope),accepted:assessment.accepted,problems:assessment.problems,
  captured:data.autoCollection?.capturedRows??data.products?.length??0,expected:data.autoCollection?.expectedRows??null,refreshEvidence:data.refreshEvidence||null,conflicts:data.conflictProductIds?.length||0};
 if(assessment.accepted){
  result.snapshot={};for(const key of ['filterEvidence','refreshEvidence','freshness','schemaVersion','origin','capturedAt','activeMode','managedSettings','selectedDateRange','dateScopes','dataAsOf','scopeFingerprint','metrics','products','summaryObservedAt','readOnly','source','qualityAssessment'])if(data[key]!==undefined)result.snapshot[key]=structuredClone(data[key]);
 }
 return result;
}
export function pruneHistory(records,now=Date.now()){
 const cutoff=now-HISTORY_DAYS*86400000;
 const sorted=records.filter(r=>Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)>=cutoff&&Date.parse(r.at)<=now+60000).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const kept=[];let bytes=2;
 for(const r of sorted){const n=new TextEncoder().encode(JSON.stringify(r)).length+1;if(kept.length>=HISTORY_LIMIT)break;if(bytes+n>HISTORY_BYTES)continue;kept.push(r);bytes+=n;}
 return kept;
}
export function historyStats(records){
 const groups=new Map();
 for(const r of records){let g=groups.get(r.scopeKey);if(!g){g={scope:r.scope,total:0,passed:0,consecutive:0,broken:false};groups.set(r.scopeKey,g);}g.total++;if(r.accepted){g.passed++;if(!g.broken)g.consecutive++;}else g.broken=true;}
 return [...groups.values()];
}
export function createHistoryStore(){
 let opened;
 const db=()=>opened??=new Promise((resolve,reject)=>{const request=indexedDB.open('xinyongtu-local-history',1);request.onupgradeneeded=()=>request.result.createObjectStore('history');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 async function transact(change){
  const database=await db();return new Promise((resolve,reject)=>{
   const tx=database.transaction('history',change?'readwrite':'readonly'),store=tx.objectStore('history'),request=store.get('records');let value;
   request.onsuccess=()=>{try{value=pruneHistory(request.result||[]);if(change){value=change(value);store.put(value,'records');}}catch(e){reject(e);tx.abort();}};
   tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||Error('本地历史存储失败'));tx.onabort=()=>reject(tx.error||Error('本地历史事务已取消'));
  });
 }
 return {list:()=>transact(),append:entry=>transact(records=>pruneHistory([entry,...records])),clear:()=>transact(()=>[])};
}
