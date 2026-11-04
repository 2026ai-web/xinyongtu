# 数据记录口径（v0.12.21）

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


## 日期操作与任务匹配（v0.12.19）

job.dateSelection记录选择类型、开始/结束日期和perDay=true，job.dates是拆分后的单日列表。续采比较完整日期列表，不能把相同天数但不同日期的任务混用。自选区间逐日采集；每一轮主日期和详情起止日期必须等于当前date，不能以7天区间结果代替。UI指定单日仍按既有三层流程采集全部当前链接，尚未新增“只选一条链接”的筛选控件；每条链接的数据自身始终按天独立保存。

直接设置值仅用于原生type=date控件；readonly/text框架日历必须经可见日期单元格选择及确认。确认后再回读和等待报表稳定，日期校验失败不保存。diagnosticHistory包含日期阶段、请求/回读值及日历信息，不包含登录凭据。


## 受控日期地址变化（v0.12.19）

工具选择日期期间允许beginDate/endDate在已验证原日期与本次目标日之间过渡，不允许推广身份、其它筛选或路径改变。只有页面回读和地址日期（若存在）都等于目标单日，才进入数据保存。dateSelection记录操作阶段，urlGuard记录是否允许及前后日期/身份/参数名；不将未确认区间当单日。没有URL日期的页面仍要求页面主日期及数据稳定性验证。


## 性能和恢复口径（v0.12.19）

recordContext、日期、范围、花费单位及缺失语义不变，仍是完整数据采集，不是改采日报或少采链接。job.performance.scope=current-driver-attempt；startedAt/elapsedMs与脚本/整表读取/滚动及恢复计数只描述本次驱动尝试，旧job.createdAt可能包含暂停或旧版本失败。requestedWaitMs为请求的等待量，不是浏览器实际定时耗时。

快速路径仅在实际收齐24个不重复小时、可用必需字段、合计及全部已识别列后跳过无增量的纵向滚动；横向扫描、日期/身份及最终日时核对保留。不齐或不稳定时仍完整采集/暂停。只读重试不改页面；日期丢回执通过状态回读继续，其它写入页面状态的动作不盲目重放。

日期恢复仅针对calendar-not-open且phase=start，最多两轮；其它阶段不重置日期状态。calendarRecoveries统计本次尝试恢复次数；导出诊断保留errorCode/recoverable。数据协议仍three-layer-table-3，不减少日期、链接或小时覆盖。

0.12.19日期适配：昨日快捷键按Asia/Shanghai当天计算且仅在目标start=end=昨天时使用，限定主统计日期组中的唯一可见“昨日”，不操作对比组。最多等2秒回读后回退日历；不能将“近7日”写到单日。日历兼容YYYY-M-D、YYYY年M月D日及aria-label，均经过真实日历日期校验、唯一性/禁用保护和最终主日期/URL日期回读。calendarCandidates导出最多4个可见候选弹层及每个8个日期属性样例，方便识别未知控件；无效格式明确报calendar-format-unsupported而非循环开关。

0.12.19不改变数据口径。普通主日期/对比日期输入容器不是弹层证据；Picker类名本身不足以判定日历已打开，需明确dialog/grid/dropdown/panel、日历弹层标记或日期单元格。真正未知格式弹层仍阻止确认，不通过忽略所有弹层来绕过日期校验。

0.12.19定位与采集分离：已验证的account-day仍是日汇总依据。后续返回概况可处于其它日期，仅按商品ID+推广模式查找唯一详情入口；该阶段读到的指标不用于写入或替换已保存日汇总。详情先确认商品和推广ID，沿实际观察的详情地址设置beginDate=endDate=目标日，其它参数保持；重新回读身份和页面日期。URL单日但页面不是单日时仍需日历，不成功不保存。job.performance.unitDateNavigations统计已观察详情地址的日期调整次数，诊断unit-date-navigation仅记录安全地址事实。

0.12.19新增xinyongtu-gpt-export-1本地精简格式。默认导出店铺备注对应最近持久化任务的completedDays/units.completed引用，不能将仓库其它日期记录当任务成功。metricColumns统一列顺序，values保留原字符串及原单位（金额元），默认exact、nonExact记录其它状态；全局列在某记录不存在标absent，与平台明确not-provided有别。managedShared.spend.amountFen仍为分且derived，不与账户总花费重复相加、不分摊。task.complete由原任务完成状态、引用存在性、覆盖和独立数据校验共同决定。完整仓库备份导出不变。

0.12.19新增order-cost-accounting-1：订单文件不含可靠所属日期时必须用户确认日期及店铺，结果名称为“剔除售后及取消订单后的经营结余”，不是全店最终净利润。SKU编码仅去首尾空白，购买件数与SKU包内只数不同，整套SKU成本乘购买件数。成本表已含快递人工、包材、运费险，不重复添加。手续费按纳入订单实收合计×3.5%四舍五入到分；扣同日全部账户总花费且不按推广归因交易额替代订单收入。金额以整数分保存，未匹配或冲突不当零，取消/退款/处理中收入及成本均剔除。成本版本按适用起始日及导入时刻选择，核算明细冻结版本及逐单成本依据。

