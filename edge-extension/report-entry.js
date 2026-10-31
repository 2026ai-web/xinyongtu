// Serialized read-only entrance discovery. A navigation click requires a fresh,
// unique descriptor matching a small allowlist; no dates, bids or budgets are set.
export function inspectReportEntrances(request={action:'inspect'}){
 if(location.protocol!=='https:'||!['mms.pinduoduo.com','yingxiao.pinduoduo.com'].includes(location.hostname))throw Error('请在拼多多商家推广或报表页面使用');
 const shown=e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const clean=s=>(s||'').replace(/\s/g,'');
 const names=new Map([['查看报表','promotion-report'],['报表','report-menu'],['商品推广','product-report'],['数据报表','promotion-report'],['推广报表','promotion-report'],['数据','product-data'],['详情','product-detail'],['推广详情','product-detail'],['数据明细','data-detail'],['分时数据','hourly-report']]);
 const nodes=[...document.querySelectorAll('a,button,[role="button"],span,div')].filter(e=>shown(e)&&names.has(clean(e.textContent))&&e.textContent.length<40&&![...e.children].some(c=>shown(c)&&names.has(clean(c.textContent))));
 const entries=[],elements=new Map();
 const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
 const safeTarget=href=>{
  if(!href||href==='#'||/^javascript:\s*(?:void\(0\)|;)\s*;?$/i.test(href))return {target:null,blocked:null};
  let u;try{u=new URL(href,location.href);}catch{return {target:null,blocked:'目标地址无法识别'};}
  if(u.protocol!=='https:'||!['mms.pinduoduo.com','yingxiao.pinduoduo.com'].includes(u.hostname))return {target:null,blocked:'目标不在商家站点范围'};
  if(/login|sso|recharge|withdraw|cashier|delete|modify|update|edit/i.test(u.pathname)||[...u.searchParams.keys()].some(k=>/token|ticket|password|auth|operation|action|method/i.test(k)))return {target:null,blocked:'目标包含登录、操作或敏感参数，不自动进入'};
  const query={};for(const [k,v] of u.searchParams)if(/^(goods_?id|product_?id|item_?id)$/i.test(k)&&/^\d{6,20}$/.test(v))query[k]=v;
  return {target:{origin:u.origin,path:u.pathname,query},blocked:null};
 };
 for(const original of nodes){
  const e=original.closest('a,button,[role="button"]')||original;
  if(!shown(e)||(!e.matches('a,button,[role="button"]')&&getComputedStyle(e).cursor!=='pointer'))continue;
  const label=clean(e.textContent);if(!names.has(label))continue;
  let row=e.closest('tr,[role="row"],[class*="table-row"],[class*="TableRow"]'),productId=null;
  if(!row){let p=e.parentElement;for(let n=0;p&&p!==document.body&&n<6;n++,p=p.parentElement){const ids=[...(p.innerText||'').matchAll(/商品\s*ID\s*[:：]\s*(\d{6,20})/gi)];if(ids.length>1)break;if(ids.length===1&&/预算|投产|推广中|暂停/.test(p.innerText)){row=p;break;}}}
  if(row){const ids=[...new Set([...(row.innerText||'').matchAll(/商品\s*ID\s*[:：]\s*(\d{6,20})/gi)].map(m=>m[1]))];if(ids.length===1)productId=ids[0];}
  if(['数据','详情','推广详情','数据明细'].includes(label)&&!productId)continue;
  const {target,blocked}=safeTarget(e.getAttribute('href'));
  const descriptor={label,kind:names.get(label),productId,target};const id=hash(JSON.stringify(descriptor));
  if(!elements.has(id))elements.set(id,[]);if(elements.get(id).includes(e))continue;elements.get(id).push(e);
  if(!entries.some(x=>x.id===id))entries.push({id,...descriptor,available:!blocked&&!e.disabled&&e.getAttribute('aria-disabled')!=='true',reason:blocked||null});
 }
 for(const entry of entries)if(elements.get(entry.id).length!==1){entry.available=false;entry.reason='存在多个同名同范围入口，未自动选择';}
 if(request.action==='open'||request.action==='resolve'){
  const entry=entries.find(e=>e.id===request.id);if(!entry||!entry.available||JSON.stringify({label:entry.label,kind:entry.kind,productId:entry.productId,target:entry.target})!==JSON.stringify(request.expected))throw Error('入口已变化或不唯一，请重新识别后再进入');
  if(request.action==='resolve'){let navigationUrl=null;if(entry.target){const u=new URL(entry.target.path,entry.target.origin);for(const [key,value] of Object.entries(entry.target.query))u.searchParams.set(key,value);navigationUrl=u.href;}return {navigationUrl,entrance:entry};}
  elements.get(entry.id)[0].click();return {clicked:true,entrance:entry};
 }
 if(request.action!=='inspect')throw Error('不支持的入口操作');
 const dateValue=v=>/^(20\d{2}[/-]\d{1,2}[/-]\d{1,2})(?:\s*(?:至|~|—|–|-)\s*(20\d{2}[/-]\d{1,2}[/-]\d{1,2}))?$/.test(v||'');
 const dateControls=[...document.querySelectorAll('input')].filter(e=>e.type!=='password'&&shown(e)&&(e.type==='date'||dateValue(e.value))).slice(0,12).map(e=>({type:e.type,readOnly:e.readOnly,value:dateValue(e.value)?e.value:null,role:/对比/.test([e.placeholder,e.getAttribute('aria-label')].join(' '))?'comparison':'unverified'}));
 const metricLabels=['成交花费(元)','总花费(元)','交易额(元)','净交易额(元)','实际投产比','净实际投产比','净成交笔数','成交笔数','曝光量','点击量','点击率','点击转化率'];
 const quickLabels=['今日','昨日','近7日','近7天','近30日','近30天','自定义','趋势图','表格','下载分时数据'];
 const visibleLabels=new Set();for(const e of document.querySelectorAll('span,a,button,label,th,[role="columnheader"]'))if(shown(e)){const text=clean(e.textContent);if([...metricLabels,...quickLabels].includes(text))visibleLabels.add(text);}
 const productIds=[...new Set([...(document.body.innerText||'').matchAll(/商品\s*ID\s*[:：]\s*(\d{6,20})/gi)].map(m=>m[1]))].slice(0,50);
 const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(shown);const dialogProductIds=[...new Set(dialogs.flatMap(e=>[...(e.innerText||'').matchAll(/商品\s*ID\s*[:：]\s*(\d{6,20})/gi)].map(m=>m[1])))].slice(0,50);
 const path=location.pathname,known=/goods\/promotion|report/i.test(path)||entries.length>0;
 return {schemaVersion:'report-map-2',recognized:known,capturedAt:new Date().toISOString(),page:{origin:location.origin,path},entries,dateControls,dialogCount:dialogs.length,dialogProductIds,quickRanges:quickLabels.filter(v=>visibleLabels.has(v)),metricLabels:metricLabels.filter(v=>visibleLabels.has(v)),productIds,readOnly:true,limitations:['仅检查当前已渲染入口；未展开的菜单或其他页入口可能尚未出现。','日期控件角色尚未验证，不自动切日期、不代表已补采历史。','地址只保留站点、路径及已知数字商品参数；不导出登录令牌或页面原文。']};
}
