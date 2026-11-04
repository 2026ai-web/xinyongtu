import {createAnalysisExport} from './analysis-export.js';
import {costStorage} from './cost-panel.js';
import {dataLock} from './local-data-lock.js';
import {createGptExport} from './gpt-export.js';
import {recordingGuide,requestedDates} from './batch-model.js';
import {createBatchStore} from './batch-store.js';
import {createBatchDriver,checkedReportURL,OVERVIEW} from './batch-driver.js';
import {runBatch} from './batch-runner.js';
export function installBatchPanel({beforeStart,setRunning}){
 const $=id=>document.getElementById(id),store=createBatchStore();let controller=null,diagnostic=null,lastJob=null,diagnosticHistory=[];
 const controls=['auto','read','reportInspect','shopLabel','batchDays','batchStartDate','batchEndDate','batchStart','historyClear'];
 const yesterday=requestedDates(1)[0];for(const id of ['batchStartDate','batchEndDate']){$(id).max=yesterday;$(id).value=yesterday;}
 try{const saved=JSON.parse(localStorage.getItem('batch-preferences')||'null');if(saved){$('shopLabel').value=String(saved.shop||'').slice(0,80);const mode=String(saved.mode??saved.days);if(['1','7','30','single','custom'].includes(mode))$('batchDays').value=mode;for(const [id,key] of [['batchStartDate','startDate'],['batchEndDate','endDate']])if(saved[key])$(id).value=saved[key];}}catch{}
 const selection=()=>{const mode=$('batchDays').value;return mode==='single'||mode==='custom'?{days:1,startDate:$('batchStartDate').value,endDate:mode==='single'?$('batchStartDate').value:$('batchEndDate').value}:{days:Number(mode)};};
 const remember=()=>{try{const value=JSON.stringify({shop:$('shopLabel').value.trim(),mode:$('batchDays').value,startDate:$('batchStartDate').value,endDate:$('batchEndDate').value});dataLock(()=>localStorage.setItem('batch-preferences',value)).catch(e=>{$('batchStatus').textContent=e.message;});}catch{}};
 const preview=()=>{const mode=$('batchDays').value;$('batchDateFields').hidden=!['single','custom'].includes(mode);$('batchEndLabel').hidden=mode!=='custom';try{const s=selection(),dates=requestedDates(s.days,Date.now(),'startDate' in s?{start:s.startDate,end:s.endDate}:null);$('batchDatePreview').textContent=dates[0]+' 至 '+dates.at(-1)+'，共 '+dates.length+' 天；每天独立采集，不保存区间汇总。';}catch(e){$('batchDatePreview').textContent=e.message;}};
 for(const id of ['shopLabel','batchDays','batchStartDate','batchEndDate'])$(id).addEventListener('change',()=>{remember();preview();});preview();
 const status=message=>{$('batchStatus').textContent=message;};
 $('batchStart').onclick=async()=>{
  if(controller)return;remember();beforeStart();controller=new AbortController();setRunning(true);for(const id of controls)$(id).disabled=true;$('batchStop').disabled=false;
  try{
   const dateOptions=selection();requestedDates(dateOptions.days,Date.now(),'startDate' in dateOptions?{start:dateOptions.startDate,end:dateOptions.endDate}:null);const shop=$('shopLabel').value.trim();if(!shop)throw Error('请填写店铺备注后重试');const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('请打开商品推广报表');
   let overviewURL;try{overviewURL=checkedReportURL(tab.url,OVERVIEW).href;}catch{
    const hits=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>[...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>{try{const u=new URL(h);return u.origin==='https://yingxiao.pinduoduo.com'&&u.pathname==='/goods/report/promotion/overView';}catch{return false;}})});const addresses=[...new Set(hits[0]?.result||[])];if(addresses.length!==1)throw Error('请先打开商品推广报表总览页；之后任务会自动进入每条链接');overviewURL=addresses[0];
   }
   const driver=createBatchDriver({tabId:tab.id,signal:controller.signal,onDiagnostic:d=>{diagnostic=d;diagnosticHistory.push({at:new Date().toISOString(),action:d.action,tab:d.tab,attempt:d.attempt,kind:d.kind,receipt:d.receipt,from:d.from,to:d.to,urlGuard:d.urlGuard,dateSelection:d.dateSelection||d.diagnostics?.dateSelection,calendar:d.diagnostics?.calendar,calendarCandidates:d.diagnostics?.calendarCandidates,context:d.context,dateEvidence:d.diagnostics?.dateEvidence,missing:d.diagnostics?.missing,summaryEvidence:d.diagnostics?.summaryEvidence,totalRows:d.diagnostics?.totalRows,scroll:d.scroll,performance:d.performance,error:d.error,errorCode:d.errorCode,recoverable:d.recoverable});diagnosticHistory=diagnosticHistory.slice(-30);}});
   lastJob=await runBatch({shop,...dateOptions,store,driver,overviewURL,signal:controller.signal,onProgress:(message,job)=>{lastJob=job;const finished=Object.values(job.units||{}).reduce((n,u)=>n+Object.keys(u.completed||{}).length,0);$('batchCoverage').textContent='整体与链接明细：'+Object.keys(job.completedDays||{}).length+'/'+job.dates.length+' 天 · 单链接分时：'+finished+'/'+(job.targetUnitDays??'待全店数据')+' 条日记录 · '+(job.phase==='complete'?'完整':'未完成');status(message+'；已保存 '+job.datasets.length+' 个数据集');}});
  }catch(e){status('未完成：'+e.message);}finally{controller=null;setRunning(false);for(const id of controls)$(id).disabled=false;$('batchStop').disabled=true;}
 };
 $('batchStop').onclick=()=>{controller?.abort(new DOMException('用户停止，已保存进度可继续','AbortError'));status('正在停止并保存断点…');};
 $('batchExport').onclick=async()=>{try{const warehouse=await store.export($('shopLabel').value.trim()),payload={...warehouse,recordingGuide,extensionVersion:chrome.runtime?.getManifest?.().version||'unknown',lastJob,diagnostic,diagnosticHistory};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='xinyongtu-batch-reports.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){status('导出失败：'+e.message);}};
 $('batchGptExport').onclick=async()=>{try{
  if(controller)throw Error('请先停止或等待采集完成，再导出最近任务');
  const shop=$('shopLabel').value.trim();if(!shop)throw Error('请填写店铺备注');
  const warehouse=await store.export(shop),job=await store.latest(shop),payload=createGptExport(warehouse,job,{extensionVersion:chrome.runtime?.getManifest?.().version||'unknown'});
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='xinyongtu-gpt-'+job.dates[0]+'-'+job.dates.at(-1)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('GPT精简导出已生成：最近任务 '+job.dates[0]+' 至 '+job.dates.at(-1)+'；'+(payload.task.complete?'完整':'未完成，请查看缺失与校验说明')+'。文件仅下载到本机，未发送给GPT。');
 }catch(e){status('GPT导出失败：'+e.message);}};
 $('batchAnalysisExport').onclick=async()=>{try{
  if(controller||$('costCalculate').disabled)throw Error('请先等待采集、核算或成本导入完成');
  const shop=$('shopLabel').value.trim(),options=selection(),dates=requestedDates(options.days,Date.now(),'startDate' in options?{start:options.startDate,end:options.endDate}:null);if(!shop)throw Error('请填写店铺备注');
  const warehouse=await store.export(shop),reports=await costStorage('reports','getAll'),costVersions=await costStorage('versions','getAll');const payload=createAnalysisExport({shop,dates,warehouse,reports,costVersions,extensionVersion:chrome.runtime?.getManifest?.().version||'unknown'});
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='xinyongtu-analysis-'+dates[0]+'-'+dates.at(-1)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('GPT经营分析资料已本机导出：'+dates[0]+' 至 '+dates.at(-1)+'；推广完整'+payload.coverage.filter(d=>d.promotionComplete).length+'/'+dates.length+'天，核算有效'+payload.coverage.filter(d=>d.accountingValid).length+'/'+dates.length+'天，快照匹配'+payload.coverage.filter(d=>d.snapshotsMatched).length+'/'+dates.length+'天；'+(payload.complete?'资料完整':'资料未完整，请先查看缺失/快照说明')+'。未发送给GPT。');
 }catch(e){status('经营分析导出失败：'+e.message);}};
 $('batchClear').onclick=async()=>{if(controller){status('请先停止采集再清理仓库');return;}if(!confirm('请先导出备份。确定清空全部店铺的一键采集仓库？'))return;try{await store.clear();lastJob=null;status('一键采集仓库已清空');}catch(e){status(e.message);}};
}
