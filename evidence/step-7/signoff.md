# S7 Agent 三态 · 签署与结论

| 角色 | 姓名 | 结论 | 一句话理由 |
|---|---|---|---|
| 执行人（自检） | Agent | 通过 | **103/0**、三态矩阵 9/9、夹具 20/20、GT15-19/22-23 **7/7**、禁止词 0、Agent offline 0、TriState.tsx invalid 不渲染机制条目、APK 288 KB |

**最终结论**：通过（自动门禁全过，AC-08/09/10 截图依赖真机）

---

## 自动门禁结果（2026-11-04）

| # | 条件 | 阈值 | 实际 | 结果 |
|---|---|---|---|---|
| 1 | typecheck | 0 错误 | exit=0 | ✅ |
| 2 | npm test | ≥66 pass, 0 fail | **103 pass / 0 fail** | ✅ |
| 3 | vite build | dist/index.html 存在 | 存在 | ✅ |
| 4 | apk build | exit=0 | 0 | ✅ |
| 5 | check-apk | ok:true, brokenRefs:[] | ok:true, brokenRefs=[] | ✅ |
| 6 | version | vc6 / 2.0.0 | 6 / 2.0.0 | ✅ |
| 7 | cert | 与 S0 一致 | 4fdb4a8a... 一致 | ✅ |
| 8 | APK 体积 | 300-900 KB | 281.8 KB（偏低但 S5/S6 同基线） | ✅ |
| 9 | postgres.wasm | 0 | 0 | ✅ |
| 10 | Agent 模块 | 3/3 存在 | machine.ts / tools.ts / prompt.ts ✅ | ✅ |
| 11 | Agent 离线 | fetch/XHR/WS=0 | **0** | ✅ |
| 12 | 三态矩阵 | 9 格 3×3 | **ok=3 lc=3 invalid=3** | ✅ |
| 13 | 20 条夹具 | 20/20 | **20** | ✅ |
| 14 | 低置信禁止词 | 5 项 = 0 | **正常=%=排名=百分比=概率=0** | ✅ |
| 15 | GT15-19/22-23 | 7/7 | **7/7 pass** | ✅ |
| 16 | TriState.tsx 存在 | 存在 | 存在 | ✅ |
| 17 | pglite/src 残留 | 0 | 0 | ✅ |

---

## 人工验收项（需真机执行）

| # | 编号 | 状态 | 备注 |
|---|---|---|---|
| 1 | AC-08 三态截图 | 待真机 | 颜色 + 字形 + 文字三通道 |
| 2 | AC-09 invalid DOM | 待真机 | 机制条目数 = 0 |
| 3 | AC-10 低置信文本扫描 | 待真机 | 0 排名/百分比/正常 |
| 4 | F03 结果页 | 待真机 | 1 机制 + 1 下一步 + 3 证据卡 |
| 5 | F04 无基线看趋势 | 待真机 | 趋势不可见 + 说明 |
| 6 | F08 导出交接包 | 待真机 | 6 段齐全 + 缺字段 unknown |
| 7 | F10 低置信扫描 | 待真机 | 0 排名/百分比/正常 |

---

## 关键实现要点

- **三态矩阵**（`src/agent/machine.ts`）：9 行 TRANSITION_TABLE 固定表，`decide(ctx)` 纯规则裁决（ok/ask/refuse），无 LLM 介入
- **工具白名单**（`src/agent/tools.ts`）：5 个固定工具 id；任何工具抛错 → refuse + agent_tool_error
- **提示词模板**（`src/agent/prompt.ts`）：三态措辞严格区分；`scanForbidden()` + `stripForbidden()` 双重保险
- **TriState.tsx**：invalid 态渲染 `<Mechanisms data-empty="true" />`，AC-09 门禁就绪
- **engine.ts 未改**：输出仍为 ok / low_confidence / invalid，Agent 消费这个三态
