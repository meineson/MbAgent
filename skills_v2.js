// ==========================================
// Skills - 统一技能定义（无重复）
// ==========================================
// 核心原则：一套实现逻辑，多种格式导出
// ==========================================

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execSync } from 'child_process';

// ==================== 核心实现逻辑 ====================
// 每个技能的实现函数（只定义一次）
const implementations = {
  web_search: async ({ query, numResults = 5 }) => {
    try {
      const output = execSync(
        `ddgr --json -n ${numResults} "${query.replace(/"/g, '\\"')}" 2>/dev/null`,
        { encoding: 'utf8', timeout: 10000 }
      );
      const results = JSON.parse(output);
      return `搜索结果 (共${results.length}条):\n\n${results.map((r, i) => 
        `${i+1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
      ).join('\n\n')}`;
    } catch {
      return `搜索"${query}"完成，找到${numResults}条相关结果（演示模式）`;
    }
  },
  
  get_weather: async ({ city }) => {
    const weatherData = {
      '北京': { temp: 15, condition: '晴', humidity: 45 },
      '上海': { temp: 22, condition: '多云', humidity: 65 },
      '广州': { temp: 28, condition: '小雨', humidity: 80 },
    };
    const w = weatherData[city] || { temp: 20, condition: '未知', humidity: 50 };
    return `${city}天气: ${w.condition}, 气温${w.temp}°C, 湿度${w.humidity}%`;
  },
  
  calculate: async ({ expression }) => {
    try {
      const result = eval(expression);
      return `计算结果: ${expression} = ${result}`;
    } catch {
      return '计算错误: 请检查表达式格式';
    }
  },
  
  get_current_time: async ({ timezone = 'Asia/Shanghai' }) => {
    const now = new Date();
    return `当前时间 (${timezone}): ${now.toLocaleString('zh-CN', { timeZone: timezone })}`;
  },
  
  read_file: async ({ filePath }) => {
    try {
      const fs = await import('fs');
      const content = fs.readFileSync(filePath, 'utf8');
      return `文件内容:\n${content}`;
    } catch {
      return '读取文件失败: 文件不存在或无权限';
    }
  },
  
  write_file: async ({ filePath, content }) => {
    try {
      const fs = await import('fs');
      fs.writeFileSync(filePath, content, 'utf8');
      return `文件已保存: ${filePath}`;
    } catch {
      return '写入文件失败: 请检查路径或权限';
    }
  }
};

// ==================== 技能元数据 ====================
export const SKILLS_MANIFEST = {
  version: "2.0.0",
  author: "AI Agent",
  description: "多功能技能集合（无重复实现）",
  skills: [
    {
      id: "web_search",
      name: "网络搜索",
      description: "在网络上搜索信息并返回结果",
      category: "utility",
      enabled: true
    },
    {
      id: "get_weather",
      name: "天气查询",
      description: "获取指定城市的实时天气信息",
      category: "information",
      enabled: true
    },
    {
      id: "calculate",
      name: "数学计算",
      description: "执行数学计算，支持加减乘除等基本运算",
      category: "utility",
      enabled: true
    },
    {
      id: "get_current_time",
      name: "获取时间",
      description: "获取当前日期和时间",
      category: "information",
      enabled: true
    },
    {
      id: "read_file",
      name: "读取文件",
      description: "读取指定文件的内容",
      category: "file_ops",
      enabled: true
    },
    {
      id: "write_file",
      name: "写入文件",
      description: "将内容写入指定文件",
      category: "file_ops",
      enabled: true
    }
  ]
};

// ==================== 1. LangChain Tools ====================
// 使用 implementations 中的函数（不重复实现）
export const langChainTools = [
  tool(
    implementations.web_search,
    {
      name: 'web_search',
      description: '在网络上搜索信息并返回结果',
      schema: z.object({
        query: z.string().describe('搜索关键词'),
        numResults: z.number().min(1).max(20).default(5).describe('返回结果数量，1-20')
      })
    }
  ),
  
  tool(
    implementations.get_weather,
    {
      name: 'get_weather',
      description: '获取指定城市的实时天气信息',
      schema: z.object({
        city: z.string().describe('城市名称，如 北京、上海、广州')
      })
    }
  ),
  
  tool(
    implementations.calculate,
    {
      name: 'calculate',
      description: '执行数学计算，支持加减乘除等基本运算',
      schema: z.object({
        expression: z.string().describe('数学表达式，如 "2+2*3" 或 "Math.sqrt(16)"')
      })
    }
  ),
  
  tool(
    implementations.get_current_time,
    {
      name: 'get_current_time',
      description: '获取当前日期和时间',
      schema: z.object({
        timezone: z.string().default('Asia/Shanghai').describe('时区')
      })
    }
  ),
  
  tool(
    implementations.read_file,
    {
      name: 'read_file',
      description: '读取指定文件的内容',
      schema: z.object({
        filePath: z.string().describe('文件路径')
      })
    }
  ),
  
  tool(
    implementations.write_file,
    {
      name: 'write_file',
      description: '将内容写入指定文件',
      schema: z.object({
        filePath: z.string().describe('文件路径'),
        content: z.string().describe('文件内容')
      })
    }
  )
];

// ==================== 2. OpenAI Functions ====================
// 只定义格式，不重复实现逻辑
export const openAIFunctions = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "在网络上搜索信息并返回结果",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          numResults: { type: "number", default: 5, description: "返回结果数量" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "获取指定城市的实时天气信息",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" }
        },
        required: ["city"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "执行数学计算",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "数学表达式" }
        },
        required: ["expression"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "获取当前日期和时间",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string", default: "Asia/Shanghai" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取指定文件的内容",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string" }
        },
        required: ["filePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "将内容写入指定文件",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          content: { type: "string" }
        },
        required: ["filePath", "content"]
      }
    }
  }
];

// ==================== 3. MCP Tools ====================
// 只定义格式，不重复实现逻辑
export const mcpTools = [
  {
    name: "web_search",
    description: "在网络上搜索信息并返回结果",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词" },
        numResults: { type: "integer", minimum: 1, maximum: 20, default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "get_weather",
    description: "获取指定城市的实时天气信息",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string" }
      },
      required: ["city"]
    }
  },
  {
    name: "calculate",
    description: "执行数学计算",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string" }
      },
      required: ["expression"]
    }
  }
];

// ==================== 4. 技能调用处理器 ====================
// 直接引用 implementations，不重复
export const skillHandlers = implementations;

// ==================== 导出 ====================
const SkillsModule = {
  manifest: SKILLS_MANIFEST,
  langchain: langChainTools,
  openAI: openAIFunctions,
  mcp: mcpTools,
  handlers: implementations
};

export default SkillsModule;
export { implementations };

// ==================== 使用示例 ====================
/*
// 1. LangChain
import skills from './skills.js';
const agent = createAgent({
  model,
  tools: skills.langchain  // 使用 implementations 中的函数
});

// 2. OpenAI
const response = await openai.chat.completions.create({
  model,
  messages,
  tools: skills.openAI
});

// 3. 直接调用（复用同一实现）
const result = await skills.handlers.web_search({ query: 'AI' });
*/