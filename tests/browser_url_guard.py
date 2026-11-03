"""Owned date rewrites do not authorize other navigation or identity/filter changes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'')
  if path.endswith('/batch-driver.js') or path.endswith('/batch-dom.js') or path.endswith('/batch-model.js'):r.fulfill(body=(root/path.rsplit('/',1)[1]).read_text(),content_type='application/javascript')
  else:r.fulfill(body='<html><meta charset="utf-8"><body><nav>今日 昨日 近7日 近30日 近90日<input type="date" value="2026-10-26"><input type="date" value="2026-11-01"></nav><p>商品 ID：900224894507</p></body></html>',content_type='text/html; charset=utf-8')
 page.route(origin+'/**',route)
 for case in ['adId','scenesMode','filter','unexpectedDate','outsideTransaction']:
  page.goto(origin+'/goods/report/promotion/unit?adId=9146588221&scenesMode=3&filter=all&beginDate=2026-10-26&endDate=2026-11-01')
  result=page.evaluate('''async kind=>{
   const {createBatchDriver}=await import('/batch-driver.js');const events=[];let changed=false;
   if(kind==='outsideTransaction'){for(const e of document.querySelectorAll('input'))e.value='2026-10-27';const u=new URL(location.href);u.searchParams.set('beginDate','2026-10-27');u.searchParams.set('endDate','2026-10-27');history.replaceState(null,'',u.href);}
   const mutate=()=>{const u=new URL(location.href);if(kind==='adId')u.searchParams.set('adId','9146588222');if(kind==='scenesMode')u.searchParams.set('scenesMode','1');if(kind==='filter')u.searchParams.set('filter','other');if(kind==='unexpectedDate'||kind==='outsideTransaction'){u.searchParams.set('beginDate','2026-10-29');u.searchParams.set('endDate','2026-10-29');}history.replaceState(null,'',u.href);};
   const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}]},scripting:{executeScript:async({func,args})=>{const result=func(...args);if(!changed&&args[0].action==='date-step'&&kind!=='outsideTransaction'){changed=true;mutate();}return [{result}];}}};
   const driver=createBatchDriver({tabId:1,api,onDiagnostic:e=>events.push(e)});let error='';
   try{if(kind==='outsideTransaction'){await driver.navigate(location.href);mutate();await driver.read();}else await driver.verifyUnit({productId:'900224894507',adId:'9146588221'},'2026-10-27');}catch(e){error=e.message;}
   return {error,guard:events.filter(e=>e.action==='url-guard').at(-1)?.urlGuard};
  }''',case)
  assert result['error'] and result['guard'] and result['guard']['accepted'] is False,result
  if case in ['adId','scenesMode','filter']:assert case in result['guard']['changedQueryKeys'],result
  if case=='outsideTransaction':assert result['guard']['targetDate'] is None,result
  print('PASS URL guard rejects',case,flush=True)
 browser.close()
