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
import { spawn, execSync } from 'child_process';
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
const RED = '\x1b[31m';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * 动画控制
 */
let spinnerInterval = null;
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function startSpinner(text = "AI 正在思考") {
  if (spinnerInterval) return;
  let i = 0;
  process.stdout.write('\n');
  spinnerInterval = setInterval(() => {
    const frame = spinnerFrames[i % spinnerFrames.length];
    process.stdout.write(`\r${CYAN}${frame} ${text}...${RESET}`);
    i++;
  }, 80);
}

function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write('\r\x1b[K'); // 清除当前行
  }
}

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
 * 通用工具：按需读取技能文档的特定章节
 */
const read_skill_segment = tool(
  async ({ skill_name, heading }) => {
    try {
      const searchDirs = ['./agent_skills', './.agents/skills'];
      let filePath = null;
      const findFileRecursive = async (d) => {
        const entries = await fs.readdir(d, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) {
            const found = await findFileRecursive(p);
            if (found) return found;
          } else if (e.name.toLowerCase().endsWith('.md')) {
            const content = await fs.readFile(p, 'utf-8');
            if (content.includes(`name: ${skill_name}`)) return p;
          }
        }
        return null;
      };
      for (const dir of searchDirs) {
        if (await fs.access(dir).then(()=>true).catch(()=>false)) {
          filePath = await findFileRecursive(dir);
          if (filePath) break;
        }
      }
      if (!filePath) return `错误: 未找到名为 ${skill_name} 的技能定义。`;
      const content = await fs.readFile(filePath, 'utf-8');
      const instructions = content.split('---').slice(2).join('---');
      const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^#+\\s+${escapedHeading}[\\r\\n]+([\\s\\S]*?)(?=\\n#+|$)`, 'mi');
      const match = instructions.match(regex);
      if (match) return `### 章节详情: ${heading}\n\n${match[1].trim()}`;
      return `错误: 未找到章节 "${heading}"。`;
    } catch (error) { return `读取失败: ${error.message}`; }
  },
  {
    name: "read_skill_segment",
    description: "按需读取大型技能文档中的特定章节。",
    schema: z.object({
      skill_name: z.string().describe("技能内部名称"),
      heading: z.string().describe("章节标题 (不带 #)")
    })
  }
);

/**
 * 解析 Markdown 格式的技能定义
 */
async function loadMarkdownSkills(dirPath) {
  const mdSkills = [];
  const runtimeDir = path.join(dirPath, '.runtime_cache');
  try { await fs.mkdir(runtimeDir, { recursive: true }); } catch (e) {}

  async function scanDir(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.runtime_cache' && entry.name !== 'node_modules') await scanDir(fullPath);
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        const content = await fs.readFile(fullPath, 'utf-8');
        const parts = content.split('---');
        if (parts.length < 3) continue;
        const metadata = yaml.load(parts[1]);
        const instructions = parts.slice(2).join('---').trim();
        const name = metadata.name || entry.name.replace(/\.[^/.]+$/, "");
        const description = metadata.description || '无描述';
        const schema = generateZodSchema(metadata.parameters);

        let implementation;
        if (metadata.implementation) {
          const implPath = path.resolve(currentDir, metadata.implementation);
          const ext = path.extname(implPath);
          try {
            if (ext === '.js' || ext === '.mjs') {
              const module = await import(pathToFileURL(implPath).href);
              implementation = module.run;
            } else if (ext === '.py') {
              implementation = async (args) => {
                return new Promise((resolve, reject) => {
                  const py = spawn('python3', [implPath, JSON.stringify(args)]);
                  let out = '', err = '';
                  py.stdout.on('data', d => out += d);
                  py.stderr.on('data', d => err += d);
                  py.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
                });
              };
            }
          } catch (err) { console.warn(`加载脚本失败: ${implPath}`); }
        } 
        
        if (!implementation) {
          const codeBlock = instructions.match(/```javascript\n([\s\S]*?)\n```/);
          if (codeBlock) {
            const tmpFile = path.resolve(runtimeDir, `${name}.js`);
            await fs.writeFile(tmpFile, codeBlock[1]);
            const mod = await import(pathToFileURL(tmpFile).href);
            implementation = mod.run;
          } else {
            implementation = async () => {
              const MAX_LEN = 4000;
              if (instructions.length <= MAX_LEN) return `[指令加载完毕]\n\n${instructions}`;
              const toc = instructions.match(/^#+\s+.*$/gm)?.join('\n') || '无目录';
              return `[⚠️ 文档过长已自动摘要]\n\n### 预览\n${instructions.slice(0, 800)}...\n\n### 目录\n${toc}\n\n**提示**: 请使用 'read_skill_segment' 读取特定章节。`;
            };
          }
        }
        if (implementation) {
          mdSkills.push(tool(implementation, { name: name.replace(/-/g, '_'), description, schema }));
        }
      }
    }
  }
  try { await scanDir(dirPath); } catch (e) {}
  return mdSkills;
}

