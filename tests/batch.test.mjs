import test from 'node:test';import assert from 'node:assert/strict';
import {metricFields,metricNumber,validateHours,reconcileProduct,requestedDates,datasetKey,reconcileAccount,validateOverall,normalizeManagedHours,managedSharedRecord} from '../edge-extension/batch-model.js';
import {checkedReportURL,assertDay,mergeRows} from '../edge-extension/batch-driver.js';
import {runBatch} from '../edge-extension/batch-runner.js';
const metrics=(amount='1')=>metricFields.map(label=>({label,current:amount,state:'exact'}));const hourly=()=>Array.from({length:24},(_,hour)=>({hour,metrics:metrics()}));
test('Beijing calendar excludes today across UTC date boundary',()=>assert.deepEqual(requestedDates(1,Date.parse('2026-10-30T17:00:00Z')),['2026-10-30']));
test('exact money uses fen; unavailable is not zero; abbreviations rejected',()=>{assert.equal(metricNumber('总花费(元)',{current:'1,803.59',state:'exact'}),180359);assert.equal(metricNumber('总花费(元)',{state:'not-provided'}),null);assert.throws(()=>metricNumber('总花费(元)',{current:'1万',state:'abbreviated'}));});
test('24 unique hours required; today cannot become complete',()=>{assert.equal(validateHours(hourly(),'全部').totals['总花费(元)'],2400);assert.throws(()=>validateHours(hourly().slice(1),'全部'));const dup=hourly();dup[1].hour=0;assert.throws(()=>validateHours(dup,'全部'));assert.equal(validateHours(hourly(),'全部',{partial:true}).complete,false);});
test('daily/hourly mismatch is explicit',()=>assert.equal(reconcileProduct({metrics:metrics('25')},validateHours(hourly(),'全部').totals).matched,false));
test('data keys separate mode, ad identity and live snapshot',()=>{const base={shop:'a',origin:'x',type:'unit-day',date:'2026-10-30',productId:'900224894507',adId:'9146588221',mode:'稳定成本推广'};assert.notEqual(datasetKey(base),datasetKey({...base,mode:'全店托管'}));assert.notEqual(datasetKey(base),datasetKey({...base,type:'today-snapshot'}));});
test('rejects report spoofing and comparison-only dates',()=>{assert.throws(()=>checkedReportURL('https://evil.test/goods/report/promotion/overView'));assert.throws(()=>assertDay({context:{dates:['2026-10-30'],primaryVerified:false}},'2026-10-30'));});
test('horizontal merge fills missing fields, conflicting cells stop scan',()=>{const map=new Map();mergeRows(map,[{hour:0,metrics:metrics()}],r=>r.hour);assert.throws(()=>mergeRows(map,[{hour:0,metrics:metrics('2')}],r=>r.hour));assert.equal(map.size,1);});
function fixture({failUnit=false}={}){const datasets=new Map();let saved,unitCalls=0,closed=0;const row={productId:'900224894507',mode:'稳定成本推广',adId:null,metrics:metrics('24')};return {datasets,get job(){return saved;},get unitCalls(){return unitCalls;},get closed(){return closed;},store:{latest:async()=>saved,claim:async()=>{},release:async()=>{},saveJob:async j=>{saved=structuredClone(j);},saveDataset:async d=>{const k=datasetKey(d);datasets.set(k,structuredClone(d));return k;},dataset:async k=>datasets.get(k)},driver:{overview:async()=>{},scan:async(d,{account=false}={})=>{if(!account){unitCalls++;if(failUnit)throw Error('unit failed');}return {summary:metrics('24'),products:account?[row]:[],hourly:hourly()};},openUnit:async()=>({adId:'9146588221',url:'https://yingxiao.pinduoduo.com/goods/report/promotion/unit?adId=9146588221&beginDate=2026-10-30&endDate=2026-10-30'}),navigate:async()=>{},verifyUnit:async()=>{},close:async()=>closed++}};}
test('full job stores three required layers without requiring an unrelated today scan',async()=>{const f=fixture();const j=await runBatch({shop:'fixture',days:1,store:f.store,driver:f.driver,overviewURL:'observed',now:Date.parse('2026-10-31T01:00:00Z')});assert.equal(j.phase,'complete');assert.equal(f.datasets.size,2);const account=[...f.datasets.values()].find(d=>d.type==='account-day');assert.equal(account.overallValidation.complete,true);assert.deepEqual(account.summary,metrics('24'));assert.deepEqual([...f.datasets.values()].find(d=>d.type==='unit-day').dailyOverall.metrics,metrics('24'));assert.equal(j.coverage.unitDays,1);assert.equal(f.closed,1);});
test('failure preserves checkpoint; resume retries unit and does not rescan account',async()=>{const f=fixture({failUnit:true}),args={shop:'fixture',days:1,store:f.store,driver:f.driver,overviewURL:'observed',now:Date.parse('2026-10-31T01:00:00Z')};const j=await runBatch(args);assert.equal(j.phase,'blocked');assert.equal(Object.keys(j.completedDays).length,1);const good=fixture();let account=0;const original=good.driver.overview;good.driver.overview=async(...a)=>{account++;return original(...a);};const resumed=await runBatch({...args,driver:good.driver});assert.equal(resumed.phase,'complete');assert.equal(account,0);assert.equal(f.datasets.size,2);});

