"""Offline regressions for loading tabs, pre-toggle summaries and report-scoped scrolling."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
fields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量']
headers=''.join('<th>'+f+'</th>' for f in fields)
hours='<table id="hourTable"><thead><tr><th>时段</th>'+headers+'</tr></thead><tbody>'+''.join('<tr><td>'+str(i)+':00-'+str(i)+':59</td>'+''.join('<td>1</td>' for _ in fields)+'</tr>' for i in range(24))+'</tbody></table>'
products='<p>合计数据（1条）</p><table id="products"><thead><tr><th>商品</th>'+headers+'</tr></thead><tbody><tr><td>合计数据（1条）</td>'+''.join('<td>24</td>' for _ in fields)+'</tr><tr><td>商品 ID：900224894507 稳定成本推广</td>'+''.join('<td>24</td>' for _ in fields)+'</tr></tbody></table>'
cards='<section id="cards"><h2>数据概况</h2>'+''.join('<dl><dt>'+f.removesuffix('(元)')+'<span style="display:none">解释说明，不是当前指标</span></dt><dd>24<span>较昨日 99%</span></dd></dl>' for f in fields)+'</section>'
controls='<nav>今日 昨日 近7日 近30日 近90日<input type="date" value="2026-11-01"></nav><nav><span aria-selected="true">全部</span><span>稳定成本推广</span><span>全店托管</span></nav><div><button>趋势图</button><button id="table">表格</button></div>'
style='<style>td,th{min-width:90px;padding:3px}nav{padding:8px}input{width:150px}.noise{width:80px;overflow:auto;white-space:nowrap}</style>'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1200,'height':700})
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'')
  if path.startswith('/extension/'):r.fulfill(body=(root/path.removeprefix('/extension/')).read_text(),content_type='application/javascript')
  else:r.fulfill(body=style+controls+cards+hours+products+'<div class="noise" id="notice">很长的通知文字很长的通知文字很长的通知文字</div><div class="noise" id="goodsName">很长的商品名称很长的商品名称很长的商品名称</div>',content_type='text/html; charset=utf-8')
 page.route(origin+'/**',route)
 page.goto(origin+'/goods/report/promotion/overView?beginDate=2026-11-01&endDate=2026-11-01')
 result=page.evaluate('''async()=>{
  const {batchReportDocument:dom}=await import('/extension/batch-dom.js');const {createBatchDriver,assertDay}=await import('/extension/batch-driver.js');const {validateOverall,validateHours}=await import('/extension/batch-model.js');
  const first=dom();if(first.summary.length!==0)throw Error('cards must not replace a missing overview table total');
  const scroll=dom({action:'scroll-init'}).scroll;if(scroll.targets.some(t=>t.className==='noise'))throw Error('noise included in report scrolling');
  function totalRow(){const row=document.createElement('tr');row.id='overallTotal';row.innerHTML='<td>合计数据（24条）</td>'+Array(6).fill('<td>24</td>').join('');return row;}document.querySelector('#table').onclick=()=>{document.querySelector('#cards')?.remove();document.querySelector('#hourTable tbody').prepend(totalRow());};
  let updates=0;const events=[];const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'loading'}),query:async()=>[{id:1}],update:async()=>{updates++;throw Error('same URL must not reload')}},scripting:{executeScript:async({func,args})=>[{result:func(...args)}]}};
  const driver=createBatchDriver({tabId:1,api,onDiagnostic:d=>events.push(d)});
  await driver.overview(location.href,'2026-11-01');const data=await driver.scan('2026-11-01',{account:true});validateOverall(data.summary,validateHours(data.hourly,'全部').totals);
  document.querySelector('#overallTotal').remove();if(dom().summary.length!==0)throw Error('product totals incorrectly treated as overall summary');
  // An explicit account hourly-table total may supply displayed overall data.
  const total=document.createElement('tr');total.innerHTML='<td>合计</td>'+Array(6).fill('<td>24</td>').join('');document.querySelector('#hourTable tbody').append(total);
  const withTotal=dom();validateOverall(withTotal.summary,validateHours(withTotal.hourly,'全部').totals);
  if(!withTotal.diagnostics.summaryEvidence.filter(e=>e.source==='overview-table-total').length)throw Error('table total provenance absent');
  // Sticky summary/footer is a separate table in the same report wrapper.
  total.remove();const hourlyTable=document.querySelector('#hourTable');const wrapper=document.createElement('div');wrapper.className='anq-table-container';hourlyTable.before(wrapper);
  const scroller=document.createElement('div');scroller.style.cssText='width:350px;overflow:auto';wrapper.append(scroller);scroller.append(hourlyTable);scroller.scrollLeft=150;
  const footer=document.createElement('table');footer.innerHTML='<tbody></tbody>';footer.querySelector('tbody').append(totalRow());wrapper.append(footer);
  const split=dom();validateOverall(split.summary,validateHours(split.hourly,'全部').totals);if(split.expectedRows!==1)throw Error('24 hourly rows confused with product count');
  // Ambiguous multiple total rows are rejected, even when their values match.
  footer.querySelector('tbody').append(totalRow());if(dom().summary.length)throw Error('ambiguous total rows accepted');footer.querySelector('tbody').lastChild.remove();
  // Main date conflict remains an error even if the tab is loading.
  document.querySelector('input').value='2026-10-31';let rejected=false;
  try{assertDay(dom(),'2026-11-01')}catch{rejected=true}if(!rejected)throw Error('wrong date accepted');
  return {updates,summary:data.summary.length,products:data.products.length,hours:data.hourly.length,loadingObservations:events.filter(d=>d.action==='wait-ready'&&d.tab.status==='loading').length,noiseOffsets:[document.querySelector('#notice').scrollLeft,document.querySelector('#goodsName').scrollLeft],rejected};
 }''')
 assert result['updates']==0 and result['summary']==6 and result['hours']==24 and result['products']==1 and result['loadingObservations']>0 and result['noiseOffsets']==[0,0] and result['rejected'],result
 print('PASS: loading tab with verified DOM, no same-URL reload, cards cannot replace missing totals, table switch captures explicit overview totals, unrelated scrollers untouched, separate sticky totals, ambiguous totals/wrong date refused',result)
 browser.close()
