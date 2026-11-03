# GPT精简导出（0.12.13）

填写原店铺备注，点击“GPT精简导出（最近任务）”。侧栏重开后无需重新采集。文件仅下载到本机，需你自行交给GPT；不调用模型或自动上传。原“完整导出（备份与诊断）”继续保存全仓库和诊断，用于备份与排错。

范围是该店铺**最近持久化任务自己的日期**，不会因为你改了日期下拉框就把旧数据改成新日期。不混入仓库其它任务的历史记录。采集中先停止或等完成再导出；未完成任务也可导出已有记录，但task.complete为false、coverage列出实际覆盖和缺失。无任务时提示错误。

## 文件结构

- schemaVersion：xinyongtu-gpt-export-1。
- shopNote：本机店铺备注，不是已验证店铺身份。
- task：任务ID、日期、阶段、重新核对后的完整性、每天预期/实际链接和小时数、引用缺失及失败说明。
- metricColumns：所有指标的统一列名顺序。
- records：account或promotion-link，包含独立统计日date、采集时刻capturedAt、推广模式、商品及推广ID。
- summary、dailyOverall、账户links各行：values数组对应metricColumns，保持页面原值字符串；不擅自转数字、补零或重新分配花费。
- hourly：hours数组与values的行一一对应；每行列顺序仍为metricColumns，正常每个链接24小时。账户级小时表也保留，不能和链接小时混加。
- nonExact：默认单元格状态exact；其它状态用从0开始的列号保存。hourly.nonExact先按从0开始的行号，再按列号索引。absent表示该记录没有此全局列；not-provided表示原记录明确平台未提供；missing等原状态继续保留。null不是0，字符串"0"仍是有记录的零。
- fieldAvailability：原字段可提供性。checks：本次导出对日期、身份、24小时、合计/日汇总的核对结果；financialComplete只表示花费是否可提供，不是利润核算。
- account.managedShared及链接sharedManagedGroupRef：托管共享组保持独立。amountFen单位分、state=derived是差额推导，非直接观察；共享限额/目标投产若未采集仍null/not-collected。不分摊给单链接，不把账户与共享组金额重复相加。

所有页面金额字符串按列名保留元；只有共享组amountFen等明确命名字段使用分。date是统计日，capturedAt是采集时刻；不同采集时刻的数据可能因平台后续归因变化而变化。没有成本/运费/售后输入，不能据此宣称利润或最终结算金额。

导出时重新核对完成引用是否存在、统计日、链接身份、24小时、账户合计及链接日汇总与小时合计；缺数据或不一致不会标完整。诊断DOM、滚动日志、其它任务和重复字段名从精简文件移除，完整文件仍保留。不会修改本机仓库。
