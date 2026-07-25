import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const piRoot = resolve(scriptDir, "..");
const typescriptDir = join(piRoot, "docs", "typescript");
const pythonDir = join(piRoot, "docs", "python");
const webModulesDir = join(piRoot, "web", "src", "content", "modules");
const webAssetsDir = join(piRoot, "web", "public", "assets");
const sourceAssetsDir = join(typescriptDir, "assets");
const pythonAssetsDir = join(pythonDir, "assets");

const PI_COMMIT = "0201806adfa825ab3d7957a4267d46e5030fd357";

const chapters = [
  {
    file: "第1章-开篇-Pi-Agent框架总览.md",
    slug: "ch01-overview",
  },
  {
    file: "第2章-三层架构-Pi-Agent项目的骨骼.md",
    slug: "ch02-three-layer-arch",
  },
  {
    file: "第3章-Agent-Loop-让模型转动起来的引擎.md",
    slug: "ch03-agent-loop",
  },
  {
    file: "第4章-模型调用-一行代码驾驭多个模型.md",
    slug: "ch04-model-call",
  },
  {
    file: "第5章-工具系统-Agent的手脚是怎么被管住的.md",
    slug: "ch05-tools",
  },
  {
    file: "第6章-消息系统-Agent的记忆如何组织与传递.md",
    slug: "ch06-messages",
  },
  {
    file: "第7章-事件驱动-Agent的神经系统.md",
    slug: "ch07-event-driven",
  },
  {
    file: "第8章-上下文工程-让有限窗口装下无限对话.md",
    slug: "ch08-context-engineering",
  },
  {
    file: "第9章-上下文压缩-当对话太长怎么办.md",
    slug: "ch09-compaction",
  },
  {
    file: "第10章-会话管理-对话的存储恢复与分叉.md",
    slug: "ch10-session",
  },
];

const pythonReadingNote =
  "> **Python 阅读说明**：本版与 TypeScript 版共享同一份事实与正文结构。下列 Python 代码只用于解释 TypeScript 源码的控制流，并非可安装的 Pi Python SDK；字段名和类型以链接的 v0.80.2 TypeScript 源码为准。";

const fencePattern = /^```([^\n]*)\n[\s\S]*?^```[ \t]*$/gm;
const typescriptFencePattern = /^```typescript(?:[^\n]*)\n[\s\S]*?^```[ \t]*$/gm;

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

function readText(path) {
  return normalizeNewlines(readFileSync(path, "utf8"));
}

function getTranslatedBlocks(markdown, chapterFile) {
  const blocks = [...markdown.matchAll(fencePattern)]
    .filter((match) => {
      const language = match[1].trim().split(/\s+/, 1)[0];
      return language === "python" || language === "typescript";
    })
    .map((match) => match[0]);

  if (chapterFile.startsWith("第3章")) {
    return blocks.filter(
      (block) => !block.includes("【Python 改写】内层循环每一圈的结构"),
    );
  }
  return blocks;
}

function addPythonReadingNote(markdown) {
  const firstLineEnd = markdown.indexOf("\n");
  if (firstLineEnd === -1 || !markdown.startsWith("# ")) {
    throw new Error("Python 版生成失败：TypeScript 章节缺少一级标题");
  }

  const heading = markdown.slice(0, firstLineEnd);
  const body = markdown.slice(firstLineEnd + 1).replace(/^\n+/, "");
  return `${heading}\n\n${pythonReadingNote}\n\n${body}`;
}

function buildPythonChapter(typescriptMarkdown, existingPython, chapterFile) {
  const translatedBlocks = getTranslatedBlocks(existingPython, chapterFile);
  const sourceBlockCount = [
    ...typescriptMarkdown.matchAll(typescriptFencePattern),
  ].length;

  if (translatedBlocks.length !== sourceBlockCount) {
    throw new Error(
      `${chapterFile} 的 Python 代码块无法一一对应：` +
        `TypeScript ${sourceBlockCount} 个，Python ${translatedBlocks.length} 个`,
    );
  }

  let index = 0;
  const translated = typescriptMarkdown.replace(
    typescriptFencePattern,
    () => translatedBlocks[index++],
  );
  return `${addPythonReadingNote(translated).trimEnd()}\n`;
}

function extractFrontmatter(mdx, path) {
  const match = mdx.match(/^---\n[\s\S]*?\n---\n/);
  if (!match) {
    throw new Error(`${relative(piRoot, path)} 缺少合法的 YAML frontmatter`);
  }
  return match[0];
}

function normalizeFrontmatter(frontmatter) {
  return frontmatter.replace(
    /caption: stopReason 驱动的循环决策流程/g,
    "caption: Agent Loop 的继续与停止信号",
  );
}

function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function rewriteChapterLinks(markdown, variant) {
  let result = markdown;
  for (const chapter of chapters) {
    const route = `/modules/${chapter.slug}${variant === "python" ? ".python" : ""}`;
    result = result.replaceAll(`(${chapter.file})`, `(${route})`);
  }
  return result;
}

