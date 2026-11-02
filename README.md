# 新龙图 Edge 侧栏

v0.12.5 测试包按三层目标采集：数据概况表格合计行、数据明细中每条链接的整体数据、每条链接24小时分时。选择店铺备注和 1/7/30 个完整日，支持暂停续采；三层齐全且校验通过才完成。不再把今日快照作为本任务目标。本机保存，不改投放，不读取登录凭据。

Windows 用户解压发布整包后双击 `install.cmd`。安装器自动写入固定目录并创建桌面更新入口，首次在 Edge 中加载该固定目录。以后双击桌面“新龙图更新”，完成后在 Edge 点重新加载。旧插件停用保留，不自动迁移旧扩展数据。

源码在 `edge-extension/`，安装器在 `windows-installer/`。原单页工具在更多设置中。安装器用 PowerShell 测试核心文件操作；Windows 快捷方式和 Edge 首次安装尚未实机验证。

验证：

```sh
node tests/batch.test.mjs
python tests/browser_batch.py
python tests/browser_three_layers.py
python tests/browser_scroll.py
python tests/browser_readiness.py
python tests/browser_managed.py
python tests/performance_batch.py
python scripts/build_extension.py
python tests/installer.py
```

浏览器测试需 Python Playwright 与 `/usr/bin/chromium`。夹具覆盖真实 DOM 解析、日期回读、24 小时数据、IndexedDB 排他锁与重载保留，以及驱动和编排完整集成；不是已登录拼多多后台验证。

使用和限制见 `edge-extension/使用说明.txt`。若后台控件不兼容，自动暂停并保留诊断，不能将暂停任务当作完整报表。当前不支持文件导入、利润核算或自动调价。

构建脚本只打包固定扩展文件清单，不包含测试、商家数据或环境文件。公开发布使用独立制品分支，保留主分支。

## v0.12.5 测试包

修复主日期与对比日期相互干扰，详情直达链接按目标日重建起止日期。整体指标单独读取并与账户分时核对，链接日整体数据随链接分时保存；单条失败继续其他链接，最终报告未完成及各条失败原因。旧 v0.12.1 任务保留，首次使用新采集协议会重采目标日，不把缺少整体指标的旧断点当完成。

导出 `account-day.summary` 为概况表格合计指标，`account-day.products` 为链接整体明细，`unit-day.dailyOverall` 为对应链接整体数据，`unit-day.hourly` 为24小时数据。`job.coverage` 为覆盖计数；`phase=complete` 才是完整任务。平台未提供的托管花费仍为空且列出未归属差额，不分摊、不补零。

测试安装：下载 `xinyongtu-edge-sidebar-0.12.5.zip` 并解压，优先加载其中 `xinyongtu-edge-sidebar/` 进行测试；保留旧扩展与数据并先停用旧扩展。若通过整包 `install.cmd` 更新固定目录，之后在 Edge 扩展页点重新加载。不要点桌面“新龙图更新”：线上更新通道尚未发布此测试包。此版本仍需用户真实后台验证，离线夹具不等于实际店铺验收。


v0.12.5：滚动不再依赖当前已出现的商品行；遍历文档根、内部纵向容器、横向表格及滚动后新增的懒加载区域，验证实际位移，结束后等待页面稳定并再次检查。滚动期间累计整体指标，支持金额拆分节点、直接文本和当前值后的对比说明；诊断保留滚动位置及整体指标候选识别状态。完整性仍依据链接总数和24小时校验，滚到底不等于采全。


v0.12.5 按用户确认的口径：第一层是“数据概况”表格中实际显示的合计行，不是数字卡片，也不是小时/商品求和。`account-day.summarySources` 标注 `overview-table-total`；缺少、重复或不一致的概况合计阻止完成。商品明细合计只作独立诊断，不冒充概况合计。概况表的24条小时记录不用于链接分页计数。表头/表体/合计行分表时，仅在明确共享的 anq/ant/rc 表格容器内按唯一列签名匹配。加载中的标签可通过已渲染报表验证继续，相同目标URL不重复导航；仍校验日期、页面加载标记及稳定性，最多等30秒。滚动范围排除通知、店铺名、商品名称等省略文字区域。


v0.12.5 记录托管共享关系：账户/托管组/单链接/逐小时数据分层，统计日期与采集时间分开。托管详情经表头证实没有花费列时，保存24小时其他指标并给花费添加not-provided/null；不把缺失记零，稳定推广或其他字段缺失仍阻止完成。托管共享花费在managedShared单独保存，不分摊到链接；差额按用户确认的共享模式规则归类，明确标记derived，保留账户总额与已知链接花费作为计算依据。共享限额/目标投产具体值尚未采集，settings标为not-collected，不能推测。导出含recordingGuide，字段口径见DATA_RECORDING.md。新协议three-layer-table-2会重采当前任务，不删除旧jobs。
