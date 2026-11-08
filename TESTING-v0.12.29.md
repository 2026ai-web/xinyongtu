# v0.12.29 报告32原日期与吸顶副本

2026-11-08（北京时间）；基线recovery/v0.12.1 / 2922f7b / v0.12.28，起始工作区干净。报告32实际28仍没有昨天新记录；不能把前两轮离线单日期栏通过说成实际问题已解决。本轮明确补上之前漏测的双日期栏及动态滚动场景。

## 实际证据

11月7日任务同584c01de，completedDays为空，75次read约37.1秒、零滚动/日历动作。实际可见日期输入3个：OverviewHeaderV2_wrap+sticky中的原DateAreaV2值7号；StickyTabRangePicker_rangeWrap/content中的DateAreaV2副本值7号；独立CompareDatePicker为6号。28要求所有unknown在同一原日期组件中，第二个副本使其失败。

报告没有完整页面事件代码，但已足够确定漏处理的组件组合和阻断条件。测试按这些类名/层级和只读单输入范围重建；仍需实际29用户采集验收，不预告实机已经成功。

## 处理规则

仅overview路由配对唯一原OverviewHeaderV2/DateAreaV2与一个StickyTabRangePicker_rangeWrap+content内DateAreaV2副本；输入数量和各规范日期值完全一致才标primary-mirror。副本不放入primary.inputs，日期操作只选原控件，非按DOM顺序挑第一个。

首轮不同值、多个副本、无原组件、普通相同值日期框及额外unknown仍阻断，绝不任意忽略第二控件。原组件和已独立对比的识别、URL初次一致等保护保持。

自有选日中只有原输入引用/路由/推广身份此前已证明，才可将暂未同步副本标primary-mirror-pending。此时primaryVerified=false，date-step只等待，保留reset，不能保存；同步后才能完成。一直不同在驱动原120步上限失败，未放宽日期/URL、金额或250ms保护。dateMirrorEvidence进入read、失败诊断和导出历史，含consistent/awaiting-sync/conflict及主副值/组数，不加动态时间戳。

## 验证

- npm test：60/60通过。
- browser_date_area_v2_sticky.py：旧2922f7b在同值原日期+吸顶副本下确定primary=false、两个unknown，复现报告32；新版primary=true、仅一个主控件。
- 完整driver/runner流程覆盖初始就有副本、首轮滚动才挂载、每次读取重建副本，以及副本DOM排在原控件之前；各完成账户+链接2份/48小时数据，不双算、不操作副本/对比/预算。
- 负例：副本不同日期、普通复制框、两个副本、仅副本无原组件、额外unknown，均拒绝确认。
- 自有只读范围选日2次日期格/1次确认；URL延迟500ms、副本延迟900ms，实际产生date-mirror-awaiting-sync并等待一致后完成，包含副本排在前面的场景。持续不一致用仅测试时钟加速跑实际120次控制器轮询，最终“日期选择未完成”，不伪报成功；不声称真实等待耗时被测试加速结果代表。
- browser_date_area_v2.py、browser_primary_date.py、browser_url_guard.py通过：28单原组件、旧/紧凑日期、URL延迟、歧义/辅助/仅对比/未知通用框及五类地址异常拒绝保持。
- browser_batch.py通过：DOM/driver/runner、投产观察、保存、备份恢复、租约和刷新保持。browser_scroll.py三种13商品滚动（document/nested/virtual）保持24小时和各商品独立目标值；browser_calendar_formats.py通过。
- performance_batch.py通过：100行/5000无关节点约105.5ms，20次滚动约1.5ms；未改250ms保护。不是所有真实环境的性能保证。
- 构建、ZIP CRC/35条目/版本/逐字节源码、JS语法及依赖、安装器清单/SHA256通过。

全部浏览器请求本机fixture拦截，没有真实店铺操作、模型调用、发布或部署。用户报告只在attachments，不进Git。金额/订单/成本/人工调整及备份格式未改，安装器沿用26容错；本轮不重跑无关Windows安装测试。

## 更新验收

先完整备份，解压29整包install.cmd，Edge原扩展重新加载，确认管理卡片和侧栏0.12.29，刷新后台。原店铺昨天11月7日继续，保持目标标签/侧栏；完成或停止完整导出报告。旧数据不清、不卸载、不点桌面更新。只恢复分支普通推送，不改main/release-channel、不发Release或部署。
