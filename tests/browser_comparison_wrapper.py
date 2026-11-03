"""Report 17 regression: comparison date wrapper is not an open calendar."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
old=subprocess.check_output(['git','show','9be9085:edge-extension/batch-dom.js'],cwd=root.parent,text=True)
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'')
  body=old if path=='/old.js' else (root/'batch-dom.js').read_text() if path=='/new.js' else '<html><meta charset="utf-8"><body></body></html>'
  r.fulfill(body=body,content_type='application/javascript' if path.endswith('.js') else 'text/html; charset=utf-8')
 page.route(origin+'/**',route);page.goto(origin+'/goods/report/promotion/overView?beginDate=2026-11-02&endDate=2026-11-02')
 result=page.evaluate('''async()=>{
 const old=(await import('/old.js')).batchReportDocument,dom=(await import('/new.js')).batchReportDocument,command={action:'date-step',start:'2026-11-02',end:'2026-11-02',reset:true};let clicks=0;
 function setup(empty=false){document.body.innerHTML='<nav class="MainDatePicker_wrap">今日 昨日 近7日 近30日 近90日<input readonly value="2026-11-02"><input readonly value="2026-11-02"></nav><div class="CompareDatePicker_wrap__Me_jj">对比日期'+(empty?'':'<input readonly value="2026-11-01">')+'</div>';document.querySelector('.CompareDatePicker_wrap__Me_jj').onclick=()=>clicks++;}
 setup();const previous=old(command);if(previous.errorCode!=='calendar-format-unsupported')throw Error('report 17 not reproduced');const current=dom(command);if(current.kind!=='date-selected'||current.diagnostics.calendarCandidates.length)throw Error('comparison wrapper blocks date');
 setup(true);if(dom(command).kind!=='date-selected')throw Error('inputless comparison wrapper mistaken for popup');
 setup();const box=document.createElement('div');box.className='anq-picker-dropdown';box.innerHTML='<button title="02/11">2</button>';document.body.append(box);const unknown=dom(command);if(unknown.errorCode!=='calendar-format-unsupported')throw Error('real unsupported popup bypassed');
 box.innerHTML='<button title="2026-11-02">2</button>';const actual=dom(command);if(actual.kind==='date-selected'||actual.dateSelection.panelCount!==1)throw Error('real date popup bypassed');
 const sample=actual.diagnostics.calendarCandidates;if(sample.some(x=>x.className.includes('CompareDatePicker')))throw Error('comparison included in popup diagnostics');if(clicks)throw Error('comparison clicked');return {baselineError:previous.errorCode,fixed:current.kind,inputlessWrapperIgnored:true,unknownPopupRejected:unknown.errorCode,realPanelCount:actual.dateSelection.panelCount,comparisonClicks:clicks};
 }''')
 print('PASS report 17 regression:',result,flush=True);browser.close()
