import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import yaml from 'js-yaml';
import { addMemory, searchMemories } from './memory.js';
import allSkills from './skills_v3.js';

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:10808';
setGlobalDispatcher(new ProxyAgent(proxyUrl));

const MODEL = process.env.MODEL || 'gpt-4-turbo';
const BASE_URL = process.env.BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.API_KEY || process.env.OPENAI_API_KEY || '';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * 辅助函数：根据参数定义生成 Zod Schema
 */
function generateZodSchema(parameters) {
  if (!parameters) return z.object({ context: z.string().optional() });
  
  const schemaFields = {};
  for (const [key, param] of Object.entries(parameters)) {
    let field;
    switch (param.type) {
      case 'string': field = z.string(); break;
      case 'number': field = z.number(); break;
      case 'boolean': field = z.boolean(); break;
      default: field = z.any();
    }
    
    if (param.default !== undefined) field = field.default(param.default);
    else if (!param.required) field = field.optional();
    if (param.description) field = field.describe(param.description);
    
    schemaFields[key] = field;
  }
  return z.object(schemaFields);
}

/**
 * 解析 Markdown 格式的技能定义 (支持递归子目录)
 */
async function loadMarkdownSkills(dirPath) {
  const mdSkills = [];
  const runtimeDir = path.join(dirPath, '.runtime_cache');
  await fs.mkdir(runtimeDir, { recursive: true });

  async function scanDir(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.runtime_cache') await scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        const content = await fs.readFile(fullPath, 'utf-8');
        const parts = content.split('---');
        if (parts.length < 3) continue;

        const metadata = yaml.load(parts[1]);
        const instructions = parts.slice(2).join('---').trim();
        const name = metadata.name || entry.name.replace('.md', '');
        const description = metadata.description || '无描述';
        const schema = generateZodSchema(metadata.parameters);

        let implementation;
        
        if (metadata.implementation) {
          // 解析相对于当前 Markdown 文件的脚本路径
          const implPath = path.resolve(currentDir, metadata.implementation);
          try {
            const module = await import(pathToFileURL(implPath).href);
            implementation = module.run;
          } catch (err) {
            console.warn(`⚠️ 无法从 ${fullPath} 加载脚本 ${metadata.implementation}:`, err.message);
          }
        } 
        
        if (!implementation) {
          const codeBlockMatch = instructions.match(/```javascript\n([\s\S]*?)\n```/);
          if (codeBlockMatch) {
            const code = codeBlockMatch[1];
            const tmpFilePath = path.resolve(runtimeDir, `${name}.js`);
            await fs.writeFile(tmpFilePath, code);
            const module = await import(pathToFileURL(tmpFilePath).href);
            implementation = module.run;
          } else {
            implementation = async () => {
              return `[指令型技能加载完毕]\n\n${instructions}`;
            };
          }
        }

        if (implementation) {
          mdSkills.push(tool(implementation, {
            name: name.replace(/-/g, '_'),
            description,
            schema
          }));
        }
      }
    }
  }

  try {
    await scanDir(dirPath);
  } catch (error) {
    console.warn('⚠️ 加载子目录 Markdown 技能出错:', error.message);
  }
  return mdSkills;
}

async function main() {
  console.log(CYAN + '🚀 多功能 AI Agent v7 (全能 Markdown 技能版)' + RESET);
  
  const markdownSkills = await loadMarkdownSkills('./agent_skills');
  const tools = [...allSkills.langchain, ...markdownSkills];

  console.log('加载技能数:', tools.length);
  console.log('可用工具:', tools.map(t => t.name).join(', '));
  console.log('输入 exit 退出\n');

  const model = new ChatOpenAI({
    model: MODEL,
    apiKey: API_KEY,
    configuration: { baseURL: BASE_URL },
    temperature: 0,
    streaming: true,
  });

  const agent = createAgent({
    model,
    tools,
    systemPrompt: `你是具备专家级知识的 AI Agent。
你拥有两类工具：
1. 底层工具（文件、搜索、计算、系统信息获取）：这些工具执行真实代码并返回客观结果。
2. 指令型技能（代码审查、操作规程）：这些工具返回专业领域的操作指南（SOP）。

当你执行任务时，请根据需要灵活组合使用这些工具。`,
  });

  while (true) {
    const userInput = await new Promise((resolve) => rl.question(BOLD + '用户输入: ' + RESET, resolve));
    if (userInput.toLowerCase() === 'exit') break;

    try {
      const relevantMemories = await searchMemories(userInput, 3);
      let context = relevantMemories.length > 0 
        ? '\n[历史记录]\n' + relevantMemories.map(m => m.text).join('\n') + '\n' 
        : '';

      const events = await agent.streamEvents(
        { messages: [{ role: 'user', content: context + userInput }] },
        { version: "v1", configurable: { thread_id: "test7-session" } }
      );

      let lastResponse = '';

      for await (const event of events) {
        if (event.event === "on_chat_model_stream") {
          const content = event.data.chunk?.message?.content || event.data.chunk?.content;
          if (content) process.stdout.write(DIM + content + RESET);
        } else if (event.event === "on_tool_start") {
          console.log(`\n${GREEN}[🔧 执行技能: ${event.name}]${RESET}`);
          if (event.data.input) console.log(DIM + "参数: " + JSON.stringify(event.data.input) + RESET);
        } else if (event.event === "on_tool_end") {
          console.log(`${GREEN}[✅ 技能响应完成]${RESET}`);
        } else if (event.event === "on_chain_end" && event.name === "LangGraph") {
            const messages = event.data?.output?.messages;
            if (messages && messages.length > 0) {
              lastResponse = messages[messages.length - 1].content;
            }
        }
      }

      console.log('\r\n' + BOLD + '✨ 最终回复:' + RESET + '\r\n' + lastResponse + '\n');
      await addMemory(`用户: ${userInput}\n助手: ${lastResponse}`);
      
    } catch (error) {
      console.error('❌ 出错:', error.message);
    }
  }

  rl.close();
}

main();
