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

const USE_PROXY = process.env.USE_PROXY === 'true';
if (USE_PROXY) {
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:10808';
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const MODEL = process.env.MODEL || 'gpt-4-turbo';
const BASE_URL = process.env.BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.API_KEY || process.env.OPENAI_API_KEY || '';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const COMMAND_LIMIT = 20;
const state = { commands: new Set() };

let spinnerInterval = null;
function startSpinner(text) {
  if (spinnerInterval) return;
  let i = 0;
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  spinnerInterval = setInterval(() => {
    process.stdout.write(`\r${CYAN}${frames[i++ % frames.length]} ${text}...${RESET}`);
  }, 80);
}
function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write('\r\x1b[K');
  }
}

async function loadSkillMetadata(dirPath) {
  const skills = [];
  async function scanDir(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.runtime_cache' && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          await scanDir(fullPath);
        }
      } else if (entry.name.toLowerCase() === 'skill.md') {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (!content.startsWith('---')) continue;
          const endI = content.indexOf('\n---', 3);
          if (endI === -1) continue;
          const metadata = yaml.load(content.slice(3, endI).trim());
          const name = metadata.name || path.basename(currentDir);
          const description = metadata.description || '';
          skills.push({ name, description, dirPath: currentDir });
        } catch (err) {
          console.error(`${RED}⚠️ 技能解析失败 ${fullPath}${RESET}`);
        }
      }
    }
  }
  try { await scanDir(dirPath); } catch (e) {}
  return skills;
}

async function loadSkillContent(skillDir) {
  const content = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf-8');
  const endI = content.indexOf('\n---', 3);
  const body = endI !== -1 ? content.slice(endI + 4).trim() : content;
  const absPath = path.resolve(skillDir);
  return `**技能目录**: ${absPath}\n\n${body}`;
}

function createLazySkillTool(skill) {
  return tool(
    async () => {
      const content = await loadSkillContent(skill.dirPath);
      return content;
    },
    { name: skill.name, description: skill.description, schema: z.object({}) }
  );
}

async function main() {
  console.log(CYAN + '🚀 MbAgent' + RESET);

  const execute_command = tool(
    async ({ command }) => {
      const cmd = command.trim();
      if (state.commands.size >= COMMAND_LIMIT) {
        return `[🛑 熔断] 命令上限(${COMMAND_LIMIT})已达到，请立即交付成果。`;
      }
      try {
        console.log(`\n${GREEN}[执行]${RESET} ${DIM}${cmd}${RESET}`);
        const out = execSync(cmd, { encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
        state.commands.add(cmd);
        console.log(`${GREEN}[✅ 命令完成]${RESET}`);
        return out || "[成功]";
      } catch (e) {
        state.commands.add(cmd);
        console.error(`${RED}[❌ 命令失败]${RESET} ${e.message}`);
        return `命令执行失败: ${e.message}\n${e.stderr || ''}`;
      }
    },
    { name: "execute_command", description: "执行 Shell 命令。", schema: z.object({ command: z.string() }) }
  );

  const skillDirs = ['./agent_skills', './.agents/skills'];
  let allSkillMetadata = [];
  for (const dir of skillDirs) {
    if (await fs.access(dir).then(() => true).catch(() => false)) {
      allSkillMetadata.push(...(await loadSkillMetadata(dir)));
    }
  }

  const skillTools = allSkillMetadata.map(createLazySkillTool);
  const tools = [execute_command, ...allSkills.langchain, ...skillTools];
  console.log(`${DIM}可用工具: ${tools.map(t => t.name).sort().join(', ')}${RESET}\n`);

const model = new ChatOpenAI({
    model: MODEL,
    apiKey: API_KEY,
    configuration: { baseURL: BASE_URL },
    temperature: 0,
    streaming: true,
    maxTokens: 16384,
    timeout: 120000
  });

  const agent = createAgent({
    model,
    tools,
    systemPrompt: `你是顶级执行力 AI Agent。
1. **技能路径**: 技能文档中的相对路径需转换为技能目录下的绝对路径。例如技能目录是 /path/to/skill，命令中的 scripts/search.py 应改为 /path/to/skill/scripts/search.py。
2. **执行规则**: 发现命令示例后立即使用 execute_command 运行。
3. **闭环交付**: 根据用户任务决定交付形式。若需要生成文件，使用 write_file 工具创建；若只需回答或执行，直接回复结果。`,
  });

  while (true) {
    const input = await new Promise(r => rl.question(BOLD + '\nUser: ' + RESET, r));
    if (input.toLowerCase() === 'exit') break;
    state.commands.clear();

    try {
      startSpinner("思考中");
      const events = await agent.streamEvents(
        { messages: [{ role: 'user', content: input }] },
        { version: "v1", recursionLimit: 50, configurable: { thread_id: "v7-final-fix" } }
      );

      let fullResponse = '';
      let lastMessageContent = '';

      for await (const e of events) {
        if (e.event === "on_chat_model_stream") {
          const c = e.data.chunk?.message?.content || e.data.chunk?.content;
          if (c) {
            stopSpinner();
            process.stdout.write(DIM + c + RESET);
            fullResponse += c;
          }
        } else if (e.event === "on_tool_start") {
          stopSpinner();
          console.log(`\n${GREEN}[🔧 工具: ${e.name}]${RESET}`);
          if (e.data.input) console.log(DIM + "输入: " + JSON.stringify(e.data.input).slice(0, 200) + RESET);
        } else if (e.event === "on_tool_end") {
          console.log(`${GREEN}[✅ 完成]${RESET}`);
          startSpinner("分析结果");
        } else if (e.event === "on_chain_end") {
          const msgs = e.data?.output?.messages || e.data?.output?.output?.messages;
          if (msgs && msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            lastMessageContent = last.content || last.kwargs?.content || '';
          }
        }
      }
      stopSpinner();
      process.stdout.write('\n');

      const finalResult = fullResponse.length > lastMessageContent.length ? fullResponse : lastMessageContent;
      console.log('\r\n' + BOLD + '✨ 结果:' + RESET + '\r\n' + (finalResult || "[任务完成]") + '\n');
      await addMemory(`User: ${input}\nAssistant: ${finalResult}`);
} catch (e) {
      stopSpinner();
      console.error('\n❌ 错误:', e.message);
      if (e.stack) console.error('堆栈:', e.stack);
    }
  }
  rl.close();
}

main();