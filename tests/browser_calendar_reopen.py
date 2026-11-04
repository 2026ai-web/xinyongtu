"""Report25: stale range restriction or focused closed picker; close/read back/reopen once."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
old=subprocess.check_output(['git','show','6c77dd0:edge-extension/batch-dom.js'],cwd=root.parent,text=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 def route(r):
  name=r.request.url.split('?')[0].rsplit('/',1)[-1]
  r.fulfill(body=old if name=='old.js' else (root/name).read_text() if name.endswith('.js') else '<html><meta charset="utf-8"><body></body></html>',content_type='application/javascript' if name.endswith('.js') else 'text/html; charset=utf-8')
 page.route(origin+'/**',route)
 page.goto(origin+'/goods/report/promotion/overView?beginDate=2026-10-28&endDate=2026-10-28')
 result=page.evaluate('''async()=>{
 const {batchReportDocument:dom}=await import('/extension/batch-dom.js'),{batchReportDocument:old}=await import('/extension/old.js'),{createBatchDriver}=await import('/extension/batch-driver.js');const target='2026-10-30',cmd={action:'date-step',start:target,end:target};let mode,closed,cells,confirms,opens,bad,active,pending,current,closeCalls;
 const inputs=()=>[...document.querySelectorAll('#main input')];
 function calendar(){opens++;document.querySelector('.anq-picker-dropdown')?.remove();const box=document.createElement('div');box.className='anq-picker-dropdown';const blocked=(mode==='stale'&&!closed)||mode==='unclosable'||mode==='end-disabled'&&active===1;box.innerHTML='<h3>2026年10月</h3><table><tr><td title="'+target+'" class="anq-picker-cell anq-picker-cell-in-view '+(blocked?'anq-picker-cell-disabled':'')+'">30</td></tr></table><button>确定</button>';document.body.append(box);box.querySelector('td').onclick=()=>{if(blocked){bad++;return;}cells++;pending[active]=target;active=1;calendar();};box.querySelector('button').onclick=()=>{confirms++;current=[...pending];inputs().forEach((e,i)=>e.value=current[i]);const u=new URL(location.href);u.searchParams.set('beginDate',current[0]);u.searchParams.set('endDate',current[1]);history.replaceState(null,'',u);box.remove();};}
 function setup(kind){mode=kind;closed=false;cells=confirms=opens=bad=closeCalls=0;active=0;current=['2026-10-28','2026-10-28'];pending=[...current];delete globalThis.__xinyongtuBatchDate;document.body.onmousedown=null;history.replaceState(null,'','/goods/report/promotion/overView?beginDate=2026-10-28&endDate=2026-10-28');document.body.innerHTML='<nav id="main">今日 昨日 近7日 近30日 近90日<div class="anq-picker-range"><input value="2026-10-28"><input readonly value="2026-10-28"></div></nav><nav class="CompareDatePicker_wrap__Me_jj">对比日期<input readonly value="2026-10-27"></nav><nav><span aria-selected="true">全部</span><span>稳定成本推广</span><span>全店托管</span></nav><button id="budget">调整预算</button>';document.querySelector('#budget').onclick=()=>bad++;document.querySelector('nav:nth-of-type(2)').onclick=()=>bad++;
 if(kind==='focus-stuck'){inputs()[0].focus();inputs().forEach((e,i)=>e.onfocus=()=>{active=i;calendar();});}else inputs().forEach((e,i)=>e.onmousedown=()=>{active=i;calendar();});
 document.body.onmousedown=e=>{if(e.target!==document.body)return;closeCalls++;if(mode==='unclosable')return;closed=true;document.querySelector('.anq-picker-dropdown')?.remove();};}
 setup('focus-stuck');let baseline;for(let i=0;i<10;i++){if(globalThis.__xinyongtuBatchDate)globalThis.__xinyongtuBatchDate.openedAt=0;const r=old({...cmd,reset:i===0});if(r.error){baseline=r.errorCode;break;}}if(baseline!=='calendar-not-open'||cells)throw Error('report25 closed-focused baseline missing');
 setup('stale');let staleBaseline;for(let i=0;i<5;i++){const r=old({...cmd,reset:i===0});if(r.error){staleBaseline=r.errorCode;break;}}if(staleBaseline!=='calendar-target-disabled'||closed||cells)throw Error('stale constraint baseline missing');
 const outcomes={baseline,staleBaseline};for(const kind of ['stale','focus-stuck','unclosable','end-disabled']){setup(kind);const events=[];const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}]},scripting:{executeScript:async({func,args})=>[{result:func(...args)}]}};const driver=createBatchDriver({tabId:1,api,onDiagnostic:d=>events.push(d)});let error;try{await driver.overview(location.href,target);}catch(e){error=e;}
 const resets=events.filter(e=>e.kind==='calendar-close-requested').length,closures=events.filter(e=>e.kind==='calendar-closed').length;
 if(kind==='unclosable'){if(error?.code!=='calendar-close-failed'||resets!==1||closures||cells||confirms)throw Error('unclosed popup accepted');}else if(kind==='end-disabled'){if(error?.code!=='calendar-target-disabled'||resets||cells!==1||confirms)throw Error('partial end selection reset');}else{if(error)throw error;if(current.join()!==target+','+target||cells!==2||confirms!==1||resets!==1||closures!==1||driver.measurements().calendarRecoveries!==0)throw Error('reopen did not reach verified single day');if(events.some(e=>e.kind==='calendar-end-first-requested'))throw Error('clicked fallback instead of reopening');}
 if(bad||document.querySelector('nav:nth-of-type(2) input').value!=='2026-10-27')throw Error('disabled/comparison/budget touched');outcomes[kind]={cells,confirms,opens,resets,closures,error:error?.code||null,actual:current,closeCalls};}
 return outcomes;
 }''')
 print('PASS calendar close/reopen:',result,flush=True)
 browser.close()
