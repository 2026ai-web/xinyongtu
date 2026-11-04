import {dataLock,journal} from './local-data-lock.js';
import {makeBackup,checkBackup,planRestore,canonical} from './backup-model.js';
const DB={warehouse:['xinyongtu-report-warehouse',{jobs:null,datasets:null,meta:null}],costs:['xinyongtu-cost-accounting',{versions:'id',reports:'id'}],history:['xinyongtu-local-history',{history:null}]};
async function open(name,stores){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{for(const [s,key] of Object.entries(stores))r.result.createObjectStore(s,key?{keyPath:key}:undefined);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function readDB(name,stores){const db=await open(name,stores);try{return await new Promise((resolve,reject)=>{const tx=db.transaction(Object.keys(stores),'readonly'),out={};let error;const work=Promise.all(Object.keys(stores).map(async s=>{const store=tx.objectStore(s),[keys,values]=await Promise.all([req(store.getAllKeys()),req(store.getAll())]);out[s]=keys.map((k,i)=>[k,values[i]]);}));work.catch(e=>{error=e;tx.abort();});tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error);});}finally{db.close();}}
async function snapshot(){const result={};for(const [id,[name,stores]] of Object.entries(DB))result[id]=await readDB(name,stores);const lock=result.warehouse.meta.find(([k])=>k==='lock')?.[1];if(lock&&lock.expiresAt>Date.now())throw Error('另一窗口正在采集，请先停止并等待保存完成');result.warehouse.meta=result.warehouse.meta.filter(([k])=>String(k).startsWith('latest:')).map(([k,v])=>[k,{id:v}]);const p=localStorage.getItem('batch-preferences');result.preferences=p===null?[]:[['batch-preferences',p]];return result;}
export const createFullBackup=version=>dataLock(async()=>{if(await journal('get'))throw Error('请先继续未完成的恢复，再备份');return makeBackup(await snapshot(),version);},{exclusive:true});
export async function previewFullRestore(file){const incoming=await checkBackup(file);return dataLock(async()=>{if(await journal('get'))throw Error('有尚未完成的恢复，请先继续恢复');return planRestore(incoming,await snapshot());},{exclusive:true});}
async function writeDB(id,content){const [name,stores]=DB[id],db=await open(name,stores);try{await new Promise((resolve,reject)=>{const tx=db.transaction(Object.keys(stores),'readwrite');let problem;try{for(const [s,rows] of Object.entries(content)){const store=tx.objectStore(s);for(const [k,input] of rows){let value=input;if(id==='warehouse'&&s==='meta')value=input.id;if(id==='warehouse'&&s==='datasets'){value=structuredClone(input);delete value.bytes;value.bytes=new TextEncoder().encode(JSON.stringify(value)).length;}if(stores[s])store.put(value);else store.put(value,k);}}if(id==='warehouse'){const usage=content.datasets.reduce((n,[,r])=>{const v=structuredClone(r);delete v.bytes;return n+new TextEncoder().encode(JSON.stringify(v)).length;},0);tx.objectStore('meta').put(usage,'usage');tx.objectStore('meta').delete('lock');}}catch(e){problem=e;tx.abort();}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(problem||tx.error);tx.onabort=()=>reject(problem||tx.error||Error('恢复事务失败'));});}finally{db.close();}}
async function finish(intent){
 // Journal is durable before the first data write. All other app storage calls
 // reject while it exists. Each DB commits atomically; repeating the planned
 // merged snapshot after reload is idempotent and completes a partial restore.
 for(const id of Object.keys(DB))await writeDB(id,intent.merged[id]);
 for(const [k,v] of intent.merged.preferences)localStorage.setItem(k,v);
 const after=await snapshot(),expected=structuredClone(intent.merged);
 // bytes is a derived usage field; data contents otherwise remain exact.
 for(const p of [after,expected])for(const [,r] of p.warehouse.datasets)delete r.bytes;
 if(canonical(after)!==canonical(expected))throw Error('恢复后数据校验不一致，已保留恢复日志，请重试');
 await journal('delete');return {restored:true};
}
export async function restoreFullBackup(file){const incoming=await checkBackup(file);return dataLock(async()=>{if(await journal('get'))throw Error('已有待继续的恢复');const plan=planRestore(incoming,await snapshot());if(!plan.canRestore)throw Error('存在同键不同内容或缺失引用，未写入任何数据；请保留原数据并在空环境恢复');await journal('put',{schemaVersion:'local-restore-intent-1',createdAt:new Date().toISOString(),merged:plan.merged});return finish({merged:plan.merged});},{exclusive:true});}
export const resumeFullRestore=()=>dataLock(async()=>{const intent=await journal('get');if(!intent)return {restored:false};if(intent.schemaVersion!=='local-restore-intent-1')throw Error('恢复日志版本不支持，请保留本机数据');return finish(intent);},{exclusive:true});
