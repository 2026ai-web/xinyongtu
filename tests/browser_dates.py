"""Readonly range picker, pending confirmation, comparison isolation, seven daily datasets."""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1400,'height':900})
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'')
  if path.startswith('/extension/'):r.fulfill(body=(root/path.removeprefix('/extension/')).read_text(),content_type='text/html; charset=utf-8' if path.endswith('.html') else 'text/css' if path.endswith('.css') else 'application/javascript')
  else:r.fulfill(body='<html><meta charset="utf-8"><body>offline calendar fixture</body></html>',content_type='text/html; charset=utf-8')
 page.route(origin+'/**',route)
 page.goto(origin+'/goods/report/promotion/overView?beginDate=2026-10-26&endDate=2026-11-01')
 if '--panel-only' not in sys.argv:
  result=page.evaluate('''async()=>{
   const {batchReportDocument:dom}=await import('/extension/batch-dom.js');const {createBatchDriver,assertDay}=await import('/extension/batch-driver.js');const {runBatch}=await import('/extension/batch-runner.js');const {createBatchStore}=await import('/extension/batch-store.js');
   const fields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量'];
   let current=['2026-10-26','2026-11-01'],pending=[],month='2026-11',tableMode=false,budgetClicks=0,calendarOpens=0,confirms=0,selected=[];const observations=[],urlEvents=[];let droppedDateReceipt=false;
   const inputs=()=>[...document.querySelectorAll('.primary input')];
   function report(){const single=current[0]===current[1],amount=single?Number(current[0].slice(-2))%7+1:999;
    const total=24*amount,header=fields.map(f=>'<th>'+f+'</th>').join('');
    document.querySelector('#hours').innerHTML=tableMode?'<table><thead><tr><th>时段</th>'+header+'</tr></thead><tbody><tr><td>合计数据（24条）</td>'+fields.map(()=>'<td>'+total+'</td>').join('')+'</tr>'+Array.from({length:single?24:7},(_,i)=>'<tr><td>'+(single?i+':00-'+i+':59':'2026-10-'+(26+i))+'</td>'+fields.map(()=>'<td>'+amount+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'';
    document.querySelector('#details').innerHTML=location.pathname.endsWith('/unit')?'':'<p>合计数据（1条）</p><table><thead><tr><th>商品</th>'+header+'</tr></thead><tbody><tr><td>商品 ID：900224894507 稳定成本推广 <a href="/goods/report/promotion/unit?adId=9146588221&beginDate='+current[0]+'&endDate='+current[1]+'">查看详情</a></td>'+fields.map(()=>'<td>'+total+'</td>').join('')+'</tr></tbody></table>';
   }
   function calendar(){
    document.querySelector('.DatePickerPopup')?.remove();const box=document.createElement('div');box.className='DatePickerPopup';box.setAttribute('role','dialog');box.style.cssText='position:fixed;top:80px;left:100px;background:white;z-index:99;border:1px solid;max-height:600px;overflow:auto';
    const date=new Date(month+'-01T00:00:00Z'),start=new Date(date);start.setUTCDate(1-date.getUTCDay());
    box.innerHTML='<header>'+date.getUTCFullYear()+'年'+(date.getUTCMonth()+1)+'月<button title="上一月">‹</button><button title="下一月">›</button></header><table><tbody>'+Array.from({length:6},(_,r)=>'<tr>'+Array.from({length:7},(_,c)=>{const d=new Date(start.getTime()+(r*7+c)*86400000),day=d.toISOString().slice(0,10);return '<td title="'+day+'" class="'+(day.slice(0,7)===month?'anq-picker-cell-in-view':'')+'"><button title="'+day+'">'+d.getUTCDate()+'</button></td>';}).join('')+'</tr>').join('')+'</tbody></table><button id="apply" '+(pending.length===2?'':'disabled')+'>确定</button>';
    document.body.append(box);
    for(const td of box.querySelectorAll('td'))td.onclick=()=>{const day=td.title;pending.push(day);selected.push(day);if(pending.length===2){const u=new URL(location.href);u.searchParams.set('beginDate',pending[0]);u.searchParams.set('endDate',pending[1]);history.replaceState(null,'',u.href);}calendar();};
    box.querySelector('[title="上一月"]').onclick=()=>{date.setUTCMonth(date.getUTCMonth()-1);month=date.toISOString().slice(0,7);calendar();};box.querySelector('[title="下一月"]').onclick=()=>{date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7);calendar();};
    box.querySelector('#apply').onclick=()=>{if(pending.length!==2)return;current=[...pending];inputs().forEach((e,i)=>e.value=current[i]);confirms++;box.remove();pending=[];report();};
   }
   function render(raw){history.replaceState(null,'',raw);current=['2026-10-26','2026-11-01'];pending=[];month='2026-11';tableMode=false;
    document.body.innerHTML='<style>td,th{min-width:90px;padding:3px}nav{padding:8px}input{width:150px}</style><nav class="primary">今日 昨日 近7日 近30日 近90日 <div class="anq-picker-range"><input readonly value="'+current[0]+'"><input readonly value="'+current[1]+'"></div></nav><nav>对比日期<input readonly value="2026-10-19"><input readonly value="2026-10-25"></nav><div><button>趋势图</button><button id="table">表格</button></div><nav><span aria-selected="true">全部</span><span>稳定成本推广</span><span>全店托管</span></nav>'+(location.pathname.endsWith('/unit')?'<p>商品 ID：900224894507</p>':'')+'<div id="hours"></div><div id="details"></div><button id="budget">调整预算</button>';
    inputs().forEach(e=>e.addEventListener('mousedown',()=>{if(!document.querySelector('.DatePickerPopup')){pending=[];calendarOpens++;calendar();}}));
    document.querySelector('#table').onclick=()=>{tableMode=true;report();};document.querySelector('#budget').onclick=()=>budgetClicks++;report();
   }
   render(location.href);
   const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}],update:async(id,c)=>{if(c.url)render(c.url)},remove:async()=>{}},scripting:{executeScript:async({func,args})=>{const result=func(...args);if(!droppedDateReceipt&&args[0].action==='date-step'&&result.kind==='date-cell-selected'&&result.dateSelection.phase==='confirm'){droppedDateReceipt=true;return [];}return [{result}];}}};
   const store=createBatchStore();await store.clear();const driver=createBatchDriver({tabId:1,api,onDiagnostic:d=>{if(d.action==='url-guard')urlEvents.push(d.urlGuard);if(d.action==='date-step')observations.push({kind:d.kind,dateSelection:d.dateSelection});}});
   const job=await runBatch({shop:'date-fixture',days:7,store,driver,overviewURL:location.href,now:Date.parse('2026-11-02T01:00:00Z')});
   const data=await store.export('date-fixture');if(job.phase!=='complete')throw Error(JSON.stringify({phase:job.phase,failures:job.failures,tail:observations.slice(-3)}));
   for(const row of data.datasets){const amount=Number(row.date.slice(-2))%7+1;if(row.hourly.length!==24||row.validation.totals['总花费(元)']!==24*amount*100)throw Error('range aggregate saved under a day');if(row.context.dates.length!==1||row.context.dates[0]!==row.date)throw Error('rendered date differs from stored date');}
   if(!droppedDateReceipt||driver.measurements().dateReceiptRecoveries!==1)throw Error('lost date receipt recovery not exercised');if(!urlEvents.some(e=>e.accepted))throw Error('no auto date URL transition exercised');if(data.datasets.length!==14)throw Error('seven days x account/link missing');
   const comparison=[...document.querySelectorAll('nav:nth-of-type(2) input')].map(e=>e.value);if(comparison.join(',')!=='2026-10-19,2026-10-25')throw Error('comparison dates were modified');
   if(budgetClicks)throw Error('ad operation touched');
   return {days:job.dates,coverage:job.coverage,records:data.datasets.length,acceptedDateURLChanges:urlEvents.filter(e=>e.accepted).length,dateReceiptRecoveries:driver.measurements().dateReceiptRecoveries,calendarOpens,confirms,selectedDateClicks:selected.length,monthNavigation:observations.filter(o=>o.kind==='calendar-month-requested').length,comparison,budgetClicks};
  }''')
  print('PASS readonly range -> 7 independent account/link days, pending apply, same-day double selection, month navigation, stale unit range repaired, no comparison or ad changes:',result,flush=True)
 # Panel custom date selection is persisted and previews independent days.
 page.add_init_script("window.chrome={tabs:{onActivated:{addListener:()=>{}},onUpdated:{addListener:()=>{}}}}")
 page.goto(origin+'/extension/panel.html');page.locator('#batchDays').select_option('single');page.locator('#batchStartDate').fill('2026-10-28');page.locator('#batchStartDate').dispatch_event('change');assert page.locator('#batchDateFields').is_visible();assert not page.locator('#batchEndDate').is_visible();assert '共 1 天' in page.locator('#batchDatePreview').inner_text()
 page.locator('#batchDays').select_option('custom');page.locator('#batchStartDate').fill('2026-10-30');page.locator('#batchEndDate').fill('2026-11-01');page.locator('#batchEndDate').dispatch_event('change');assert '共 3 天' in page.locator('#batchDatePreview').inner_text();page.reload();assert page.locator('#batchDays').input_value()=='custom';assert page.locator('#batchStartDate').input_value()=='2026-10-30';assert page.locator('#batchEndDate').input_value()=='2026-11-01'
 print('PASS custom single/date-range controls, day preview and reload persistence',flush=True)
 browser.close()
