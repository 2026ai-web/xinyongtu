# v0.12.11 报告17回归修复（2026-11-03）

基线recovery/v0.12.1 / 9be9085（0.12.10）。工作区开始时干净。

## 问题与修复

报告17扩展版本0.12.10，9个失败的主日期及URL起止均已是2026-11-02，第1步就报calendar-format-unsupported，openAttempts=0。候选只有CompareDatePicker_wrap__Me_jj且没有日期单元格样例。新规则把普通对比日期组件误认成弹层，阻碍了已经正确选日的流程；不是更新未生效的证据，也不需要清空旧数据。

本版排除包含主/对比日期输入的普通容器；Picker类名不再单独证明弹层已打开，还需dialog/grid/dropdown/panel语义、日历弹层标记或日期单元格结构。真正未知格式的弹层仍阻止继续，不通过忽略所有弹层绕过校验。协议three-layer-table-3、日期/URL/身份/24小时/金额和托管null规则保持。

## 离线验证

所有浏览器访问均拦截并返回本地合成页面，无真实店铺操作。

- browser_comparison_wrapper.py：直接加载9be9085旧代码，复现报告17同名对比控件导致calendar-format-unsupported；新代码同页面返回date-selected。普通无输入的对比组件也不误判；真实未知日期弹层仍拒绝、真实有效弹层仍识别；对比点击0次。
- browser_three_layers.py：完整账户+2链接日汇总及24小时流程加入CompareDatePicker_wrap__Me_jj，采集完成。原有错误日期/身份/URL及图表切换保护保持。
- browser_calendar_formats.py、browser_date_errors.py：通过。日期短格式/中文/aria、慢弹层壳、昨日快捷回读、无效日期/歧义/禁用/确认失败保护不变。
- npm test：20/20通过；托管null、共享花费、断点续采、1/7/30及自选日期、金额和地址保护保持。
- browser_managed.py：稳定推广/托管混合流程通过，真实缺失花费列保存null、不分摊共享成本。

- browser_dates.py及browser_url_guard.py：通过。7日共14份独立日数据、28次日期点击、14次确认；一次丢回执恢复、对比日期不变、预算0点击；自选日期持久化和5类非法地址变化拒绝通过。
- browser_calendar_recovery.py：通过，慢日历等待、外层入口、有限恢复、永久失败暂停、已选开始日不重置、页面及注入异常保留均保持。
- browser_batch.py：通过，账户/链接/日期/24小时、IndexedDB和面板流程保持。
- performance_batch.py：本轮100行/10字段约172.8ms，20次滚动2.5ms，慢按钮动作301ms单独记录，250ms解析保护未放宽。上一版已记录运行波动，本次通过不保证真实页面一直低于阈值。
- 全部扩展JS语法、git diff --check、构建、ZIP CRC/固定23条目/包内源码与版本一致/SHA256检查通过。

## 复测方式

先导出JSON备份。解压0.12.11整包运行install.cmd，Edge重新加载扩展并刷新后台，确认0.12.11。不要点桌面更新。旧版本保持关闭、无需删除。原店铺同日期2026-11-02继续，已有4条成功记录保留；导出JSON核对13/13链接与每链接24小时。

本版确定修复已复现误判，不表示真实后台所有问题已验收。Windows安装器功能未改，本环境不具备实际Windows/Edge验证。旧制品和数据保留，未发布Release、部署、修改main/release-channel或上传商家JSON。
