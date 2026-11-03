"""Offline real-DOM regressions for three-layer collection; all requests fulfilled locally."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
fields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量']
def document(unit=False,managed=False):
    current_fields=fields[1:] if unit and managed else fields
    main='<nav>今日 昨日 近7日 近30日 近90日 <input class="mainDate" type="date" value="2026-11-01"></nav>'
    compare='<nav>对比日期<input class="comparisonDate" type="date" value="2026-10-31"></nav>'
    cards='<section><h2>数据概况</h2>'+''.join('<div><span>'+f+'</span><strong>'+('24' if unit else '48')+'</strong><small>较前日 0%</small></div>' for f in fields)+'</section>'
    # Details start in chart view: the hourly table exists only after an explicit toggle.
    total='<tr><td>合计数据（24条）</td>'+''.join('<td>'+('24' if unit else '48')+'</td>' for f in current_fields)+'</tr>'
    table='<table><thead><tr><th>时段</th>'+''.join('<th>'+f+'</th>' for f in current_fields)+'</tr></thead><tbody>'+total+''.join('<tr><td>'+str(i)+':00-'+str(i)+':59</td>'+''.join('<td>'+('1' if unit else '2')+'</td>' for f in current_fields)+'</tr>' for i in range(24))+'</tbody></table>'
    toggle='<div><button>趋势图</button><button id="tableToggle">表格</button></div><div id="hours"></div>'
    products='' if unit else '<h2>数据明细</h2><p>合计数据（2条）</p><table><thead><tr><th>商品</th>'+''.join('<th>'+f+'</th>' for f in current_fields)+'</tr></thead><tbody>'+''.join('<tr><td>商品 ID：'+str(900224894507+i)+(' 全店托管' if i==1 else ' 稳定成本推广')+' <a href="/goods/report/promotion/unit?adId='+str(9146588221+i)+'&beginDate=2026-10-30&endDate=2026-10-30">查看详情</a></td>'+''.join('<td>'+('—' if i==1 and f=='总花费(元)' else '24')+'</td>' for f in current_fields)+'</tr>' for i in range(2))+'</tbody></table>'
    return '<style>td,th{min-width:90px;padding:4px}nav{padding:8px}input{width:150px}</style>'+'<section>'+main+compare+'</section>'+cards+toggle+products+('<p id="identity">商品 ID：900224894507</p>' if unit else '<nav><button aria-selected="true">全部</button><button>稳定成本推广</button><button>全店托管</button></nav>')+'<button id="budget">调整预算</button>',table
import subprocess,time
fields.append('成交笔数')
baseline='e5afcd3864d75208298ebcc1c3b5a09365d001aa'
modules={name:subprocess.check_output(['git','show',baseline+':edge-extension/'+name],cwd=root.parent).decode() for name in ['batch-driver.js','batch-dom.js','batch-model.js','batch-runner.js','batch-store.js']}
BASE_SCRIPT="async()=>{\n      const timingStart=performance.now();window.scriptCalls=0;window.fullReads=0;const {batchReportDocument:dom}=await import('/__MODULE_PREFIX__/batch-dom.js');\n      const {assertDay,createBatchDriver}=await import('/__MODULE_PREFIX__/batch-driver.js');\n      const {runBatch}=await import('/__MODULE_PREFIX__/batch-runner.js');\n      const {createBatchStore}=await import('/__MODULE_PREFIX__/batch-store.js');\n      window.budgetClicks=0;\n      function render(url){const u=new URL(url),unit=u.pathname.endsWith('/unit');history.replaceState(null,'',u.href);const managed=unit&&u.searchParams.get('adId')==='9146588222';document.body.innerHTML=unit?(managed?window.bodyManaged:window.bodyUnit):window.bodyOverview;\n        document.querySelector('.mainDate').value=u.searchParams.get('beginDate')||'2026-11-01';\n        if(unit)document.querySelector('#identity').textContent='商品 ID：'+(Number(u.searchParams.get('adId'))-9146588221+900224894507);\n        document.querySelector('#tableToggle').onclick=()=>document.querySelector('#hours').innerHTML=unit?(managed?window.tableManaged:window.tableUnit):window.tableOverview;\n        document.querySelector('#budget').onclick=()=>window.budgetClicks++;\n      }\n      render(location.href);\n      const evidence=dom();assertDay(evidence,'2026-11-01');\n      if(evidence.summary.length!==0||evidence.hourly.length)throw Error('summary or chart fixture invalid');\n      // Two independent primary dates with conflicting values must still reject.\n      const conflict=document.createElement('input');conflict.type='date';conflict.setAttribute('aria-label','统计日期');conflict.value='2026-10-31';document.body.append(conflict);\n      let rejected=false;try{assertDay(dom(),'2026-11-01')}catch{rejected=true}conflict.remove();if(!rejected)throw Error('conflicting primary date accepted');\n      // URL dates alone never establish the page date, nor do comparison inputs.\n      history.replaceState(null,'','/goods/report/promotion/unit?adId=9146588221&beginDate=2026-11-01&endDate=2026-11-01');\n      document.querySelector('.mainDate').closest('nav').remove();\n      if(dom().context.primaryVerified)throw Error('URL or comparison trusted as statistics date');\n      render(location.origin+'/goods/report/promotion/overView');\n      const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}],update:async(id,change)=>{if(change.url)render(change.url)},remove:async()=>{}},scripting:{executeScript:async({func,args})=>{window.scriptCalls++;if(args[0].action==='read')window.fullReads++;return [{result:func(...args)}];}}};\n      const store=createBatchStore();await store.clear();\n      const driver=createBatchDriver({tabId:1,api,signal:new AbortController().signal});\n      const job=await runBatch({shop:'offline-three-layer',days:1,store,driver,overviewURL:location.href,now:Date.parse('2026-11-02T01:00:00Z')});\n      return {elapsedMs:performance.now()-timingStart,scriptCalls:window.scriptCalls,fullReads:window.fullReads,job,data:await store.export('offline-three-layer'),budgetClicks};\n    }"
results={}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for label in ['baseline','optimized']:
  ctx=browser.new_context(viewport={'width':1500,'height':900});page=ctx.new_page()
  def route(r):
   path=r.request.url.split('?')[0].replace(origin,'')
   if path.startswith('/baseline/'):r.fulfill(body=modules[path.rsplit('/',1)[1]],content_type='application/javascript')
   elif path.startswith('/optimized/'):r.fulfill(body=(root/path.rsplit('/',1)[1]).read_text(),content_type='application/javascript')
   else:r.fulfill(body='<html><meta charset="utf-8"><body>benchmark fixture</body></html>',content_type='text/html; charset=utf-8')
  page.route(origin+'/**',route);page.goto(origin+'/goods/report/promotion/overView')
  for name,unit,managed in [('Overview',False,False),('Unit',True,False),('Managed',True,True)]:
   body,table=document(unit,managed);table='<div style="height:180px;overflow:auto">'+table+'</div>'
   page.evaluate('(x)=>{window["body"+x.name]=x.body;window["table"+x.name]=x.table}',{'name':name,'body':body,'table':table})
  code=BASE_SCRIPT.replace('__MODULE_PREFIX__',label)
  result=page.evaluate(code);assert result['job']['phase']=='complete',result['job']['failures'];results[label]=result
  print(label,{k:result[k] for k in ['elapsedMs','scriptCalls','fullReads']},flush=True);ctx.close()
 browser.close()
def canonical(result):
 return sorted([{k:v for k,v in r.items() if k not in ['capturedAt','bytes']} for r in result['data']['datasets']],key=lambda r:(r['type'],r.get('mode',''),r.get('adId','')))
assert canonical(results['baseline'])==canonical(results['optimized']),'Recorded data differs from verified baseline'
assert results['optimized']['scriptCalls']<results['baseline']['scriptCalls']
assert results['optimized']['elapsedMs']<results['baseline']['elapsedMs']
print('PASS: full record equality (money/scopes/dates/identities/nulls/shared costs/hours), fewer script calls and lower elapsed time; reduction_percent=',round(100*(1-results['optimized']['elapsedMs']/results['baseline']['elapsedMs']),1))
