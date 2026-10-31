# 新龙图 Edge 侧栏

v0.11.3 测试版新增一键历史报表采集。选择店铺备注和 1/7/30 个完整日，一次点击自动采账户分时、商品日明细、各推广链接分时和今日快照，支持暂停续采。本机保存，不改投放，不读取登录凭据。

源码在 `edge-extension/`。在 Edge 扩展开发者模式中加载该目录。原单页工具保留在高级区域。

验证：

```sh
node tests/batch.test.mjs
python tests/browser_batch.py
python scripts/build_extension.py
```

浏览器测试需 Python Playwright 与 `/usr/bin/chromium`。夹具覆盖真实 DOM 解析、日期回读、24 小时数据、IndexedDB 排他锁与重载保留，以及驱动和编排完整集成；不是已登录拼多多后台验证。

使用和限制见 `edge-extension/使用说明.txt`。若后台控件不兼容，自动暂停并保留诊断，不能将暂停任务当作完整报表。当前不支持文件导入、利润核算或自动调价。

构建脚本只打包固定扩展文件清单，不包含测试、商家数据或环境文件。公开发布使用独立制品分支，保留主分支。
