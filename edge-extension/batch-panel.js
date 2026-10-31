import {createBatchStore} from './batch-store.js';
import {createBatchDriver,checkedReportURL,OVERVIEW} from './batch-driver.js';
import {runBatch} from './batch-runner.js';
export function installBatchPanel({beforeStart,setRunning}){
 const $=id=>document.getElementById(id),store=createBatchStore();let controller=null,diagnostic=null,lastJob=null;
 const controls=['auto','read','reportInspect','shopLabel','batchDays','batchStart','historyClear'];
 const status=message=>{$('batchStatus').textContent=message;};
 $('batchStart').onclick=async()=>{
  if(controller)return;beforeStart();controller=new AbortController();setRunning(true);for(const id of controls)$(id).disabled=true;$('batchStop').disabled=false;
  try{
   const shop=$('shopLabel').value.trim();if(!shop)throw Error('请填写店铺备注后重试');const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('请打开商品推广报表');
   let overviewURL;try{overviewURL=checkedReportURL(tab.url,OVERVIEW).href;}catch{
    const hits=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>[...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>{try{const u=new URL(h);return u.origin==='https://yingxiao.pinduoduo.com'&&u.pathname==='/goods/report/promotion/overView';}catch{return false;}})});const addresses=[...new Set(hits[0]?.result||[])];if(addresses.length!==1)throw Error('请先打开商品推广报表总览页；之后任务会自动进入每条链接');overviewURL=addresses[0];
   }
   const driver=createBatchDriver({tabId:tab.id,signal:controller.signal,onDiagnostic:d=>{diagnostic=d;}});
   lastJob=await runBatch({shop,days:Number($('batchDays').value),store,driver,overviewURL,signal:controller.signal,onProgress:(message,job)=>{lastJob=job;status(message+'；已保存 '+job.datasets.length+' 个数据集');}});
  }catch(e){status('未完成：'+e.message);}finally{controller=null;setRunning(false);for(const id of controls)$(id).disabled=false;$('batchStop').disabled=true;}
 };
 $('batchStop').onclick=()=>{controller?.abort(new DOMException('用户停止，已保存进度可继续','AbortError'));status('正在停止并保存断点…');};
 $('batchExport').onclick=async()=>{try{const warehouse=await store.export($('shopLabel').value.trim()),payload={...warehouse,lastJob,diagnostic};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='xinyongtu-batch-reports.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){status('导出失败：'+e.message);}};
 $('batchClear').onclick=async()=>{if(controller){status('请先停止采集再清理仓库');return;}if(!confirm('请先导出备份。确定清空全部店铺的一键采集仓库？'))return;try{await store.clear();lastJob=null;status('一键采集仓库已清空');}catch(e){status(e.message);}};
}
