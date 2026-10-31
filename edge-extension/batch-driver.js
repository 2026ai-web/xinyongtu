import {batchReportDocument} from './batch-dom.js';
import {rowKey} from './batch-model.js';
export const OVERVIEW='/goods/report/promotion/overView',UNIT='/goods/report/promotion/unit';
export function checkedReportURL(raw,path){const u=new URL(raw);if(u.origin!=='https://yingxiao.pinduoduo.com'||![OVERVIEW,UNIT].includes(u.pathname)||(path&&u.pathname!==path))throw Error('页面离开已确认的商品推广报表');return u;}
export function assertDay(data,date){const c=data.context;if(!c.primaryVerified||!c.dates.length||c.dates.some(d=>d!==date))throw Error('主统计日期未确认：'+date);if(c.route===OVERVIEW&&c.selectedMode!=='全部')throw Error('账户报表未处于“全部”模式');if(c.route===UNIT&&(c.beginDate!==date||c.endDate!==date))throw Error('详情地址与统计日期不一致');}
export function mergeRows(map,rows,key){for(const row of rows){const id=key(row),previous=map.get(id);if(!previous){map.set(id,structuredClone(row));continue;}for(const metric of row.metrics){const old=previous.metrics.find(m=>m.label===metric.label);if(!old){previous.metrics.push(metric);continue;}if(old.state==='missing'){Object.assign(old,metric);continue;}if(metric.state!=='missing'&&JSON.stringify(old)!==JSON.stringify(metric))throw Error('扫描期间字段冲突：'+id+' '+metric.label);}}}
export function createBatchDriver({tabId,signal,onDiagnostic=()=>{},api=chrome}){
 let controlled=tabId,expectedURL=null;const created=new Set();
 const check=()=>signal?.throwIfAborted();
 const wait=ms=>new Promise((resolve,reject)=>{check();const done=()=>{signal?.removeEventListener('abort',abort);resolve();},t=setTimeout(done,ms),abort=()=>{clearTimeout(t);reject(signal.reason||new DOMException('已停止','AbortError'));};signal?.addEventListener('abort',abort,{once:true});});
 async function current(){check();const tab=await api.tabs.get(controlled);checkedReportURL(tab.url);const [active]=await api.tabs.query({active:true,windowId:tab.windowId});if(active?.id!==controlled)throw Error('标签页已切换，任务暂停；点击一键采集可继续');if(expectedURL&&tab.url!==expectedURL)throw Error('报表地址被改变，任务暂停');return tab;}
 async function read(command={action:'read'}){await current();const results=await api.scripting.executeScript({target:{tabId:controlled},func:batchReportDocument,args:[command]});const data=results[0]?.result;if(data?.protocol!=='batch-dom-1'||data.action!==command.action)throw Error('采集模块版本或动作回执不一致，请更新扩展后重试');onDiagnostic(data);if(data.performance?.durationMs>250)throw Error('页面解析耗时超过250毫秒，已暂停以避免持续卡顿；请导出诊断');if(data.error)throw Error(data.error);return data;}
 async function stable(date){let last=null,steady=0;for(let n=0;n<30;n++){await wait(400);const t=await current();if(t.status==='loading')continue;let d;try{d=await read();if(d.context.loading)throw Error('报表仍在加载');if(date)assertDay(d,date);}catch(e){if(n===29)throw e;continue;}const fingerprint=JSON.stringify([d.context,d.products,d.hourly]);if(last===fingerprint){steady++;if(steady>=2)return d;}else steady=0;last=fingerprint;}throw Error('报表加载未稳定，已暂停');}
 async function navigate(raw){const u=checkedReportURL(raw);expectedURL=u.href;await api.tabs.update(controlled,{url:u.href});return stable();}
 async function overview(raw,date){await navigate(raw);await read({action:'all-mode'});await stable();for(let n=0;n<40;n++){const result=await read({action:'date-step',start:date,end:date});await wait(350);if(result.kind==='date-selected'){await stable(date);return;}}throw Error('日期切换超出40步，已暂停');}
 async function scan(date,{account=false}={}){
  await read({action:'table'});await stable(date);if(account){await read({action:'first-page'});await stable(date);}const products=new Map(),hours=new Map();let expected=null;
  for(let page=1;page<=20;page++){
   await read({action:'scroll-init'});
   for(let step=0;step<100;step++){
    await wait(150);const d=await read();assertDay(d,date);if(d.expectedRows!==null){if(expected!==null&&expected!==d.expectedRows)throw Error('列表总条数在扫描期间变化');expected=d.expectedRows;}
    mergeRows(products,d.products,rowKey);mergeRows(hours,d.hourly,r=>r.hour);
    const action=await read({action:'scroll-next'});if(action.kind==='end')break;if(step===99)throw Error('滚动扫描超过上限');
   }
   if(!account||expected!==null&&products.size===expected)break;
   if(expected===null||products.size>expected)throw Error('无法确认商品总条数或存在重复推广身份');
   await read({action:'page',page:page+1});await stable(date);if(page===20)throw Error('商品分页超过20页');
  }
  if(account&&(expected===null||products.size!==expected))throw Error('商品列表未完整覆盖');
  return {context:(await read()).context,products:[...products.values()],hourly:[...hours.values()].sort((a,b)=>a.hour-b.hour),expectedRows:expected};
 }
 async function openUnit(row,date,overviewURL){
  if(row.unitURL){await navigate(row.unitURL);return verifyUnit(row,date);}
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
 async function verifyUnit(row,date){const d=await stable(date);if(d.context.productId!==row.productId||!d.context.adId||row.adId&&row.adId!==d.context.adId)throw Error('商品详情身份与来源行不一致');const source=new URL((await current()).url),safe=new URL(UNIT,source.origin);for(const key of ['adId','beginDate','endDate','scenesMode'])if(source.searchParams.has(key))safe.searchParams.set(key,source.searchParams.get(key));return {adId:d.context.adId,url:safe.href};}
 return {read,overview,scan,openUnit,navigate,verifyUnit,wait,async close(){for(const id of created){try{checkedReportURL((await api.tabs.get(id)).url);await api.tabs.remove(id);}catch{}}}};
}
