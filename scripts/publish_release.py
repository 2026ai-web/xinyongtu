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
source=[root/'README.md',root/'.gitignore',root/'package.json']+sorted((root/'edge-extension').glob('*'))+sorted((root/'tests').glob('*.mjs'))+sorted((root/'tests').glob('*.py'))+sorted((root/'scripts').glob('*.py'))
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
body=f'''修复分离表头、表体导致已识别24个小时但指标为空的问题：在最近报表容器内按列数和唯一表头签名匹配，避免依赖横向滚动坐标。增加匹配失败时的结构诊断。分离表头及独立横向滚动回归、完整浏览器流程与性能测试通过；真实后台尚需核验。

一键采集测试版：历史账户分时、商品日明细、单链接24小时分时及今日快照；支持暂停续采与本地导出。原单页采集保留在高级区域。

[下载 Edge 插件 ZIP]({url})

SHA256: `{hashlib.sha256(zip_path.read_bytes()).hexdigest()}`

已通过10项单元/编排测试及本地 Chromium DOM、日期、IndexedDB和完整驱动集成夹具。尚未在真实登录后台验证日历、表格兼容性，遇到不支持控件会暂停并保存诊断。本版不修改投放设置。

更新：替换原扩展文件夹内容后在 edge://extensions 点击重新加载，保留原扩展身份和本地历史。源码和构建脚本在制品分支，main保持不变。'''
release=api('releases',{'tag_name':'v'+version,'target_commitish':main,'name':f'v{version} 一键报表采集测试版','body':body,'draft':False,'prerelease':True,'make_latest':'false'})
print(json.dumps({'release':release['html_url'],'download':url,'sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest(),'commit':commit['sha']},ensure_ascii=False))