0.12.19在order-cost-accounting-1内追加productAccounting（product-accounting-1）。商品ID为汇总维度，不能把同商品订单拆给稳定推广和托管分别记收入。platformFeeFen来自全店手续费的最大余数账务分配，非平台逐商品实际扣费。knownAdSpendFen是商品已明确列示的花费；adSpendFen/afterAdBalanceFen只有费用可确定时给数值。托管参与商品不填完整广告后结余。账户未归属/共享费用单列，不重复扣除、不按收入摊分。

广告数据按同店铺同日、primaryVerified、账户合计与24小时、overview-table-total来源、expectedRows及身份唯一性检查；异常时全部商品广告后结余保持null。缺失商品ID保留未知桶，不丢金额；待确认成本仍不能变零成本利润。广告有支出而订单未纳入的商品仍列出。reconciliation保留收入/成本/手续费/订单数量合计检查，以及“商品扣广告前结余合计－已知花费－未归属费用＝全店结余”检查。complete表示分组/来源核对完整，不表示托管单商品利润都可确定，另有allProductBalancesKnown。

0.12.19仅改变侧栏展示：可见投产比按revenueFen/adSpendFen保留2位显示，adSpendFen=null显示无法确定，=0显示—，有pendingOrders显示无法确定。该比值不写回核心核算结果，不覆盖平台归因投产。营业额/单量/结余使用原商品分组数据，成本明细和完整导出不删。

0.12.19新增xinyongtu-full-backup-1，备份全部店铺而不是当前任务。payload含warehouse.jobs/datasets/latest索引、costs.versions/reports、history、batch-preferences；不备份采集锁和usage派生计数，不保存登录/Cookie或外部原始文件。JSON省略未定义可选属性，不改财务数值；SHA256按标准JSON语义与稳定键序校验。恢复忽略重复数据的派生bytes差异，使用内容判断冲突；版本相同且成本映射/适用日期/导入时间相同可视为同版本，不以重复计数差异覆盖成本。容量及任务引用先检查，usage重算，锁不重放。

三个业务数据库分别事务写入，不能声称跨库原子事务。用先持久化的恢复意图、跨窗口Web Locks及正常存储访问门禁实现可继续恢复：中断时保留意图，读写暂拒，重开后重放同一已预检合并快照，逐库事务幂等提交，再按内容核对；成功后才清理意图。存在冲突/篡改/缺引用时不启动恢复写入。备份不是财务结算验证，保留原记录的完成/未知/缺失状态，不把旧数据自动判合格。

0.12.19新增xinyongtu-gpt-analysis-1，推广来源为所选日期已保存快照，不伪造任务已完成状态。coverage逐日给promotionComplete/accountingPresent/accountingValid/snapshotsMatched/complete与原因。核算选择同店铺同日最近createdAt记录，不因较新记录失败而退用旧成功；同一时间不同内容视为歧义。成本版本和逐单内部金额、数量、剔除、手续费及结余复核后才给汇总。核算所引用广告金额及capturedAt必须与本次账户快照一致，才关联商品广告后结果，否则说明重核。

promotion.values保持页面原字符串/金额元，accounting.summary和productAccounting金额为整数分。订单实收与归因交易额不视为同一批成交、不相加；小时推广不等于小时订单利润。托管共享不分摊，complete指资料匹配，不代表所有托管商品利润可知。原数据不修改，导出不含订单号、逐单SKU和完整成本映射，仅成本版本。

0.12.19订单号日期：dateSource=order-id-prefix，dateEvidence记录YYMMDD-hyphen-order-id规则、订单数及imported-rows-only范围；每行订单号都必须与统计日一致，排除的订单也参与日期/重复检测。20YY规则由用户截图及实际订单确认，不宣称官方编号保证。手动旧记录继续有效。orderCoverage=imported-file-rows和shopIdentityVerified=false说明自动日期不等于全天/店铺认证。

一批多个CSV仅提取核算所需列，允许列顺序不同；先跨文件去重复校验（不静默去重）再分日。每日报告独立保存及核对，手续费每一天按实收合计3.5%取整，不把七天先合并取整。多天下载可含失败日期，不能以其它日期代替；分析导出接受自动来源但重查每个订单号所属日。

0.12.20仅日期选择兼容改动：当目标单日晚于已显示结束日、当前阶段为选开始日、主范围控件两输入框且目标格全部禁用时，可一次先延长结束日，确认并回读该临时范围；然后重新选择目标单日。受控URL更新仍仅限初始已核对日期和本次目标日，商品身份/其它筛选/路径/hash不放宽。临时范围不写账户或链接数据，最终仍需主日期和URL单日一致。日期格每阶段隐藏时最多等待1.2秒再判断，整体120步上限保持。targetCandidates记录最多6个日期候选样例；activeControl仅表示主日期输入框焦点索引。

0.12.21：开始日目标被禁用时，先用主控件Escape/失焦和body外部点击事件关闭旧日历，确认所有已识别弹层消失后才重新打开，优先于0.12.20的结束日扩展。主日期打开失败同样仅在尚未选择日期的start阶段尝试一次关闭恢复，不对end阶段丢弃已选开始日。每次日期状态最多一次；驱动原有两轮calendar-not-open恢复仍有限。关闭未生效明确calendar-close-failed。没有点击临时其它日期，没有改变URL白名单和最终单日校验。diagnostics.dateSelection.calendarReset记录尝试与原因。
