import {collectPromotionDocument,isMerchantUrl} from './reader.js';
export function promotionScope(data){
 if(!data?.recognized||!data.dateScopes?.primaryVerified||!['稳定成本推广','全店托管'].includes(data.activeMode)||!data.scopeFingerprint||!data.selectedDateRange?.length){const error=Error('刷新前后无法可靠确认推广模式、日期或筛选范围');error.code='scope-unverified';throw error;}
 return {origin:data.origin,mode:data.activeMode,dates:[...data.selectedDateRange].sort(),comparison:[...(data.dateScopes.comparison||[])].sort(),filter:data.scopeFingerprint,controls:(data.filterEvidence?.controls||[]).map(c=>({label:c.label,value:c.value}))};
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function assertPromotionScope(expected,data){
 const actual=promotionScope(data);if(!same(expected,actual)){
  const changes=[];for(const field of ['origin','mode','dates','comparison','filter','controls'])if(!same(expected[field],actual[field]))changes.push({field,before:expected[field],after:actual[field]});
  const descriptions=changes.filter(c=>c.field!=='filter').map(c=>c.field==='controls'?'筛选项 '+JSON.stringify(c.before)+' → '+JSON.stringify(c.after):c.field==='mode'?'模式 '+c.before+' → '+c.after:c.field==='dates'?'日期 '+c.before.join('、')+' → '+c.after.join('、'):c.field==='comparison'?'对比日期变化':'站点变化');
  const error=Error('刷新前后推广模式、日期或筛选范围发生变化：'+(descriptions.join('；')||'筛选标识变化')+'；请在平台确认范围后重新开始');error.scopeChanges=changes;throw error;
 }return actual;
}
export function promotionReadiness(data,requiredLabels=[]){
 const missing=[];try{promotionScope(data);}catch{missing.push('推广范围');}
 const fields=['成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数'];
 for(const scope of data?.activeMode==='全店托管'?['overall-summary','managed-summary']:['overall-summary'])for(const label of fields)if((data?.metrics||[]).filter(m=>m.scope===scope&&m.label===label).length!==1)missing.push(scope+' / '+label);
 if(!data?.dataAsOf?.currentCutoffs?.length)missing.push('数据截止时间');
 if(!Number.isInteger(data?.listedCount)||data.listedCount<0)missing.push('商品列表合计');
 if(data?.listedCount>0&&!data?.products?.length)missing.push('商品列表首批数据');
 const labels=data?.filterEvidence?.labels||[];if(!labels.includes('商品搜索'))missing.push('商品搜索控件');for(const label of requiredLabels)if(!labels.includes(label))missing.push('筛选控件 / '+label);
 return {ready:missing.length===0,missing};
}
// Reload only the currently selected merchant tab, never navigate to a constructed URL.
// A changed document marker proves reload completed; equal data is not proof of freshness.
export async function prepareRefreshedPage({tabId,signal,baseline=null,onPhase=()=>{},timeoutMs=30000,pollMs=250,settleMs=500,scopeSettleMs=1200}){
 const evidence={requested:true,attempted:false,documentReloadConfirmed:false,startedAt:new Date().toISOString(),before:null,after:null,readinessSamples:[]};
 const deadline=Date.now()+timeoutMs;let originalUrl;
 const sleep=()=>new Promise(resolve=>setTimeout(resolve,pollMs));
 async function check(){
  if(signal.aborted)throw Error('采集已停止');if(Date.now()>deadline)throw Error('页面刷新或范围校验超时，请等页面加载完成后重试');
  const [active]=await chrome.tabs.query({active:true,currentWindow:true});const tab=await chrome.tabs.get(tabId);
  if(active?.id!==tabId||!isMerchantUrl(tab.url))throw Error('当前标签或站点已改变，停止刷新采集');
  if(originalUrl&&tab.url!==originalUrl)throw Error('刷新期间页面地址改变，可能跳转登录，请确认页面后重新开始');
  return tab;
 }
 async function marker(){const [r]=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},func:()=>performance.timeOrigin});return r?.result;}
 async function read(){
  const rs=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:collectPromotionDocument,args:[{includeOffscreen:true}]});
  const matches=rs.filter(r=>r.result?.recognized);if(matches.length!==1){const error=Error('未唯一识别推广页面，可能未登录或尚未加载完成');error.code=matches.length>1?'ambiguous-frame':rs.some(r=>/登录/.test(r.result?.reason||''))?'login-required':'page-not-ready';throw error;}return matches[0].result;
 }
 async function waitScopedRead(phase,expectedScope=null){
  let stableSince=null,lastKey=null;
  for(;;){await check();try{
   const data=await read();
   const required=expectedScope&&data.activeMode===expectedScope.mode?[...new Set((expectedScope.controls||[]).map(c=>c.label))]:[];
   const readiness=promotionReadiness(data,required);
   let scope=null;try{scope=promotionScope(data);}catch{}
   evidence.readinessSamples.push({phase,at:new Date().toISOString(),scope,missing:readiness.missing});if(evidence.readinessSamples.length>40)evidence.readinessSamples.splice(1,1);
   if(phase==='after'){evidence.after=scope;evidence.afterCutoffs=data.dataAsOf;}
   if(!readiness.ready){stableSince=null;lastKey=null;onPhase('等待'+(phase==='after'?'刷新后':'刷新前')+'页面就绪：'+readiness.missing.slice(0,3).join('、'));}
   else{const key=JSON.stringify(scope);if(key!==lastKey){lastKey=key;stableSince=Date.now();}if(Date.now()-stableSince>=scopeSettleMs)return data;onPhase('数据与筛选已出现，正在确认范围连续稳定…');}
  }catch(error){if(!['page-not-ready','scope-unverified'].includes(error.code))throw error;stableSince=null;lastKey=null;}await sleep();}
 }
 async function waitReady(oldMarker){
  let readySince=null;
  for(;;){
   const tab=await check();let changed=oldMarker===undefined;
   if(tab.status!=='loading'){
    if(oldMarker!==undefined){try{const m=await marker();changed=typeof m==='number'&&m!==oldMarker;}catch{changed=false;}}
    if(changed){readySince??=Date.now();if(Date.now()-readySince>=settleMs)return;}else readySince=null;
   }else readySince=null;
   await sleep();
  }
 }
 try{
  onPhase('正在核对刷新前的推广范围…');const initial=await check();originalUrl=initial.url;await waitReady();
  const before=await waitScopedRead('before');await check();const scope=promotionScope(before);evidence.before=scope;evidence.beforeCutoffs=before.dataAsOf;
  if(baseline)assertPromotionScope(baseline,before);
  const oldMarker=await marker();if(typeof oldMarker!=='number')throw Error('无法确认页面文档，未执行刷新');
  await check();onPhase('正在刷新当前推广页面，等待加载完成…');evidence.attempted=true;await chrome.tabs.reload(tabId);
  await waitReady(oldMarker);evidence.documentReloadConfirmed=true;
  onPhase('页面已刷新，正在核对日期、模式和筛选范围…');
  const after=await waitScopedRead('after',scope);await check();evidence.after=promotionScope(after);evidence.afterCutoffs=after.dataAsOf;
  assertPromotionScope(scope,after);
  await sleep();await check();const confirmed=await read();assertPromotionScope(scope,confirmed);
  evidence.afterCutoffs=confirmed.dataAsOf;evidence.finishedAt=new Date().toISOString();
  const old=before.dataAsOf?.currentCutoffs||[],fresh=confirmed.dataAsOf?.currentCutoffs||[];
  evidence.cutoffChanged=old.length===1&&fresh.length===1?old[0]!==fresh[0]:null;
  return {scope,evidence};
 }catch(error){evidence.finishedAt=new Date().toISOString();if(/超时/.test(error.message)){const last=evidence.readinessSamples.at(-1);if(last?.missing?.length)error.message+='；尚缺 '+last.missing.slice(0,4).join('、');}evidence.error=error.message;if(error.scopeChanges)evidence.scopeChanges=error.scopeChanges;error.refreshEvidence=evidence;throw error;}
}
export function refreshFailureDiagnostic(error){
 const info=error.refreshEvidence||{},scope=info.before||{};
 return {schemaVersion:'0.9.1',recognized:false,origin:scope.origin||'',activeMode:scope.mode||null,selectedDateRange:scope.dates||[],dateScopes:{primary:scope.dates||[],primaryVerified:false},scopeFingerprint:scope.filter||'',metrics:[],products:[],pendingRows:[],conflictProductIds:[],warnings:[error.message],capturedAt:new Date().toISOString(),readOnly:true,source:'daily-edge-sidebar-refresh-failed',refreshEvidence:info,
 autoCollection:{scanCompleted:false,expectedRows:null,capturedRows:0,rowCoverageConfirmed:false,dateRangeVerified:false,fieldsComplete:false,stopReason:error.message}};
}
