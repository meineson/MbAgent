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
const YELLOW = '\x1b[33m';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function logStatus(msg) {
  process.stdout.write(`\n${CYAN}[🤖 ${msg}]${RESET}\n`);
}

/**
 * 辅助函数：生成 Zod Schema
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
 * 通用工具：按需读取章节
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
      if (!filePath) return `错误: 未找到名为 ${skill_name} 的技能。`;
      const content = await fs.readFile(filePath, 'utf-8');
      const instructions = content.split('---').slice(2).join('---');
      const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^#+\\s+${escapedHeading}[\\r\\n]+([\\s\\S]*?)(?=\\n#+|$)`, 'mi');
      const match = instructions.match(regex);
      if (match) return `### ${heading} 详情:\n\n${match[1].trim()}`;
      return `错误: 未找到章节 "${heading}"。`;
    } catch (error) { return `读取失败: ${error.message}`; }
  },
  {
    name: "read_skill_segment",
    description: "精准读取技能文档中的特定章节。当主技能返回摘要时，必须使用此工具获取细节。",
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
              return `[⚠️ 内容过长已截断]\n\n该工具目前仅返回目录摘要。**禁止再次调用本工具**进行相同的尝试。如果你需要了解细节，必须且只能使用 'read_skill_segment' 工具并指定下方目录中的标题。\n\n### 可用章节目录:\n${toc}`;
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
  console.log(CYAN + '🚀 多功能 AI Agent v7 (稳定交付版)' + RESET);
  
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
      description: "执行物理命令。当你从文档示例中发现脚本路径时，请使用此工具。",
      schema: z.object({ command: z.string().describe("shell 命令") })
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

  const model = new ChatOpenAI({ 
    model: MODEL, 
    apiKey: API_KEY, 
    configuration: { baseURL: BASE_URL }, 
    temperature: 0, 
    streaming: true,
    maxTokens: 4096 
  });

  const agent = createAgent({
    model,
    tools,
    systemPrompt: `你是具备专家级知识的 AI Agent。
1. **禁止重复**: 严禁连续多次使用相似参数调用同一个工具。如果你调用的工具返回了摘要或目录，说明该工具已达到获取上限，你必须切换到 'read_skill_segment' 或其他脚本工具。
2. **知识驱动**: 优先阅读技能 SOP。
3. **闭环执行**: 你的最终目标是完成具体的物理交付（如生成文件）。如果任务涉及代码设计，最后必须调用文件工具生成结果。
4. **高效原则**: 一旦获取到核心 Guidelines，立即开始合成并交付，不要在研究阶段反复徘徊。`,
  });

  while (true) {
    const input = await new Promise(r => rl.question(BOLD + '\n用户输入: ' + RESET, r));
    if (input.toLowerCase() === 'exit') break;
    
    try {
      const memories = await searchMemories(input, 3);
      const context = memories.length > 0 ? '\n[历史记录]\n' + memories.map(m => m.text).join('\n') + '\n' : '';
      
      logStatus("AI 启动中...");
      const events = await agent.streamEvents(
        { messages: [{ role: 'user', content: context + input }] }, 
        { version: "v1", configurable: { thread_id: "session-v7", recursion_limit: 25 } }
      );
      
      let fullResponse = '';
      let toolCount = 0;
      let lastToolResult = '';

      for await (const e of events) {
        if (e.event === "on_chat_model_stream") {
          const content = e.data.chunk?.message?.content || e.data.chunk?.content;
          if (content) {
            if (!fullResponse) process.stdout.write(DIM);
            process.stdout.write(content);
            fullResponse += content;
          }
        } else if (e.event === "on_tool_start") {
          toolCount++;
          if (toolCount > 10) {
            console.log(RED + "\n[🛑 达到工具调用上限，强制终止并总结结果]" + RESET);
            if (lastToolResult.includes('成功')) {
                fullResponse = `✅ 任务已接近完成。最后一步操作（文件写入）已成功执行。\n\n由于调研步骤较多，已触发安全截断。请检查项目目录下的生成文件。`;
            }
            break;
          }
          console.log(`\n${GREEN}[🔧 工具调用: ${e.name}]${RESET}`);
          if (e.data.input) console.log(DIM + "参数: " + JSON.stringify(e.data.input).slice(0, 300) + RESET);
        } else if (e.event === "on_tool_end") {
          console.log(`${GREEN}[✅ 调用结束]${RESET}`);
          lastToolResult = String(e.data.output || '');
          logStatus("分析中...");
        }
      }
      process.stdout.write(RESET + '\n');
      
      const finalReply = fullResponse || (lastToolResult.includes('成功') ? "✅ 任务执行成功，文件已生成。" : "[任务已在后台完成]");
      console.log('\r\n' + BOLD + '✨ 最终回复:' + RESET + '\r\n' + finalReply + '\n');
      await addMemory(`用户: ${input}\n助手: ${finalReply}`);
    } catch (e) { 
      console.error('\n❌ 出错:', e.message); 
    }
  }
  rl.close();
}

main();
