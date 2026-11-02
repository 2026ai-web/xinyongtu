# v0.12.5：托管共享数据记录测试

2026-11-02（Asia/Shanghai），recovery/v0.12.1；前版f9539a2。用户要求当前工具只准确记录、供后续GPT分析，区分账户/共享组/链接及统计日期。

## 实现与边界

- 托管详情在相关完整表头明确没有总花费列时，添加花费not-provided/null标记并保存其他24小时数据；表头未知、稳定推广缺花费、实际存在花费列但单元格解析失败、重复字段或其他必需字段缺失仍阻止完成。
- 记录scope、date、Asia/Shanghai、mode、productId/adId及来源，统计日期与capturedAt分开。账户/链接小时数据不混用。
- managedShared为一店铺备注/统计日/托管模式的共享组，不分摊给链接；花费差额按用户确认规则归为共享费用，明确derived与directObservation=false，保留公式、账户总额和已知链接花费。共享限额和目标投产具体值尚未采集，保留not-collected/null，不能当零或历史配置。
- validation.complete表示记录可提供数据完整；financialComplete只指总花费可用性，不是结算或利润完整。coverage新增unavailableLinkSpendDays，导出recordingGuide及DATA_RECORDING.md解释单位和重叠聚合。
- 日期继续由原1/7/30完整日流程自动切换并回读；协议three-layer-table-2重采当前任务，不删除旧jobs，成功后同键数据更新，升级前备份。

## 最终检查

| 检查 | 结果 |
| --- | --- |
| node tests/batch.test.mjs | 17/17通过：增加托管缺整列null而非0、稳定推广/未知表头/其他缺字段/少小时拒绝、共享费用单组派生与未知设置、账户/链接scope及共享组引用。保留13链接×1/7/30日期范围、续采等测试。 |
| python tests/browser_managed.py | 通过：真实DOM混合稳定/托管完整驱动→编排→IndexedDB流程；托管表头真的没有花费列，24小时其余指标保存，链接花费保持null、共享差额单列、设置未知、日/时核对、日期和推广ID分离、零投放按钮点击。 |
| python tests/browser_readiness.py | 通过，loading状态、重复导航、明确表合计与无关滚动区域保护。 |
| python tests/browser_three_layers.py | 通过，概况实际表合计、两链接日整体与24小时、日期及身份校验。 |
| python tests/browser_scroll.py | document/nested/virtual均通过；各场景13明细、24账户小时、6合计指标，断言实际位移。 |
| python tests/browser_batch.py | 通过，分离表头、持久化、面板及真实驱动/编排回归。 |
| python tests/performance_batch.py | 通过，100行/5000无关区块约102ms，20次滚动约1.3ms；250ms保护不变。 |
| 用户导出8的本地数据回放 | 用最后一条托管链接实际24小时及表头证据回放新规则，日/时核对通过；链接花费null、financialComplete=false，共享差额93953分且derived。前一条失败链接的完整小时不在最后诊断中，未声称其实际数据也已完整回放。原始商家文件不提交。 |
| python scripts/build_extension.py、ZIP/source一致性、CRC、固定23条目 | 通过。 |
| 全部扩展JS语法及git diff --check | 通过，版本0.12.5。 |

功能浏览器测试全部使用本地路由拦截夹具，无真实商家操作。本轮未重跑Windows安装器及实际Edge安装；此前环境缺pwsh且Chromium扩展加载受限，仍需用户实机验收。没有利润/GPT调用/调价功能，没有Release、部署或更新release-channel。

## 用户验收

先导出备份；下载并解压整包，运行install.cmd后在Edge重新加载原固定目录扩展并刷新报表页，或停用旧版后加载新目录。确认0.12.5，不点击桌面更新通道。新协议会重采昨天，保留旧任务；采集保持侧栏开启及目标标签选中。

导出当前任务应有概况/明细1/1天、链接分时13/13（以实际页面链接数为准），可包含2条花费not-provided的托管链接；这不等于托管链接各自花费已知。检查managedShared与链接引用、金额来源/单位、unknown设置、统计日期和24小时，避免把整体/共享/链接金额重复相加。
