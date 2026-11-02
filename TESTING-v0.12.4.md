# v0.12.4：概况表格合计行、加载就绪及滚动范围

日期：2026-11-02（Asia/Shanghai）。分支 recovery/v0.12.1，前版577e86f。用户本轮明确确认：“数据概况整体数据”指表格中的合计行。此前把数字卡片当必需来源的理解已纠正。

## 当前采集合同

`collectionContract=three-layer-table-1`：

1. 数据概况表格中实际显示的合计行，直接映射列，保存到 account-day.summary。summarySources 标注 overview-table-total。
2. 数据明细里各条链接的整体数据，保存 account-day.products；对应链接日记录内有 dailyOverall。
3. 各链接24个不重复小时，保存 unit-day.hourly，与链接日整体数据核对。

不把顶部数字卡片、小时求和或数据明细的合计冒充第一层。概况表合计缺失、多个候选或与账户分时不符时停止，不伪造完整结果。概况的24条小时数据不是商品链接数。

## 其他调整

- 相同目标URL不再重复导航；标签仍为loading时读取实际DOM，要求主日期可靠、报表加载标记消失、连续稳定；最多等待30秒。错误/不稳定会重置稳定计数，等待状态进入诊断。
- 页面根和包含报表表格/标题的容器才进入滚动遍历，排除通知条、店铺名及商品名称省略文字。
- 支持在明确共享anq/ant/rc容器内的独立合计表，以唯一列数和表头签名映射；重复合计不接受。不会把坐标恰好对齐当成唯一凭证。
- 诊断保留概况和明细合计的独立结构、字段及候选来源。旧采集协议任务不直接续作当前任务；旧jobs保留，同键数据在成功重采后更新。更新前先导出备份。

## 最终检查结果

| 命令 | 实际结果 |
| --- | --- |
| node tests/batch.test.mjs | 14/14通过；13链接×1/7/30天、断点续采、失败继续、缺失和冲突拒绝。 |
| python tests/browser_readiness.py | 通过；标签loading但DOM有效时继续、相同URL零重载；只有卡片/商品合计不能当概况合计；表格切换后采概况合计；独立粘性合计表、重复合计拒绝、错误日期拒绝；通知/商品名滚动位置仍为0。 |
| python tests/browser_three_layers.py | 通过；明确的概况表合计、两条不同推广身份的链接日整体及各24小时、详情旧日期修正；零预算按钮点击。 |
| python tests/browser_scroll.py | document/nested/virtual三场景均通过；每场景13商品、24账户时段、6个直接读取的合计指标；实际纵向和横向移动，滚后懒加载、每次仅4行虚拟挂载累计至13行。 |
| python tests/browser_batch.py | 通过；日期、真实DOM、分离表头、持久化和完整驱动/编排。夹具改为显式概况合计行，不能再靠数字卡片通过。 |
| python tests/performance_batch.py | 通过；最终100行/5000无关区块约192.6ms，20次滚动约1.6ms；250ms阈值未放宽，性能数字依机器负载变化。 |
| python scripts/build_extension.py | 通过，固定23条目；另核对ZIP CRC及包内文件与源码一致性。 |
| 所有扩展JS的node --check、git diff --check | 通过，扩展和package版本0.12.4。 |

所有浏览器功能验证均用本地路由拦截的合成页面，未访问真实店铺、未读登录凭据，未改投放。合计行实际后台布局仍需用户验收。Windows安装器没有改功能，本轮未重跑其测试；既有环境缺少pwsh，实际扩展加载也受Chromium环境限制，因此不能宣称Windows/Edge安装验收通过。

## 用户更新和最小验收

先导出备份并保留旧扩展。固定目录用户下载本包、解压、双击install.cmd，在Edge扩展页重新加载原扩展、刷新商家报表页，确认0.12.4；或者停用旧版后加载包中的xinyongtu-edge-sidebar目录。新路径不自动迁移旧数据。不要点击桌面“新龙图更新”，release-channel尚未变化。

先选昨天，保持侧栏和目标标签，勿干预滚动。完成后导出JSON，按当前lastJob.datasets定位本次数据，检查概况/明细1/1天、链接分时N/N、phase=complete、failures为空；account-day.summary应与概况表合计逐项一致，summarySources应是overview-table-total。再逐条核对数据明细整体数据及对应24小时。若仍失败，反馈原始导出，不清库或删除旧数据。

本次只保存源码和测试包到恢复分支，不更新main/release-channel，不发布Release或部署。
