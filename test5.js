import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, ToolMessage, AIMessageChunk } from "@langchain/core/messages";
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

// Zod状态定义
const StateSchema = z.object({
  messages: z.array(z.any()),
  currentState: z.enum(["router", "getlist", "check", "report", "error"]).optional(),
  nextAction: z.enum(["check", "report"]).optional(),
  retryCount: z.number().default(0),
  cameras: z.array(z.object({
    name: z.string(),
    url: z.string(),
  })).default([]),
  checkResults: z.array(z.object({
    name: z.string(),
    status: z.string(),
    result: z.string(),
  })).default([]),
  isValidFlow: z.boolean().default(false),  // 标记是否是有效流程
  userInput: z.string().optional(),  // 保存用户原始输入
});

// router: 解析用户意图，决定下一步
async function routerNode(state) {
  const messages = state.messages;
  const response = await llmWithTools.invoke(messages);

  const hasGetCameras = response.tool_calls?.some(t => t.name === 'get_cameras');
  const hasCheckCamera = response.tool_calls?.some(t => t.name === 'check_camera');

  console.log(`${GREEN}[📍 router] LLM返回: ${response.content?.slice(0, 80) || 'tool_calls: ' + (response.tool_calls?.length || 0)}${RESET}`);

  if (hasGetCameras && hasCheckCamera) {
    console.log(`${GREEN}[📍 router] -> getlist -> check${RESET}`);
    return {
      messages: [response],
      currentState: "getlist",
      nextAction: "check",
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  } else if (hasGetCameras) {
    console.log(`${GREEN}[📍 router] -> getlist -> report${RESET}`);
    return {
      messages: [response],
      currentState: "getlist",
      nextAction: "report",
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  } else if (hasCheckCamera) {
    console.log(`${GREEN}[📍 router] -> check${RESET}`);
    return {
      messages: [response],
      currentState: "check",
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  }

  if (response.content) {
    console.log(`${GREEN}[📍 router] -> END (LLM直接回复)${RESET}`);
    return {
      messages: [response],
      currentState: END,
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  }

  console.log(`${GREEN}[📍 router] -> END (需要工具调用)${RESET}`);
  return {
    messages: [new HumanMessage("请明确您的需求，例如：\n- 查看所有摄像头列表\n- 检查所有摄像头状态")],
    currentState: END,
    retryCount: 0,
    isValidFlow: false,
    userInput: state.userInput,
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
      console.log(`${GREEN}[✅ getlist] 获取成功: ${result}${RESET}`);

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
    currentState: state.nextAction || "report",
    retryCount: 0,
    isValidFlow: true,
    userInput: state.userInput,
  };
}

// check: 检查摄像头
async function checkNode(state) {
  console.log(`${GREEN}[🔍 check] 检查摄像头状态...${RESET}`);

  const messages = state.messages;
  const lastMsg = messages[messages.length - 1];

  // 从tool_call中获取check_camera调用
  const toolCalls = lastMsg.tool_calls?.filter(t => t.name === 'check_camera') || [];

  if (toolCalls.length === 0) {
    // 没有明确指定摄像头，检查所有摄像头
    console.log(`${GREEN}[🔍 check] 未指定摄像头，检查所有${RESET}`);
    const cameras = state.cameras || [];

    if (cameras.length === 0) {
      return {
        messages: [new ToolMessage({ content: "[]", name: 'check_results' })],
        checkResults: [],
        currentState: "getlist",
        retryCount: state.retryCount || 0,
        isValidFlow: true,
        userInput: state.userInput,
      };
    }

    const checkResults = [];
    for (const camera of cameras) {
      try {
        console.log(`${GREEN}[🔧 检查] ${camera.name}${RESET}`);
        const result = await checkCameraTool.invoke({ url: camera.url, name: camera.name });
        checkResults.push({ name: camera.name, status: 'success', result });
      } catch (e) {
        checkResults.push({ name: camera.name, status: 'error', result: e.message });
      }
    }

    console.log(`${GREEN}[✅ check] 完成，共${checkResults.length}个${RESET}`);

    return {
      messages: [new ToolMessage({ content: JSON.stringify(checkResults), name: 'check_results' })],
      checkResults,
      currentState: "report",
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  }

  const checkResults = [];

  // 执行所有检查任务
  for (const toolCall of toolCalls) {
    const { url, name } = toolCall.args || {};
    if (!url || !name) continue;

    try {
      console.log(`${GREEN}[🔧 检查] ${name}${RESET}`);
      const result = await checkCameraTool.invoke({ url, name });
      checkResults.push({ name, status: 'success', result });
    } catch (e) {
      checkResults.push({ name, status: 'error', result: e.message });
    }
  }

  console.log(`${GREEN}[✅ check] 完成，共${checkResults.length}个${RESET}`);

  return {
    messages: [new ToolMessage({ content: JSON.stringify(checkResults), name: 'check_results' })],
    checkResults,
    currentState: "report",
    retryCount: 0,
    isValidFlow: true,
    userInput: state.userInput,
  };
}

// report: 让LLM决定是回复还是继续调用工具
async function reportNode(state) {
  console.log(`${GREEN}[📊 report] 生成回复中...${RESET}`);

  const messages = state.messages;
  const userInput = state.userInput || "";

  // 获取工具结果
  const toolResultMsg = messages.find(m => m.name === 'get_cameras' || m.name === 'check_results');
  const toolResult = toolResultMsg?.content || "";

  // 发送给LLM决定下一步
  const prompt = `用户原始请求: ${userInput}

工具返回结果:
${toolResult}

请根据用户请求和工具结果，决定：
1. 如果用户需求已满足，直接生成简洁的中文回复
2. 如果需要调用工具才能完成需求，请调用合适的工具`;

  const response = await llmWithTools.invoke([new HumanMessage(prompt)]);

  // 检查是否需要继续调用工具
  const hasGetCameras = response.tool_calls?.some(t => t.name === 'get_cameras');
  const hasCheckCamera = response.tool_calls?.some(t => t.name === 'check_camera');

  if (hasGetCameras || hasCheckCamera) {
    console.log(`${GREEN}[📊 report] -> 继续调用工具${RESET}`);
    return {
      messages: [response],
      currentState: response.tool_calls[0].name === 'get_cameras' ? "getlist" : "check",
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  }

  // 直接回复
  console.log(`${GREEN}[📊 report] -> 结束${RESET}`);
  return {
    messages: [response],
    currentState: END,
    cameras: [],
    checkResults: [],
    isValidFlow: true,
    userInput: state.userInput,
  };
}

// error: 错误处理
async function errorNode(state) {
  console.log(`${RED}[⚠️ error] 重试次数: ${state.retryCount}${RESET}`);

  if (state.retryCount >= 3) {
    console.log(`${RED}[❌ error] 重试达上限${RESET}`);
    return {
      messages: [new HumanMessage("多次尝试后失败，请重新输入请求。")],
      currentState: END,
      retryCount: 0,
      isValidFlow: false,
    };
  }

  return {
    messages: [new HumanMessage("请重试您的请求。")],
    currentState: "router",
    retryCount: state.retryCount + 1,
    isValidFlow: false,
  };
}

// 创建状态机图
const workflow = new StateGraph(StateSchema)
  .addNode("router", routerNode)
  .addNode("getlist", getlistNode)
  .addNode("check", checkNode)
  .addNode("report", reportNode)
  .addNode("error", errorNode)

  .addEdge(START, "router")

  .addConditionalEdges("router", (state) => state.currentState || END, {
    getlist: "getlist",
    check: "check",
    error: "error",
    [END]: END,
  })

  .addConditionalEdges("getlist", (state) => state.currentState || "report", {
    check: "check",
    report: "report",
    [END]: END,
  })

  .addConditionalEdges("check", (state) => state.currentState || "report", {
    getlist: "getlist",
    report: "report",
    error: "error",
    [END]: "report",
  })

  .addConditionalEdges("report", (state) => state.currentState || END, {
    getlist: "getlist",
    check: "check",
    report: "report",
    error: "error",
    [END]: END,
  })

  .addEdge("error", END);

// 编译图
const graph = workflow.compile();

async function main() {
  console.log('🤖 LangGraph Agent 已启动 (状态机版)');
  console.log('状态: router -> getlist -> check -> report');
  console.log('输入 exit 退出\n');

  while (true) {
    const userInput = await new Promise((resolve) => rl.question('用户输入: ', resolve));
    if (userInput.toLowerCase() === 'exit') {
      rl.close();
      break;
    }

    console.log('\n' + BOLD + '🤖 处理中...' + RESET + '\n');

    try {
      const initialState = {
        messages: [new HumanMessage(userInput)],
        currentState: "router",
        retryCount: 0,
        cameras: [],
        checkResults: [],
        userInput,
      };

      const result = await graph.invoke(initialState);

      const messages = result.messages || [];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.content) {
        console.log('\r\n' + BOLD + '✨ 最终回复:' + RESET + '\r\n' + lastMsg.content);
      }

      if (lastMsg?.usage_metadata) {
        const usage = lastMsg.usage_metadata;
        const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
        const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
        console.log(`${DIM}📊 Token消耗 - 输入: ${inputTokens}, 输出: ${outputTokens}, 总计: ${inputTokens + outputTokens}${RESET}`);
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        console.log(`${DIM}📈 累计 - 输入: ${totalInputTokens}, 输出: ${totalOutputTokens}, 总计: ${totalInputTokens + totalOutputTokens}${RESET}`);
      }

      // 根据流程状态决定是否保存到memory
      // if (result.isValidFlow && lastMsg?.content) {
      //   await addMemory(`用户: ${userInput}\n助手: ${lastMsg.content}`);
      // }
      console.log('\n✅ 任务完成\n');
    } catch (error) {
      console.error('❌ 执行出错:', error.message);
      console.error(error.stack);
    }
  }

  console.log('再见！');
}

main();
