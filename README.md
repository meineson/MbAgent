# 从0开始AI Agent开发（面向有经验程序员）

## 学习步骤

1. 原始 HTTP API 调用云端大模型 → 2. OpenAI SDK → 3. 本地部署 7B 模型 → 4. LangChain → 5. LangGraph 状态机 → 6. Skills 配置驱动

## 版本对比

| 版本 | 技术栈 | 特点 | 推荐场景 |
|------|--------|------|----------|
| test.js | 原生 fetch | 无依赖，手动 SSE | 学习原理 |
| test2.js | OpenAI SDK | 代码简洁 | 快速开发 |
| test3.js | LangChain | 流式工作示例 | 学习流式 |
| test4.js | LangChain | 自动化框架+长期记忆 | 生产环境 |
| test5.js | LangChain+LangGraph | 状态机驱动Agent | 复杂流程 |
| test6.js | LangChain | Skill技能框架，易扩展 | 多功能场景 |
| test7.js | LangChain+Expert Skills | 工业级技能架构，支持MD/脚本/SOP | 复杂生产环境 |

## 最新：test7.js 核心特性

`test7.js` 引入了全新的 **Expert Skills (专家级技能)** 架构，实现了“描述”与“执行”的完美分离：

- **一技能一目录**：每个技能拥有独立子目录（如 `agent_skills/web-search/`），包含 `SKILL.md` 指南和 `scripts/` 实现脚本。
- **Markdown 专家规程**：通过 MD 定义元数据和 SOP，AI 会先阅读“说明书”再干活。
- **混合型加载**：同时支持本地 `agent_skills/` 和下载的 `.agents/skills/`（兼容https://skills.sh）。
- **智能知识调度**：
  - **自动摘要**：文档过长时自动生成目录摘要，节省 Context。
  - **按需读取**：即渐进式加载，Agent 可通过 `read_skill_segment` 精准读取文档特定章节。
- **自主脚本执行**：AI 能够识别文档中的 Usage Example 并通过 `execute_command` 自动运行 Shell/Python 脚本。

！甚至已经具备一个mini claude code编程助手的雏形（浏览网页，创建目录，生成并写入代码，执行npm安装指令，运行检查命令……）。

## 快速开始...

```bash
npm install
export OPENAI_API_KEY="your-api-key"
export MODEL="gpt-4-turbo"
export BASE_URL="https://api.openai.com/v1"

node testX.js

# 安装外部技能 (自动下载到 .agents/skills/)
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
node test7.js
```

**示例1：（调用skills.sh上的ui-ux-pro-max技能设计一个web界面）**
- 识别意图是“设计”软件界面
- 调用ui-ux-pro-max技能
- 调用execute_command技能执行ui-ux-pro-max技能的script脚本search.py查找设计要素
- 执行ui-ux-pro-max技能的script脚本design_system.py输出设计规范
- 调用write_file技能保存输出的html或js等web内容
- 根据需要调用execute_command创建目录、列出目标目录下文件来检查结果

注意：测试使用kimi k2.5，太小的模型可能不能正确识别意图和执行复杂技能，可能导致异常结果甚至错误删除文件！

