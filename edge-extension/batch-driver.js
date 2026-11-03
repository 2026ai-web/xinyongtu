import {batchReportDocument} from './batch-dom.js';
import {rowKey} from './batch-model.js';
export const OVERVIEW='/goods/report/promotion/overView',UNIT='/goods/report/promotion/unit';
export function checkedReportURL(raw,path){const u=new URL(raw);if(u.origin!=='https://yingxiao.pinduoduo.com'||![OVERVIEW,UNIT].includes(u.pathname)||(path&&u.pathname!==path))throw Error('页面离开已确认的商品推广报表');return u;}
// Only owned date selection may alter these two query keys. Identity, route,
// all other filters and hashes remain exact; transient old/target dates are bounded.
export function allowedDateURLChange(beforeRaw,afterRaw,targetDate,initialDates=[]){
 try{const before=checkedReportURL(beforeRaw),after=checkedReportURL(afterRaw);if(before.origin!==after.origin||before.pathname!==after.pathname||before.hash!==after.hash||before.username!==after.username||before.password!==after.password)return false;
  const dateKeys=new Set(['beginDate','endDate']);const rest=u=>JSON.stringify([...new Set(u.searchParams.keys())].filter(k=>!dateKeys.has(k)).sort().map(k=>[k,u.searchParams.getAll(k)]));
  if(rest(before)!==rest(after))return false;
  const valid=d=>/^20\d{2}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  if(!valid(targetDate))return false;const allowed=new Set([targetDate,before.searchParams.get('beginDate'),before.searchParams.get('endDate'),...initialDates].filter(valid));
  for(const key of dateKeys){const values=after.searchParams.getAll(key);if(values.length!==1||!valid(values[0])||!allowed.has(values[0]))return false;}
  return true;
 }catch{return false;}
}
const reportURLFacts=raw=>{try{const u=new URL(raw);return {origin:u.origin,path:u.pathname,beginDate:u.searchParams.get('beginDate'),endDate:u.searchParams.get('endDate'),adId:u.searchParams.get('adId'),scenesMode:u.searchParams.get('scenesMode'),hasHash:Boolean(u.hash),queryKeys:[...new Set(u.searchParams.keys())].sort()};}catch{return {invalid:true};}};
export function assertDay(data,date){const c=data.context;if(!c.primaryVerified||!c.dates.length||c.dates.some(d=>d!==date))throw Error('主统计日期未确认：'+date);if(c.route===OVERVIEW&&c.selectedMode!=='全部')throw Error('账户报表未处于“全部”模式');if(c.route===UNIT&&(c.beginDate!==date||c.endDate!==date))throw Error('详情地址与统计日期不一致');}
export function mergeRows(map,rows,key){for(const row of rows){const id=key(row),previous=map.get(id);if(!previous){map.set(id,structuredClone(row));continue;}for(const metric of row.metrics){const old=previous.metrics.find(m=>m.label===metric.label);if(!old){previous.metrics.push(metric);continue;}if(old.state==='missing'){Object.assign(old,metric);continue;}if(metric.state!=='missing'&&JSON.stringify(old)!==JSON.stringify(metric))throw Error('扫描期间字段冲突：'+id+' '+metric.label);}}}
export function createBatchDriver({tabId,signal,onDiagnostic=()=>{},api=chrome}){
 let controlled=tabId,expectedURL=null,dateTransaction=null;const created=new Set();let lastDiagnostic=null;
 const check=()=>signal?.throwIfAborted();
 const wait=ms=>new Promise((resolve,reject)=>{check();const done=()=>{signal?.removeEventListener('abort',abort);resolve();},t=setTimeout(done,ms),abort=()=>{clearTimeout(t);reject(signal.reason||new DOMException('已停止','AbortError'));};signal?.addEventListener('abort',abort,{once:true});});
 const urlDiagnostic=(before,after,accepted,reason)=>{let changedQueryKeys=[],hashChanged=false;try{const a=new URL(before),b=new URL(after);changedQueryKeys=[...new Set([...a.searchParams.keys(),...b.searchParams.keys()])].filter(k=>JSON.stringify(a.searchParams.getAll(k))!==JSON.stringify(b.searchParams.getAll(k))).sort();hashChanged=a.hash!==b.hash;}catch{}const event={protocol:'batch-dom-1',action:'url-guard',urlGuard:{accepted,reason,changedQueryKeys,hashChanged,targetDate:dateTransaction?.targetDate||null,initialDates:dateTransaction?.initialDates||[],before:reportURLFacts(before),after:reportURLFacts(after)}};lastDiagnostic=event;onDiagnostic(event);};
 async function current(){check();const tab=await api.tabs.get(controlled);
  try{checkedReportURL(tab.url);}catch(e){urlDiagnostic(expectedURL,tab.url,false,'outside-supported-report');throw e;}
  const [active]=await api.tabs.query({active:true,windowId:tab.windowId});if(active?.id!==controlled)throw Error('标签页已切换，任务暂停；点击一键采集可继续');
  if(!expectedURL)expectedURL=tab.url;
  if(expectedURL&&tab.url!==expectedURL){const allowed=Boolean(dateTransaction&&allowedDateURLChange(dateTransaction.baseline,tab.url,dateTransaction.targetDate,dateTransaction.initialDates));urlDiagnostic(expectedURL,tab.url,allowed,allowed?'owned-date-query-update':'unexpected-report-url-change');if(!allowed)throw Error('报表地址变化不属于当前日期选择，已暂停；请导出前后地址诊断');expectedURL=tab.url;}
  return tab;
 }
 async function read(command={action:'read'}){await current();const results=await api.scripting.executeScript({target:{tabId:controlled},func:batchReportDocument,args:[command]});const data=results[0]?.result;if(data?.protocol!=='batch-dom-1'||data.action!==command.action)throw Error('采集模块版本或动作回执不一致，请更新扩展后重试');lastDiagnostic={action:data.action,context:data.context,dateEvidence:data.diagnostics?.dateEvidence,missing:data.diagnostics?.missing,headerGroups:data.diagnostics?.headerGroups,summaryEvidence:data.diagnostics?.summaryEvidence,dateSelection:data.dateSelection||data.diagnostics?.dateSelection,calendar:data.diagnostics?.calendar,kind:data.kind,totalRows:data.diagnostics?.totalRows,scroll:data.scroll,performance:data.performance,error:data.error};onDiagnostic(data);if(data.performance?.durationMs>250)throw Error('页面解析耗时超过250毫秒，已暂停以避免持续卡顿；请导出诊断');if(data.error)throw Error(data.error);return data;}
 async function stable(date){
  let last=null,steady=0,lastError=null;
  for(let n=0;n<75;n++){
   await wait(400);const tab=await current();
   const waiting={protocol:'batch-dom-1',action:'wait-ready',tab:{status:tab.status,route:new URL(tab.url).pathname},attempt:n+1};
   lastDiagnostic=waiting;onDiagnostic(waiting);
   let d;try{d=await read();if(d.context.loading)throw Error('报表仍在加载');if(!d.context.primaryVerified||!d.context.dates.length)throw Error('主统计日期尚未就绪');if(date)assertDay(d,date);}
   catch(e){lastError=e;last=null;steady=0;if(n===74)throw e;continue;}
   const fingerprint=JSON.stringify([d.context,d.summary,d.products,d.hourly]);
   if(last===fingerprint){steady++;if(steady>=2)return d;}else steady=0;last=fingerprint;
  }
  throw lastError||Error('报表加载未稳定，已暂停');
 }
 async function navigate(raw){const u=checkedReportURL(raw);const before=await current();expectedURL=u.href;if(before.url!==u.href)await api.tabs.update(controlled,{url:u.href});return stable();}
 async function selectDay(date){
  const before=await current(),initial=await read();if(!initial.context?.primaryVerified)throw Error('日期选择前未确认主日期，未开始操作');dateTransaction={baseline:before.url,targetDate:date,initialDates:[...initial.context.dates]};
  try{for(let n=0;n<120;n++){const result=await read({action:'date-step',start:date,end:date,reset:n===0});await wait(350);if(result.kind==='date-selected'){
    await stable(date);const final=checkedReportURL((await current()).url),hasDate=final.searchParams.has('beginDate')||final.searchParams.has('endDate');
    if(hasDate&&(final.searchParams.getAll('beginDate').length!==1||final.searchParams.getAll('endDate').length!==1||final.searchParams.get('beginDate')!==date||final.searchParams.get('endDate')!==date)){urlDiagnostic(before.url,final.href,false,'date-readback-and-url-disagree');throw Error('页面主日期与地址日期未同时确认为目标单日，未保存数据');}
    return;
   }}throw Error('日期选择未完成：请求单日 '+date+'，已保留实际回读日期，未保存区间汇总');
  }finally{dateTransaction=null;}
 }
 async function overview(raw,date){await navigate(raw);await read({action:'all-mode'});await stable();await selectDay(date);}
 async function scan(date,{account=false}={}){
  const products=new Map(),hours=new Map(),overall=new Map(),overallSources=new Map();let expected=null,spendAvailability=null;
  const observeSummary=d=>{assertDay(d,date);for(const metric of d.summary||[]){const previous=overall.get(metric.label);if(previous&&JSON.stringify(previous)!==JSON.stringify(metric))throw Error('扫描期间整体指标冲突：'+metric.label);overall.set(metric.label,metric);const evidence=d.diagnostics?.summaryEvidence?.find(e=>e.label===metric.label&&e.source);if(evidence)overallSources.set(metric.label,evidence.source);}};
  await read({action:'scroll-init'});observeSummary(await stable(date));
  await read({action:'table'});observeSummary(await stable(date));if(account){await read({action:'first-page'});observeSummary(await stable(date));}
  for(let page=1;page<=20;page++){
   await read({action:'scroll-init'});
   const observe=d=>{
    assertDay(d,date);if(d.expectedRows!==null){if(expected!==null&&expected!==d.expectedRows)throw Error('列表总条数在扫描期间变化');expected=d.expectedRows;}
    mergeRows(products,d.products,rowKey);mergeRows(hours,d.hourly,r=>r.hour);
    observeSummary(d);const observed=d.fieldAvailability?.totalSpend;if(observed&&observed.state!=='unknown'){if(spendAvailability&&spendAvailability.state!==observed.state)throw Error('扫描期间花费列可用性冲突，不能确认平台是否提供');spendAvailability=structuredClone(observed);}
   };
   for(let step=0;step<100;step++){
    await wait(150);const d=await read();if(d.context.loading){observe(await stable(date));continue;}observe(d);
    let action=await read({action:'scroll-next'});if(action.kind==='end'){observe(await stable(date));action=await read({action:'scroll-next',recheck:true});if(action.kind==='end')break;}if(step===99)throw Error('滚动扫描超过上限');
   }
   if(!account||expected!==null&&products.size===expected)break;
   if(expected===null||products.size>expected)throw Error('无法确认商品总条数或存在重复推广身份');
   await read({action:'page',page:page+1});await stable(date);if(page===20)throw Error('商品分页超过20页');
  }
  if(account&&(expected===null||products.size!==expected))throw Error('商品列表未完整覆盖');
  const final=await read();assertDay(final,date);return {context:final.context,summary:[...overall.values()],summarySources:[...overallSources].map(([label,source])=>({label,source})),products:[...products.values()],hourly:[...hours.values()].sort((a,b)=>a.hour-b.hour),expectedRows:expected,fieldAvailability:{totalSpend:spendAvailability||{state:'unknown'}}};
 }
 async function openUnit(row,date,overviewURL){
  if(row.unitURL){const u=checkedReportURL(row.unitURL,UNIT);u.searchParams.set('beginDate',date);u.searchParams.set('endDate',date);await navigate(u.href);return verifyUnit(row,date);}
  await overview(overviewURL,date);
  // Locate the observed row again, including pagination and virtual scrolling.
  for(let page=1;page<=20;page++){
   await read({action:'scroll-init'});for(let step=0;step<100;step++){
    const d=await read();if(d.products.some(p=>p.productId===row.productId&&p.mode===row.mode)){
     const before=await api.tabs.query({windowId:(await current()).windowId}),source=controlled;const action=await read({action:'open-details',productId:row.productId,mode:row.mode});if(action.url){await navigate(action.url);return verifyUnit(row,date);}
     expectedURL=null;
     for(let n=0;n<30;n++){await wait(300);const sourceTab=await api.tabs.get(source);if(new URL(sourceTab.url).pathname===UNIT){await stable(date);return verifyUnit(row,date);}const fresh=(await api.tabs.query({windowId:sourceTab.windowId})).filter(t=>!before.some(b=>b.id===t.id)&&t.openerTabId===source&&(()=>{try{return checkedReportURL(t.url,UNIT);}catch{return false;}})());if(fresh.length===1){controlled=fresh[0].id;created.add(controlled);await api.tabs.update(controlled,{active:true});await stable(date);return verifyUnit(row,date);}}
     throw Error('查看详情后未确认商品报表，已暂停');
    }
    if((await read({action:'scroll-next'})).kind==='end')break;await wait(150);
   }
   await read({action:'page',page:page+1});await stable(date);
  }throw Error('未定位到商品查看详情入口');
 }
 async function verifyUnit(row,date){let d=await stable();if(d.context.productId!==row.productId||!d.context.adId||row.adId&&row.adId!==d.context.adId)throw Error('商品详情身份与来源行不一致');if(!d.context.dates.length||d.context.dates.some(value=>value!==date)){await selectDay(date);d=await stable(date);}else assertDay(d,date);const source=new URL((await current()).url),safe=new URL(UNIT,source.origin);for(const key of ['adId','beginDate','endDate','scenesMode'])if(source.searchParams.has(key))safe.searchParams.set(key,source.searchParams.get(key));return {adId:d.context.adId,url:safe.href};}
 return {read,overview,scan,openUnit,navigate,verifyUnit,wait,diagnostic:()=>structuredClone(lastDiagnostic),async close(){for(const id of created){try{checkedReportURL((await api.tabs.get(id)).url);await api.tabs.remove(id);}catch{}}}};
}
