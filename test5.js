import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { addMemory, searchMemories } from './memory.js';
import readline from 'readline';
import { execSync } from 'child_process';

//qn
// const MODEL = 'deepseek/deepseek-v3.2-251201';  //ok
// const MODEL = "minimax/minimax-m2.1";   //ok
// const MODEL = "z-ai/glm-4.7";   //ok

//openrouter
const MODEL = 'stepfun/step-3.5-flash:free';  //openrouter ok
// const MODEL = 'z-ai/glm-4.5-air:free';  //openrouter free，ok
// const MODEL = 'anthropic/claude-3-5-sonnet';  //支持 tool call

// const BASE_URL = "http://172.21.240.16:8000/v1";
// const BASE_URL = "https://api.qnaigc.com/v1"
const BASE_URL = "https://openrouter.ai/api/v1"

// API Key
// const API_KEY = process.env.OPENAI_API_KEY;
const API_KEY = process.env.OPENROUTER_API_KEY;

// 颜色常量
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Token统计
let totalInputTokens = 0;
let totalOutputTokens = 0;

// 定义工具
const getCamerasTool = tool(
  async ({ range }) => {
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
      return `检查${name}摄像头状态完成：视频流正常。ffprobe输出：${output.slice(0, 200)}`;
    } catch (err) {
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

// 创建LLM
const llm = new ChatOpenAI({
  model: MODEL,
  apiKey: API_KEY,
  configuration: { baseURL: BASE_URL },
  temperature: 0,
  streaming: false,
});

// 绑定工具
const llmWithTools = llm.bindTools(tools);

// 状态定义
const StateAnnotation = Annotation.Root({
  messages: Annotation({
    value: (x, y) => x.concat(y),
    default: () => [],
  }),
  currentState: Annotation({
    value: (x, y) => y ?? x,
    default: () => "start",
  }),
  retryCount: Annotation({
    value: (x, y) => y ?? x,
    default: () => 0,
  }),
  cameras: Annotation({
    value: (x, y) => y ?? x,
    default: () => [],
  }),
  checkResults: Annotation({
    value: (x, y) => y ?? x,
    default: () => [],
  }),
});

// router: 解析用户意图，决定下一步
async function routerNode(state) {
  console.log(`${GREEN}[📍 router] 分析用户意图...${RESET}`);

  const messages = state.messages;
  const lastMsg = messages[messages.length - 1];

  const response = await llmWithTools.invoke(messages);

  const hasGetCameras = response.tool_calls?.some(t => t.name === 'get_cameras');
  const hasCheckCamera = response.tool_calls?.some(t => t.name === 'check_camera');

  let nextState = END;
  if (hasGetCameras) {
    nextState = "getlist";
  } else if (hasCheckCamera) {
    nextState = "check";
  }

  return {
    messages: [response],
    currentState: nextState,
    retryCount: 0,
  };
}

// getlist: 获取摄像头列表
async function getlistNode(state) {
  console.log(`${GREEN}[📋 getlist] 获取摄像头列表...${RESET}`);

  const lastMsg = state.messages[state.messages.length - 1];
  const toolCall = lastMsg.tool_calls?.find(t => t.name === 'get_cameras');

  let cameras = [];
  if (toolCall) {
    try {
      const result = await getCamerasTool.invoke(toolCall.args);
      console.log(`${GREEN}[✅ getlist] 获取成功${RESET}`);

      // 解析摄像头列表
      const cameraRegex = /摄像头名称: "([^"]+)"\s+RTSP地址: "([^"]+)"/g;
      let match;
      while ((match = cameraRegex.exec(result)) !== null) {
        cameras.push({ name: match[1], url: match[2] });
      }
    } catch (e) {
      console.log(`${RED}[❌ getlist] 获取失败: ${e.message}${RESET}`);
    }
  }

  return {
    messages: [new ToolMessage({
      content: JSON.stringify(cameras),
      name: 'get_cameras',
    })],
    cameras,
    currentState: "check",
    retryCount: 0,
  };
}

// check: 检查摄像头
async function checkNode(state) {
  console.log(`${GREEN}[🔍 check] 检查摄像头状态...${RESET}`);

  let cameras = state.cameras;

  // 如果没有摄像头，先获取列表
  if (!cameras || cameras.length === 0) {
    console.log(`${GREEN}[🔍 check] 没有摄像头信息，转到getlist获取${RESET}`);
    return {
      messages: [new ToolMessage({
        content: "[]",
        name: 'check_camera',
      })],
      cameras: [],
      checkResults: [],
      currentState: "getlist",
      retryCount: 0,
    };
  }

  const checkResults = [];

  for (const camera of cameras) {
    try {
      console.log(`${GREEN}[🔧 检查摄像头] ${camera.name}${RESET}`);
      const result = await checkCameraTool.invoke({ url: camera.url, name: camera.name });
      checkResults.push({ name: camera.name, status: 'success', result });
    } catch (e) {
      checkResults.push({ name: camera.name, status: 'error', result: e.message });
    }
  }

  console.log(`${GREEN}[✅ check] 检查完成，共${checkResults.length}个摄像头${RESET}`);

  return {
    messages: [new ToolMessage({
      content: JSON.stringify(checkResults),
      name: 'check_results',
    })],
    checkResults,
    currentState: "report",
    retryCount: 0,
  };
}

// report: 生成报告
async function reportNode(state) {
  console.log(`${GREEN}[📊 report] 生成报告...${RESET}`);

  const checkResults = state.checkResults;

  const successCount = checkResults.filter(r => r.status === 'success').length;
  const errorCount = checkResults.filter(r => r.status === 'error').length;

  let report = `# 摄像头状态报告\n\n`;
  report += `## 总结\n`;
  report += `- 总数: ${checkResults.length}\n`;
  report += `- 正常: ${successCount}\n`;
  report += `- 异常: ${errorCount}\n\n`;
  report += `## 详细信息\n\n`;
  for (const r of checkResults) {
    report += `### ${r.name}\n`;
    report += `- 状态: ${r.status === 'success' ? '✅ 正常' : '❌ 异常'}\n`;
    report += `- 结果: ${r.result.slice(0, 100)}\n\n`;
  }

  return {
    messages: [new HumanMessage(report)],
    currentState: END,
    cameras: [],
    checkResults: [],
  };
}

// error: 错误处理
async function errorNode(state) {
  console.log(`${RED}[⚠️ error] 错误处理，重试次数: ${state.retryCount}${RESET}`);

  if (state.retryCount >= 3) {
    console.log(`${RED}[❌ error] 重试次数已达上限${RESET}`);
    return {
      messages: [new HumanMessage("多次尝试后失败，请重新输入请求。")],
      currentState: END,
      retryCount: 0,
    };
  }

  return {
    messages: [new HumanMessage("请重试您的请求。")],
    currentState: "start",
    retryCount: state.retryCount + 1,
  };
}

// 判断下一步状态
function decideNext(state) {
  return state.currentState || "start";
}

// 创建状态机图
const workflow = new StateGraph(StateAnnotation)
  .addNode("router", routerNode)
  .addNode("getlist", getlistNode)
  .addNode("check", checkNode)
  .addNode("report", reportNode)
  .addNode("error", errorNode)

  .addEdge(START, "router")
  .addConditionalEdges("router", decideNext)
  .addEdge("getlist", "check")
  .addConditionalEdges("check", decideNext)
  .addEdge("report", END)
  .addEdge("error", END);

// 编译图
const graph = workflow.compile();

async function main() {
  console.log('🤖 LangGraph Agent 已启动 (状态机版)');
  console.log('状态流程: router -> getlist/check -> check -> report (单次执行)');
  console.log('router会根据意图路由到对应节点或直接结束');
  console.log('输入 exit 退出\n');  

  while (true) {
    const userInput = await new Promise((resolve) => rl.question('用户输入: ', resolve));
    if (userInput.toLowerCase() === 'exit') {
      rl.close();
      break;
    }

    console.log('\n' + BOLD + '🤖 处理中...' + RESET + '\n');

    try {
      // 初始状态
      const initialState = {
        messages: [new HumanMessage(userInput)],
        currentState: "start",
        retryCount: 0,
        cameras: [],
        checkResults: [],
      };

      // 运行状态机
      const result = await graph.invoke(initialState);

      // 输出最终回复
      const messages = result.messages || [];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.content) {
        console.log('\r\n' + BOLD + '✨ 最终回复:' + RESET + '\r\n' + lastMsg.content);
      }

      // Token统计
      if (lastMsg?.usage_metadata) {
        const usage = lastMsg.usage_metadata;
        const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
        const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
        console.log(`${DIM}📊 Token消耗 - 输入: ${inputTokens}, 输出: ${outputTokens}, 总计: ${inputTokens + outputTokens}${RESET}`);
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        console.log(`${DIM}📈 累计消耗 - 输入: ${totalInputTokens}, 输出: ${totalOutputTokens}, 总计: ${totalInputTokens + totalOutputTokens}${RESET}`);
      }

      await addMemory(`用户: ${userInput}\n助手: ${lastMsg?.content || ''}`);
      console.log('\n✅ 任务完成\n');
    } catch (error) {
      console.error('❌ 执行出错:', error.message);
      console.error(error.stack);
    }
  }

  console.log('再见！');
}

main();
