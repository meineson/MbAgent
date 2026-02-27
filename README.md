# 从0开始AI Agent开发（面向有经验程序员）

## 学习步骤

1. 原始 HTTP API 调用云端大模型 → 2. OpenAI SDK → 3. 本地部署 7B 模型 → 4. LangChain → 5. LangGraph 状态机 → 6. Skills 配置驱动

## 版本对比

| 版本 | 技术栈 | 特点 | 推荐场景 |
|------|--------|------|----------|
| test.js | 原生 fetch | 无依赖，手动 SSE | 学习原理 |
| test2.js | OpenAI SDK | 代码简洁 | 快速开发 |
| test3.js | LangChain | 流式工作示例 | 学习流式 |
| test4.js | LangChain Agent | 自动工具调用 | 生产环境 |
| test5.js | LangGraph | 状态机，详细日志 | 复杂流程 |
| test6.js | Skill技能框架 | 8个技能，易扩展 | 多功能场景 |

## 快速开始

```bash
npm install
export OPENAI_API_KEY="your-api-key"
export MODEL="gpt-3.5-turbo"
export BASE_URL="https://api.openai.com/v1"

node testX.js
```

**添加新技能（test6.js）：**

```javascript
// skills/my_skill.js
export async function my_function({ param1 }) {
  return `结果: ${param1}`;
}
```

```yaml
# skills.config.yaml
my_skill:
  implementation: "./skills/my_skill.js#my_function"
  enabled: true
  parameters:
    param1: { type: "string", required: true }
```

## 技术栈

- LangChain v1.2 / LangGraph - Agent 框架
- @langchain/openai - OpenAI 模型
- Zod - 参数校验
- js-yaml - YAML 解析
- ffprobe - RTSP 流检测

## 调试

```bash
ffprobe -v error -show_entries stream=codec_name,codec_type rtsp://url

node -e "import('./skills_v3.js').then(m => console.log(m.default.manifest.skills))"
```

## License

MIT