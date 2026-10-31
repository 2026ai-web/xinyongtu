// Page watermark is independent of when our scan finished. No refresh or requests.
export function createFreshnessTracker(){
 const seen=new Map();
 return {observe(data,now=Date.now()){
  const key=JSON.stringify([data.localShopLabel||'',data.origin,data.activeMode,data.selectedDateRange,data.scopeFingerprint]);
  const content=JSON.stringify({metrics:(data.metrics||[]).map(m=>[m.scope,m.label,m.current]),products:(data.products||[]).map(p=>[p.productId,p.status,p.budget,p.targetNetRoas,p.metrics]).sort((a,b)=>a[0].localeCompare(b[0]))});
  const old=seen.get(key),unchanged=old?.content===content?(old.unchanged+1):0;seen.set(key,{content,unchanged});if(seen.size>20)seen.delete(seen.keys().next().value);
  const dates=data.selectedDateRange||[],cutoffs=data.dataAsOf?.currentCutoffs||[];
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const out={unchangedRounds:unchanged,comparisonScope:'current-sidebar-session',watermarkState:'unknown',ageMinutes:null};
  if(dates.length===1&&/^\d{4}-\d{2}-\d{2}$/.test(dates[0])&&cutoffs.length===1&&/^\d{1,2}:\d{2}$/.test(cutoffs[0])){
   const stamp=Date.parse(dates[0]+'T'+cutoffs[0].padStart(5,'0')+':00+08:00');
   if(Number.isFinite(stamp)){out.ageMinutes=Math.floor((now-stamp)/60000);out.watermarkState=dates[0]!==today?'historical':out.ageMinutes<0?'clock-or-cutoff-mismatch':out.ageMinutes>=5?'delayed':'recent';out.watermark=cutoffs[0];}
  }
  return out;
 }};
}
