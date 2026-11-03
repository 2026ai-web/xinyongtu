"""Reproduce invisible-to-parser calendars and verify scoped yesterday shortcut."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
baseline=subprocess.check_output(['git','show','9a53c4d:edge-extension/batch-dom.js'],cwd=root.parent,text=True)
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'')
  body=baseline if path=='/baseline.js' else (root/path.rsplit('/',1)[1]).read_text() if path.startswith('/extension/') else '<html><meta charset="utf-8"><body></body></html>'
  r.fulfill(body=body,content_type='application/javascript' if path.endswith('.js') else 'text/html; charset=utf-8')
 page.route(origin+'/**',route);page.goto(origin+'/goods/report/promotion/overView')
 result=page.evaluate('''async()=>{
 const {batchReportDocument:dom}=await import('/extension/batch-dom.js');const {batchReportDocument:old}=await import('/baseline.js');const {createBatchDriver}=await import('/extension/batch-driver.js');
 const command={action:'date-step',start:'2026-11-02',end:'2026-11-02'};let clicks=0,confirms=0,shortcut=0,decoy=0;
 function setup(format,broken=false){delete globalThis.__xinyongtuBatchDate;clicks=0;confirms=0;document.body.innerHTML='<nav id="primary" class="DatePickerRange">今日 昨日 近7日 近30日 近90日<input readonly value="2026-10-27"><input readonly value="2026-11-02"></nav><nav id="comparison">对比日期<input readonly value="2026-10-20"><input readonly value="2026-10-26"></nav><nav><span aria-selected="true">全部</span><span>稳定成本推广</span><span>全店托管</span></nav>';
 document.querySelector('input').onmousedown=()=>{if(document.querySelector('[role=dialog]'))return;const box=document.createElement('div');box.setAttribute('role','dialog');box.innerHTML='<button '+(format==='short'?'title="2026-11-2"':format==='chinese'?'title="2026年11月2日"':format==='aria'?'aria-label="2026年11月2日 星期一"':'title="02/11"')+'>2</button><button id="apply">确定</button>';document.body.append(box);box.firstElementChild.onclick=()=>clicks++;box.lastElementChild.onclick=()=>{confirms++;if(!broken)document.querySelectorAll('#primary input').forEach(e=>e.value='2026-11-02');box.remove();};};}
 setup('short');old({...command,reset:true});const previous=old(command);if(previous.dateSelection.panelCount!==0)throw Error('baseline failure not reproduced');
 const outcomes={baselinePanelCount:previous.dateSelection.panelCount};for(const format of ['short','chinese','aria']){setup(format);let selected=false;for(let n=0;n<8;n++){const r=dom({...command,reset:n===0});if(r.error)throw Error(r.error);if(r.kind==='date-selected'){selected=true;break;}}if(!selected||clicks!==2||confirms!==1)throw Error('format selection failed: '+format);outcomes[format]={clicks,confirms};}
 setup('unknown');dom({...command,reset:true});globalThis.__xinyongtuBatchDate.openedAt=0;const unsupported=dom(command);if(unsupported.errorCode!=='calendar-format-unsupported'||!unsupported.diagnostics.calendarCandidates.length)throw Error('unsupported popup misdiagnosed');document.querySelectorAll('#primary input').forEach(e=>e.value='2026-11-02');if(dom(command).kind==='date-selected')throw Error('unrecognized visible popup mistaken for confirmed selection');
 setup('short');const input=document.querySelector('input'),open=input.onmousedown;input.onmousedown=()=>{open();const button=document.querySelector('[role=dialog] button');button.removeAttribute('title');setTimeout(()=>button.setAttribute('title','2026-11-2'),900);};let slowComplete=false;for(let n=0;n<20;n++){const r=dom({...command,reset:n===0});if(r.error)throw Error('slow popup shell rejected: '+r.error);if(r.kind==='date-selected'){slowComplete=true;break;}await new Promise(r=>setTimeout(r,150));}if(!slowComplete||clicks!==2||confirms!==1)throw Error('slow date cells did not complete');outcomes.slowPopupShell=true;
 const now=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),target=new Date(Date.parse(now+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 function shortcuts(broken=false){setup('short');document.querySelector('#primary').insertAdjacentHTML('afterbegin','<span id="yesterday">昨日</span>');document.querySelector('#comparison').insertAdjacentHTML('beforeend','<button id="decoy">昨日</button>');document.querySelector('#yesterday').onclick=()=>{shortcut++;if(!broken)document.querySelectorAll('#primary input').forEach(e=>e.value=target);};document.querySelector('#decoy').onclick=()=>decoy++;}
 const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}]},scripting:{executeScript:async({func,args})=>[{result:func(...args)}]}};
 shortcuts();const driver=createBatchDriver({tabId:1,api});await driver.overview(location.href,target);if(shortcut!==1||decoy||clicks||confirms)throw Error('shortcut scope/repetition failure');
 shortcuts(true);const c={action:'date-step',start:target,end:target};const requested=dom({...c,reset:true}),pending=dom(c);if(requested.kind!=='date-shortcut-requested'||pending.kind==='date-selected')throw Error('shortcut click mistaken for completion');globalThis.__xinyongtuBatchDate.shortcutAt=0;const fallback=dom(c);if(fallback.kind==='date-selected'||shortcut!==2)throw Error('failed shortcut not bounded');
 const comparison=[...document.querySelectorAll('#comparison input')].map(e=>e.value).join(',');if(comparison!=='2026-10-20,2026-10-26')throw Error('comparison changed');return {...outcomes,unsupported:unsupported.errorCode,shortcutSuccess:true,ignoredShortcutNotAccepted:true,decoyClicks:decoy,comparison};
 }''')
 print('PASS calendar formats and shortcut:',result,flush=True);browser.close()
