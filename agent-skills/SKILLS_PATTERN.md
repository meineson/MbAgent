# Skills 配置驱动模式

一套配置驱动多种框架的技能管理系统，适用于 AI Agent 项目。

## 架构概述

```
skills.config.yaml  →  skills_v3.js  →  LangChain / OpenAI / MCP 格式
        ↓                    ↓
   配置定义            动态加载生成
                              ↓
     skills/         ←    实现代码
```

## 三步实现

### 1. YAML 配置定义技能

`skills.config.yaml`:

```yaml
skills:
  skill_name:
    name: "技能名称"
    description: "技能描述，LLM 用此判断是否调用"
    category: "utility"
    enabled: true
    implementation: "./skills/file.js#function_name"  # 实现路径#函数名
    parameters:
      param1:
        type: "string"
        description: "参数描述"
        required: true
      param2:
        type: "number"
        description: "可选参数"
        default: 5
        min: 1
        max: 20
```

### 2. 技能实现代码

`skills/file.js`:

```javascript
// 每个函数独立导出，与 YAML 中的 implementation 对应
export async function function_name({ param1, param2 }) {
  // 实现逻辑
  return `结果: ${param1}`;
}

export async function another_function({ param }) {
  // 另一个技能
  return `结果: ${param}`;
}
```

### 3. 加载器生成多格式

`skills_v3.js` 核心代码:

```javascript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import yaml from 'js-yaml';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 缓存已加载的实现
const implCache = new Map();

// 动态加载实现函数
async function loadImpl(implPath) {
  if (implCache.has(implPath)) return implCache.get(implPath);
  
  const [modulePath, funcName] = implPath.split('#');
  const module = await import(join(__dirname, modulePath));
  const fn = module[funcName];
  
  if (typeof fn !== 'function') {
    throw new Error(`函数 ${funcName} 未找到`);
  }
  
  implCache.set(implPath, fn);
  return fn;
}

// 加载 YAML 配置
async function loadConfig() {
  const content = await readFile(join(__dirname, 'skills.config.yaml'), 'utf8');
  return yaml.load(content);
}

// 生成 Zod Schema
function generateSchema(params) {
  const fields = {};
  for (const [key, p] of Object.entries(params)) {
    let field;
    switch (p.type) {
      case 'string': field = z.string(); break;
      case 'number': 
        field = z.number();
        if (p.min !== undefined) field = field.min(p.min);
        if (p.max !== undefined) field = field.max(p.max);
        break;
      case 'boolean': field = z.boolean(); break;
      default: field = z.any();
    }
    if (p.default !== undefined) field = field.default(p.default);
    else if (!p.required) field = field.optional();
    if (p.description) field = field.describe(p.description);
    fields[key] = field;
  }
  return z.object(fields);
}

// 生成 LangChain Tools
async function generateLangChainTools(config) {
  const tools = [];
  for (const [key, skill] of Object.entries(config.skills)) {
    if (!skill.enabled || !skill.implementation) continue;
    
    const impl = await loadImpl(skill.implementation);
    if (!impl) continue;
    
    tools.push(tool(impl, {
      name: key,
      description: skill.description,
      schema: generateSchema(skill.parameters)
    }));
  }
  return tools;
}

// 生成 OpenAI Functions
function generateOpenAIFunctions(config) {
  return Object.entries(config.skills)
    .filter(([, s]) => s.enabled)
    .map(([key, skill]) => ({
      type: "function",
      function: {
        name: key,
        description: skill.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(skill.parameters).map(([k, p]) => [
              k, { type: p.type, description: p.description, default: p.default }
            ])
          ),
          required: Object.entries(skill.parameters)
            .filter(([, p]) => p.required)
            .map(([k]) => k)
        }
      }
    }));
}

// 主入口
async function loadSkills() {
  const config = await loadConfig();
  
  const langchain = await generateLangChainTools(config);
  const openai = generateOpenAIFunctions(config);
  
  // 构建 handlers 映射
  const handlers = {};
  for (const [key, skill] of Object.entries(config.skills)) {
    if (skill.implementation) {
      const impl = await loadImpl(skill.implementation);
      if (impl) handlers[key] = impl;
    }
  }
  
  return { langchain, openai, handlers, config };
}

export default await loadSkills();
```

## 使用方式

### LangChain Agent

```javascript
import skills from './skills_v3.js';
import { createAgent } from "langchain";

const agent = createAgent({
  model,
  tools: skills.langchain,  // 自动生成的 LangChain Tools
});

const result = await agent.invoke({ messages: [...] });
```

### OpenAI SDK

```javascript
import skills from './skills_v3.js';
import OpenAI from 'openai';

const client = new OpenAI();

const response = await client.chat.completions.create({
  model: "gpt-4",
  messages: [...],
  tools: skills.openai,  // 自动生成的 OpenAI Functions
});

// 调用 handler
if (response.choices[0].message.tool_calls) {
  for (const call of response.choices[0].message.tool_calls) {
    const handler = skills.handlers[call.function.name];
    const result = await handler(JSON.parse(call.function.arguments));
  }
}
```

### 直接调用

```javascript
import skills from './skills_v3.js';

// 直接调用实现函数
const result = await skills.handlers.skill_name({ param1: "value" });
```

## 添加新技能

1. 创建实现文件 `skills/my.js`:

```javascript
export async function my_skill({ input }) {
  return `处理: ${input}`;
}
```

2. 添加配置到 `skills.config.yaml`:

```yaml
  my_skill:
    name: "我的技能"
    description: "处理用户输入"
    enabled: true
    implementation: "./skills/my.js#my_skill"
    parameters:
      input:
        type: "string"
        required: true
```

3. 重启应用，技能自动加载

## 文件结构

```
project/
├── skills.config.yaml    # 技能配置
├── skills_v3.js          # 加载器
└── skills/               # 实现目录
    ├── cameras.js        # 摄像头技能
    ├── utility.js        # 工具技能
    ├── info.js           # 信息技能
    └── file.js           # 文件技能
```

## 优势

1. **配置驱动** - 修改配置即可调整技能，无需改代码
2. **模块化** - 每个技能独立文件，易于维护
3. **多格式** - 自动生成 LangChain / OpenAI / MCP 格式
4. **热加载** - 新增技能只需添加配置和实现
5. **类型安全** - Zod 自动校验参数

## 依赖

```bash
npm install js-yaml zod @langchain/core
```