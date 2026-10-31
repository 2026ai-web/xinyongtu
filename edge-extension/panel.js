import {installBatchPanel} from './batch-panel.js';
let batchRunning=false;
import {navigateReportEntrance} from './report-navigation.js';
import {inspectReportEntrances} from './report-entry.js';
import {prepareRefreshedPage,assertPromotionScope,refreshFailureDiagnostic} from './refresh-cycle.js';
import {createFreshnessTracker} from './freshness.js';
const freshnessTracker=createFreshnessTracker();
import {createHistoryStore,historyEntry,historyStats} from './history.js';
import {collectPromotionDocument,isMerchantUrl} from './reader.js';
import {collectAutomatically} from './auto-collector.js';
import {createSnapshotJournal} from './snapshot-quality.js';
const historyStore=createHistoryStore();let historyQueue=Promise.resolve();
const journal=createSnapshotJournal();let latestAttempt=null,currentAssessment=null;
const $=id=>document.getElementById(id);let snapshot=null,revision=0,targetTab=null;
let nextScanAt=null,countdownTimer=null,refreshing=false,refreshUrl=null,scopeBaseline=null,runShopLabel='';
let automatic=false,controller=null,timer=null,autoEpoch=0,waitingForReady=false;
function node(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function reset(message='页面已改变，请重新采集。'){
 revision++;snapshot=null;$('results').hidden=true;$('export').disabled=true;$('status').textContent=message;if($('progress').textContent.startsWith('扫描中'))$('progress').textContent='扫描已停止。';
}
function renderSnapshot(data){
 snapshot=data;const auto=data.autoCollection;const managed=data.activeMode==='全店托管';$('coverage').textContent=auto?'已采商品：'+auto.capturedRows+'/'+(auto.expectedRows??'总数未识别')+'；'+(auto.rowCoverageConfirmed?'当前筛选行数覆盖已核对':'行数覆盖未确认')+'；'+(auto.fieldsComplete?'字段齐全':'仍有缺失字段')+'；日期范围：'+(auto.dateRangeVerified?'已核对控件值':'未完全核对')+'。停止原因：'+auto.stopReason+'。仅列表数据，不含单品详情。':'';$('results').hidden=false;$('time').textContent='本轮结束时间：'+new Date(data.capturedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）';
 const ds=data.dateScopes||{};$('dates').textContent='推广模式：'+(data.activeMode||'未可靠识别')+'；推广统计日期：'+((ds.primary||[]).join('、')||'未可靠识别')+'；对比日期：'+((ds.comparison||[]).join('、')||'未识别')+'；辅助模块日期：'+((ds.auxiliary||[]).join('、')||'无')+'（不作为推广范围）。';
 const f=data.freshness||{};
 $('freshness').textContent='采集时的数据时效：'+(f.watermarkState==='historical'?'所选为历史日期，不作为实时数据':f.watermarkState==='unknown'?'数据截止时间无法唯一确认':f.watermarkState==='clock-or-cutoff-mismatch'?'本机时间与页面截止时间不一致，需核对':('页面显示截至 '+f.watermark+'，距采集时约 '+f.ageMinutes+' 分钟'+(f.watermarkState==='delayed'?'，可能存在更新延迟':'')))+'。'+(f.unchangedRounds?'本次侧栏会话同范围连续 '+f.unchangedRounds+' 次与上轮内容相同；重复扫描不代表平台更新。':'本次范围首次读取或内容有变化。');
 const re=data.refreshEvidence;
 $('refreshEvidence').textContent=re?(re.error?'刷新采集未完成：'+re.error:re.documentReloadConfirmed?'本轮已重载页面并核对范围；刷新前截止 '+((re.beforeCutoffs?.currentCutoffs||[]).join('、')||'未知')+'，刷新后截止 '+((re.afterCutoffs?.currentCutoffs||[]).join('、')||'未知')+'。'+(re.cutoffChanged===false?'截止时间没有变化，不能认定平台已更新。':re.cutoffChanged===true?'页面截止时间发生变化，仍以字段和时效核对为准。':'截止时间无法比较。'):'未确认页面刷新完成。'):'本轮只读取已加载页面，没有主动刷新。';
 const asOf=data.dataAsOf||{};
 $('asOf').textContent='当前日截止：'+((asOf.currentCutoffs||[]).join('、')||'未识别')+'；对比日截止：'+((asOf.comparisonCutoffs||[]).join('、')||'未识别')+'。'+(asOf.cutoffAlignment==='different'?'时点不同，不能直接同比。':asOf.cutoffAlignment==='same'?'时点一致，仍需核对统计范围。':'截止时点无法完整核对。');
 $('productScope').textContent=managed?'托管商品行不虚构独立预算、目标或广告费；总预算：'+(data.managedSettings?.budget?.display||'未识别')+'；总净目标投产比：'+(data.managedSettings?.targetNetRoas||'未识别'):(data.productScope||'尚未识别商品行');$('products').replaceChildren();
 for(const product of data.products||[]){
  const block=document.createElement('div');block.className='product';if((data.conflictProductIds||[]).includes(product.productId))block.append(node('p','此商品扫描期间数据变化，存在冲突，不可用于计算。'));block.append(node('h3','商品 ID：'+product.productId));
  block.append(node('p','状态：'+(product.status||'未识别')+' · 预算：'+(product.budget?product.budget.display+(product.budget.kind==='amount'?' 元':''):managed?'使用托管总预算':'未识别')+' · 净目标投产比：'+(product.targetNetRoas||(managed?'使用托管总目标':'未识别'))));
  if(product.statusReason==='daily-budget-exhausted')block.append(node('p','日预算已耗尽，系统因限额停止投放；不同于手动暂停。不会自动增加预算。'));
  if(product.budgetWarning)block.append(node('p','预算提示：'+product.budgetWarning+(product.statusReason==='daily-budget-exhausted'?'':'（仅提示，不据此推断已停止）')));
  const list=document.createElement('dl');for(const field of product.metrics){list.append(node('dt',field.label),node('dd',product.interpretations?.[field.label]?.state==='not_applicable'?'—（无净成交）':field.current+(/元/.test(field.label)&&/[万亿]$/.test(field.current)?'（页面缩写）':'')));}block.append(list);
  block.append(node('p',product.metrics.length?'同行指标待核对；不能与顶部汇总合并。':'未匹配到可靠列头，未猜测这条商品的花费或成交数据。'));
  block.append(node('p','本次缺失：'+product.missingFields.join('、')));$('products').append(block);
 }
 if(!(data.products||[]).length)$('products').append(node('p','当前未识别商品行，覆盖未确认；请导出结果供排查。'));
 for(const row of data.pendingRows||[])$('products').append(node('p','待核对：'+row.reason));
 const counts=Object.create(null);for(const m of data.metrics)counts[(m.scope||'unknown')+m.label]=(counts[(m.scope||'unknown')+m.label]||0)+1;
 $('metrics').replaceChildren();
 for(const m of data.metrics){const tr=document.createElement('tr');for(const v of[(m.scope==='managed-summary'?'托管汇总 · ':m.scope==='managed-settings'?'托管设置 · ':m.scope==='overall-summary'?'整体汇总 · ':'')+m.label,m.current+(/元/.test(m.label)&&/[万亿]$/.test(m.current)?'（页面缩写）':''),counts[(m.scope||'unknown')+m.label]>1?'多个候选，不可合并':'待人工核对'])tr.append(node('td',v));$('metrics').append(tr);}
 $('warnings').replaceChildren();
 if(!data.metrics.length)$('warnings').append(node('p','页面已识别，但未解析到数据卡片。请将指标显示在窗口中再试，不会将缺失值记成零。'));
 for(const warning of data.warnings)$('warnings').append(node('p',warning));
 for(const c of data.conflictRecords||[])$('warnings').append(node('p','冲突商品 '+c.productId+' / '+c.field+'：'+JSON.stringify(c.before.value)+'（'+c.before.observedAt+'）→ '+JSON.stringify(c.after.value)+'（'+c.after.observedAt+'）；原因未定。'));
 $('export').disabled=false;
}
function display(data){
 data={...data,freshness:freshnessTracker.observe({...data,localShopLabel:$('shopLabel').value.trim()})};
 const record=journal.record(data,targetTab);latestAttempt=record.latestAttempt;currentAssessment=record.assessment;
 const displayed=record.lastQualified||latestAttempt;renderSnapshot(displayed);
 $('resultHeading').textContent=record.promoted?'本轮结构检查合格 · 待人工核对':record.lastQualified?'保留上轮结构合格结果 · 非本轮实时数据':'本轮诊断结果 · 未通过结构检查';
 $('attemptStatus').textContent='本轮 '+new Date(data.capturedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'：'+(record.promoted?'结构检查通过；不代表店铺、利润或结算已验证。':record.assessment.problems.join('；')+'。'+(record.lastQualified?'没有覆盖上轮合格结果。':'当前没有同范围的合格快照。'));
 for(const warning of record.assessment.warnings||[])$('warnings').append(node('p',warning));
 $('exportAttempt').disabled=false;
 const shop=$('shopLabel').value.trim();if(shop){const entry=historyEntry(latestAttempt,currentAssessment,shop);historyQueue=historyQueue.then(()=>historyStore.append(entry)).then(()=>refreshHistory()).catch(e=>{$('historyStatus').textContent='本轮历史未保存：'+e.message;});}
}
$('read').onclick=async()=>{
 reportNavController?.abort();
 reset('正在只读采集当前标签页…');const ticket=revision;$('read').disabled=true;
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!isMerchantUrl(tab.url))throw Error('请先选中日常 Edge 中的拼多多商家后台或多多招财标签页，再点击采集。');
  if(tab.status==='loading')throw Error('页面正在加载，请稍后重试。');
  targetTab=tab.id;
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:collectPromotionDocument});
  if(ticket!==revision)return;
  const current=await chrome.tabs.get(tab.id);
  if(current.url!==tab.url||current.status==='loading')throw Error('页面已跳转，请加载完成后重新采集。');
  const recognized=results.map(r=>r.result).filter(r=>r?.recognized);
  if(!recognized.length)throw Error('未识别到可见的多多招财数据。请确认已登录，打开“商品推广”，并将数据卡片显示在当前窗口。');
  if(recognized.length!==1)throw Error('页面存在多个推广区域，暂不自动合并。请只显示一个待核对的推广页面后重试。');
  display({...recognized[0],capturedAt:new Date().toISOString(),readOnly:true,source:'daily-edge-sidebar',origin:new URL(tab.url).origin});
  $('status').textContent='采集完成，数据待核对；没有修改推广。';
 }catch(e){if(ticket===revision)$('status').textContent=/Cannot access|permission|Extension manifest/i.test(e.message)?'无法读取此页面。请确认扩展已获得拼多多站点权限；扩展更新后请刷新推广标签页再试。':e.message;}
 finally{$('read').disabled=false;}
};
$('clear').onclick=()=>{stopAutomatic('本次数据已清除。');journal.clear();latestAttempt=null;currentAssessment=null;$('exportAttempt').disabled=true;$('attemptStatus').textContent='本轮与合格快照已清除。';reset('本次数据已清除。');};
function download(data,name){
 if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('export').onclick=()=>download(snapshot,'xinyongtu-displayed-snapshot.json');
$('exportAttempt').onclick=()=>download(latestAttempt,'xinyongtu-latest-attempt-diagnostic.json');
chrome.tabs.onActivated.addListener(()=>{if(batchRunning)return;stopAutomatic('当前标签页已切换，自动采集已停止。');reset('当前标签页已切换，请重新采集。');});
chrome.tabs.onUpdated.addListener((id,change)=>{
 if(batchRunning)return;
 if(id!==targetTab)return;
 if(refreshing){if(!change.url||change.url===refreshUrl)return;$('status').textContent='刷新期间页面地址改变，正在停止并保存诊断。';return;}
 if(change.url||(change.status==='loading'&&!waitingForReady)){stopAutomatic('页面正在跳转，自动采集已停止。');reset('推广页面已跳转或刷新，请重新采集。');}
});

function stopAutomatic(message='自动采集已停止。'){
 nextScanAt=null;clearInterval(countdownTimer);countdownTimer=null;autoEpoch++;automatic=false;waitingForReady=false;clearTimeout(timer);timer=null;controller?.abort();refreshing=false;refreshUrl=null;$('refreshMode').disabled=false;$('shopLabel').disabled=false;$('auto').disabled=false;$('stop').disabled=true;$('read').disabled=false;$('interval').disabled=false;$('status').textContent=message;if($('progress').textContent.startsWith('扫描中'))$('progress').textContent='扫描已停止。';
}
async function runCycle(expectedEpoch=autoEpoch){
 if(!automatic||expectedEpoch!==autoEpoch)return;nextScanAt=null;clearInterval(countdownTimer);countdownTimer=null;const runEpoch=expectedEpoch;controller=new AbortController();const runController=controller;waitingForReady=true;$('status').textContent='正在自动采集，请暂时不要切换标签、日期、筛选条件或手动操作页面。';
 try{
  if($('shopLabel').value.trim()!==runShopLabel)throw Error('店铺备注已改变，请重新开始');
  let refreshEvidence=null;
  if($('refreshMode').value==='reload'){
   const tab=await chrome.tabs.get(targetTab);refreshUrl=tab.url;refreshing=true;
   try{const prepared=await prepareRefreshedPage({tabId:targetTab,signal:runController.signal,baseline:scopeBaseline,onPhase:message=>{if(automatic&&runEpoch===autoEpoch){$('status').textContent=message;$('progress').textContent=message;}}});if(!automatic||runEpoch!==autoEpoch)return;scopeBaseline=prepared.scope;refreshEvidence=prepared.evidence;}
   finally{if(runEpoch===autoEpoch){refreshing=false;refreshUrl=null;}}
  }
  if(!automatic||runEpoch!==autoEpoch)return;
  const data=await collectAutomatically({tabId:targetTab,signal:runController.signal,progress:p=>{if(!automatic||runEpoch!==autoEpoch)return;waitingForReady=false;$('progress').textContent='扫描中：'+p.count+'/'+(p.expected??'总数未知')+' 条；扫描步数 '+p.steps+'；向后扫描页数 '+p.pages;}});
  if(!automatic||runEpoch!==autoEpoch)return;
  if(scopeBaseline){try{assertPromotionScope(scopeBaseline,data);}catch(e){e.refreshEvidence={...refreshEvidence,error:e.message};throw e;}}
  if($('shopLabel').value.trim()!==runShopLabel)throw Error('店铺备注已改变，请重新开始');
  if(refreshEvidence)data.refreshEvidence=refreshEvidence;
  $('progress').textContent='扫描已结束：'+data.autoCollection.capturedRows+'/'+(data.autoCollection.expectedRows??'总数未知')+' 条；扫描步数 '+data.autoCollection.scanSteps+'。';display(data);$('status').textContent='本轮扫描结束，未修改广告。覆盖范围请看结果说明。';
  if(!currentAssessment.accepted){stopAutomatic('本轮未通过结构检查，已暂停重复采集；请导出本轮诊断。上轮合格结果未被覆盖。');return;}
  const seconds=Number($('interval').value);
  if(seconds>0){$('progress').textContent='本轮'+data.products.length+'条；约'+seconds+'秒后'+($('refreshMode').value==='reload'?'刷新页面并重新采集。':'重新读取平台已加载数据（不刷新页面）。');nextScanAt=Date.now()+seconds*1000;renderRunState();countdownTimer=setInterval(renderRunState,1000);timer=setTimeout(()=>runCycle(runEpoch),seconds*1000);}
  else stopAutomatic('单轮自动扫描已结束，请核对结果。');
 }catch(e){if(automatic&&runEpoch===autoEpoch){if(e.refreshEvidence)display(refreshFailureDiagnostic(e));stopAutomatic(e.message);}}
}
$('auto').onclick=async()=>{
 reportNavController?.abort();
 stopAutomatic();reset('正在准备自动采集…');
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id||!isMerchantUrl(tab.url)){$('status').textContent='请先选中正常登录的多多招财标签页。';return;}
 targetTab=tab.id;scopeBaseline=null;runShopLabel=$('shopLabel').value.trim();automatic=true;$('refreshMode').disabled=true;$('shopLabel').disabled=true;$('auto').disabled=true;$('stop').disabled=false;$('read').disabled=true;$('interval').disabled=true;runCycle();
};
$('stop').onclick=()=>stopAutomatic();
window.addEventListener('pagehide',()=>{reportNavController?.abort();automatic=false;controller?.abort();clearTimeout(timer);clearInterval(countdownTimer);});

