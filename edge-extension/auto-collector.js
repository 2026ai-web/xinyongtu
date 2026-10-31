import {collectPromotionDocument,isMerchantUrl} from './reader.js';

// Executed only in the extension's isolated world on an identified promotion frame.
// The only allowed UI changes are scroll positions and exact pagination controls.
export function traversePromotion(command){
 if(location.protocol!=='https:'||!['mms.pinduoduo.com','yingxiao.pinduoduo.com'].includes(location.hostname))throw Error('不支持的站点');
 const key='__xinyongtuReadTraversal';
 const shown=e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 if(command==='init'){
  const root=document.scrollingElement;
  const nested=[...document.querySelectorAll('div,section,main')].filter(e=>{
   if(!shown(e)||!/商品\s*ID\s*[:：]/i.test(e.textContent||''))return false;
   const css=getComputedStyle(e);
   const hiddenList=css.overflowY==='hidden'&&e.clientHeight>=200&&[...(e.textContent||'').matchAll(/商品\s*ID\s*[:：]/gi)].length>=2;
   return ((/auto|scroll/.test(css.overflowY)||hiddenList)&&e.scrollHeight>e.clientHeight+5)||(/auto|scroll/.test(css.overflowX)&&e.scrollWidth>e.clientWidth+5);
  });
  const targets=[...new Set([root,...nested.slice(0,5)].filter(Boolean))];
  globalThis[key]={targets,index:0,saved:targets.map(e=>({e,top:e.scrollTop,left:e.scrollLeft}))};
  for(const e of targets)e.scrollTo({top:0,left:0,behavior:'instant'});
  return {kind:'ready',candidateCount:nested.length,targetLimitReached:nested.length>5,targets:targets.map(e=>({tag:e.tagName,height:e.clientHeight,width:e.clientWidth,scrollHeight:e.scrollHeight,scrollWidth:e.scrollWidth}))};
 }
 const state=globalThis[key];
 if(command==='restore'){
  if(state)for(const s of state.saved)if(s.e.isConnected)s.e.scrollTo({top:s.top,left:s.left,behavior:'instant'});
  delete globalThis[key];return {kind:'restored'};
 }
 if(command==='advance'){
  if(!state)throw Error('采集滚动状态已失效');
  while(state.index<state.targets.length){
   const e=state.targets[state.index];if(!e.isConnected){state.index++;continue;}
   if(e.scrollLeft+e.clientWidth<e.scrollWidth-3){e.scrollLeft+=Math.max(100,Math.floor(e.clientWidth*.8));return {kind:'scrolled'};}
   if(e.scrollTop+e.clientHeight<e.scrollHeight-3){e.scrollLeft=0;e.scrollTop+=Math.max(100,Math.floor(e.clientHeight*.8));return {kind:'scrolled'};}
   state.index++;
  }
  return {kind:'end'};
 }
 if(command==='next'||command==='previous'){
  const wanted=command==='next'?['下一页','next','next page']:['上一页','previous','previous page'];
  const containers=[...document.querySelectorAll('nav,[role="navigation"],[class*="pagination"],[class*="Pagination"]')].filter(shown);
  const matches=[],seenControls=new Set();let considered=0,disabledControls=0;
  for(const container of containers)for(const b of container.querySelectorAll('button,[role="button"]')){
   if(seenControls.has(b))continue;seenControls.add(b);
   const names=[b.getAttribute('aria-label'),b.getAttribute('title'),b.textContent,b.parentElement?.getAttribute('title')].filter(Boolean).map(s=>s.trim().toLowerCase());
   if(!names.some(s=>wanted.includes(s))||!shown(b))continue;
   considered++;const parent=b.closest('li')||b;
   if(b.disabled||b.closest('[aria-disabled="true"],[disabled]')||/disabled/i.test(parent.className||'')){disabledControls++;continue;}
   if(!matches.includes(b))matches.push(b);
  }
  if(matches.length!==1)return {kind:'unavailable',containers:containers.length,recognizedControls:considered,disabledControls,enabledControls:matches.length};
  matches[0].click();return {kind:'page-requested'};
 }
 throw Error('不支持的采集操作');
}

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function collectAutomatically({tabId,signal,progress=()=>{},maxSteps=80,maxPages=20}){
 let frameId=null,baseline=null,filterBaseline=null,summary=null,last=null,steps=0,pages=1,reason='',scanCompleted=false,sampleIndex=0;
 const products=new Map(),conflicts=new Set(),warnings=new Set(),fieldSources=new Map(),observationHistory=new Map(),conflictRecords=[],conflictKeys=new Set(),navigationEvents=[],snapshotDiagnostics=[];
 const startedAt=new Date().toISOString();
 let dateRangeVerified=true,changedSelection=null;
 async function check(){
  if(signal.aborted)throw Error('采集已停止');
  if(Date.now()-Date.parse(startedAt)>90000)throw Error('达到90秒采集时限，已停止，覆盖尚待核对');
  const [active]=await chrome.tabs.query({active:true,currentWindow:true});
  if(active?.id!==tabId)throw Error('标签页已切换，已停止采集');
  const tab=await chrome.tabs.get(tabId);if(!isMerchantUrl(tab.url)||tab.status==='loading')throw Error('页面跳转或正在加载，已停止采集');
 }
 // Wait for a stable initial document before collecting any rows. Never resume a mixed round after navigation.
 let initialUrl=null;
 async function waitForInitialReady(){
  const first=await chrome.tabs.get(tabId);initialUrl=first.url;let readySince=null;
  for(let n=0;n<32;n++){
   if(signal.aborted)throw Error('采集已停止');
   const [active]=await chrome.tabs.query({active:true,currentWindow:true});const tab=await chrome.tabs.get(tabId);
   if(active?.id!==tabId||tab.url!==initialUrl||!isMerchantUrl(tab.url))throw Error('准备期间页面或标签已改变，请重新采集');
   if(tab.status!=='loading'){readySince??=Date.now();if(Date.now()-readySince>=500)return;}else readySince=null;
   await pause(250);
  }throw Error('页面尚未加载稳定，请稍后重新采集');
 }
 async function snapshot(){
  await check();
  const target=frameId===null?{tabId,allFrames:true}:{tabId,frameIds:[frameId]};
  const results=await chrome.scripting.executeScript({target,func:collectPromotionDocument,args:[{includeOffscreen:true}]});
  const matches=results.filter(r=>r.result?.recognized);
  if(matches.length!==1)throw Error('推广页面无法唯一识别，停止自动采集');
  frameId=matches[0].frameId;const data=matches[0].result;
  const selection=[...new Set(data.selectedDateRange||[])].sort();
  if(!data.dateScopes?.primaryVerified)dateRangeVerified=false;
  if(data.scopeFingerprint){if(filterBaseline!==null&&filterBaseline!==data.scopeFingerprint)throw Error('推广模式或筛选信号发生变化，停止合并');filterBaseline=data.scopeFingerprint;}
  if(selection.length){
    const scope=JSON.stringify(selection);
    if(baseline!==null&&baseline!==scope){changedSelection=selection;throw Error('日期控件的实际选择发生变化，停止合并；请重新采集');}
    baseline=scope;
  }else dateRangeVerified=false;
  if(!summary&&data.metrics.length)summary={...structuredClone(data),summaryObservedAt:new Date().toISOString()};
  last=data;
  for(const w of data.warnings)warnings.add(w);
  sampleIndex++;const observedAt=new Date().toISOString();
  snapshotDiagnostics.push({sampleIndex,observedAt,productIds:data.products.map(p=>p.productId),listedCount:data.listedCount,dateScopes:data.dateScopes,parser:data.diagnostics});if(snapshotDiagnostics.length>120)snapshotDiagnostics.splice(20,1);
  const equivalent=(field,a,b)=>{
   if(field==='budget')return a.kind===b.kind&&a.currency===b.currency&&(a.kind==='unlimited'||Number(a.display.replace(/,/g,''))===Number(b.display.replace(/,/g,'')));
   if(typeof a==='string'&&typeof b==='string'){
    const parse=v=>/^(-?[\d,.]+)(万|亿|%)?$/.exec(v.trim());const x=parse(a),y=parse(b);
    if(x&&y)return (x[2]||'')===(y[2]||'')&&Number(x[1].replace(/,/g,''))===Number(y[1].replace(/,/g,''));
   }
   return JSON.stringify(a)===JSON.stringify(b);
  };
  for(const row of data.products){
   const evidence={observedAt,sampleIndex,rowTop:row.top,mapping:row.mapping,dateScope:data.selectedDateRange||[],scopeFingerprint:data.scopeFingerprint||null,cutoffs:data.dataAsOf};
   const history=observationHistory.get(row.productId)||[];
   const observation={...evidence,budget:row.budget,status:row.status,targetNetRoas:row.targetNetRoas,metrics:structuredClone(row.metrics),missingFields:[...row.missingFields]};
   const variant=JSON.stringify({budget:row.budget,status:row.status,targetNetRoas:row.targetNetRoas,metrics:row.metrics,missing:row.missingFields});
   if(!history.some(h=>h.variant===variant)&&history.length<5)history.push({variant,observation});
   observationHistory.set(row.productId,history);
   const sources=fieldSources.get(row.productId)||new Map();
   const entries=[...['budget','targetNetRoas','status'].map(key=>[key,row[key]]),...row.metrics.map(m=>['metric:'+m.label,m.current])];
   if(!products.has(row.productId)){
    products.set(row.productId,{...structuredClone(row),firstSeenAt:observedAt,lastSeenAt:observedAt,singleObservationComplete:row.missingFields.length===0});
    for(const [key,value]of entries)if(value!==null&&value!==undefined)sources.set(key,{value:structuredClone(value),...evidence});
    fieldSources.set(row.productId,sources);continue;
   }
   const previous=products.get(row.productId);previous.lastSeenAt=observedAt;
   for(const [key,value]of entries){
    if(value===null||value===undefined)continue;
    const old=sources.get(key);
    if(old&&!equivalent(key,old.value,value)){
     conflicts.add(row.productId);
     const unique=JSON.stringify([row.productId,key,old.value,value]);
     if(!conflictKeys.has(unique)&&conflictRecords.length<200){conflictKeys.add(unique);conflictRecords.push({productId:row.productId,field:key,before:structuredClone(old),after:{value:structuredClone(value),...evidence},classification:'unresolved-value-difference',note:'可能为实时更新或采集错位，尚未确定原因；不静默覆盖。'});}
    }else sources.set(key,{value:structuredClone(value),...evidence});
   }
   for(const key of ['budget','targetNetRoas','status','statusReason','budgetWarning'])if(!previous[key])previous[key]=row[key];
   for(const field of row.metrics)if(!previous.metrics.some(m=>m.label===field.label))previous.metrics.push(structuredClone(field));
   previous.missingFields=previous.missingFields.filter(name=>!(name==='预算日限额'&&previous.budget)&&!(name==='净目标投产比'&&previous.targetNetRoas)&&!previous.metrics.some(f=>f.label===name));
   if(row.missingFields.length===0&&!conflicts.has(row.productId))previous.singleObservationComplete=true;
  }
  progress({count:products.size,expected:last.listedCount,pages,steps});return data;
 }
 async function navigate(command){await check();const [r]=await chrome.scripting.executeScript({target:{tabId,frameIds:[frameId]},func:traversePromotion,args:[command]});if(['init','next','previous','advance'].includes(command))navigationEvents.push({command,result:r.result,at:new Date().toISOString()});return r.result;}
 function signature(data){return JSON.stringify(data.products.map(p=>p.productId).sort());}
 async function changePage(command){
  const before=signature(last);const result=await navigate(command);if(result.kind!=='page-requested')return false;
  for(let n=0;n<8;n++){await pause(300);await check();const data=await snapshot();if(signature(data)!==before)return true;}
  throw Error('已请求翻页，但商品列表未确认变化，停止以避免重复采集');
 }
 try{
  await waitForInitialReady();
  await snapshot();
  // Return to the first accessible page through exact previous-page controls only.
  for(let n=0;n<maxPages-1;n++){if(!await changePage('previous'))break;}
  await navigate('init');await pause(200);
  while(steps<maxSteps){
   await snapshot();steps++;
   const move=await navigate('advance');
   if(move.kind==='scrolled'){await pause(200);continue;}
   if(last.listedCount!==null&&products.size>=last.listedCount){reason='已覆盖页面声明的当前筛选商品数量';scanCompleted=true;break;}
   if(pages>=maxPages){reason='达到安全分页上限，覆盖未确认';break;}
   if(!await changePage('next')){reason='未找到唯一可用的下一页按钮；完整覆盖尚需核对';break;}
   pages++;await navigate('init');await pause(200);
  }
  if(!reason)reason='达到安全扫描上限，覆盖未确认';
 }catch(e){reason=e.message;}
 finally{
  if(frameId!==null){try{await chrome.scripting.executeScript({target:{tabId,frameIds:[frameId]},func:traversePromotion,args:['restore']});}catch{}}
 }
 if(!last)throw Error(reason||'没有可用采集结果');
 const list=[...products.values()];
 const rowCoverage=last.listedCount!==null&&list.length===last.listedCount;
 if(conflicts.size)warnings.add('存在采集冲突：同商品出现不同候选值，原因未明（实时更新或映射错位均可能），不得直接用于计算。');
 for(const row of list){const net=row.metrics.find(m=>m.label==='净成交笔数');if(net&&Number(net.current.replace(/,/g,''))===0)row.interpretations={'每笔净成交花费(元)':{state:'not_applicable',reason:'无净成交，平台0.00只是占位，不能当作免费获客。'}};}
 return {...(summary||last),products:list,conflictProductIds:[...conflicts],conflictRecords,rowObservations:Object.fromEntries([...observationHistory].map(([id,h])=>[id,h.map(x=>x.observation)])),warnings:[...warnings],
  autoCollection:{startedAt,finishedAt:new Date().toISOString(),pagesVisited:pages,scanSteps:steps,stopReason:reason,scanCompleted,navigationEvents:navigationEvents.slice(-80),snapshotDiagnostics,
   expectedRows:last.listedCount,capturedRows:list.length,rowCoverageConfirmed:rowCoverage,dateRangeVerified:dateRangeVerified&&baseline!==null,dateSelectionBefore:baseline?JSON.parse(baseline):[],dateSelectionAfter:changedSelection,fieldsComplete:list.length>0&&list.every(p=>p.missingFields.length===0),
   note:'仅当前推广模式及筛选范围；行数覆盖不等于详情字段完整，尚未采集单品详情或其他模式。'},
  capturedAt:new Date().toISOString(),readOnly:true,source:'daily-edge-sidebar-auto',productScope:'自动扫描当前筛选范围的已渲染列表；详见覆盖数量、缺失字段和停止原因。'};
}
