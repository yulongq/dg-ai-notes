# 第2章：三层架构 —— Pi-Agent 项目的骨骼

> **Python 阅读说明**：本版与 TypeScript 版共享同一份事实与正文结构。下列 Python 代码只用于解释 TypeScript 源码的控制流，并非可安装的 Pi Python SDK；字段名和类型以链接的 v0.80.2 TypeScript 源码为准。

> 本章我们站在高处，把 Pi 的整体架构看清楚——代码放在哪里、包之间怎么依赖、类型怎么在层与层之间流转。理解了这幅全景图，后面再钻进任何一个模块都不会迷路。
>
> **校对口径**：目录、依赖和类型均以 Pi **v0.80.2** 的发布提交 [`0201806`](https://github.com/earendil-works/pi/tree/0201806adfa825ab3d7957a4267d46e5030fd357) 为准。本章所说的“三层”是职责与依赖方向，不表示顶层只能 import 相邻一层。

---

## 1. 你打开了一个 Agent 代码库

假设你第一次克隆了 Pi 的代码库，在终端里敲下 `ls`，你会看到这样的目录结构：

```
repo/
├── packages/
│   ├── ai/              ← @earendil-works/pi-ai
│   ├── agent/           ← @earendil-works/pi-agent-core
│   ├── coding-agent/    ← @earendil-works/pi-coding-agent
│   └── tui/             ← @earendil-works/pi-tui
├── package.json         ← 根配置，npm workspaces
└── tsconfig.json
```

v0.80.2 的 `packages/*` 匹配这四个**顶层核心包**。根配置还显式列出了 5 个 coding-agent 扩展示例 workspace，因此这个版本实际配置了 9 个 workspace；上图只画本章讨论的四个核心包。这里必须强调版本：后续提交可能新增、移动或删除包，不能把新版本目录倒推回本教程。

如果你做过 Node.js 项目，大概率用过 monorepo（把多个包放在一个仓库里管理）。Pi 用的就是标准的 npm workspaces 方案——根目录的 `package.json` 以 `"packages/*"` 纳入四个顶层包，并另外列出 5 个更深层的扩展示例目录。

但这不是重点。重点是：**为什么是四个包？它们之间的关系是什么？能不能合并？**

要回答这个问题，我们需要先搞清楚每个包到底在干什么。

---

## 2. 四个包，各管各的

先不要管依赖关系，我们从每个包自己的视角看它在做什么。

### 2.1 pi-ai：管"调模型"

`@earendil-works/pi-ai`（源码在 `packages/ai/`）解决的问题是：**怎么用一套代码调用不同的 LLM？**

它的 `package.json` 里写了这么一行描述：

> "Unified LLM API with automatic model discovery and provider configuration"（统一 LLM API，支持自动模型发现和提供商配置）

具体来说，它做了三件事：

1. **定义统一的类型**：不管你用 OpenAI、Anthropic、Google 还是 AWS Bedrock，消息格式都是一样的——`UserMessage`、`AssistantMessage`、`ToolResultMessage`，模型定义都是 `Model<TApi>`
2. **统一流式调用**：Provider / Models 抽象通过 `streamSimple()` 返回 `AssistantMessageEventStream`，调用方按增量事件消费
3. **配置 30+ Provider**：源码定义了 35 个文本 `KnownProvider` 标识（含区域与产品变体），每个 Provider 通常有自己的工厂与模型目录；它们复用 9 种文本 `KnownApi` 协议实现，而不是各自实现一套协议适配器

你看它的 `index.ts` 导出了什么就知道了：

```python
# ============================================================
# 【Python 改写】packages/ai/src/index.ts 的对外导出（v0.80.x 节选）
# 原文 TS:
#   // 顶部注释明确写：Core only, side-effect free: no generated catalogs,
#   // no provider factories, no api-registry, no OAuth implementations, no compat.
#   // 全局 API 注册表、stream/complete 函数等已迁至 ./compat.ts
#   export type { Static, TSchema } from "typebox";
#   export { Type } from "typebox";
#   export * from "./api/lazy.ts"            // lazyStream / lazyApi 通用懒加载 helper
#   export * from "./auth/context.ts"        // 认证上下文
#   export * from "./auth/credential-store.ts"
#   export * from "./auth/helpers.ts"
#   export * from "./auth/types.ts"
#   export * from "./images-models.ts"
#   export * from "./models.ts"              // Provider / Models 运行时抽象与创建函数
#   ...
#   export * from "./types.ts"               // 消息、Model、Tool、KnownApi、KnownProvider 等基础类型
#   export * from "./utils/event-stream.ts"  // 事件流基类
#   // 旧版全局 stream / streamSimple 函数位于临时兼容入口 ./compat.ts
# ============================================================

# 概念对照：TS 的 `export *` 在 Python 里相当于 `from X import *`，
# TS 的 `export type` 相当于 Python 的 typing 类型别名 / Protocol；
# tbox 的 TypeBox（运行时 schema 校验）在 Python 生态里类比 pydantic / msgspec

from pi_ai.types import Message, Model, Tool, ImageContent
from pi_ai.api import lazy                  # 通用懒加载 helper
from pi_ai.auth import context, credential_store, helpers, types as auth_types
from pi_ai import images_models, models
from pi_ai.utils.event_stream import EventStream

# 旧版全局 stream / stream_simple 位于临时兼容入口 ./compat.ts；
# 新代码通过 Models 实例调用。
# from pi_ai.compat import stream, stream_simple
```

它没有 Agent 循环，也不实现 read、bash、edit 这类可执行的领域工具；但会定义 LLM 请求需要的最小 `Tool` schema。它只管一件事：**把 LLM API 的差异抹平，对外暴露一套统一的接口**。

### 2.2 pi-agent-core：管"通用 Agent runtime"

`@earendil-works/pi-agent-core`（源码在 `packages/agent/`）解决的问题是：**怎么让 LLM 反复思考和行动？**

它的 `package.json` 描述是：

> "General-purpose agent with transport abstraction, state management, and attachment support"（通用 Agent 框架，支持传输抽象、状态管理和附件支持）

关键词是 **"general-purpose"（通用的）**。这个包不知道自己在做编程 Agent、客服 Agent 还是任何具体领域的 Agent。它只知道：

- 怎么维护对话状态（`AgentState`）
- 怎么跑一个"调用 LLM → 执行工具 → 再调用 LLM"的循环（`agentLoop`）
- 怎么在循环过程中发出事件，让外部知道发生了什么（`AgentEvent`）
- 怎么管理会话历史、做上下文压缩（`Session`、`compact`）

看它的 `index.ts` 导出：

```python
# ============================================================
# 【Python 改写】packages/agent/src/index.ts 的对外导出（结构摘要）
# 原文 TS:
#   export * from "./agent.ts"                         // Agent 类
#   export * from "./agent-loop.ts"                    // 循环函数
#   export * from "./harness/agent-harness.ts"         // 高层 Harness
#   export * from "./harness/session/session.ts"       // 会话管理
#   export { compact, /* ... */ } from "./harness/compaction/compaction.ts"
#   export * from "./types.ts"                         // 类型定义
# ============================================================

# 概念对照：Python 用 __init__.py 显式 re-export 来模拟 TS 的 export *
from pi_agent_core.agent import Agent
from pi_agent_core.agent_loop import agent_loop, run_agent_loop
from pi_agent_core.harness.agent_harness import AgentHarness
from pi_agent_core.harness.session import Session          # 会话管理
from pi_agent_core.harness.compaction import compact       # 上下文压缩
from pi_agent_core.types import (
    AgentMessage, AgentTool, AgentEvent, AgentState,
)
```

没有 "read"（读文件）、没有 "bash"（执行命令）、没有 "edit"（编辑代码）。它不关心具体做什么事，只关心"怎么把一个 Agent 跑起来"。

### 2.3 pi-coding-agent：管"具体业务"

`@earendil-works/pi-coding-agent`（源码在 `packages/coding-agent/`）解决的问题是：**怎么做一个编程助手？**

它的 `package.json` 描述是：

> "Coding agent CLI with read, bash, edit, write tools and session management"（编程 Agent CLI，提供读、执行、编辑、写工具和会话管理）

这一层有上百个源文件，远大于 pi-agent-core，整体规模与 pi-ai 和 pi-agent-core 合计相当。因为它知道所有具体的事：

- 7 个编程工具（read、bash、edit、write、grep、find、ls）怎么实现
- 扩展系统怎么加载和运行
- 会话怎么持久化到磁盘
- CLI 怎么解析参数、怎么在终端渲染输出
- 认证信息怎么存储

它的入口是 `cli.ts`，用户在终端输入 `pi` 命令时，就从这里启动：

```python
# ============================================================
# 【Python 改写】packages/coding-agent/src/cli.ts 入口
# 原文 TS:
#   #!/usr/bin/env node
#   import { main } from "./main.ts";
#   // ... 设置进程状态并初始化 HTTP dispatcher
#   main(process.argv.slice(2));
# ============================================================

# 概念对照：TS 的 #!/usr/bin/env node 用 Node 跑；
# Python 入口同样用 shebang 指向 python3，sys.argv[1:] 跳过脚本名；
# 进程状态与网络运行时也应在 main() 之前初始化
#!/usr/bin/env python3
import os
import sys
from pi_coding_agent.http_dispatcher import configure_http_dispatcher
from pi_coding_agent.main import main

if __name__ == "__main__":
    os.environ["PI_CODING_AGENT"] = "true"
    configure_http_dispatcher()
    main(sys.argv[1:])
```

一个简单的入口，背后是一整条启动链路：

```
你输入: pi "帮我改个 bug"
└── cli.ts                  ← 初始化进程与 HTTP 运行时，调用 main()
    └── main.ts             ← 解析参数、选择模式、创建运行时服务
        ├── ResourceLoader  ← 加载扩展与其他资源
        └── createAgentSessionFromServices()
            └── createAgentSession()
                ├── Agent        ← 管理模型、状态与循环
                └── AgentSession ← 包装 Agent，组装工具并绑定扩展
                    └── Agent.prompt()
                        └── runAgentLoop()  ← 核心循环开始
```

### 2.4 pi-tui：管"显示"

最后一个包是 UI 层：

- **pi-tui**：终端 UI 库，负责在终端里渲染 Markdown 与差分内容，并提供可插拔的代码高亮回调；实际的 highlight.js 高亮器由 coding-agent 注入。它的依赖里**没有任何 AI 相关的包**——运行时仅 `marked`（Markdown 渲染）+ `get-east-asian-width`（东亚字符宽度计算）；`chalk`、`@xterm/headless` 在 devDependencies，不打包进运行时

这个包和"Agent 怎么工作"没有直接关系，它只是负责把 Agent 的工作过程展示给用户看。后面的学习中我们不会深入这一层。

---

## 3. 看完四个包，你大概有了直觉

读完上面那一段，你脑子里可能已经有了一个画面：

```
能力职责（从业务到模型）
│
├─ pi-coding-agent：编码产品
│  工具 · 扩展 · CLI · 会话持久化
│
├─ pi-agent-core：Agent 运行时
│  循环 · 状态 · 事件 · 压缩
│
└─ pi-ai：模型层
   统一 API · 流式调用 · Provider 适配

独立 UI 包
└─ pi-tui：终端显示
```

这是一种直观的分层：底层调模型，中间跑循环，顶层做业务。

这张图表达的是**能力职责栈**，不是 `package.json` 的真实依赖图。真实依赖 DAG 会在下一节单独画出，pi-tui 也不依赖 pi-ai 或 pi-agent-core。

但等等——

---

## 4. 打开 package.json，事情没那么简单

> **阅读路径提示**：第 4-5 节是**架构理解进阶**，深入依赖关系和类型流转的细节。第 4 节修正"严格分层"的常见误解、讲清依赖方向——**如果你打算基于 SDK 二次开发，这一节必读**；第 5 节展开三层类型字段递进，更偏类型系统细节，记不住字段不影响后续学习。**只想快速用起来的读者，可以跳过这两节，直接去第 6 节看"分层承诺怎么兑现"。**

如果你的分层理解是"上层只能依赖相邻的下层"，那打开 `packages/coding-agent/package.json` 的 `dependencies` 字段，你会看到一个意料之外的细节：

```json
// packages/coding-agent/package.json
"dependencies": {
    "@earendil-works/pi-agent-core": "^0.80.2",   // ← 依赖中间层，合理
    "@earendil-works/pi-ai": "^0.80.2",            // ← 也直接依赖底层？
    "@earendil-works/pi-tui": "^0.80.2",
    // ... 其他依赖
}
```

coding-agent **直接依赖了 pi-ai**，而不是只通过 pi-agent-core 间接使用它。

如果你之前认为分层就是"隔一层调一层"（就像网络协议栈那样），这个发现会让你愣一下：这不是打破分层了吗？为什么顶层要跨层直接引用底层的东西？

### 答案不只藏在类型系统里

打开 `packages/agent/src/types.ts` 的第一行，你会看到：

```python
# ============================================================
# 【Python 改写】packages/agent/src/types.ts:1-14
# 原文 TS:
#   import type {
#       Api, AssistantMessage, AssistantMessageEvent,
#       AssistantMessageEventStream, Context, ImageContent,
#       Message, Model, SimpleStreamOptions, TextContent,
#       Tool, ToolResultMessage,
#   } from "@earendil-works/pi-ai";
# ============================================================

# 概念对照：TS 的 `import type` 在 Python 里相当于 `from X import Y` 仅用于类型注解；
# Python 用 typing.TYPE_CHECKING 守卫这些纯类型导入，避免运行时循环 import

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from pi_ai import (
        Api, AssistantMessage, AssistantMessageEvent,
        AssistantMessageEventStream, Context, ImageContent,
        Message, Model, SimpleStreamOptions, TextContent,
        Tool, ToolResultMessage,
    )
```

pi-agent-core 的类型定义里，大量基础类型都是从 pi-ai 导入的：`Message`、`Model`、`ImageContent`、`Tool`…… 这些是整个系统的"原子概念"——就像化学元素一样，不管你在哪一层，都需要用到"原子"的定义。

同样，coding-agent 也需要直接用到 pi-ai 的类型。比如用户往聊天里贴了一张截图，coding-agent 需要知道图片数据用什么格式表示——这个 `ImageContent` 类型就定义在 pi-ai 里。

但在 v0.80.2，这个依赖也不只是 type-only：coding-agent 还直接使用 `streamSimple()`、`completeSimple()`、`clampThinkingLevel()`、`modelsAreEqual()` 以及模型注册、OAuth 等 pi-ai 运行时能力。共享类型解释了跨层引用为什么自然，直接调用这些运行时 API 则解释了为什么 `package.json` 必须声明真实依赖。

所以 coding-agent 直接依赖 pi-ai 不是偶然遗漏，而是这个仓库采用的明确设计：共享模型与消息类型放在 pi-ai，需要这些类型或底层运行时能力的上层包可以直接引用它。其他项目也可能通过门面包或重新导出来维持相邻依赖，并非只有这一种分层方法。

### 那分层的规则到底是什么？

关键不在于"能不能跨层引用"，而在于**依赖方向是不是单向的**。

我们来验证一下。只看四个核心包之间的内部依赖：

| 包 | 依赖的其他 pi 包 | 说明 |
|---|---|---|
| pi-ai | 无 | 不依赖其他 pi 包 |
| pi-agent-core | pi-ai | 不依赖 coding-agent 或 pi-tui |
| pi-tui | 无 | 独立 UI 库 |
| pi-coding-agent | pi-ai、pi-agent-core、pi-tui | 真实依赖 DAG 的顶层 |

用一张图表示：

```
pi-coding-agent → pi-agent-core → pi-ai
pi-coding-agent → pi-ai
pi-coding-agent → pi-tui
```

箭头从使用方指向被依赖方，全部由具体层指向更基础的抽象。**底层不知道上层的存在**——pi-ai 不 import pi-agent-core 或 pi-coding-agent，pi-agent-core 也不 import pi-coding-agent。这就是分层的真正规则：**不是限制引用层级，而是让依赖只朝更稳定的抽象流动。**

有人可能会问：那 pi-tui 呢，它也是底层的吗？

pi-tui 的运行时依赖只有 `marked`（Markdown 渲染）和 `get-east-asian-width`（东亚字符宽度），**没有任何 pi-xxx 包**。它不依赖 pi-ai，也不依赖 pi-agent-core。它就是一个独立的终端渲染工具。pi-coding-agent 依赖 pi-tui，把它当工具用，不存在循环依赖。

> 代码来源：各包的 `package.json` 的 `dependencies` 字段。`packages/ai/src/types.ts` 定义了 9 种文本 `KnownApi` 和 35 个 `KnownProvider` 标识（含区域与产品变体），这些是模型注册与适配所用的基础类型。

---

## 5. 类型在层间的流转：从原子到分子

理解了依赖方向之后，下一个问题是：**类型怎么在层与层之间传递？**

还是用化学做类比。pi-ai 定义了"原子"（最基础的类型），pi-agent-core 把原子组合成"分子"（Agent 专用类型），pi-coding-agent 再把分子组合成"材料"（业务专用类型）。

### 第一层：pi-ai 定义原子

```python
# ============================================================
# 【Python 改写】packages/ai/src/types.ts（节选）
# 原文 TS:
#   type Message = UserMessage | AssistantMessage | ToolResultMessage
#   interface Model<TApi> {
#       id: string; name: string; api: TApi;
#       contextWindow: number; // ...
#   }
#   interface Tool<TSchema> {
#       name: string; description: string; parameters: TSchema;
#   }
# ============================================================

# 概念对照：TS 的联合类型 `A | B | C` 在 Python 里用 Union 表达；
# TS 的泛型接口在 Python 用 Generic / TypeVar 表达

from typing import Union, Generic, TypeVar
from dataclasses import dataclass
from typing_any import AnySchema

TApi = TypeVar("TApi")
TSchema = TypeVar("TSchema")

# 最基础的消息类型——所有 LLM 都认的格式
Message = Union["UserMessage", "AssistantMessage", "ToolResultMessage"]

# 模型定义——描述一个 LLM 的全部信息
@dataclass
class Model(Generic[TApi]):
    id: str              # 如 "claude-sonnet-4-6"
    name: str
    api: TApi            # 如 "anthropic-messages"
    context_window: int  # 如 200000
    # ... 更多字段

# 工具定义——描述一个工具的 schema
@dataclass
class Tool(Generic[TSchema]):
    name: str
    description: str
    parameters: TSchema
```

这三个类型——`Message`、`Model`、`Tool`——就是整个 Pi 系统的原子。任何包只要和 LLM 打交道，都必须用到它们。

### 第二层：pi-agent-core 把原子组合成分子

```python
# ============================================================
# 【Python 改写】packages/agent/src/types.ts（节选）
# 原文 TS:
#   import type { Message, Model, Tool, ImageContent, ... } from "@earendil-works/pi-ai";
#   type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]
#   interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
#       label: string;
#       prepareArguments?: (args: unknown) => Static<TParameters>;
#       execute: (toolCallId, params, signal?, onUpdate?) => Promise<AgentToolResult<TDetails>>;
#       executionMode?: ToolExecutionMode;
#   }
# ============================================================

# 概念对照：TS 的 `extends` 接口继承 → Python 用 dataclass 继承；
# TS 的 `?:` 可选字段 → Python 用 Optional + 默认 None；
# TS 的 `Static<TSchema>` （从 schema 反推类型）→ Python 里用 TypeVar + Any 弱化

import abc
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Union
import asyncio

# 扩展消息：除了标准 LLM 消息，还可以有自定义消息
AgentMessage = Union[Message, "CustomAgentMessage"]   # 自定义消息由各上层自行注册

# 扩展工具：除了 schema，还有参数预处理、执行函数和执行模式（types.ts:371-394）
@dataclass
class AgentTool(Tool[TParameters], Generic[TParameters, TDetails]):
    label: str                                                   # 显示名称
    prepare_arguments: Optional[Callable[[Any], Any]] = None    # 参数预处理
    execute: Callable[..., "asyncio.Future[AgentToolResult]"] = None  # 实际执行函数（async）
    execution_mode: Optional[str] = None                         # "sequential" | "parallel"
```

注意两件事：

1. **`AgentMessage` 是 `Message` 的超集**。`Message` 是只有三种标准消息（User/Assistant/ToolResult），`AgentMessage` 在此基础上加入了自定义消息（如压缩摘要、分支信息等）。用 TypeScript 的联合类型（`|`）实现扩展，而不是修改原来的类型定义。
2. **`AgentTool` 继承了 `Tool`**。底层的 `Tool` 只知道"工具叫什么、参数是什么"（这是 LLM 需要知道的信息），上层的 `AgentTool` 加上了"怎么执行、串行还是并行"（这是 Agent 循环需要知道的信息）。

### 第三层：pi-coding-agent 把分子组合成材料

到了 coding-agent 层，类型变成了具体的业务定义：

```python
# ============================================================
# 【Python 改写】packages/coding-agent/src/core/extensions/types.ts:435-482（节选）
# 原文 TS:
#   interface ToolDefinition<TParams extends TSchema, TDetails, TState> {
#       name: string; label: string; description: string;
#       promptSnippet?: string; promptGuidelines?: string[];
#       parameters: TParams; renderShell?: "default" | "self";
#       prepareArguments?: (args: unknown) => Static<TParams>;
#       executionMode?: ToolExecutionMode;
#       execute: (toolCallId, params, signal, onUpdate, ctx) => Promise<AgentToolResult<TDetails>>;
#       renderCall?: ...;
#   }
#   interface Extension {
#       path: string; resolvedPath: string; sourceInfo: SourceInfo;
#       handlers: Map<string, HandlerFn[]>;
#       tools: Map<string, RegisteredTool>;
#       messageRenderers: Map<string, MessageRenderer>;
#       commands: Map<string, RegisteredCommand>;
#       flags: Map<string, ExtensionFlag>;
#       shortcuts: Map<KeyId, ExtensionShortcut>;
#   }
#
# 注意：ToolDefinition 在 TypeScript 层面是独立 interface 重新声明；
# 它与 AgentTool 共享核心字段，但 execute 多一个必填 ctx 参数，
# 未经 wrapToolDefinition() 不能直接作为 AgentTool（详见 types.ts:435）
# ============================================================

# 概念对照：TS 的 Map<K,V> → Python 的 dict[K, V]；TS 的 Record<K,V> 同理
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

@dataclass
class ToolDefinition:
    # 工具定义（产品视角）——完整接口有 10+ 个字段，下面列出关键字段
    # 注意：在 TS 源码中是独立 interface，不是 AgentTool 的子类型；
    # 注册时需要显式 wrapper 绑定 ExtensionContext
    name: str
    label: str                                       # UI 展示名
    description: str
    prompt_snippet: Optional[str] = None             # 自动拼到 system prompt 的工具片段
    prompt_guidelines: Optional[List[str]] = None    # 工具使用守则
    parameters: Any = None
    render_shell: Optional[str] = None               # "default" | "self"
    prepare_arguments: Optional[Callable[[Any], Any]] = None  # 参数预处理钩子
    execution_mode: Optional[str] = None             # 并行/串行
    execute: Optional[Callable[..., Any]] = None     # 签名扩展：比 AgentTool.execute 多 ctx 参数
    # ... 还有渲染器、UI 组件等业务属性

@dataclass
class Extension:
    # 扩展定义（运行时聚合体，types.ts:1585-1595）
    path: str
    resolved_path: str                                # 解析后的绝对路径
    source_info: Any                                  # 来源信息
    handlers: Dict[str, List[Any]] = field(default_factory=dict)   # 各类处理器
    tools: Dict[str, Any] = field(default_factory=dict)            # 注册的工具（dict，非 TypedDict）
    message_renderers: Dict[str, Any] = field(default_factory=dict)
    commands: Dict[str, Any] = field(default_factory=dict)         # 注册的命令
    flags: Dict[str, Any] = field(default_factory=dict)            # 扩展标志
    shortcuts: Dict[str, Any] = field(default_factory=dict)        # 快捷键绑定
```

### 类型扩展的 Before → After 对照

把三层类型变化放到一起看。下面是两种语言版本共用的职责示意，不是可编译代码：

```text
pi-ai · Tool：描述工具"长什么样"
├─ name
├─ description
└─ parameters
   │
   └─ AgentTool extends Tool

pi-agent-core · AgentTool：增加"怎么执行"
├─ label
├─ execute
└─ executionMode

pi-coding-agent · ToolDefinition：增加"怎么显示"
├─ 独立声明共享核心字段，不 extends AgentTool
├─ 增加 prompt、渲染器和 ExtensionContext
└─ wrapToolDefinition() 显式转换为 AgentTool
```

这里是**职责递进**，不是三次字面继承：`AgentTool extends Tool`；`ToolDefinition` 则独立声明，并由 `wrapToolDefinition()` 显式转换为 `AgentTool`。它的 `execute` 多一个必填 `ExtensionContext` 参数，未经 wrapper 不能直接作为 `AgentTool`。底层类型不需要知道上层字段——pi-ai 的 `Tool` 没有 `execute`，因为 LLM 只需要工具描述与参数 schema。

![三层类型递进扩展](assets/260702-ch02-type-progression.svg)

**配图说明**：三列对比 Tool / AgentTool / ToolDefinition 的字段与职责——LLM 关心"长什么样"，Agent 关心"怎么执行"，coding-agent 关心"怎么显示"。这里的递进不等于三次继承：`AgentTool extends Tool`，而 `ToolDefinition` 独立声明共享字段，再由 wrapper 转成 `AgentTool`。底层可独立发布复用，是分层架构的核心承诺。

> 代码来源：`packages/ai/src/types.ts:15-24`（`KnownApi`）、`packages/ai/src/types.ts:32-67`（`KnownProvider`）、`packages/agent/src/types.ts:1-14`（从 pi-ai 导入基础类型）、`packages/coding-agent/src/core/extensions/types.ts:435-482`（`ToolDefinition`）与 `:1585-1595`（`Extension`）。`packages/coding-agent/src/core/extensions/index.ts` 只负责重新导出这些类型。

---

## 6. 那我写 Agent 真的需要三层吗？

到这里，三层架构看起来很优雅。但如果你只是一个开发者，想写一个简单的 Agent——比如一个只会用 OpenAI、只需要一两个工具的 Agent——真的需要搞三层吗？

来看一下不分层会怎样。

### 场景 A：不分层，所有代码放一个文件

你写了一个 Agent，循环逻辑和 OpenAI SDK 调用写在一起：

```python
# ============================================================
# 【Python 改写】假设：不分层的 Agent
# 原文 TS:
#   import OpenAI from "openai";
#   const client = new OpenAI();
#   const messages = [];
#   while (true) {
#       const response = await client.chat.completions.create({
#           model: "gpt-4o", messages,
#       });
#       // 解析工具调用、执行、追加到 messages ...
#   }
# ============================================================

# 概念对照：直接拿 OpenAI SDK 跑循环，没有抽象层

from openai import OpenAI

client = OpenAI()
messages = []

while True:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
    )
    # 解析工具调用、执行、追加到 messages ...
```

能用。但如果你想换成 Claude，你得改 Agent 循环里的调用代码。循环逻辑和模型 API 耦合了。

### 场景 B：只分两层（去掉 coding-agent 层）

用 pi-ai + pi-agent-core，不引入 coding-agent：

```python
# ============================================================
# 【Python 改写】只用底层 + 中间层
# 原文 TS:
#   import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
#   import { builtinModels } from "@earendil-works/pi-ai/providers/all";
#
#   const models = builtinModels();
#   const model = models.getModel("anthropic", "claude-sonnet-4-5");
#   if (!model) throw new Error("model not found");
#
#   declare const myTools: AgentTool[];
#   const agent = new Agent({
#       initialState: { model, tools: myTools },
#   });
#   await agent.prompt("帮我分析这段日志");
# ============================================================

# 概念对照：从两个包分别 import；模型和工具在构造 Agent 时进入初始状态

from pi_agent_core import Agent, AgentTool
from pi_ai.providers.all import builtin_models

models = builtin_models()
model = models.get_model("anthropic", "claude-sonnet-4-5")
if model is None:
    raise LookupError("model not found")

my_tools: list[AgentTool] = build_my_tools()
agent = Agent(initial_state={"model": model, "tools": my_tools})
await agent.prompt("帮我分析这段日志")
```

完全可行。pi-agent-core 不知道什么是 "read" 工具、什么是 "bash" 工具——它只定义了工具的接口规范（`AgentTool`），具体注册什么工具由你决定。你甚至可以不注册任何工具，让它纯聊天。

**这说明 coding-agent 层不是必须的。** 它的上百个文件是在 pi-agent-core 的基础上"添砖加瓦"——加了编程专用的工具、CLI 界面、扩展系统。如果你的 Agent 不是编程助手，你完全可以用 pi-agent-core 搭配自己写的工具。

### 场景 C：只用一层（只用 pi-ai）

```python
# ============================================================
# 【Python 改写】只用底层；从 Provider / Models 入口调用，不依赖 Agent
# 原文 TS:
#   import type { Context } from "@earendil-works/pi-ai";
#   import { builtinModels } from "@earendil-works/pi-ai/providers/all";
#
#   const models = builtinModels();
#   const model = models.getModel("anthropic", "claude-sonnet-4-5");
#   if (!model) throw new Error("model not found");
#
#   const context: Context = {
#       messages: [{ role: "user", content: "Hello!", timestamp: Date.now() }],
#   };
#
#   const stream = models.streamSimple(model, context);
#   for await (const event of stream) {
#       console.log(event);
#   }
# ============================================================

# 概念对照：创建内置 Provider 集合，从 Models 实例发起流式调用并自己消费事件

import time
from pi_ai.providers.all import builtin_models

models = builtin_models()
model = models.get_model("anthropic", "claude-sonnet-4-5")
if model is None:
    raise LookupError("model not found")

context = {
    "messages": [
        {"role": "user", "content": "Hello!", "timestamp": int(time.time() * 1000)}
    ]
}
stream = models.stream_simple(model, context)
async for event in stream:
    print(event)
```

也完全可以。pi-ai 自己就是一个独立的包——调用 LLM、流式返回结果，不需要任何 Agent 框架。上例用 `builtinModels()` 一次注册内置 Provider；如果只需要少数 Provider，也可以用 `createModels()` 配合具体的 Provider factory。v0.80.2 还保留了 `@earendil-works/pi-ai/compat`，但源码明确把它标为临时兼容入口，不适合新代码继续依赖。

但你就得自己写循环、自己管理消息状态、自己处理工具调用。这正是 pi-agent-core 存在的意义——`Agent` 帮你处理循环、状态、工具执行和事件；这个包还另外提供 `Session`、compaction primitives 和更高层的 `AgentHarness`。如果只使用 `Agent`，上下文压缩仍需通过 `transformContext` 或 Harness 显式接入。

### 三层不是教条，依赖方向控制才是

上面的三个场景说明：

| 场景 | 适合什么 | 你自己做什么 |
|------|---------|------------|
| 只用 pi-ai | 只需要调 LLM、不需要 Agent 循环 | 自己管状态、自己写循环（如果需要） |
| pi-ai + pi-agent-core | 需要完整 Agent 能力、但有自己独特的业务场景 | 写自己的工具、自己的入口 |
| 全部三层 | 做 Pi 同类的编程助手 | 直接用，或写扩展 |

层数取决于你的复杂度。但无论几层，有一条规则不能违反：

**底层的代码里不能出现任何对上层的引用。**

pi-ai 不能 import pi-agent-core 的任何东西。pi-agent-core 不能 import pi-coding-agent 的任何东西。这条规则降低了替换一层时的影响面，但不代表任意实现都能无缝替换：只有新实现保持原层的公开契约，或通过 adapter / package alias 提供兼容接口时，上层业务代码才可能不改；API 不兼容时，上层 import 和调用点仍然需要调整。

---

## 7. 三个可以带走的方法

从 Pi 的分层设计里，我提炼出三个在你自己的 Agent 项目中可以复用的方法。

### 方法 1："依赖漏斗"分层法

**是什么**：设计包结构时，先画依赖箭头。底层是"不知道外面世界的"，中间层是"知道底层但不知道业务的"，顶层是"知道一切的"。

**怎么做**：
1. 找出只依赖本层稳定契约、最少感知外部系统的部分 → 放底层
2. 找出"依赖底层但不知道具体业务"的部分 → 放中间层
3. 找出"知道用户要什么"的部分 → 放顶层
4. 检查：如果有任何高层的东西被底层 import，说明分层有问题

**怎么验证**：问自己"去掉上层，这一层还能跑吗？"如果能，依赖方向正确。如果不能，上层的东西泄漏到了下层。

### 方法 2："类型递进扩展"模式

**是什么**：底层定义最小接口，上层可以用联合类型、继承、组合或结构兼容扩展职责，而不是反向修改底层。

**怎么做**：
1. 底层定义原子类型（如 `Tool = { name, description, parameters }`）
2. 中间层可用继承扩展（如 `AgentTool extends Tool`，加上 `execute`）
3. 顶层按边界选择组合或独立声明（如共享核心字段的 `ToolDefinition`，再由包装函数显式适配）
4. 每一层只加自己关心的事，不改底层

**好处**：底层可以独立发布和复用。别人可以只引用你的底层类型，不引入整个 Agent 框架。

### 方法 3："可独立使用"测试

**是什么**：每层设计完后，做一个简单测试——去掉上层，这一层还能不能正常工作？

Pi 的三层都能通过这个测试：
- 去掉 pi-agent-core 和 pi-coding-agent，pi-ai 可以独立调用 LLM
- 去掉 pi-coding-agent，pi-ai + pi-agent-core 可以跑一个自定义 Agent
- 三层全用，就是一个完整的编程助手

**怎么做**：在你的 `package.json` 里，试着暂时移除上层的依赖，看看底层包的编译和测试还能不能通过。如果报错了，说明你的底层泄漏了对上层的依赖。

---

## 8. 下一步：钻进 Agent 的心脏

这一章我们从外面看了一眼 Pi 的整体架构。你知道了：

- 从能力职责看，Pi 分三层：pi-ai（管模型）→ pi-agent-core（管通用 Agent runtime）→ pi-coding-agent（管业务）；pi-tui 是正交的 UI 能力
- 从实际依赖看，箭头由使用方指向被依赖方；所有依赖都流向更基础的包，底层对上层一无所知
- 类型职责从底层到顶层逐步增加：`Tool` → `AgentTool` → `ToolDefinition`；最后一步由 wrapper 显式适配，不是继承链
- 三层不是必须的，层数取决于你的复杂度；但依赖方向控制是必须的

但我们还没有回答一个更根本的问题：Agent 到底是怎么跑起来的？LLM 怎么反复思考、调工具、看结果、再思考？那个著名的"Agent Loop"到底长什么样？

下一章，我们钻进 Agent 的心脏——**Agent Loop**。我们会先理解为什么需要 Loop（而不是一次调用就完事），然后追踪一条用户消息从按下回车到 Agent 说"我完成了"的完整旅程。

---

> **本教程结构说明**：前 6 章（第1章开篇→第6章消息系统）建立对 Pi-Agent 核心机制的完整理解，建议按顺序通读。第 7 章起（事件驱动、上下文工程、上下文压缩、会话管理等）进入进阶工程议题，每章相对独立，可按需跳读。
