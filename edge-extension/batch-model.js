export const metricFields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量'];
export function chinaToday(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
export function requestedDates(days=7,now=Date.now()){
 if(![1,7,30].includes(days))throw Error('历史范围只支持1、7或30天');const today=chinaToday(now),base=Date.parse(today+'T00:00:00Z');return Array.from({length:days},(_,i)=>new Date(base-(days-i)*86400000).toISOString().slice(0,10));
}
export function metricNumber(field,metric){
 if(!metric||metric.state==='missing'||metric.state==='wrong-unit')throw Error(field+' 缺失或单位错误');if(metric.state==='not-provided')return null;
 if(metric.state!=='exact'||!/^\d[\d,]*(?:\.\d+)?$/.test(metric.current))throw Error(field+' 需要精确数据，不能使用页面缩写');
 const n=Number(metric.current.replace(/,/g,''));if(!Number.isFinite(n)||n>1e12)throw Error(field+' 超出范围');return /元/.test(field)?Math.round(n*100):n;
}
export function rowKey(row){if(!/^\d{6,20}$/.test(row.productId)||!['稳定成本推广','全店托管'].includes(row.mode))throw Error('商品身份或推广模式未确认');return row.productId+'|'+row.mode+'|'+(row.adId||'unresolved');}
export function validateHours(hours,mode,{partial=false}={}){
 const seen=new Set(),totals={};if(!hours.length)throw Error('未读取到分时表格');
 for(const row of hours){if(!Number.isInteger(row.hour)||row.hour<0||row.hour>23||seen.has(row.hour))throw Error('分时时段重复或无效');seen.add(row.hour);
  for(const field of metricFields){const matches=row.metrics.filter(m=>m.label===field);if(matches.length!==1)throw Error('分时字段缺失或重复：'+field);const n=metricNumber(field,matches[0]);if(n===null&&!(mode==='全店托管'&&field==='总花费(元)'))throw Error('非托管分时缺少金额：'+field);if(n===null)totals[field]=null;else if(totals[field]!==null)totals[field]=(totals[field]||0)+n;}
 }
 if(!partial&&seen.size!==24)throw Error('历史分时不完整：'+seen.size+'/24');return {complete:!partial&&seen.size===24,hourCount:seen.size,totals};
}
export function reconcileProduct(row,hourTotals){
 const differences=[];for(const label of metricFields){const m=row.metrics.find(v=>v.label===label);if(!m)continue;let n;try{n=metricNumber(label,m);}catch{continue;}if(n!==null&&hourTotals[label]!==null&&hourTotals[label]!==undefined&&n!==hourTotals[label])differences.push({label,daily:n,hourly:hourTotals[label]});}return {matched:differences.length===0,differences};
}
export function datasetKey(data){return JSON.stringify([data.shop,data.origin,data.type,data.date,data.mode||null,data.productId||null,data.adId||null]);}
export function createBatchJob(shop,days=7,now=Date.now()){
 shop=String(shop||'').trim().slice(0,80);if(!shop)throw Error('请先填写店铺备注');return {schemaVersion:'batch-job-1',id:crypto.randomUUID(),shop,days,dates:requestedDates(days,now),today:chinaToday(now),phase:'pending',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),completedDays:{},units:{},failures:[],log:[],datasets:[],liveCount:0};
}
export function reconcileAccount(products,totals){
 const checks=[];for(const field of metricFields){let sum=0,unavailable=0;for(const row of products){const n=metricNumber(field,row.metrics.find(m=>m.label===field));if(n===null){if(!(row.mode==='全店托管'&&field==='总花费(元)'))throw Error('商品明细非花费字段不可为空：'+field);unavailable++;}else sum+=n;}const account=totals[field];if(account===null||account===undefined)throw Error('账户分时缺少 '+field);if(!unavailable&&sum!==account)throw Error('账户分时与商品日汇总不一致：'+field);checks.push({field,account,reportedProductSum:sum,unavailableRows:unavailable,unallocated:unavailable?account-sum:0,matched:unavailable?null:true});}return checks;
}
