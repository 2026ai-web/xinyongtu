import {datasetKey} from './batch-model.js';
export function createBatchStore(){
 let opened;const open=()=>opened??=new Promise((resolve,reject)=>{const r=indexedDB.open('xinyongtu-report-warehouse',1);r.onupgradeneeded=()=>{for(const n of ['jobs','datasets','meta'])r.result.createObjectStore(n);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 async function transaction(names,mode,work){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(names,mode);let result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('本地仓库事务终止'));Promise.resolve(work(tx)).then(v=>{result=v;}).catch(e=>{reject(e);tx.abort();});});}
 return {
  claim:owner=>transaction(['meta'],'readwrite',async t=>{const s=t.objectStore('meta'),lock=await request(s.get('lock'));if(lock&&lock.owner!==owner&&lock.expiresAt>Date.now())throw Error('另一窗口正在采集，请先停止该任务');s.put({owner,expiresAt:Date.now()+60000},'lock');}),
  release:owner=>transaction(['meta'],'readwrite',async t=>{const s=t.objectStore('meta'),lock=await request(s.get('lock'));if(lock?.owner===owner)s.delete('lock');}),
  saveJob:job=>transaction(['jobs','meta'],'readwrite',t=>{t.objectStore('jobs').put(structuredClone(job),job.id);t.objectStore('meta').put(job.id,'latest:'+job.shop);}),
  latest:shop=>transaction(['jobs','meta'],'readonly',async t=>{const id=await request(t.objectStore('meta').get('latest:'+shop));return id?await request(t.objectStore('jobs').get(id)):null;}),
  dataset:key=>transaction(['datasets'],'readonly',t=>request(t.objectStore('datasets').get(key))),
  saveDataset:data=>transaction(['datasets','meta'],'readwrite',async t=>{const s=t.objectStore('datasets'),meta=t.objectStore('meta'),key=datasetKey(data);const old=await request(s.get(key)),usage=await request(meta.get('usage'))||0,count=await request(s.count());const copy=structuredClone(data),bytes=new TextEncoder().encode(JSON.stringify(copy)).length;if(usage-(old?.bytes||0)+bytes>20*1024*1024||(!old&&count>=5000))throw Error('历史仓库已达20MB或5000个数据集上限，请导出后清理');s.put({...copy,bytes},key);meta.put(usage-(old?.bytes||0)+bytes,'usage');return key;}),
  export:shop=>transaction(['jobs','datasets'],'readonly',async t=>({schemaVersion:'batch-warehouse-1',exportedAt:new Date().toISOString(),shop,jobs:(await request(t.objectStore('jobs').getAll())).filter(x=>x.shop===shop),datasets:(await request(t.objectStore('datasets').getAll())).filter(x=>x.shop===shop)})),
  clear:()=>transaction(['jobs','datasets','meta'],'readwrite',t=>{for(const n of ['jobs','datasets','meta'])t.objectStore(n).clear();})
 };
}
