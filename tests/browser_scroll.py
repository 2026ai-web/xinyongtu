"""Real Chromium regressions for document, nested, lazy and virtual report scrolling."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
fields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量']
headers='<tr><th>商品</th>'+''.join('<th>'+f+'</th>' for f in fields)+'</tr>'
rows=['<tr><td>商品 ID：'+str(900224894500+i)+' 稳定成本推广</td>'+''.join('<td>24</td>' for _ in fields)+'</tr>' for i in range(13)]
hours='<table><thead><tr><th>时段</th>'+''.join('<th>'+f+'</th>' for f in fields)+'</tr></thead><tbody>'+''.join('<tr><td>'+str(i)+':00-'+str(i)+':59</td>'+''.join('<td>13</td>' for _ in fields)+'</tr>' for i in range(24))+'</tbody></table>'
controls='<nav>今日 昨日 近7日 近30日 近90日<input type="date" value="2026-11-01"></nav><nav><span aria-selected="true">全部</span><span>稳定成本推广</span><span>全店托管</span></nav><div><button>趋势图</button><button>表格</button></div>'
# Label and value as mixed direct text, split numeric spans, and comparison values.
summary='<section><h2>数据概况</h2>'+''.join('<div><span>'+f+'</span>￥<b>3</b><b>12</b><i>.00</i>元<span>较昨日 9.9%</span></div>' if '元' in f else '<div><span>'+f+'</span>312<span>较昨日 9.9%</span></div>' for f in fields)+'</section>'
style='<style>body{margin:0}nav{padding:6px}input{width:150px}td,th{min-width:100px;padding:3px}.horizontal{width:550px;overflow-x:auto}.virtual{height:180px;overflow-y:auto}#shell{height:520px;overflow:auto}#shell.document{height:auto;overflow:visible}</style>'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1000,'height':650})
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'')
  if path.startswith('/extension/'):r.fulfill(body=(root/path.removeprefix('/extension/')).read_text(),content_type='application/javascript')
  else:r.fulfill(body=style+'<main id="shell">'+controls+summary+hours+'<div style="height:900px">报表说明</div><section id="detail"><h2>数据明细</h2><p>合计数据（13条）</p><div id="mount" style="height:600px">尚未进入可视区域</div></section></main>',content_type='text/html; charset=utf-8')
 page.route(origin+'/**',route)
 for mode in ['document','nested','virtual']:
  page.goto(origin+'/goods/report/promotion/overView?beginDate=2026-11-01&endDate=2026-11-01')
  page.evaluate('''args=>{
   const shell=document.querySelector('#shell');if(args.mode==='document')shell.className='document';
   window.scrollEvents=0;window.maxHorizontal=0;window.maxVertical=0;window.mounted=false;
   const container=args.mode==='document'?document:shell;
   function mount(){
    if(window.mounted)return;const box=document.querySelector('#mount').getBoundingClientRect(),parent=args.mode==='document'?{top:0,bottom:innerHeight}:shell.getBoundingClientRect();
    if(box.top>=parent.bottom||box.bottom<=parent.top)return;
    window.mounted=true;const m=document.querySelector('#mount');m.style.height='auto';
    m.innerHTML='<div class="horizontal"><div class="virtual"><div style="height:1200px"><table><thead>'+args.headers+'</thead><tbody></tbody></table></div></div></div>';
    const v=m.querySelector('.virtual'),h=m.querySelector('.horizontal');
    // The horizontal container itself must be wider than its viewport.
    v.style.width='850px';
    function render(){const start=args.mode==='virtual'?Math.min(9,Math.floor(v.scrollTop/100)):0;m.querySelector('tbody').innerHTML=args.rows.slice(start,args.mode==='virtual'?start+4:13).join('');window.maxVertical=Math.max(window.maxVertical,v.scrollTop);}
    render();v.addEventListener('scroll',render);h.addEventListener('scroll',()=>{window.maxHorizontal=Math.max(window.maxHorizontal,h.scrollLeft)});
   }
   container.addEventListener('scroll',()=>{window.scrollEvents++;mount()});mount();
  }''',{'mode':mode,'headers':headers,'rows':rows})
  result=page.evaluate('''async()=>{
   const {createBatchDriver}=await import('/extension/batch-driver.js');const {validateOverall,validateHours,reconcileAccount}=await import('/extension/batch-model.js');
   const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}]},scripting:{executeScript:async({func,args})=>[{result:func(...args)}]}};
   const driver=createBatchDriver({tabId:1,api});const data=await driver.scan('2026-11-01',{account:true});
   const totals=validateHours(data.hourly,'全部').totals;validateOverall(data.summary,totals);reconcileAccount(data.products,totals);
   return {rows:data.products.length,hours:data.hourly.length,summary:data.summary.length,scrollEvents:window.scrollEvents,mounted:window.mounted,maxHorizontal:window.maxHorizontal,maxVertical:window.maxVertical,rootTop:document.scrollingElement.scrollTop,shellTop:document.querySelector('#shell').scrollTop};
  }''')
  assert result['rows']==13 and result['hours']==24 and result['summary']==6,result
  assert result['mounted'] and result['scrollEvents']>0 and result['maxHorizontal']>0,result
  assert result['rootTop']>0 if mode=='document' else result['shellTop']>0,result
  if mode=='virtual':assert result['maxVertical']>=900,result
  print('PASS',mode,json.dumps(result))
 browser.close()