```
node test7.js
🚀 多功能 AI Agent v7 (参数校验版)
可用工具: execute_command, read_skill_segment, get_weather, calculate, get_current_time, read_file, write_file, get_cameras, check_camera, code-review, system-info, web-search, ui-ux-pro-max

用户输入: 设计一个webrtc视频会议界面保存在当前目录demo文件夹中,使用本地tailwindcss和alpine.js
[Memory] 加载了 0 条历史记忆
[Memory] 检索到 0 条相关记忆

[🤖 启动任务...]

[🔧 调用: ui-ux-pro-max]
[✅ 结束]
预览: [⚠️ 摘要] 该工具仅返回目录。你必须使用 'read_skill_segment' 获取细节。路径前缀: '.agents/skills/ui-ux-pro-max/scripts/'。  ###...

[🤖 分析中...]

[🔧 调用: read_skill_segment]

[🔧 调用: read_skill_segment]
[✅ 结束]
预览: ### 章节内容: Style Selection (MEDIUM)  - `style-match` - Match style to product type - `consistency` - ...

[🤖 分析中...]
[✅ 结束]
预览: ### 章节内容: Step 2: Generate Design System (REQUIRED)  **Always start with `--design-system`** to get ...

[🤖 分析中...]

[🔧 调用: execute_command]

[💻 命令] python3 .agents/skills/ui-ux-pro-max/scripts/search.py "video conferencing meeting collaboration professional" --design-system -p "WebRTC Video Conference"
[✅ 结束]
预览: +-----------------------------------------------------------------------------------------+ |  TARGE...

[🤖 分析中...]

[🔧 调用: execute_command]

[💻 命令] mkdir -p demo
[✅ 结束]
预览:   [通知] 数据已获取。禁止继续搜索。立即交付物理文件。...

[🤖 分析中...]

[🔧 调用: write_file]
[✅ 结束]
预览: 文件已保存: demo/index.html...
```

其它示例：(调用浏览器playwright检索网页)：
```
安装skills.sh技能：
npx skills add microsoft/playwright-cli@playwright-cli

安装全局命令行：
npm install -g @playwright/cli

node test7.js
User: 百度搜索tailwindcss最新版本号
[🔧 Tool: execute_command]

[Exec] ls -la .agents/skills/playwright-cli/

[🔧 Tool: read_file]

[🔧 Tool: execute_command]

[Exec] playwright-cli open https://www.baidu.com

[🔧 Tool: execute_command]

[Exec] playwright-cli type "tailwindcss"

[🔧 Tool: execute_command]

[Exec] playwright-cli press Enter

[🔧 Tool: execute_command]

[Exec] playwright-cli snapshot

[🔧 Tool: read_file]

[🔧 Tool: execute_command]

[Exec] playwright-cli goto https://tailwindcss.com

[🔧 Tool: execute_command]

[🔧 Tool: read_file]

[🔧 Tool: execute_command]

[Exec] playwright-cli close


✨ Result:
根据我在百度搜索并访问 Tailwind CSS 官方网站的结果，找到了最新版本信息：

## Tailwind CSS 最新版本

### v4.2

从 Tailwind CSS 官方网站（tailwindcss.com）可以看到当前版本显示为 **v4.2**。

其他搜索结果中也提到了：
- 百度百科：提到 "2025年1月22日发布v4.0版本进行性能优化与配置重构"
- GitHub：显示最新版本为 v3.0.24（这是 v3 系列的最新版本）

**总结**：Tailwind CSS 目前最新的稳定版本是 **v4.2**（这是 v4 大版本系列），而 v3 系列的最新版本是 v3.0.24。v4 系列相比 v3 有重大更新，包括性能优化和配置重构。
```

**添加新技能（test7.js）：**

1. 创建技能目录：`mkdir -p agent_skills/my-skill/scripts`
2. 编写实现脚本 `agent_skills/my-skill/scripts/run.js`:
```javascript
export async function run({ param1 }) {
  return `执行结果: ${param1}`;
}
```
3. 编写专家指南 `agent_skills/my-skill/SKILL.md`:
```markdown
---
name: my-skill
description: 描述该技能的功能，供 AI 判断何时调用
---
# 使用指南
当你使用此技能时，请确保参数格式正确。
### Usage Example
```bash
node agent_skills/my-skill/scripts/run.js "测试数据"
```
```

## 技术栈

- LangChain v1.2 / LangGraph - Agent 框架
- @langchain/openai - OpenAI 模型
- Zod - 参数校验
- js-yaml - YAML 解析
- ffprobe - RTSP 流检测

## 调试

出错异常时，清除faiss_db目录重新运行，避免历史会话记录干扰当前会话。

```bash
ffprobe -v error -show_entries stream=codec_name,codec_type rtsp://url

node -e "import('./skills_v3.js').then(m => console.log(m.default.manifest.skills))"
```

## License

MIT