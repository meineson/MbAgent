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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const skillMap = {};
const state = { commands: new Set(), searchCount: 0 };

let spinnerInterval = null;
function startSpinner(text) {
  if (spinnerInterval) return;
  let i = 0; const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  spinnerInterval = setInterval(() => {
    process.stdout.write(`\r${CYAN}${frames[i++ % frames.length]} ${text}...${RESET}`);
  }, 80);
}
function stopSpinner() {
  if (spinnerInterval) { clearInterval(spinnerInterval); spinnerInterval = null; process.stdout.write('\r\x1b[K'); }
}

function withSafety(originalTools) {
  return originalTools.map(t => {
    const originalFunc = t.func;
    t.func = async (args, config) => {
      if (t.name === 'write_file' && args.filePath && state.commands.has(`file:${args.filePath}`)) {
        return `[⚠️ 拦截] 文件 '${args.filePath}' 已生成。`;
      }
      return originalFunc(args, config);
    };
    return t;
  });
}

async function loadMarkdownSkills(dirPath) {
  const mdSkills = [];
  async function scanDir(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.runtime_cache' && entry.name !== 'node_modules') await scanDir(fullPath);
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (!content.startsWith('---')) continue;
          const endI = content.indexOf('---', 3);
          if (endI === -1) continue;
          const metadata = yaml.load(content.slice(3, endI).trim());
          const name = metadata.name || entry.name.replace(/\.[^/.]+$/, "");
          skillMap[name] = path.relative(process.cwd(), currentDir);
          let files = []; try { files = await fs.readdir(currentDir); } catch (e) {}
          mdSkills.push(tool(async () => `[Files: ${files.join(', ')}]\n\n${content.slice(endI + 3).trim()}`, { 
            name, description: `(DOC) ${metadata.description}`, schema: z.object({ context: z.string().optional() }) 
          }));
        } catch (err) { console.error(`${RED}⚠️ 技能解析失败 ${fullPath}${RESET}`); }
      }
    }
  }
  try { await scanDir(dirPath); } catch (e) {}
  return mdSkills;
}

async function main() {
  console.log(CYAN + '🚀 MbAgent' + RESET);
  const execute_command = tool(
    async ({ command }) => {
      const cmd = command.trim();
      if (state.commands.has(cmd)) return `[⚠️ 拦截] 命令已执行。`;
      if (state.searchCount >= 10) return `[🛑 熔断] 调研上限。请立即交付成果。`;
      try {
        console.log(`\n${GREEN}[Exec]${RESET} ${DIM}${cmd}${RESET}`);
        const out = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
        state.commands.add(cmd);
        if (cmd.includes('search.js') || cmd.includes('search.py')) state.searchCount++;
        return out || "[Success]";
      } catch (e) { return `Error: ${e.message}`; }
    },
    { name: "execute_command", description: "执行 Shell 命令。", schema: z.object({ command: z.string() }) }
  );

  const skillDirs = ['./agent_skills', './.agents/skills'];
  let allMdSkills = [];
  for (const dir of skillDirs) {
    if (await fs.access(dir).then(()=>true).catch(()=>false)) {
      allMdSkills.push(...(await loadMarkdownSkills(dir)));
    }
  }

  const tools = withSafety([execute_command, ...allSkills.langchain, ...allMdSkills]);
  console.log(`${DIM}可用工具: ${tools.map(t => t.name).sort().join(', ')}${RESET}\n`);

  const model = new ChatOpenAI({ model: MODEL, apiKey: API_KEY, configuration: { baseURL: BASE_URL }, temperature: 0, streaming: true, maxTokens: 16384 });
  const agent = createAgent({
    model, tools,
    systemPrompt: `你是顶级执行力 AI Agent。
1. **技能地图**: ${Object.entries(skillMap).map(([n, d]) => `${n}: ${d}/`).join(', ')}
2. **执行规则**: 发现命令示例后立即使用 execute_command 运行。
3. **闭环交付**: 最终任务必须生成物理文件（如 index.html）。生成后，必须告知用户。`,
  });

  while (true) {
    const input = await new Promise(r => rl.question(BOLD + '\nUser: ' + RESET, r));
    if (input.toLowerCase() === 'exit') break;
    state.commands.clear(); state.searchCount = 0;

    try {
      startSpinner("Thinking");
      const events = await agent.streamEvents({ messages: [{ role: 'user', content: input }] }, { version: "v1", recursionLimit: 50, configurable: { thread_id: "v7-final-fix" } });
      
      let fullResponse = '';
      let lastMessageContent = '';

      for await (const e of events) {
        if (e.event === "on_chat_model_stream") {
          const c = e.data.chunk?.message?.content || e.data.chunk?.content;
          if (c) { stopSpinner(); process.stdout.write(DIM + c + RESET); fullResponse += c; }
        } else if (e.event === "on_tool_start") {
          stopSpinner();
          console.log(`\n${GREEN}[🔧 Tool: ${e.name}]${RESET}`);
          if (e.data.input) console.log(DIM + "Input: " + JSON.stringify(e.data.input).slice(0, 200) + RESET);
          if (e.name === 'write_file') state.commands.add(`file:${e.data.input.filePath}`);
        } else if (e.event === "on_tool_end") {
          console.log(`${GREEN}[✅ Done]${RESET}`);
          startSpinner("Analyzing result");
        } else if (e.event === "on_chain_end") {
          // 捕获链结束时的最后一条消息
          const msgs = e.data?.output?.messages || e.data?.output?.output?.messages;
          if (msgs && msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            lastMessageContent = last.content || last.kwargs?.content || '';
          }
        }
      }
      stopSpinner();
      process.stdout.write('\n');
      
      // 核心逻辑：如果流式采集的内容太短（比如只说了开场白），则使用最终态的消息内容
      const finalResult = (fullResponse.length > lastMessageContent.length) ? fullResponse : lastMessageContent;
      
      console.log('\r\n' + BOLD + '✨ Result:' + RESET + '\r\n' + (finalResult || "[Task Completed]") + '\n');
      await addMemory(`User: ${input}\nAssistant: ${finalResult}`);
    } catch (e) { stopSpinner(); console.error('\n❌ Error:', e.message); }
  }
  rl.close();
}
main();
