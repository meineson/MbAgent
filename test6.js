import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import readline from 'readline';
import { addMemory, searchMemories } from './memory.js';

import allSkills from './skills_v3.js';

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:10808';
setGlobalDispatcher(new ProxyAgent(proxyUrl));

const MODEL = process.env.MODEL || 'gpt-3.5-turbo';
const BASE_URL = process.env.BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.API_KEY || process.env.OPENAI_API_KEY || '';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let totalInputTokens = 0;
let totalOutputTokens = 0;

const tools = [...allSkills.langchain];

const model = new ChatOpenAI({
  model: MODEL,
  apiKey: API_KEY,
  configuration: { baseURL: BASE_URL },
  temperature: 0,
  streaming: true,
  skipTokenCounting: true,
});

const agent = createAgent({
  model,
  tools,
  systemPrompt: `你是功能强大的 AI Agent，具备多种能力：
- 摄像头管理: 获取摄像头列表、检查摄像头状态
- 网络搜索: 搜索网络信息
- 天气查询: 获取城市天气
- 时间查询: 获取当前时间
- 数学计算: 执行计算
- 文件操作: 读取和写入文件
- 命令执行: 执行 shell 命令

根据用户需求选择合适的工具完成任务，给出简洁的结果。`,
});

async function main() {
  console.log('🤖 多功能 AI Agent 已启动 (含所有 skills)');
  console.log('可用工具:', tools.map(t => t.name).join(', '));
  console.log('输入 exit 退出\n');

  while (true) {
    const userInput = await new Promise((resolve) => rl.question('用户输入: ', resolve));
    if (userInput.toLowerCase() === 'exit') break;

    console.log('\n🤖 AI 思考中...\n');

    try {
      const relevantMemories = await searchMemories(userInput, 3);
      let context = '';
      if (relevantMemories.length > 0) {
        context = '\n[相关历史记录]\n' + relevantMemories.map(m => m.text).join('\n') + '\n';
      }

      const events = await agent.streamEvents(
        { messages: [{ role: 'user', content: context + userInput }] },
        { version: "v1", configurable: { thread_id: "skills" } }
      );

      let fullResponse = '';
      let lastResponse = '';
      let finalUsage = null;

      for await (const event of events) {
        switch (event.event) {
          case "on_chat_model_stream":
          case "on_llm_stream":
            const content = event.data.chunk?.message?.content || event.data.chunk?.content;
            if (content) {
              process.stdout.write(DIM + content + RESET);
              fullResponse += content;
            }
            break;

          case "on_tool_start":
            console.log(`\n${GREEN}[🔧 调用工具]${RESET} ${GREEN}${event.name}${RESET}`);
            if (event.data.input) {
              console.log(`${GREEN}输入:${RESET} ${GREEN}${JSON.stringify(event.data.input).slice(0, 200)}${RESET}`);
            }
            break;

          case "on_tool_end":
            console.log(`${GREEN}[✅ 工具返回]${RESET} ${GREEN}${event.name}${RESET}`);
            const toolOutput = event.data.output?.kwargs?.content || event.data.output?.content || event.data.output;
            if (typeof toolOutput === 'string') {
              console.log(GREEN + toolOutput.slice(0, 200) + RESET);
            }
            break;

          case "on_chain_end":
            if (event.name === "LangGraph") {
              const messages = event.data?.output?.messages;
              if (messages && messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                lastResponse = lastMsg.kwargs?.content || lastMsg.content;
                finalUsage = lastMsg.kwargs?.usage_metadata || lastMsg.usage_metadata;
              }
            }
            break;
        }
      }

      console.log('\r\n' + BOLD + '✨ 最终回复:' + RESET + '\r\n' + BOLD + lastResponse + RESET);

      if (finalUsage) {
        console.log(`${DIM}📊 Token消耗 - 输入: ${finalUsage.input_tokens}, 输出: ${finalUsage.output_tokens}, 总计: ${finalUsage.total_tokens}${RESET}`);
        totalInputTokens += finalUsage.input_tokens;
        totalOutputTokens += finalUsage.output_tokens;
      }

      await addMemory(`用户: ${userInput}\n助手: ${fullResponse}`);
      console.log('\n✅ 任务完成\n');
    } catch (error) {
      console.error('❌ 执行出错:', error.message);
      console.error(error.stack);
    }
  }

  rl.close();
  console.log('再见！');
}

main();