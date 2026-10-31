"""Publish the allowlisted source and deterministic ZIP on an isolated artifact branch."""
from pathlib import Path
import subprocess,json,base64,tempfile,hashlib
root=Path(__file__).resolve().parents[1]
repo='repos/2026ai-web/xinyongtu'
def api(path,payload=None):
    command=['gh','api',repo+'/'+path]
    if payload is None:return json.loads(subprocess.check_output(command,text=True))
    with tempfile.NamedTemporaryFile(mode='w',suffix='.json') as f:
        json.dump(payload,f,ensure_ascii=False);f.flush()
        return json.loads(subprocess.check_output(command+['--method','POST','--input',f.name],text=True))
version=json.loads((root/'edge-extension/manifest.json').read_text())['version']
zip_path=root/'dist'/f'xinyongtu-edge-sidebar-{version}.zip'
main=api('git/ref/heads/main')['object']['sha'];tree=[]
source=[root/'README.md',root/'.gitignore',root/'package.json']+sorted((root/'edge-extension').glob('*'))+sorted((root/'tests').glob('*.mjs'))+sorted((root/'tests').glob('*.py'))+sorted((root/'scripts').glob('*.py'))+sorted((root/'windows-installer').glob('*'))
for file in source:
    if file.is_file():tree.append({'path':str(file.relative_to(root)),'mode':'100644','type':'blob','content':file.read_text()})
blob=api('git/blobs',{'content':base64.b64encode(zip_path.read_bytes()).decode(),'encoding':'base64'})
tree.append({'path':zip_path.name,'mode':'100644','type':'blob','sha':blob['sha']})
tree.append({'path':zip_path.name+'.sha256','mode':'100644','type':'blob','content':zip_path.with_suffix('.zip.sha256').read_text()})
base=api('git/commits/'+main)['tree']['sha']
newtree=api('git/trees',{'base_tree':base,'tree':tree})
commit=api('git/commits',{'message':f'Publish v{version} one-click collection preview and recoverable source','tree':newtree['sha'],'parents':[main]})
api('git/refs',{'ref':f'refs/heads/release-artifacts/v{version}','sha':commit['sha']})
url=f'https://github.com/2026ai-web/xinyongtu/raw/{commit["sha"]}/{zip_path.name}'
body=f'''简化安装更新版：解压整包并双击 install.cmd，文件自动装到固定位置，创建桌面「新龙图更新」入口。后续双击更新入口自动下载并校验安装；Edge仍需要点击一次重新加载。首次需要在Edge中加载一次固定目录。旧插件请停用保留，旧扩展数据不会自动迁移。

侧栏主界面收拢为开始采集、停止、导出结果；记住店铺备注和范围，默认采昨天。Windows安装器核心文件操作使用PowerShell自动测试，Windows桌面/Edge首次加载未实机验证。

一键采集测试版：历史账户分时、商品日明细、单链接24小时分时及今日快照；支持暂停续采与本地导出。原单页采集保留在高级区域。

[下载 Edge 插件 ZIP]({url})

SHA256: `{hashlib.sha256(zip_path.read_bytes()).hexdigest()}`

已通过10项单元/编排测试及本地 Chromium DOM、日期、IndexedDB和完整驱动集成夹具。尚未在真实登录后台验证日历、表格兼容性，遇到不支持控件会暂停并保存诊断。本版不修改投放设置。

更新：双击桌面「新龙图更新」，完成后在 edge://extensions 点击重新加载。源码和构建脚本在制品分支，main保持不变。'''
release=api('releases',{'tag_name':'v'+version,'target_commitish':main,'name':f'v{version} 一键报表采集测试版','body':body,'draft':False,'prerelease':True,'make_latest':'false'})
# Point the opt-in updater at this published, immutable package only after release creation.
channel='release-channel'
probe=subprocess.run(['gh','api',repo+'/git/ref/heads/'+channel],capture_output=True,text=True)
if probe.returncode:
    if '404' not in probe.stderr:raise RuntimeError('Could not inspect update channel')
    parent=main
else:parent=json.loads(probe.stdout)['object']['sha']
metadata=json.dumps({'version':version,'url':url,'sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest()},ensure_ascii=False)+'\n'
ctree=api('git/trees',{'tree':[{'path':'latest.json','mode':'100644','type':'blob','content':metadata}]})
ccommit=api('git/commits',{'message':'Update opt-in installer channel to '+version,'tree':ctree['sha'],'parents':[parent]})
if probe.returncode:api('git/refs',{'ref':'refs/heads/'+channel,'sha':ccommit['sha']})
else:
    with tempfile.NamedTemporaryFile(mode='w',suffix='.json') as f:
        json.dump({'sha':ccommit['sha'],'force':False},f);f.flush()
        subprocess.run(['gh','api',repo+'/git/refs/heads/'+channel,'--method','PATCH','--input',f.name],check=True,capture_output=True)
print(json.dumps({'release':release['html_url'],'download':url,'sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest(),'commit':commit['sha']},ensure_ascii=False))
