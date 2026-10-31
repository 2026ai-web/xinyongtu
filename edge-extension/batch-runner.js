import {createBatchJob,metricFields,metricNumber,validateHours,reconcileProduct,reconcileAccount,chinaToday} from './batch-model.js';
export async function runBatch({shop,days,store,driver,overviewURL,signal,onProgress=()=>{},now=Date.now()}){
 const old=await store.latest(shop),today=chinaToday(now);let job=old&&old.days===days&&old.today===today&&old.phase!=='complete'?old:createBatchJob(shop,days,now);
 const owner=crypto.randomUUID();await store.claim(owner);let leaseError=null;const heartbeat=setInterval(()=>store.claim(owner).catch(e=>{leaseError=e;}),15000);
 const check=()=>{signal?.throwIfAborted();if(leaseError)throw leaseError;};
 async function checkpoint(message){check();job.updatedAt=new Date().toISOString();job.log.push({at:job.updatedAt,message});job.log=job.log.slice(-100);await store.saveJob(job);onProgress(message,job);}
 async function save(data){check();const key=await store.saveDataset({schemaVersion:'report-dataset-1',shop,origin:'https://yingxiao.pinduoduo.com',capturedAt:new Date().toISOString(),...data});if(!job.datasets.includes(key))job.datasets.push(key);return key;}
 try{
  job.phase='account';job.failures=[];await checkpoint('开始采集历史账户与商品明细');
  for(const date of job.dates){check();if(job.completedDays[date])continue;await checkpoint('采集 '+date+'：全店分时和商品明细');await driver.overview(overviewURL,date);const data=await driver.scan(date,{account:true});const validation=validateHours(data.hourly,'全部');
   for(const row of data.products)for(const field of metricFields){const m=row.metrics.find(m=>m.label===field),n=metricNumber(field,m);if(n===null&&!(row.mode==='全店托管'&&field==='总花费(元)'))throw Error('稳定推广商品明细缺少 '+field);}
   const reconciliation=reconcileAccount(data.products,validation.totals);const key=await save({type:'account-day',date,mode:'全部',...data,validation,reconciliation});job.completedDays[date]=key;await checkpoint(date+' 账户与明细已保存');
  }
  job.targetUnitDays=0;for(const date of job.dates){const saved=await store.dataset(job.completedDays[date]);job.targetUnitDays+=saved.products.length;}job.phase='units';await checkpoint('采集各链接历史分时数据');
  for(const date of job.dates){const data=await store.dataset(job.completedDays[date]);for(const row of data.products){check();const identity=row.productId+'|'+row.mode+'|'+(row.adId||'unresolved'),unit=job.units[identity]??={completed:{}};if(unit.completed[date])continue;await checkpoint(date+' 商品 '+row.productId+' · '+row.mode);
    let binding=unit.binding;
    if(!binding){binding=await driver.openUnit(row,date,overviewURL);unit.binding=binding;await checkpoint('已确认商品 '+row.productId+' 的推广 ID '+binding.adId);}
    else {const url=new URL(binding.url);url.searchParams.set('beginDate',date);url.searchParams.set('endDate',date);await driver.navigate(url.href);await driver.verifyUnit({...row,adId:binding.adId},date);}
    const hourlyData=await driver.scan(date),validation=validateHours(hourlyData.hourly,row.mode),reconciliation=reconcileProduct(row,validation.totals);if(!reconciliation.matched)throw Error('单链接分时与日汇总不一致：'+reconciliation.differences.map(d=>d.label).join('、'));
    unit.completed[date]=await save({type:'unit-day',date,mode:row.mode,productId:row.productId,adId:binding.adId,...hourlyData,validation,reconciliation});await checkpoint('已保存 '+date+' 商品 '+row.productId+' 的24小时数据');
   }}
  job.phase='today';await checkpoint('采集今日快照（未结日）');await driver.overview(overviewURL,today);const live=await driver.scan(today,{account:true});const validation=validateHours(live.hourly,'全部',{partial:true});await save({type:'today-snapshot',date:today,mode:'全部',...live,validation});job.liveCount++;job.phase='complete';await checkpoint('采集完成：历史分时、商品明细及今日快照已保存');return job;
 }catch(e){const stoppedStage=job.phase;job.phase=signal?.aborted?'paused':'blocked';job.failures.push({stage:stoppedStage,at:new Date().toISOString(),message:e.message||String(e)});job.updatedAt=new Date().toISOString();await store.saveJob(job);onProgress('已暂停：'+job.failures.at(-1).message,job);return job;}
 finally{clearInterval(heartbeat);await store.release(owner);await driver.close();}
}
