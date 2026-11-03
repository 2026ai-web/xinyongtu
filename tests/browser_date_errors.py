"""Date failures must never change/read back an unconfirmed interval as a single day."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 page.route(origin+'/**',lambda r:r.fulfill(body=(root/'batch-dom.js').read_text() if r.request.url.endswith('/batch-dom.js') else '<html><meta charset="utf-8"><body></body></html>',content_type='application/javascript' if r.request.url.endswith('/batch-dom.js') else 'text/html; charset=utf-8'))
 page.goto(origin+'/goods/report/promotion/overView')
 result=page.evaluate('''async()=>{
  const {batchReportDocument:dom}=await import('/batch-dom.js');const target='2026-10-26',command={action:'date-step',start:target,end:target};
  function setup(type){document.body.innerHTML='<nav>今日 昨日 近7日 近30日 近90日<input readonly value="2026-10-26"><input readonly value="2026-11-01"></nav><nav>对比日期<input readonly value="2026-10-19"><input readonly value="2026-10-25"></nav>';
   document.querySelector('input').onmousedown=()=>{if(type==='none'||document.querySelector('[role=dialog]'))return;const box=document.createElement('div');box.setAttribute('role','dialog');box.innerHTML=type==='duplicate'?'<button title="'+target+'">26</button><button title="'+target+'">26</button>':type==='disabled'?'<button title="'+target+'" disabled>26</button>':'<button title="'+target+'">26</button><button>确定</button>';document.body.append(box);};}
  setup('none');const decoy=document.createElement('div');decoy.setAttribute('role','grid');decoy.innerHTML='<table><tr><td title="'+target+'">报表日期</td></tr></table>';let decoyClicks=0;decoy.onclick=()=>decoyClicks++;document.body.append(decoy);let noPopup=false;for(let i=0;i<5;i++){const result=dom({...command,reset:i===0});if(globalThis.__xinyongtuBatchDate)globalThis.__xinyongtuBatchDate.openedAt=0;if(result.error){noPopup=result.errorCode==='calendar-not-open';break;}}if(!noPopup||decoyClicks)throw Error('missing calendar not diagnosed or report grid clicked');
  setup('duplicate');dom({...command,reset:true});const duplicate=dom(command).error?.includes('不唯一');if(!duplicate)throw Error('duplicate date cells accepted');
  setup('disabled');dom({...command,reset:true});if(!dom(command).error)throw Error('disabled target date accepted');
  setup('ignored');let selected=false,rejected=false;for(let i=0;i<122;i++){const result=dom({...command,reset:i===0});if(result.kind==='date-selected')selected=true;if(result.error){rejected=true;break;}}if(selected||!rejected)throw Error('unapplied selection accepted');
  const values=[...document.querySelectorAll('input')].map(e=>e.value);if(values.join(',')!=='2026-10-26,2026-11-01,2026-10-19,2026-10-25')throw Error('unconfirmed or comparison values changed');return {noPopup,duplicate,disabled:true,unappliedSelectionRejected:rejected,values};
 }''')
 print('PASS date error protections:',result)
 browser.close()