test('account reconciliation records unallocated managed spend without distributing it',()=>{const rows=[{mode:'全店托管',metrics:metrics('24')}];rows[0].metrics[0]={label:'总花费(元)',current:null,state:'not-provided'};const result=reconcileAccount(rows,validateHours(hourly(),'全部').totals);assert.equal(result[0].unallocated,2400);assert.equal(result[0].matched,null);rows[0].metrics[1].current='23';assert.throws(()=>reconcileAccount(rows,validateHours(hourly(),'全部').totals));});

test('overview table totals must be read, not synthesized from hours; mismatch and missing reject',()=>{const totals=validateHours(hourly(),'全部').totals;assert.equal(validateOverall(metrics('24'),totals).complete,true);assert.throws(()=>validateOverall([],totals));assert.throws(()=>validateOverall(metrics('25'),totals));});
test('incomplete first link does not prevent other links from being saved',async()=>{
 const f=fixture();const scan=f.driver.scan;let current='';
 f.driver.scan=async(d,opts={})=>{const data=await scan(d,opts);if(opts.account){data.products.push({...data.products[0],productId:'900224894508'});data.hourly=data.hourly.map(r=>({...r,metrics:metrics('2')}));data.summary=metrics('48');}else if(current==='900224894507')throw Error('主统计日期未确认');return data;};
 f.driver.openUnit=async row=>{current=row.productId;return {adId:row.productId,url:'observed'};};
 const j=await runBatch({shop:'fixture',days:1,store:f.store,driver:f.driver,overviewURL:'observed',now:Date.parse('2026-10-31T01:00:00Z')});
 assert.equal(j.phase,'blocked');assert.equal(j.coverage.unitDays,1);assert.equal(j.coverage.expectedUnitDays,2);assert.equal(j.failures[0].productId,'900224894507');assert.equal(f.datasets.size,2);
});
test('old account checkpoints without table-total contract are rescanned without deleting old datasets',async()=>{
 const f=fixture(),args={shop:'fixture',days:1,store:f.store,driver:f.driver,overviewURL:'observed',now:Date.parse('2026-10-31T01:00:00Z')};
 await f.store.saveJob({id:'legacy',today:'2026-10-31',days:1,phase:'blocked',completedDays:{'2026-10-30':'legacy-account'}});
 f.datasets.set('legacy-account',{products:[]});const j=await runBatch(args);assert.notEqual(j.id,'legacy');assert.equal(j.phase,'complete');assert.equal(f.datasets.has('legacy-account'),true);
});
test('13 links over 1/7/30 complete days have explicit three-layer coverage',async()=>{
 for(const days of [1,7,30]){const f=fixture();const scan=f.driver.scan;f.driver.scan=async(d,opts={})=>{const data=await scan(d,opts);if(opts.account){data.products=Array.from({length:13},(_,i)=>({...data.products[0],productId:String(900224894500+i),adId:String(9146588200+i)}));data.hourly=data.hourly.map(r=>({...r,metrics:metrics('13')}));data.summary=metrics('312');}return data;};
 f.driver.openUnit=async row=>({adId:row.adId,url:'https://yingxiao.pinduoduo.com/goods/report/promotion/unit?adId='+row.adId});
 const j=await runBatch({shop:'fixture',days,store:f.store,driver:f.driver,overviewURL:'observed',now:Date.parse('2026-11-02T01:00:00Z')});assert.equal(j.phase,'complete');assert.equal(j.coverage.unitDays,13*days);assert.equal(f.datasets.size,14*days);
 }
});