async function refreshHistory(){
 const shop=$('shopLabel').value.trim();
 try{
  const records=(await historyStore.list()).filter(r=>r.scope.shop===shop);
  $('historyStatus').textContent=shop?'本机备注“'+shop+'”：已保存 '+records.length+' 轮；仅本机，不上传。':'未填写备注，采集照常运行，暂不保存历史。';
  $('historyRows').replaceChildren();$('historyStats').replaceChildren();
  for(const g of historyStats(records).slice(0,6))$('historyStats').append(node('p',g.scope.mode+' · '+g.scope.dates.join('、')+' · 筛选 '+g.scope.filter+'：保留记录中 '+g.passed+'/'+g.total+' 轮通过；最近连续通过 '+g.consecutive+' 轮。'));
  for(const r of records.slice(0,10))$('historyRows').append(node('p',new Date(r.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+' · '+r.scope.mode+' · '+r.captured+'/'+(r.expected??'?')+' 条 · '+(r.accepted?'结构合格':r.problems.join('；'))));
 }catch(e){$('historyStatus').textContent='无法读取本地历史：'+e.message;}
}
$('historyRefresh').onclick=()=>historyQueue.then(refreshHistory);
$('shopLabel').onchange=refreshHistory;
$('historyExport').onclick=async()=>{await historyQueue;const shop=$('shopLabel').value.trim();if(!shop){$('historyStatus').textContent='请先填写要导出的店铺备注。';return;}try{const records=(await historyStore.list()).filter(r=>r.scope.shop===shop);download({schemaVersion:'history-1',exportedAt:new Date().toISOString(),shopLabel:shop,records},'xinyongtu-local-history.json');}catch(e){$('historyStatus').textContent='历史导出失败：'+e.message;}};
$('historyClear').onclick=async()=>{if(!confirm('清空此扩展保存的全部店铺历史？此操作不可撤销。'))return;historyQueue=historyQueue.then(()=>historyStore.clear()).then(refreshHistory).catch(e=>{$('historyStatus').textContent='清空失败：'+e.message;});await historyQueue;};
refreshHistory();

function renderRunState(){
 if(batchRunning){$('runState').textContent='一键采集进行中 · '+$('batchStatus').textContent;$('runState').dataset.running='true';return;}
 $('runState').textContent=automatic?(nextScanAt?'自动采集运行中 · 距下次扫描约 '+Math.max(0,Math.ceil((nextScanAt-Date.now())/1000))+' 秒':'自动采集运行中 · '+($('progress').textContent||'准备扫描')):('未在自动采集 · '+$('status').textContent);
 $('runState').dataset.running=String(automatic);
}
new MutationObserver(renderRunState).observe($('status'),{childList:true,subtree:true,characterData:true});
new MutationObserver(renderRunState).observe($('progress'),{childList:true,subtree:true,characterData:true});
renderRunState();

let reportMap=null,reportMapTarget=null,reportNavController=null;
$('reportInspect').onclick=async()=>{
 reportNavController?.abort();stopAutomatic('已停止定时采集，开始识别报表入口。');$('reportInspect').disabled=true;$('reportMapStatus').textContent='正在识别已渲染的报表入口和日期控件…';reportMap=null;reportMapTarget=null;$('reportMapExport').disabled=true;$('reportMapEntries').replaceChildren();
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!isMerchantUrl(tab.url)||tab.status==='loading')throw Error('请选中已加载完成的商家推广或报表页');
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:inspectReportEntrances,args:[{action:'inspect'}]});
  const valid=results.filter(r=>r.result?.recognized);if(valid.length!==1)throw Error('没有唯一识别到报表区域；请展开报表菜单或打开报表页后重试');
  const current=await chrome.tabs.get(tab.id);if(current.url!==tab.url||current.status==='loading')throw Error('页面已改变，请重新识别');
  showReportMap(valid[0].result,{tabId:tab.id,frameId:valid[0].frameId,url:tab.url});
 }catch(e){$('reportMapStatus').textContent=e.message;}finally{$('reportInspect').disabled=false;}
};
function showReportMap(map,target){
 $('reportMapEntries').replaceChildren();
 reportMap=map;reportMapTarget=target;$('reportMapExport').disabled=false;
  $('reportMapStatus').textContent='识别到 '+reportMap.entries.length+' 个入口，'+reportMap.dateControls.length+' 个日期控件。当前路径：'+reportMap.page.path+'。尚未执行历史补采。';
  for(const entry of reportMap.entries){const block=document.createElement('div');block.className='product';block.append(node('p',entry.label+(entry.productId?' · 商品 '+entry.productId:' · 当前页面')+(entry.target?' · '+entry.target.path:'')));if(entry.reason)block.append(node('p',entry.reason));const button=node('button','进入此入口');button.disabled=!entry.available;button.onclick=()=>openReportEntrance(entry);block.append(button);$('reportMapEntries').append(block);}
}
async function openReportEntrance(entry){
 reportNavController?.abort();stopAutomatic('已停止定时采集，准备进入报表入口。');const controller=new AbortController();reportNavController=controller;$('reportInspect').disabled=true;$('reportMapExport').disabled=true;
 try{
  if(!reportMapTarget)throw Error('请先重新识别入口');
  const result=await navigateReportEntrance({target:reportMapTarget,entry,signal:controller.signal,onPhase:message=>{if(!controller.signal.aborted)$('reportMapStatus').textContent=message;}});
  if(controller.signal.aborted)return;showReportMap(result.map,result.target);$('reportMapStatus').textContent='已核验进入报表：'+result.map.page.path+'。已自动识别新页面，请直接导出入口与日期诊断。';
 }catch(e){if(!controller.signal.aborted){if(e.reportMap)showReportMap(e.reportMap,e.reportMapTarget);if(reportMap)reportMap={...reportMap,navigationEvidence:e.navigationEvidence||{confirmed:false,error:e.message}};$('reportMapExport').disabled=!reportMap;$('reportMapStatus').textContent='未确认进入报表：'+e.message+'。可在平台手动打开报表后再识别。';}}
 finally{if(reportNavController===controller){reportNavController=null;$('reportInspect').disabled=false;}}
}
$('reportMapExport').onclick=()=>download(reportMap,'xinyongtu-report-map.json');

installBatchPanel({beforeStart:()=>{reportNavController?.abort();stopAutomatic();},setRunning:value=>{batchRunning=value;$('advancedTools').inert=value;renderRunState();}});
new MutationObserver(renderRunState).observe($('batchStatus'),{childList:true,subtree:true,characterData:true});
