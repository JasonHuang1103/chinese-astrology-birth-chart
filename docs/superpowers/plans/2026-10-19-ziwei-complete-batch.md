# 紫微斗数规则修正与分层批量输出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修复闰月晚子日界不一致，输出全部十二大限及其间流年、实际农历月份的关联JSON，并建立有独立出处的对照测试。

**Architecture:** 在现有排盘适配层统一晚子有效日期，保留原始出生信息。批量模块复用单层运限接口，以生成器逐份输出共享本命和分层文档；CLI在临时目录完成后发布至新目录，清单记录引用和校验值。

**Tech Stack:** Node.js CommonJS、iztro 2.5.8、lunar-typescript、node:test。

**Spec:** `docs/audits/2026-10-19-ziwei-capability-audit.md` 及用户本次明确的继续实施指示。

## Global Constraints

- 保持现有默认流派和九干相容的四化表；壬干等异文明确注明，不暗中混表。
- 晚子 `forward` 采用整日推进后统一计算年月日；`current` 使用当日子时。保留真太阳时原日期、晚子索引与显示标签，另记录实际计算日期。
- `batch` 从实际出生时刻覆盖至第十二大限结束后的春节；十二段大限全部输出，不能受无关小限120岁表限制。
- 年月周期按既有运限民用历日、春节与农历月界。闰月单独成文件，前后半月分别记录盘面与有效区间。
- 区间为UTC半开区间；记录当地边界标签与解析方式。缺失午夜取之后第一个存在的分钟，重复午夜取第一次。
- 仅支持批量年界、运限界和虚岁为 `normal` 的配置；不支持的配置明确拒绝。
- 不读取个人命盘，不覆盖已有导出，不上传生辰。沿用当前工作区已有修改，不提交用户数据。

## Review Focus

1. 闰月十五／十六、闰月末、普通月末及春节晚子必须使用同一有效年月日。
2. 真太阳时跨春节、出生晚于月中、童年未起大限必须保留有效区间及明确无大限引用原因。
3. 第十二限121–125岁尾部有真实大限／年／月数据，不能因小限缺项而丢失。
4. 闰月两段与正常月份不重叠、不漏段；自然周期与出生裁切分开。
5. 出口文件引用、哈希、确定性身份与失败清理正确，非空或已存在目录不得被替换。

## Task 1: 统一晚子有效日期与独立规则依据

**Files:** `src/ziwei.js`、`test/ziwei-late-zi.test.js`、`docs/references/ziwei-late-zi-convention.md`。

**Interfaces:** `createZiweiChart(input) -> { document, astrolabe }`；原有 `generateZiweiChart(input)` 保留。

- [x] 用HKO日期、安命身／纳音／起紫微规则固定七对晚子与次日早子预期，先运行失败。
- [x] 安星前将 `forward` 的晚子转换为次日早子；其余规则统一用该日期，原显示时间保持。
- [x] 记录 `chart.lunar_date_details`、`chart.calculation_lunar_date_details` 与有效计算日期／索引。
- [x] 运行晚子、既有本命及运限测试；修复差异不得用生产结果反填独立预期。

## Task 2: 单层运限与明确的民用周期边界

**Files:** `src/time.js`、`src/ziwei-horoscope.js`、相应测试。

**Interfaces:** `resolveCivilInstant({date,time,timeZone})` 返回当地日期、时间、UTC时刻与偏移；`resolvePeriodBoundary(date,timeZone)` 返回带解析政策的首个有效边界；`generateZiweiScopes(astrolabe,input,scopeNames)` 返回仅所选层的运限结构。

- [x] 测试同日午夜、DST午夜跳跃／重复、Apia跳过整日及出生时间严格校验。
- [x] 测试只请求大限／流年／流月时，121岁后有效层不会被小限拦截。
- [x] 将固定六层遍历改为请求层遍历；原 `generateZiweiHoroscope` 仍请求全部六层。
- [x] 不改变现有运限年／月民用日期基准；明确它与出生真太阳校时的区别。

## Task 3: 全生命周期分层文档

**Files:** `src/ziwei-batch.js`、`test/ziwei-batch.test.js`。

**Interfaces:** `generateZiweiBatch(input)` 是生成器，逐份产生 `{path,document}`，最后产生 `manifest.json`。

- [x] 先写12限完整性、末限尾段、农历年／月覆盖、闰月裁切与引用测试并观察失败。
- [x] 输出 `natal.json`、`decadals/01.json` 至 `12.json`、`years/<year>.json`、`months/<year>-<month>[-leap].json`。
- [x] 每个层文档带 `chart_id`、`layer_id`、自然与有效区间、相对 `natal_ref` 及适用父层引用；出生前片段不得有效输出。
- [x] 清单列文件、层级、区间、SHA-256与规则。身份不包含输出目录或当前生成时间；哈希按实际格式化JSON字节计算。
- [x] 真太阳校正跨春节产生的初始虚岁0，允许年／月盘但明确无大限上下文原因，不能伪造童限。

## Task 4: CLI安全写盘与使用说明

**Files:** `src/chart.js`、`bin/ziwei-json.js`、`src/ziwei-batch-writer.js`、CLI测试、README与AGENTS。

- [x] 新增 `--ziwei-output batch --output-dir PATH`；不接受与快照目标时间混用，也不接受八字批量。
- [x] 用临时目录完成生成和引用／哈希检查后发布到新目标；已有目录明确拒绝；失败只清理本次暂存目录。
- [x] 标准输出仅一个可解析的清单／结果摘要JSON；原本命与快照行为保留。
- [x] 测试真实CLI文件数量、哈希、引用、末限、无覆盖及错误清理。

## Task 5: 独立对照、完整性及交付

**Files:** `test/fixtures/ziwei-independent-reference.json`、独立对照测试、README、审计后续报告。

- [x] 以HKO历表及《全书》原规则手工固定十个非争议生辰，覆盖五局、140个绝对主星位置和主要辅曜；明确表异文。
- [x] 测试已定义星曜库存、亮度值来源／空值语义、四化及引用，不宣称所有流派都有同一完整清单。
- [x] 运行 `npm test` 和适用的生命周期扫描，独立审查全部新差异，修复实质问题。
- [x] 更新现状与命令、实际验证范围及剩余天文近似限制。

## Execution ledger

- 已授权：用户明确要求按核查报告继续实现，无新增发布或提交要求。
- 本轮选择：维持当前默认四化表；古籍壬科异文以来源记录而非改表处理。
- 本轮选择：共享本命加关联分层文件，避免每个月重复整份本命；清单与相对引用保证可独立定位。
- 本轮选择：现有快照保持完整六层语义；批量仅请求本层，从而覆盖末大限尾部。