async function main() {
  console.log(CYAN + '🚀 多功能 AI Agent v7 (指令执行增强版)' + RESET);
  
  const execute_command = tool(
    async ({ command }) => {
      try {
        console.log(`\n${GREEN}[💻 执行命令]${RESET} ${DIM}${command}${RESET}`);
        const out = execSync(command, { encoding: 'utf8', timeout: 30000 });
        return out || '[执行成功]';
      } catch (e) { return `失败: ${e.message}\n${e.stderr || ''}`; }
    },
    {
      name: "execute_command",
      description: "执行 Shell 命令。当你从文档中发现具体的脚本调用示例时，请使用此工具运行它们。",
      schema: z.object({ command: z.string().describe("完整的 shell 命令") })
    }
  );

  const skillDirs = ['./agent_skills', './.agents/skills'];
  const allMdSkills = [];
  for (const dir of skillDirs) {
    if (await fs.access(dir).then(()=>true).catch(()=>false)) {
      allMdSkills.push(...(await loadMarkdownSkills(dir)));
    }
  }

  const tools = [execute_command, read_skill_segment, ...allSkills.langchain, ...allMdSkills];
  console.log('可用工具:', tools.map(t => t.name).join(', '));

  const model = new ChatOpenAI({ model: MODEL, apiKey: API_KEY, configuration: { baseURL: BASE_URL }, temperature: 0, streaming: true });
  const agent = createAgent({
    model,
    tools,
    systemPrompt: `你是专家级 AI Agent。
1. **任务导向**: 尽快解决问题，不要陷入无限搜索循环。
2. **知识获取**: 优先调用技能获取指南。如果文档过长使用 'read_skill_segment'。
3. **合成代码**: 获取到足够信息后，**必须立即编写完整的代码实现**，不要反复搜索。
4. **截断警告**: 单次会话如果你执行了超过 5 次工具调用，请立即开始总结并输出最终结果。`,
  });

  while (true) {
    const input = await new Promise(r => rl.question(BOLD + '\n用户输入: ' + RESET, r));
    if (input.toLowerCase() === 'exit') break;
    
    try {
      const memories = await searchMemories(input, 3);
      const context = memories.length > 0 ? '\n[历史记录]\n' + memories.map(m => m.text).join('\n') + '\n' : '';
      startSpinner("AI 正在思考中");
      const events = await agent.streamEvents(
        { messages: [{ role: 'user', content: context + input }] }, 
        { version: "v1", configurable: { thread_id: "session-v7", recursion_limit: 15 } }
      );
      
      let lastMsg = '';
      let toolCount = 0;
      for await (const e of events) {
        if (e.event === "on_chat_model_start" || e.event === "on_chain_start") {
          startSpinner("AI 正在思考中");
        } else if (e.event === "on_chat_model_stream") {
          if (e.data.chunk?.message?.content || e.data.chunk?.content) {
            stopSpinner();
            const c = e.data.chunk?.message?.content || e.data.chunk?.content;
            process.stdout.write(DIM + c + RESET);
          }
        } else if (e.event === "on_tool_start") {
          stopSpinner();
          toolCount++;
          if (toolCount > 8) {
            console.log(RED + "\n[🛑 达到最大工具调用限制，防止死循环]" + RESET);
            break;
          }
          console.log(`\n${GREEN}[🔧 调用: ${e.name}]${RESET}`);
          if (e.data.input) console.log(DIM + "参数: " + JSON.stringify(e.data.input) + RESET);
        } else if (e.event === "on_tool_end") {
          console.log(`${GREEN}[✅ 调用结束]${RESET}`);
        } else if (e.event === "on_chain_end" && e.name === "LangGraph") {
            const messages = e.data?.output?.messages;
            if (messages && messages.length > 0) {
              lastMsg = messages[messages.length - 1].content;
            }
        }
      }
      stopSpinner();
      console.log('\r\n' + BOLD + '✨ 最终回复:' + RESET + '\r\n' + lastMsg + '\n');
      await addMemory(`用户: ${input}\n助手: ${lastMsg}`);
    } catch (e) { 
      stopSpinner();
      console.error('❌ 错误:', e.message); 
    }
  }
  rl.close();
}

main();
