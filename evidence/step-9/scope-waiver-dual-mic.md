# D-04 裁决 · 双麦只留接口不实现

> 来源：推进计划 §1.1 D-04 | 签字：S0 裁决定稿 | 实施：S9

## 裁决

| 项 | 内容 |
|---|---|
| 编号 | D-04 |
| 主题 | 双麦接口 |
| 裁决结论 | **只留接口，文档明确「未实现」**；GT31–GT39 标 N/A（不适用），不是失败 |
| 影响编号 | M02、M08；GT31–39（N/A）、GT40–41（not_run）；F07、F09 |
| 生效文件 | `src/audio/dual-mic.ts`（仅接口/类型）；无 getUserMedia/AudioWorkletNode 调用 |

## 实施

- `src/audio/dual-mic.ts` — 4 处 `throw new Error("not implemented: dual mic reserved for v2.1")` + 1 处 TODO
- 无 `getUserMedia` / `AudioWorkletNode` 调用（grep 全仓库 0 命中）
- `evidence/step-9/gt-scope.md` — GT 范围说明
- `evidence/step-9/dual-mic.ts.txt` — dual-mic.ts 源码归档

## GT 范围（S9 signoff 确认）

| GT | 结论 | 原因 |
|---|---|---|
| GT31–GT39 | **na**（9 条） | D-04 双麦未实装，一个都不能写 pass |
| GT40–GT41 | **not_run + waiver**（2 条） | 无端侧模型；必须有 waiver 才能 not_run |

## 约束

- 禁止把 GT31–39 写成 pass
- 禁止用双麦推 SPL
- 禁止把未探测的第二麦当「已启用」
- 禁止把模型文件打进 APK（`.gguf` 0 命中）
