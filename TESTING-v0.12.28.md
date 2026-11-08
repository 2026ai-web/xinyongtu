# v0.12.28 报告30 DateAreaV2实际结构兼容

2026-11-08（北京时间）；基线recovery/v0.12.1 / a4d9922 / v0.12.27，起始工作区干净。本轮只补一个明确的主日期组件分支，业务核算、备份、手工调整、日期最终核对和安装器不变（除版本与文档）。

## 实际报告

报告30明确运行0.12.27，11月7日仍账户阶段blocked、completedDays为空。75次read、约33.5秒，日期/滚动动作均0；URL begin/end=7日，readonly主输入值7日但unknown，对比6日已正确归comparison-component。

新诊断揭示真实祖先：anq-picker-input → anq-picker-range/anq-date-range-picker + DateAreaV2_rangePicker → SPAN → DateAreaV2_wrapper → DIV → OverviewHeaderV2_wrap。27只认识旧DatePicker命名组件和紧凑文字组，确实未覆盖此组合。报告没有完整页面HTML或事件处理代码，结构测试不是对真实后台执行的替代。

## 修改

仅overview路由下识别DateAreaV2_wrapper，要求其子级存在anq-date-range-picker，且4层父级内是OverviewHeaderV2_wrap。类名只匹配组件前缀，不硬编码构建hash。随后仍要求同组唯一unknown、最多2日期输入、有独立对比且不混入、首次渲染起止与唯一URL日期相符。已确认同控件的自有选日角色复用、URL身份保护、最终日期回读均保持。

没有让任意DateArea、任意range控件或地址日期直接作为主日期，也未为未知控件绕过日期检查。范围单输入Readonly仍通过可见日历格两次选择及确认，不直接赋值。

## 执行

- npm test：60/60通过。
- browser_date_area_v2.py通过：按报告六层祖先、readonly text单输入范围、独立CompareDatePicker重建；加载旧a4d9922确定复现primary=false。新代码primary=true，实际driver/runner完成昨天账户+链接各一份、48小时保存，表格模式两次切换、日期按7日核对、预算和对比0点击。
- 同fixture有意隐藏概况表格直到点击“表格”，因此验证已越过原等待阶段进入扫描，不只是read标记改变。另用只读范围选择6号，两次日期格点击/一次确认，地址延迟500ms更新后最终回读一致。
- V2负例5类通过：没有OverviewHeaderV2、没有实际范围组件、页面/地址初始日期不符、两个不明日期组、主组件混入对比，均不提升为主日期。
- browser_primary_date.py、browser_comparison_wrapper.py、browser_url_guard.py通过：旧紧凑/命名控件、异步地址、通用未知/辅助/仅对比等负例、未知弹层和五类URL异常保护保持。
- browser_batch.py通过：原DOM/driver/runner、投产观察、保存与备份恢复、IndexedDB租约/刷新；browser_calendar_formats.py通过：日期格式、慢弹层、昨日快捷入口、对比隔离及未知格式保护。
- 构建、ZIP CRC/35条目/版本/源码逐字节、JS语法与依赖闭包、安装器清单/SHA256通过。安装器逻辑沿用26，未重复无关Windows安装测试。

所有页面请求均本机fixture拦截，无真实店铺访问/操作、模型调用、发布或部署。报告只在attachments，不入Git。真实28采集仍待用户续采验收，尤其报告未提供的表格事件/详情页布局不伪称已实测。

## 更新

先完整备份，解压28整包install.cmd，Edge原扩展重新加载，卡片和侧栏均确认0.12.28，再刷新后台。原店铺昨天11月7日继续，保持目标标签与侧栏开启，完成或停止完整导出报告。27失败未保存昨天新数据，旧七日/成本/核算/调整日志保留，不卸载、不清数据、不点桌面更新。只恢复分支普通推送，不改main/release-channel、不发布部署。
