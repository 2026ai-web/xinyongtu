import {inspectReportEntrances} from './report-entry.js';
import {isMerchantUrl} from './reader.js';
export async function navigateReportEntrance({target,entry,signal,timeoutMs=15000,pollMs=250,settleMs=500,onPhase=()=>{}}){
 const started=Date.now(),evidence={startedAt:new Date().toISOString(),confirmed:false,entrance:{label:entry.label,productId:entry.productId},method:null};
 const expected={label:entry.label,kind:entry.kind,productId:entry.productId,target:entry.target};
 let wanted=null,lastObserved=null,lastTarget=null;
 const safePage=url=>{const u=new URL(url);return {origin:u.origin,path:u.pathname};};
 async function check(){
  if(signal.aborted)throw Error('进入报表已停止');if(Date.now()-started>timeoutMs)throw Error('没有确认进入报表：页面或报表弹层未发生可验证变化');
  const [active]=await chrome.tabs.query({active:true,currentWindow:true});if(active?.id!==target.tabId)throw Error('当前标签已改变；请选中新报表标签后重新识别');
  const tab=await chrome.tabs.get(target.tabId);if(!isMerchantUrl(tab.url)||/\/login|\/sso/i.test(new URL(tab.url).pathname))throw Error('报表跳转到登录或站点范围外，请先确认登录');return tab;
 }
 async function inspect(){const rs=await chrome.scripting.executeScript({target:{tabId:target.tabId,allFrames:true},func:inspectReportEntrances,args:[{action:'inspect'}]});const matches=rs.filter(r=>r.result?.recognized);return matches.length===1?matches[0]:null;}
 try{
  const tab=await check();if(tab.url!==target.url||tab.status==='loading')throw Error('页面已改变，请重新识别入口');evidence.from=safePage(tab.url);
  const before=await inspect();if(!before)throw Error('未唯一确认当前报表区域');
  const [resolved]=await chrome.scripting.executeScript({target:{tabId:target.tabId,frameIds:[target.frameId]},func:inspectReportEntrances,args:[{action:'resolve',id:entry.id,expected}]});
  const url=resolved?.result?.navigationUrl;
  await check();
  if(url){
   wanted=new URL(url);if(!isMerchantUrl(url)||wanted.origin!==entry.target?.origin||wanted.pathname!==entry.target?.path)throw Error('报表目标未通过复核');
   if(url===tab.url)throw Error('入口指向当前页面，不能确认已进入新的报表');
   evidence.method='verified-link';onPhase('正在当前标签进入已核对的报表地址…');await chrome.tabs.update(target.tabId,{url});
  }else{
   evidence.method='click-and-verify';onPhase('正在点击报表入口并等待页面变化…');
   await chrome.scripting.executeScript({target:{tabId:target.tabId,frameIds:[target.frameId]},func:inspectReportEntrances,args:[{action:'open',id:entry.id,expected}]});
  }
  let stableSince=null,lastKey=null;
  for(;;){
   const current=await check();
   if(current.status!=='loading'){
    if(wanted){const u=new URL(current.url);if(u.origin!==wanted.origin||u.pathname!==wanted.pathname||[...wanted.searchParams].some(([k,v])=>u.searchParams.get(k)!==v))throw Error('实际页面与报表目标不同，未确认进入');}
    let found;try{found=await inspect();}catch{found=null;}
    if(found){lastObserved=found.result;lastTarget={tabId:target.tabId,frameId:found.frameId,url:current.url};const map=found.result;
     const changed=map.page.path!==before.result.page.path||((map.dialogCount||0)>(before.result.dialogCount||0)&&(!entry.productId||(map.dialogProductIds||[]).includes(entry.productId)));
     const ready=changed&&map.dateControls.length>0&&map.metricLabels.length>0&&(!wanted||map.page.path===wanted.pathname);
     if(ready){const key=JSON.stringify([map.page,map.dateControls,map.metricLabels,map.dialogCount]);if(key!==lastKey){lastKey=key;stableSince=Date.now();}if(Date.now()-stableSince>=settleMs){evidence.confirmed=true;evidence.finishedAt=new Date().toISOString();evidence.to=map.page;return {map:{...map,navigationEvidence:evidence},target:{tabId:target.tabId,frameId:found.frameId,url:current.url}};}}
     else{stableSince=null;lastKey=null;}
    }
   }else{stableSince=null;lastKey=null;}
   await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
 }catch(error){evidence.finishedAt=new Date().toISOString();evidence.error=error.message;error.navigationEvidence=evidence;if(lastObserved){error.reportMap=lastObserved;error.reportMapTarget=lastTarget;}throw error;}
}
