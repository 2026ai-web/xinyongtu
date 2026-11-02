# 数据记录口径（v0.12.6）

当前用途是保存准确原始记录及明确来源的派生记录，供以后分析。没有利润计算、GPT调用、调价或投放执行。

## 日期、身份与范围

选择昨天/近7/近30个完整日，或指定单日/自选起止日期（最多30个完整日），工具按Asia/Shanghai生成日期，逐日切换并回读页面；每条链接还核对商品ID、推广ID与详情日期。`date`、`recordContext.date`是统计日期；`capturedAt`是实际采集时间，不能当统计日期。`shop`只是本地备注，不是已验证的平台店铺身份。

同商品不同模式、不同推广ID分别记录。只使用当前任务 `lastJob.datasets` 指向的记录判断本次覆盖；仓库其他记录可能来自历史任务。协议 `three-layer-table-3` 与旧协议不直接续用；旧jobs保留，同键数据在重采成功后更新，升级前先导出备份。

## 三层数据与托管共享组

| 路径 | 范围与来源 |
| --- | --- |
| account-day.recordContext | scope=account，账户/日期/全部模式。 |
| account-day.summary | 直接读取的数据概况表合计行，来源summarySources=overview-table-total。不能用数字卡片或求和代替。 |
| account-day.products | 数据明细中每条推广链接日整体数据；各行scope=promotion-link、date、mode、productId；推广ID未直接读到时为空，不能用商品ID冒充。 |
| account-day.hourly | 账户层面的小时数据；不是任何单条链接数据。 |
| account-day.managedShared | 一个店铺备注/统计日/托管模式的共享组；不是每条链接各有一份共享花费。 |
| unit-day.recordContext | scope=promotion-link，按date/mode/productId/adId区分。 |
| unit-day.dailyOverall | 对应链接的日整体数据，带已确认的推广ID与统计日期。 |
| unit-day.summary | 该链接详情表的合计指标，来源summarySources=link-table-total；不要当账户合计。 |
| unit-day.hourly | 该条推广链接的24小时数据。 |
| unit-day.sharedManagedGroupRef | 托管链接所属共享组ID；稳定推广为空。不代表把组花费记到该链接上。 |

## 托管花费与共享设置

用户确认托管链接共享限额及目标投产。若托管详情的完整相关表头没有总花费列，单链接小时花费记为 `current:null,state:not-provided`，reason说明列未提供；不得补零或分摊共享花费。仅解析失败、表头未知、花费列存在但单元格缺失、其他必需字段缺失、小时不足/重复，仍会阻止完成。

`managedShared.spend.amountFen` 在全部托管链接日花费均为平台未提供、已知其他链接花费可用时，记录“账户总花费－已知链接花费”差额，并按用户确认的共享规则归类。其 `state=derived`、`directObservation=false`，保留账户总额、已知链接总额、公式和解释。它不是从托管费用页面直接读取的金额。不能把它重复加到账户总花费上，也不能均分给各链接；差额为负会阻止记录。

共享限额与目标投产的具体值当前没有采集。`managedShared.settings.dailyBudget` 和 `targetRoas` 均为 `value:null,state:not-collected,scope:managed-group`。不能猜值、当零，也不能把未知当前设置当历史日期设置。

## 缺失、完整性与单位

- `validation.complete`：该日按采集规则的小时和可提供必需字段完整，不代表结算、利润或全部财务信息齐全。
- `validation.financialComplete`：只表示该记录的总花费可用；托管链接缺少花费时为false，仍可完整保存其余指标。不是“利润核算完整”。
- `validation.unavailableFields`：明确列出平台未提供的字段。
- `coverage.unavailableLinkSpendDays`：完整保存但缺少链接花费的链接日记录数；`unitDays/expectedUnitDays`是实际覆盖，不能用前者掩盖未覆盖链接。
- 页面 `metrics[].current` 保留原字符串，金额为元；`validation.totals`、`overallValidation.totals`、reconciliation中金额标签对应的数字为分，计数指标仍是计数。`managedShared.spend.amountFen`等以Fen结尾的值为分。93953分即939.53元。
- `null/not-provided/not-collected`均不等于0；`derived`不等于页面直接读数。

导出的 `recordingGuide` 包含这些机器可读口径。账户、共享组、链接、小时属于相互关联的聚合层，不能全部相加；先按日期、模式、推广身份、范围和来源选择分析层级。


## 日期操作与任务匹配（v0.12.6）

job.dateSelection记录选择类型、开始/结束日期和perDay=true，job.dates是拆分后的单日列表。续采比较完整日期列表，不能把相同天数但不同日期的任务混用。自选区间逐日采集；每一轮主日期和详情起止日期必须等于当前date，不能以7天区间结果代替。UI指定单日仍按既有三层流程采集全部当前链接，尚未新增“只选一条链接”的筛选控件；每条链接的数据自身始终按天独立保存。

直接设置值仅用于原生type=date控件；readonly/text框架日历必须经可见日期单元格选择及确认。确认后再回读和等待报表稳定，日期校验失败不保存。diagnosticHistory包含日期阶段、请求/回读值及日历信息，不包含登录凭据。
