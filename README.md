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
  - **按需读取**：Agent 可通过 `read_skill_segment` 精准读取文档特定章节。
- **自主脚本执行**：AI 能够识别文档中的 Usage Example 并通过 `execute_command` 自动运行 Shell/Python 脚本。
- **交互优化**：集成 CLI Spinner 加载动画，提供实时的思考状态反馈。

## 快速开始...

```bash
npm install
export OPENAI_API_KEY="your-api-key"
export MODEL="gpt-4-turbo"
export BASE_URL="https://api.openai.com/v1"

# 安装外部技能 (自动下载到 .agents/skills/)
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max

node test7.js
```

**示例：（调用skills.sh上的ui-ux-pro-max技能设计一个软电话界面）**
```
🚀 多功能 AI Agent v7 (稳定交付版)
可用工具: execute_command, read_skill_segment, get_weather, calculate, get_current_time, read_file, write_file, get_cameras, check_camera, code_review, system_info, web_search, ui_ux_pro_max

用户输入: 设计一个软电话界面,基于tailwindcss和alpinejs
[Memory] 加载了 0 条历史记忆
[Memory] 检索到 0 条相关记忆

[🤖 AI 启动中...]

[🔧 工具调用: ui_ux_pro_max]
参数: "{\"context\":\"设计一个软电话(Soft Phone)界面，基于Tailwind CSS和Alpine.js。需要包含以下功能：\\n1. 拨号键盘(0-9, *, #)\\n2. 号码输入显示区\\n3. 通话控制按钮(拨打、挂断、静音、免提、保持)\\n4. 通话状态显示(通话中、振铃、空闲等)\\n5. 联系人列表侧边栏\\n6. 通话记录\\n7. 响应式设计，适配桌面和移动端\\n8. 现代简洁的UI风格，使用玻璃拟态或扁平化设计\\n9. 深色/浅色模式支持\\n\\n请提供完整的HTML代码，包含所有必要的CSS样式和JavaScript交互逻辑。\"}"
[✅ 调用结束]

[🤖 分析中...]

[🔧 工具调用: read_skill_segment]
参数: "{\"skill_name\":\"ui_ux_pro_max\",\"heading\":\"Style Selection (MEDIUM)\"}"

[🔧 工具调用: read_skill_segment]
参数: "{\"skill_name\":\"ui_ux_pro_max\",\"heading\":\"Color palette\"}"
[✅ 调用结束]

[🤖 分析中...]
[✅ 调用结束]

[🤖 分析中...]

[🔧 工具调用: read_skill_segment]
参数: "{\"skill_name\":\"ui_ux_pro_max\",\"heading\":\"Style Selection (MEDIUM)\"}"

[🔧 工具调用: read_skill_segment]
参数: "{\"skill_name\":\"ui_ux_pro_max\",\"heading\":\"Color palette\"}"
[✅ 调用结束]

[🤖 分析中...]
[✅ 调用结束]

[🤖 分析中...]

[🔧 工具调用: read_skill_segment]
参数: "{\"skill_name\":\"ui_ux_pro_max\",\"heading\":\"Step 2: Generate Design System (REQUIRED)\"}"

[🔧 工具调用: read_skill_segment]
参数: "{\"skill_name\":\"ui_ux_pro_max\",\"heading\":\"Stack Guidelines\"}"
[✅ 调用结束]

[🤖 分析中...]
[✅ 调用结束]

[🤖 分析中...]

[🔧 工具调用: read_skill_segment]
参数: "{\"skill_name\":\"ui_ux_pro_max\",\"heading\":\"Step 2: Generate Design System (REQUIRED)\"}"

[🔧 工具调用: read_skill_segment]
参数: "{\"skill_name\":\"ui_ux_pro_max\",\"heading\":\"Common Rules for Professional UI\"}"
[✅ 调用结束]

[🤖 分析中...]
[✅ 调用结束]

[🤖 分析中...]

[🔧 工具调用: write_file]
参数: "{\"filePath\":\"softphone.html\",\"content\":\"<!DOCTYPE html>\\n<html lang=\\\"zh-CN\\\">\\n<head>\\n    <meta charset=\\\"UTF-8\\\">\\n    <meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1.0\\\">\\n    <title>软电话 - SoftPhone</title>\\n    <!-- TailwindCSS CDN -->\\n    <
[✅ 调用结束]

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