from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
fields=['成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数','每笔净成交花费(元)','曝光量','点击量']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page()
 body='<nav>今日 昨日 近7日 近30日 近90日<input value="2026-10-30"></nav><nav><span aria-selected="true">全部</span><span>稳定成本推广</span><span>全店托管</span></nav>'
 body+='<table><thead><tr><th>商品</th>'+''.join('<th><span>'+x+'</span></th>' for x in fields)+'</tr></thead><tbody>'
 for i in range(100):body+='<tr><td>商品 ID：'+str(900224890000+i)+' 稳定成本推广 <a>查看详情</a></td>'+''.join('<td><div><span>10</span></div></td>' for x in fields)+'</tr>'
 body+='</tbody></table>'+''.join('<div><span>无关导航 '+str(i)+'</span></div>' for i in range(5000))
 page.route('https://yingxiao.pinduoduo.com/**',lambda r:r.fulfill(body=body,content_type='text/html; charset=utf-8'))
 page.goto('https://yingxiao.pinduoduo.com/goods/report/promotion/overView')
 results={}
 for label,path in [('before',Path('/tmp/batch-dom-before.js')),('after',root/'edge-extension/batch-dom.js')]:
  if not path.exists():continue
  source=path.read_text().replace('export function','function',1)
  page.evaluate('()=>{'+source+';window.collect=batchReportDocument;}')
  result=page.evaluate("()=>{const start=performance.now();const r=collect({action:'read'});return {ms:performance.now()-start,rows:r.products.length,fields:r.products[0].metrics.length}}")
  results[label]=result
 assert results['after']['rows']==100 and results['after']['fields']==10,results
 assert results['after']['ms']<250,results
 page.evaluate("collect({action:'scroll-init'})")
 result=page.evaluate("()=>{const t=performance.now();for(let i=0;i<20;i++)collect({action:'scroll-next'});return performance.now()-t}")
 assert result<100,result
 results['20_scroll_commands_ms']=result
 page.evaluate("()=>{const toggle=document.createElement('div');toggle.innerHTML='<button>趋势图</button><button>表格</button>';document.body.prepend(toggle);toggle.lastChild.onclick=()=>{const end=performance.now()+300;while(performance.now()<end){};window.switched=true;};}")
 result=page.evaluate("collect({action:'table'})")
 assert result['performance']['durationMs']<250 and result['performance']['actionDurationMs']>=290,result
 assert 'products' not in result and page.evaluate('window.switched'),result
 results['slow_table_handler']=result['performance']
 print(json.dumps(results))
 b.close()