function buildMdx(markdown, existingMdx, mdxPath, variant) {
  const frontmatter = normalizeFrontmatter(
    extractFrontmatter(existingMdx, mdxPath),
  );
  let body = markdown.replace(/^# [^\n]+\n+/, "");
  body = rewriteChapterLinks(body, variant);
  body = body.replace(
    /!\[([^\]]*)\]\(assets\/([^)]+\.svg)\)/g,
    (_match, caption, file) =>
      `<Diagram file="/assets/${file}" caption="${escapeAttribute(caption)}" id="${file.replace(/\.svg$/, "")}" />`,
  );

  return (
    `${frontmatter}\n` +
    "import Diagram from '../../components/Diagram.astro';\n\n" +
    `${body.trimStart().trimEnd()}\n`
  );
}

function validateSourceChapter(markdown, path) {
  const displayPath = relative(piRoot, path);
  if (!markdown.startsWith("# ")) {
    throw new Error(`${displayPath} 缺少一级标题`);
  }
  if (!markdown.includes("v0.80.2")) {
    throw new Error(`${displayPath} 没有声明 v0.80.2 校对口径`);
  }
  if (markdown.includes("](repo/")) {
    throw new Error(`${displayPath} 仍含只能在旧目录中工作的 repo/ 链接`);
  }

  for (const match of markdown.matchAll(
    /https:\/\/github\.com\/earendil-works\/pi\/(?:blob|tree)\/([^/)\s]+)/g,
  )) {
    if (match[1] !== PI_COMMIT) {
      throw new Error(`${displayPath} 含未固定到 v0.80.2 的源码链接：${match[0]}`);
    }
  }

  for (const match of markdown.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)) {
    const assetPath = join(dirname(path), match[1]);
    if (!existsSync(assetPath)) {
      throw new Error(`${displayPath} 引用了不存在的插图：${match[1]}`);
    }
  }
}

function buildGeneratedFiles() {
  const generated = new Map();
  const pythonChapters = new Map();

  for (const chapter of chapters) {
    const typescriptPath = join(typescriptDir, chapter.file);
    const pythonPath = join(pythonDir, chapter.file);
    const typescriptMdxPath = join(webModulesDir, `${chapter.slug}.mdx`);
    const pythonMdxPath = join(webModulesDir, `${chapter.slug}.python.mdx`);

    for (const path of [
      typescriptPath,
      pythonPath,
      typescriptMdxPath,
      pythonMdxPath,
    ]) {
      if (!existsSync(path)) {
        throw new Error(`同步所需文件不存在：${relative(piRoot, path)}`);
      }
    }

    const typescriptMarkdown = readText(typescriptPath);
    validateSourceChapter(typescriptMarkdown, typescriptPath);

    const pythonMarkdown = buildPythonChapter(
      typescriptMarkdown,
      readText(pythonPath),
      chapter.file,
    );
    pythonChapters.set(chapter.file, pythonMarkdown);
    generated.set(pythonPath, pythonMarkdown);

    generated.set(
      typescriptMdxPath,
      buildMdx(
        typescriptMarkdown,
        readText(typescriptMdxPath),
        typescriptMdxPath,
        "ts",
      ),
    );
    generated.set(
      pythonMdxPath,
      buildMdx(
        pythonMarkdown,
        readText(pythonMdxPath),
        pythonMdxPath,
        "python",
      ),
    );
  }

  for (const file of readdirSync(sourceAssetsDir).sort()) {
    if (!file.endsWith(".svg") && !file.endsWith(".html")) continue;
    const source = readFileSync(join(sourceAssetsDir, file));
    generated.set(join(pythonAssetsDir, file), source);
    if (file.endsWith(".svg")) {
      generated.set(join(webAssetsDir, file), source);
    }
  }

  return generated;
}

function valuesEqual(actual, expected) {
  const expectedBuffer = Buffer.isBuffer(expected)
    ? expected
    : Buffer.from(expected, "utf8");
  return actual.equals(expectedBuffer);
}

export function synchronizeContent({ check = false } = {}) {
  const generated = buildGeneratedFiles();
  const changed = [];

  for (const [path, expected] of generated) {
    const current = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
    if (valuesEqual(current, expected)) continue;

    changed.push(relative(piRoot, path));
    if (!check) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, expected);
    }
  }

  if (check && changed.length > 0) {
    throw new Error(
      `内容副本未同步，请运行 npm run sync:content：\n${changed
        .map((path) => `- ${path}`)
        .join("\n")}`,
    );
  }

  const mode = check ? "校验" : "同步";
  console.log(
    `${mode}完成：${chapters.length} 章 TypeScript → Python / Web，` +
      `${readdirSync(sourceAssetsDir).filter((file) => file.endsWith(".svg")).length} 张 SVG。` +
      (changed.length > 0 ? ` 更新 ${changed.length} 个文件。` : " 无漂移。"),
  );

  return { changed, generatedCount: generated.size };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    synchronizeContent({ check: process.argv.includes("--check") });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
