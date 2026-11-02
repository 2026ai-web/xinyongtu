export const metricFields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量'];
export function chinaToday(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
export function requestedDates(days=7,now=Date.now(),selection=null){
 if(selection){
  const valid=d=>typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  const start=selection.start,end=selection.end??start;
  if(!valid(start)||!valid(end)||start>end)throw Error('请选择有效的起止日期，结束日不能早于开始日');
  if(end>=chinaToday(now))throw Error('只支持已结束的完整日，不能选择今天或未来日期');
  const first=Date.parse(start+'T00:00:00Z'),last=Date.parse(end+'T00:00:00Z'),count=(last-first)/86400000+1;
  if(count>30)throw Error('一次最多选择30个完整日，请分批采集');
  return Array.from({length:count},(_,i)=>new Date(first+i*86400000).toISOString().slice(0,10));
 }
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
 if(!partial&&seen.size!==24)throw Error('历史分时不完整：'+seen.size+'/24');return {complete:!partial&&seen.size===24,hourCount:seen.size,totals,financialComplete:totals['总花费(元)']!==null,unavailableFields:Object.entries(totals).filter(([,v])=>v===null).map(([label])=>({label,state:'not-provided'}))};
}
export function reconcileProduct(row,hourTotals){
 const differences=[];for(const label of metricFields){const m=row.metrics.find(v=>v.label===label);if(!m)continue;let n;try{n=metricNumber(label,m);}catch{continue;}if(n!==null&&hourTotals[label]!==null&&hourTotals[label]!==undefined&&n!==hourTotals[label])differences.push({label,daily:n,hourly:hourTotals[label]});}return {matched:differences.length===0,differences};
}
export function datasetKey(data){return JSON.stringify([data.shop,data.origin,data.type,data.date,data.mode||null,data.productId||null,data.adId||null]);}
export function createBatchJob(shop,days=7,now=Date.now(),selection=null){
 shop=String(shop||'').trim().slice(0,80);if(!shop)throw Error('请先填写店铺备注');const dates=requestedDates(days,now,selection);return {schemaVersion:'batch-job-1',id:crypto.randomUUID(),shop,days:dates.length,dates,dateSelection:{kind:selection?'custom':'preset',start:dates[0],end:dates.at(-1),perDay:true},today:chinaToday(now),phase:'pending',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),completedDays:{},units:{},failures:[],log:[],datasets:[],liveCount:0};
}
export function reconcileAccount(products,totals){
 const checks=[];for(const field of metricFields){let sum=0,unavailable=0;for(const row of products){const n=metricNumber(field,row.metrics.find(m=>m.label===field));if(n===null){if(!(row.mode==='全店托管'&&field==='总花费(元)'))throw Error('商品明细非花费字段不可为空：'+field);unavailable++;}else sum+=n;}const account=totals[field];if(account===null||account===undefined)throw Error('账户分时缺少 '+field);if(!unavailable&&sum!==account)throw Error('账户分时与商品日汇总不一致：'+field);checks.push({field,account,reportedProductSum:sum,unavailableRows:unavailable,unallocated:unavailable?account-sum:0,matched:unavailable?null:true});}return checks;
}

// The displayed overview table total is source data; never synthesize it from hours.
export function validateOverall(summary,hourTotals){
 const totals={};for(const field of metricFields){const values=(summary||[]).filter(m=>m.label===field);if(values.length!==1)throw Error('数据概况表格合计指标缺失或不唯一：'+field);const n=metricNumber(field,values[0]);if(n===null)throw Error('数据概况表格合计指标不可为空：'+field);if(n!==hourTotals[field])throw Error('数据概况表格合计指标与分时不一致：'+field);totals[field]=n;}return {complete:true,totals};
}

// A missing column is not a missing cell: only a verified managed-link header
// can establish that the platform did not expose per-link spend.
export function normalizeManagedHours(hours,mode,availability){
 const output=structuredClone(hours);
 if(mode!=='全店托管')return output;
 for(const row of output){
  const matches=row.metrics.filter(m=>m.label==='总花费(元)');
  if(!matches.length&&availability?.totalSpend?.state==='not-provided'&&availability.totalSpend.basis==='observed-report-headers'&&availability.totalSpend.scope==='promotion-link'){
   row.metrics.push({label:'总花费(元)',current:null,state:'not-provided',reason:'managed-report-has-no-link-spend-column',scope:'promotion-link'});
  }
 }
 return output;
}
export function managedSharedRecord(shop,date,products,reconciliation){
 const managed=products.filter(p=>p.mode==='全店托管');if(!managed.length)return null;
 const cost=reconciliation.find(r=>r.field==='总花费(元)'),allUnavailable=managed.every(p=>p.metrics.find(m=>m.label==='总花费(元)')?.state==='not-provided');
 if(cost?.unallocated<0)throw Error('已知链接花费超过账户花费，不能记录为托管共享花费');
 return {groupId:JSON.stringify([shop,date,'全店托管']),scope:'managed-group',mode:'全店托管',date,timeZone:'Asia/Shanghai',allocationPolicy:'never-allocate-to-links',
  spend:{amountFen:allUnavailable&&cost?cost.unallocated:null,state:allUnavailable&&cost?'derived':'not-determined',basis:'account-total-minus-reported-link-spend',directObservation:false,interpretation:'managed-shared-spend-per-user-confirmed-rule',accountTotalFen:cost?.account??null,reportedLinkSpendFen:cost?.reportedProductSum??null},
  settings:{dailyBudget:{value:null,state:'not-collected',scope:'managed-group',unit:'CNY-yuan'},targetRoas:{value:null,state:'not-collected',scope:'managed-group',unit:'ratio'}},
  links:managed.map(p=>({productId:p.productId,adId:p.adId||null,mode:p.mode}))};
}
export const recordingGuide={schemaVersion:'recording-scopes-1',purpose:'accurate-recording-for-later-analysis',timeZone:'Asia/Shanghai',moneyUnit:'CNY-fen-in-validation-and-derived-records; displayed-metrics-retain-yuan',
 scopes:{'account-day':'account overview table totals and promotion-link daily details; hourly is account-level','unit-day':'one promotion ID and mode for one day; hourly is link-level','managedShared':'one shared managed group for one shop label and date, never a per-link cost'},
 valueUnits:{displayedMetrics:'current preserves page strings; money in yuan',validationTotals:'money labels ending (元) use integer fen; counts use numeric counts',managedSharedSpend:'amountFen is integer CNY fen'},
 completeness:'validation.complete means recorded hours/provided fields; financialComplete only indicates total-spend availability, never profit or final settlement',
 missingValues:'null/not-provided is not zero; not-collected settings are unknown',derivedValues:'managedShared.spend is an explicit arithmetic difference under the user-confirmed shared-cost rule, not a direct platform observation',
 aggregation:'account totals, managed shared totals and link totals overlap; never sum them as separate spend',shopIdentity:'shop is a local note, not verified platform identity',currentTask:'Use lastJob.datasets keys for the current task; other warehouse entries are historical'};
