"""Fast coverage must not skip unmounted virtual hours or repeat lost mutations."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1200,'height':750})
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'')
  if path.startswith('/extension/'):r.fulfill(body=(root/path.rsplit('/',1)[1]).read_text(),content_type='application/javascript')
  else:r.fulfill(body='<html><meta charset="utf-8"><body></body></html>',content_type='text/html; charset=utf-8')
 page.route(origin+'/**',route)
 page.goto(origin+'/goods/report/promotion/unit?adId=9146588221&beginDate=2026-11-01&endDate=2026-11-01')
 result=page.evaluate('''async()=>{
  const {createBatchDriver}=await import('/extension/batch-driver.js');const {validateHours}=await import('/extension/batch-model.js');const fields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量'];
  function setup(virtual=true){document.body.innerHTML='<style>td,th{min-width:90px;padding:4px}input{width:150px}</style><nav>今日 昨日 近7日 近30日 近90日<input type="date" value="2026-11-01"></nav><p>商品 ID：900224894507</p><div><button>趋势图</button><button>表格</button></div><div id="scroll" style="height:180px;overflow:auto"><div style="height:2400px"><table><thead><tr><th>时段</th>'+fields.map(f=>'<th>'+f+'</th>').join('')+'</tr></thead><tbody></tbody></table></div></div>';window.maxTop=0;const scroller=document.querySelector('#scroll');function render(){const start=virtual?Math.min(20,Math.floor(scroller.scrollTop/100)):0;document.querySelector('tbody').innerHTML='<tr><td>合计数据（24条）</td>'+fields.map(()=>'<td>24</td>').join('')+'</tr>'+Array.from({length:4},(_,i)=>'<tr><td>'+(start+i)+':00-'+(start+i)+':59</td>'+fields.map(()=>'<td>1</td>').join('')+'</tr>').join('');window.maxTop=Math.max(window.maxTop,scroller.scrollTop);}scroller.onscroll=render;render();}
  const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}]},scripting:{executeScript:async({func,args})=>[{result:func(...args)}]}};
  setup(true);const delayed=[...document.querySelectorAll('button')].find(e=>e.textContent==='表格'),parent=delayed.parentElement;delayed.remove();setTimeout(()=>parent.append(delayed),200);const driver=createBatchDriver({tabId:1,api});const data=await driver.scan('2026-11-01');validateHours(data.hourly,'稳定成本推广');if(window.maxTop<2000)throw Error('unmounted virtual hours skipped');const virtualTop=window.maxTop;
  setup(false);const partial=await createBatchDriver({tabId:1,api}).scan('2026-11-01');let refused=false;try{validateHours(partial.hourly,'稳定成本推广')}catch{refused=true}if(!refused)throw Error('4 hours mistaken for 24');
  let lostRead=true,readCalls=0;const retryApi={...api,scripting:{executeScript:async({func,args})=>{readCalls++;if(lostRead){lostRead=false;return [];}return [{result:func(...args)}];}}};const reader=createBatchDriver({tabId:1,api:retryApi});await reader.read();if(readCalls!==2||reader.measurements().readReceiptRetries!==1)throw Error('readonly retry failed');
  let scrollCalls=0;const lostMutation={...api,scripting:{executeScript:async({func,args})=>{if(args[0].action==='scroll-next'){scrollCalls++;func(...args);return [];}return [{result:func(...args)}];}}};const controller=createBatchDriver({tabId:1,api:lostMutation});await controller.read({action:'scroll-init'});let blocked=false;try{await controller.read({action:'scroll-next'})}catch{blocked=true}if(!blocked||scrollCalls!==1)throw Error('lost mutation was replayed');
  const wrong={...api,scripting:{executeScript:async()=>[{result:{protocol:'wrong',action:'read'}}]}};let wrongRejected=false;try{await createBatchDriver({tabId:1,api:wrong}).read()}catch{wrongRejected=true}if(!wrongRejected)throw Error('wrong protocol accepted');
  return {hours:data.hourly.length,virtualTop,incompleteRefused:refused,readCalls,lostScrollCalls:scrollCalls,wrongProtocolRejected:wrongRejected};
 }''')
 print('PASS fast-path and receipt protections:',result)
 browser.close()