const absentSpend={totalSpend:{state:'not-provided',basis:'observed-report-headers',scope:'promotion-link'}};
test('managed omitted spend column is null, never zero; other missing fields still fail',()=>{
 const raw=hourly().map(r=>({...r,metrics:r.metrics.filter(m=>m.label!=='总花费(元)')}));
 const normalized=normalizeManagedHours(raw,'全店托管',absentSpend),v=validateHours(normalized,'全店托管');
 assert.equal(v.totals['总花费(元)'],null);assert.equal(v.financialComplete,false);assert.equal(v.complete,true);assert.equal(raw[0].metrics.length,5);
 assert.throws(()=>validateHours(normalizeManagedHours(raw,'稳定成本推广',absentSpend),'稳定成本推广'));
 assert.throws(()=>validateHours(normalizeManagedHours(raw,'全店托管',{totalSpend:{state:'unknown'}}),'全店托管'));
 const broken=structuredClone(raw);broken[0].metrics=broken[0].metrics.filter(m=>m.label!=='点击量');assert.throws(()=>validateHours(normalizeManagedHours(broken,'全店托管',absentSpend),'全店托管'));
 const blank=hourly();blank[0].metrics[0].state='missing';assert.throws(()=>validateHours(normalizeManagedHours(blank,'全店托管',absentSpend),'全店托管'));
 assert.throws(()=>validateHours(normalized.slice(1),'全店托管'));
});
test('shared managed cost is one derived group amount with unknown settings and no allocation',()=>{
 const row={productId:'900224894507',mode:'全店托管',metrics:metrics('24')};row.metrics[0]={label:'总花费(元)',current:null,state:'not-provided'};
 const reconciliation=reconcileAccount([row],validateHours(hourly(),'全部').totals),shared=managedSharedRecord('fixture','2026-11-01',[row],reconciliation);
 assert.equal(shared.scope,'managed-group');assert.equal(shared.spend.amountFen,2400);assert.equal(shared.spend.directObservation,false);assert.equal(shared.spend.state,'derived');assert.equal(shared.settings.dailyBudget.value,null);assert.equal(shared.settings.targetRoas.state,'not-collected');assert.equal(shared.allocationPolicy,'never-allocate-to-links');
 assert.notEqual(shared.groupId,managedSharedRecord('fixture','2026-10-31',[row],reconciliation).groupId);
 assert.throws(()=>managedSharedRecord('fixture','2026-11-01',[row],[{field:'总花费(元)',unallocated:-1}]));
});
test('managed link records complete without per-link spend, with scopes and shared reference',async()=>{
 const f=fixture();const scan=f.driver.scan;f.driver.scan=async(d,opts={})=>{const data=await scan(d,opts);if(opts.account){data.products[0].mode='全店托管';data.products[0].metrics[0]={label:'总花费(元)',current:null,state:'not-provided'};}else{data.hourly=data.hourly.map(r=>({...r,metrics:r.metrics.filter(m=>m.label!=='总花费(元)')}));data.fieldAvailability=absentSpend;}return data;};
 const job=await runBatch({shop:'fixture',days:1,store:f.store,driver:f.driver,overviewURL:'observed',now:Date.parse('2026-11-02T01:00:00Z')});
 assert.equal(job.phase,'complete');assert.equal(job.coverage.unavailableLinkSpendDays,1);const account=[...f.datasets.values()].find(d=>d.type==='account-day'),unit=[...f.datasets.values()].find(d=>d.type==='unit-day');assert.equal(account.recordContext.scope,'account');assert.equal(unit.recordContext.scope,'promotion-link');assert.equal(unit.sharedManagedGroupRef,account.managedShared.groupId);assert.equal(unit.validation.totals['总花费(元)'],null);assert.equal(unit.dailyOverall.date,'2026-11-01');assert.equal(unit.dailyOverall.adId,unit.adId);assert.equal(account.managedShared.spend.amountFen,2400);
});
