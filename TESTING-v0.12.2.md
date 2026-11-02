# v0.12.2 三层采集测试记录

日期：2026-11-02（Asia/Shanghai）；恢复分支 recovery/v0.12.1；基线 9f0181c。

本包用于用户验收，不是线上发布。未访问真实店铺、未改投放、未发布 Release、未部署；没有上传用户报表文件。

## 本机检查结果

- `node tests/batch.test.mjs`：14/14 通过。包括 13 条链接 × 1/7/30 天（分别 14/98/420 个账户与链接日数据集）、失败继续其他链接、旧协议任务重采、断点续采、整体指标缺失/不一致拒绝。
- `python tests/browser_batch.py`：通过。真实 DOM 解析、分离表头、日期、IndexedDB 租约/重载、驱动/编排和面板输入验证。
- `python tests/browser_three_layers.py`：通过。以两条链接的不同商品/推广 ID 验证完整三层导出：页面整体指标、两条链接日整体、每条24小时；主/对比日期分离，冲突主日期与 URL-only 日期拒绝，旧详情链接日期修正，趋势图切换到表格，零预算按钮点击。网络请求全部由本地夹具拦截，不是商家实测。
- `python tests/performance_batch.py`：最终串行运行通过，100 行/5000 无关区块约 87.8ms，20 次滚动约 0.5ms。首次并行运行曾为 416.2ms 超过阈值，单独复跑约96.4ms通过；最终检查再次通过。保留250ms保护，不放宽阈值；实际页面/机器仍可能触发性能保护。
- `python scripts/build_extension.py`：通过；ZIP CRC、固定23条目和包内文件与源码一致性另行核对。
- 扩展全部 JavaScript 的 `node --check` 和 `git diff --check`：通过。
- `python tests/installer.py`：未能执行安装逻辑；缺少 PowerShell，`/tmp/xinyongtu-pwsh/pwsh` 不存在。
- `python tests/extension_package.py`：实际整包扩展加载检查未通过，环境 Chromium 154 未产生扩展 service worker；尝试 CDP 加载时返回 `Extensions.loadUnpacked: Method not available`。不能据此宣称 Edge 加载或 sidePanel 实机测试通过；该脚本为需要支持扩展加载的 Chromium 环境准备。

## 你这边的最小验收步骤

1. 在旧扩展先导出备份。保留旧扩展和目录，停用旧扩展。
2. 下载并解压 `xinyongtu-edge-sidebar-0.12.2.zip`，在 `edge://extensions` 开启开发者模式，加载解压后的 `xinyongtu-edge-sidebar` 文件夹，确认版本 0.12.2。推荐此方式；安装器本次未验收。新路径通常有独立数据，旧数据不会自动迁移。
3. 不点击桌面“新龙图更新”，线上更新通道尚未包含本测试包。
4. 在日常 Edge 已登录的商品推广报表总览页，填写店铺备注，先选“昨天”。侧栏保持开启，目标标签保持选中，不手动切日期/店铺。
5. 完成时检查整体与链接明细为 1/1 天、单链接分时为 N/N（以页面实际链接数为准）。未完成或失败不能算采全；同一天同备注同范围可继续未完成项。
6. 导出 JSON，核对当前 `lastJob.collectionContract` 为 `three-layer-1`、`phase` 为 `complete`、`coverage.unitDays == coverage.expectedUnitDays`，且 `failures` 为空。导出包含旧任务时以当前 job 的 datasets 键定位，不能把旧记录算进本次覆盖数。
7. `account-day.summary` 必须来自页面数据概况，`account-day.products` 是数据明细每条链接的日整体数据；每条 `unit-day` 必须有对应 `dailyOverall`、正确 productId/adId/date、24 个不重复小时和日/时核对结果。分别与后台页面人工比对。
8. 若未完成，保留原始导出 JSON 反馈，不要清库重装；查看 failures 中每链接诊断和 diagnosticHistory。

平台确实未提供的托管花费仍保留 `not-provided`，不记零、不分摊。账户未归属花费差额会明确保留，这属于数据缺口，不是利润结论。
