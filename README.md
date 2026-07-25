# 📚 dg-ai-notes

> 冬瓜的 AI 学习笔记 · 当前重点：[Pi](https://pi.dev) coding agent 深度教程

---

## 🤔 Pi-Agent 是什么？为什么要学它？

[**Pi**](https://github.com/earendil-works/pi) 是 Mario Zechner 开源的终端 coding agent，同时提供可独立复用的模型调用、Agent 循环和终端 UI 包。

这套笔记不把 Pi 当成“所有 Agent 的标准答案”，而把它当成一个边界清楚、源码可读的工程样本：哪些机制属于模型适配层，哪些属于通用 Agent Loop，哪些又是 coding-agent 的产品选择。

> **版本口径**：教程严格对应 Pi **v0.80.2**，源码引用固定到发布提交 [`0201806`](https://github.com/earendil-works/pi/tree/0201806adfa825ab3d7957a4267d46e5030fd357)。后续版本的目录和职责可能已经变化。

**核心能力**：

- 🔄 **Agent Loop** —— 模型循环调用、继续与停止信号、错误边界
- 🛠️ **工具系统** —— 查找、参数准备、校验、调用前钩子、执行与结果编码
- 💬 **消息系统** —— 内部消息先投影为 pi-ai 的 3 种统一 Message，再由 Provider 适配器翻译
- 📡 **事件驱动** —— 可等待的生命周期事件用于观察，产品扩展钩子负责控制
- 🗂️ **会话管理** —— Session Tree 让对话可存储、可恢复、可分叉
- 🧩 **扩展机制** —— 工具、事件和产品层扩展点如何组合

**谁该学**：

- 想用 pi-agent SDK 自己搭 Agent 的开发者
- 想理解 coding agent 内部如何运转的工程师
- 不满足于"会用 Claude Code"，想看懂 Harness 设计的好奇心党

---

## 📖 本教程：10 章拆解一个 Coding Agent

10 章系统拆解 Pi v0.80.2 的源码设计与实现。每一章依次回答：**要解决什么问题**、**源码如何实现**、**边界与取舍是什么**。

```
ch01 开篇总览    →  ch02 三层架构   →  ch03 Agent Loop  →  ch04 模型调用  →  ch05 工具系统
                                                                       ↓
ch06 消息系统    →  ch07 事件驱动   →  ch08 上下文工程  →  ch09 上下文压缩  →  ch10 会话管理
```

每一章都提供 **TypeScript 版**（与 Pi 原作同语言）和 **Python 版**（方便只熟悉 Python 的读者）双版本对照。

---

## 📚 三种阅读方式

| 方式 | 入口 | 适合场景 |
|------|------|----------|
| 🌐 **Web 在线版**（推荐） | https://yulongq-dg-ai-notes.pages.dev | PC 端沉浸式阅读，三栏布局 + 配图联动 + 主题切换 |
| 📥 **Markdown 下载版** | [pi-agent/docs/](./pi-agent/docs/) | 下载到本地，配合 AI（Claude / Cursor / 等）边读边问、对照源码 |
| 📕 **PDF 版** | [v1.0 Release](../../releases/tag/v1.0) | 离线阅读、打印、长期存档 |

> TS 版路径：[pi-agent/docs/typescript/](./pi-agent/docs/typescript/)
> Python 版路径：[pi-agent/docs/python/](./pi-agent/docs/python/)

---

## 🧪 补充材料：Agent Loop Notebook

[notebooks/agent-loop.ipynb](./pi-agent/notebooks/agent-loop.ipynb) 是第 3 章 Agent Loop 的可执行实验场，可以单步运行、改参数、观察 loop 状态。

> ⚠️ 本教程主体为"阅读型"，配套实验代码（L00-L31 课程实战）暂未公开。Notebook 仅作 Agent Loop 章节的补充实验场。

---

## 🗺️ 内容地图

详见 [Pi-Agent 教程 README](./pi-agent/README.md)。

---

## 🤝 贡献

发现 typo / 内容错误？欢迎：

- 提 [Issue](../../issues)（建议用「内容勘误」模板）
- 直接发 PR 修

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 📜 License

- **代码**：[MIT](./LICENSE)
- **文档**：[CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/)（要求演绎作品同样开源，保护教程不被商业站抓走洗稿）

---

## 👋 关于作者

大家好，我是**冬瓜**，一个热衷于拆解 AI 工程的博主

如果你觉得内容有帮助，欢迎来我的社交账号找我玩，一起交流 AI / Agent / LLM 的工程实践——

<table>
  <tr>
    <td width="50%" align="center">
      <img src="./assets/donghua-douyin-qr.png" alt="冬瓜的抖音二维码" width="220" />
      <br /><sub><b>抖音 · 冬瓜</b></sub>
      <br /><sub>AI 技术科普 · 源码拆解</sub>
    </td>
    <td width="50%" align="center">
      <img src="./assets/donghua-bilibili-qr.jpg" alt="冬瓜的 B 站二维码" width="220" />
      <br /><sub><b>B 站 · 冬瓜</b></sub>
      <br /><sub>长视频教程 · 直播 coding</sub>
    </td>
  </tr>
</table>


---

## 🙏 Acknowledgments

- [Pi-Agent](https://github.com/earendil-works/pi) 官方团队 —— 没有他们的开源，就没有这本笔记
- 所有引用的开源项目作者
