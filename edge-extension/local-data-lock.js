const NAME='xinyongtu-local-data';let opened;
export function backupStateDB(){return opened??=new Promise((resolve,reject)=>{const r=indexedDB.open('xinyongtu-backup-state',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function journal(method,value){const db=await backupStateDB();return new Promise((resolve,reject)=>{const tx=db.transaction('state',method==='get'?'readonly':'readwrite'),r=tx.objectStore('state')[method](...(method==='put'?[value,'restore']:['restore']));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('恢复日志保存失败'));});}
export function dataLock(work,{exclusive=false}={}){
 if(!navigator.locks)throw Error('当前浏览器不支持本机数据锁，请更新Edge');
 return navigator.locks.request(NAME,{mode:exclusive?'exclusive':'shared'},async()=>{if(!exclusive&&await journal('get'))throw Error('完整恢复尚未完成，请刷新侧栏继续恢复；暂不修改数据');return work();});
}
