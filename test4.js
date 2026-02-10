import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import readline from 'readline';
import { execSync } from 'child_process';
import { addMemory, searchMemories } from './memory.js';

const MODEL = 'deepseek/deepseek-v3.2-251201';  //ok
// const MODEL = "minimax/minimax-m2.1";   //ok
// const MODEL = "z-ai/glm-4.7";   //ok

// const BASE_URL = "http://172.21.240.16:8000/v1";
const BASE_URL = "https://api.qnaigc.com/v1"


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Token统计
let totalInputTokens = 0;
let totalOutputTokens = 0;

// 定义工具 - LangChain 1.x 格式
const getCamerasTool = tool(
  async ({ range }) => {
    console.log('🔧 [get_cameras] 工具被调用');
    console.log('参数:', JSON.stringify({ range }));

    const cameras = [
      { id: 1, name: '门口', url: 'rtsp://172.21.132.230/url1' },
      { id: 2, name: '办公室', url: 'rtsp://172.21.132.230:554/rtp/32020000002000000003_32020000001320000020?originTypeStr=rtp_push' },
      { id: 3, name: '广场', url: 'rtsp://172.21.132.230/url3' },
    ];
    let resp = `已成功获取所有摄像头，列表如下：\n\n`;
    cameras.forEach((cam) => {
      resp += `摄像头名称: "${cam.name}"\nRTSP地址: "${cam.url}"\n\n`;
    });
    return resp;
  },
  {
    name: 'get_cameras',
    description: '获取所有在线的网络摄像头，返回结果包含摄像头的名称、编号和RTSP地址。',
    schema: z.object({
      range: z.enum(["all"]).describe("摄像头范围，目前只有所有all。")
    }),
  }
);

const checkCameraTool = tool(
  async ({ url, name }) => {
    console.log(`\n🔧 执行ffprobe检查RTSP流: ${name}...`);

    try {
      const output = execSync(
        `ffprobe -timeout 3000000 -v error -show_entries stream=codec_name,codec_type -of default=noprint_wrappers=1 '${url}'`,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 1024,
        }
      );
      console.log('✅ ffprobe 执行成功');
      return `检查${name}摄像头状态完成：视频流正常。ffprobe输出：${output.slice(0, 200)}`;
    } catch (err) {
      console.error('❌ ffprobe 执行失败:', err.stderr?.toString()?.substring(0, 200) || err.message);
      const errorOutput = err.stderr?.toString() || err.message || '无法连接';
      return `检查${name}摄像头状态完成：连接失败。错误信息：${errorOutput.slice(0, 200)}`;
    }
  },
  {
    name: 'check_camera',
    description: '用获取到的摄像头的RTSP播放地址来检查摄像头的状态，输出结果是ffprobe程序的输出。',
    schema: z.object({
      url: z.string().describe('摄像头的RTSP播放地址'),
      name: z.string().describe('摄像头的名称'),
    }),
  }
);

const tools = [getCamerasTool, checkCameraTool];

const model = new ChatOpenAI({
  model: MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: BASE_URL },
  temperature: 0,
  streaming: true,
  skipTokenCounting: true,
});

const agent = createAgent({
  model,
  tools,
  systemPrompt: "你是 AI Agent，必须分析用户意图并调用合适的工具完成任务。",
});

async function main() {
  console.log('🤖 AI Agent 已启动 (含长期记忆功能)');
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
        { version: "v1", configurable: { thread_id: "1" } }
      );

      let fullResponse = '';
      let hasUsage = false;
      let usage = null;

      let agentStarted = false;
      let agentEnded = false;

      for await (const event of events) {
        switch (event.event) {
          case "on_chain_start":
            if (!agentStarted ) {
              console.log("\n[🤖 Agent 启动]", event.name);
              agentStarted = true;
            }
            break;

          case "on_chat_model_stream":
          case "on_llm_stream":
            const content = event.data.chunk?.message?.content || event.data.chunk?.content;
            if (content) {
              process.stdout.write(content);
              fullResponse += content;
            }
            break;

          case "on_tool_start":
            console.log(`\n[🔧 调用工具] ${event.name}`);
            if (event.data.input) {
              console.log("输入:", JSON.stringify(event.data.input).slice(0, 200));
            }
            break;

          case "on_tool_end":
            console.log(`\n[✅ 工具返回] ${event.name}`);
            if (typeof event.data.output === 'string') {
              console.log("输出:", event.data.output.slice(0, 200));
            }
            break;

          case "on_chain_end":
            if (!agentEnded) {
              console.log("\n[🏁 Agent 结束]", event.name);
              agentEnded = true;
            }
            break;
        }
      }
      console.log();

      const messages = agent.memory?.chatHistory?.messages || [];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.usage_metadata) {
        usage = lastMsg.usage_metadata;
        console.log(`\n📊 Token消耗 - 输入: ${usage.input_tokens}, 输出: ${usage.output_tokens}, 总计: ${usage.total_tokens}`);
        totalInputTokens += usage.input_tokens;
        totalOutputTokens += usage.output_tokens;
        console.log(`📈 累计消耗 - 输入: ${totalInputTokens}, 输出: ${totalOutputTokens}, 总计: ${totalInputTokens + totalOutputTokens}`);
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
