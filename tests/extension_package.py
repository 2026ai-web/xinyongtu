"""Load the built package as an actual Chromium extension, without merchant access."""
from pathlib import Path
import json,tempfile,zipfile
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'edge-extension/manifest.json').read_text())['version']
with tempfile.TemporaryDirectory(prefix='xinyongtu-package-') as tmp:
    tmp=Path(tmp)
    with zipfile.ZipFile(root/'dist'/f'xinyongtu-edge-sidebar-{version}.zip') as z:
        assert z.testzip() is None
        z.extractall(tmp/'package')
    extension=tmp/'package/xinyongtu-edge-sidebar'
    with sync_playwright() as p:
        ctx=p.chromium.launch_persistent_context(str(tmp/'profile'),executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--disable-extensions'],args=['--no-sandbox','--enable-unsafe-extension-debugging',f'--disable-extensions-except={extension}',f'--load-extension={extension}'])
        ctx.route('http://**/*',lambda r:r.abort())
        ctx.route('https://**/*',lambda r:r.abort())
        session=ctx.new_cdp_session(ctx.pages[0])
        session.send('Extensions.loadUnpacked',{'path':str(extension)})
        worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker',timeout=20000)
        manifest=worker.evaluate('chrome.runtime.getManifest()')
        assert manifest['version']==version and manifest['side_panel']['default_path']=='panel.html',manifest
        page=ctx.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('chrome-extension://'+worker.url.split('/')[2]+'/panel.html')
        page.locator('#batchStart').wait_for()
        page.locator('#batchStart').click()
        page.wait_for_timeout(200)
        assert '填写店铺备注' in page.locator('#batchStatus').inner_text()
        assert page.locator('#batchStart').is_enabled()
        assert not errors,errors
        assert version in page.locator('header').inner_text()
        ctx.close()
print('PASS: built ZIP CRC, actual Chromium extension service worker/manifest/panel, input validation, no merchant access')
