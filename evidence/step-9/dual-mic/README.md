dual-mic.ts 源码归档（S9 产物）。

dual-mic.ts 只含接口/类型声明 + `throw new Error("not implemented: dual mic reserved for v2.1")` 占位。

运行时调用链：
- 无 getUserMedia 调用
- 无 AudioWorkletNode 调用
- 无 Web Audio API 扩展

所有 4 个公开方法签名完整，但运行时必抛。v2.1 实现后替换。

GT 范围：GT31-39 na（D-04 裁决），GT40-41 not_run（无端侧模型）
