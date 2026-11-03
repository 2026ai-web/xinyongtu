"""Offline slow popup, outer range wrapper, bounded recovery and real error receipts."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'')
  r.fulfill(body=(root/path.rsplit('/',1)[1]).read_text() if path.startswith('/extension/') else '<html><meta charset="utf-8"><body></body></html>',content_type='application/javascript' if path.startswith('/extension/') else 'text/html; charset=utf-8')
 page.route(origin+'/**',route);page.goto(origin+'/goods/report/promotion/overView')
 result=page.evaluate('''async()=>{
 const {createBatchDriver}=await import('/extension/batch-driver.js');
 let attempts=0,cells=0,confirms=0,toggles=0,mode='slow';const target='2026-11-02';
 function setup(value){mode=value;attempts=0;cells=0;confirms=0;toggles=0;delete globalThis.__xinyongtuBatchDate;document.body.innerHTML='<nav>今日 昨日 近7日 近30日 近90日<div class="anq-picker-range"><div class="anq-picker-input"><input readonly value="2026-10-27"></div><div class="anq-picker-input"><input readonly value="2026-11-02"></div></div></nav><nav>对比日期<input readonly value="2026-10-20"><input readonly value="2026-10-26"></nav><nav><span aria-selected="true">全部</span><span>稳定成本推广</span><span>全店托管</span></nav>';
 const wrapper=document.querySelector('.anq-picker-range');let pending=false;
 function open(){if(document.querySelector('[role=dialog]'))return;const box=document.createElement('div');box.setAttribute('role','dialog');box.innerHTML='<button title="'+target+'">2</button><button id="apply">确定</button>';document.body.append(box);box.firstElementChild.onclick=()=>{cells++;if(mode==='end-never')box.remove();};box.lastElementChild.onclick=()=>{if(cells!==2)throw Error('incorrect cell count');document.querySelectorAll('.anq-picker-range input').forEach(e=>e.value=target);confirms++;box.remove();};}
 wrapper.onmousedown=e=>{attempts++;if(mode==='never'||mode==='end-never'&&cells)return;if(mode==='wrapper'&&e.target!==wrapper)return;if(mode==='recovery'&&attempts<=3)return;if(mode==='slow'){if(pending){toggles++;return;}pending=true;setTimeout(open,900);}else open();};}
 const events=[];const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}]},scripting:{executeScript:async({func,args})=>{if(mode!=='slow'&&globalThis.__xinyongtuBatchDate)globalThis.__xinyongtuBatchDate.openedAt=0;return [{result:func(...args)}];}}};
 const outcomes={};for(const test of ['slow','wrapper','recovery','never','end-never']){setup(test);events.length=0;const driver=createBatchDriver({tabId:1,api,onDiagnostic:d=>events.push(d)});let error;try{await driver.overview(location.href,target);}catch(e){error=e;}const stats=driver.measurements();if(test==='end-never'){if(error?.code!=='calendar-not-open'||stats.calendarRecoveries!==0||cells!==1||confirms!==0)throw Error('partial selection was reset or retried');}else if(test==='never'){if(error?.code!=='calendar-not-open'||stats.calendarRecoveries!==2||attempts!==9)throw Error('permanent failure not bounded: '+JSON.stringify({message:error?.message,stats,attempts}));}else{if(error)throw error;if(cells!==2||confirms!==1||toggles)throw Error('date repeated or popup toggled');if(test==='slow'&&attempts!==1)throw Error('did not wait for delayed popup');if(test==='wrapper'&&attempts!==3)throw Error('outer range wrapper fallback missing');if(test==='recovery'&&stats.calendarRecoveries!==1)throw Error('no bounded automatic recovery');}const comparison=[...document.querySelectorAll('nav:nth-of-type(2) input')].map(e=>e.value).join(',');if(comparison!=='2026-10-20,2026-10-26')throw Error('comparison changed');outcomes[test]={attempts,cells,confirms,recoveries:stats.calendarRecoveries,error:error?.code};}
 setup('slow');const driver=createBatchDriver({tabId:1,api});let pageError;try{await driver.read({action:'unknown'});}catch(e){pageError=e;}if(pageError?.message!=='不支持的报表采集动作'||pageError.code!=='page-command-failed')throw Error('page error lost');
 let injectedCalls=0;const bad={...api,scripting:{executeScript:async()=>{injectedCalls++;return [{error:{message:'fixture actual exception'}}];}}};let injection;try{await createBatchDriver({tabId:1,api:bad}).read();}catch(e){injection=e;}if(injection?.message!=='fixture actual exception'||injectedCalls!==1)throw Error('injection error misclassified or retried');
 return {...outcomes,pageError:pageError.message,injectionError:injection.message};
 }''')
 print('PASS calendar recovery:',result,flush=True);browser.close()
