# Pi v0.80.2 源码笔记：Python 伪代码版

本目录与 [TypeScript 版](../typescript/) 共享同一份事实、章节结构和插图，只把 TypeScript 示例改写成便于 Python 读者理解的伪代码。

> **重要边界**：Pi v0.80.2 没有可安装的 Python SDK。文中的 `pi_ai`、`pi_agent_core`、`pi_coding_agent` 等 Python import 都是解释性写法；真实字段、类型和行为以文中链接的 TypeScript 源码为准。

## 如何阅读

- 先用 Python 伪代码理解控制流，再对照代码块注释中的原始 TypeScript。
- 把 `asyncio.gather`、`Protocol`、`dataclass` 等视为概念映射，而不是 Pi 的公开 Python API。
- 涉及精确签名、Provider 协议或持久化格式时，以固定到发布提交 [`0201806`](https://github.com/earendil-works/pi/tree/0201806adfa825ab3d7957a4267d46e5030fd357) 的源码链接为准。

## 同步规则

TypeScript 版是正文的唯一来源。维护者运行：

```bash
cd pi-agent/web
# 如果 TypeScript 示例有变化，先逐块更新 Python 翻译，然后接受审阅锁
npm run accept:python-translations
npm run sync:content
npm run check:sync
```

同步脚本会保留本目录中与 TypeScript 代码块一一对应的 Python 翻译片段，同时更新正文、Web MDX 和插图副本。正文事实只在 TypeScript 版修改；Python 翻译片段仍是人工维护的内容。只有 TypeScript 示例发生变化时才需要运行 `accept:python-translations`；运行前必须先逐块复核对应翻译。审阅锁能发现示例变化，但不能代替语义核对。

章节入口见上一级 [Pi-Agent 教程 README](../../README.md)。
