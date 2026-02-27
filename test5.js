import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, ToolMessage, AIMessageChunk, SystemMessage } from "@langchain/core/messages";
import readline from 'readline';
import { execSync } from 'child_process';
import { addMemory, searchMemories } from './memory.js';

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:10808';
setGlobalDispatcher(new ProxyAgent(proxyUrl));

const MODEL = process.env.MODEL || 'gpt-3.5-turbo';
const BASE_URL = process.env.BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.API_KEY || process.env.OPENAI_API_KEY || '';

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
  streaming: false  
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
  console.log(`${GREEN}[📍 router] messages(${state.messages.length})${RESET}`);

  const systemMsg = new SystemMessage(`你是摄像头助手，只能处理以下相关问题：
1. 查询摄像头列表 - 调用 get_cameras
2. 检查摄像头状态 - 调用 check_camera（需要摄像头RTSP地址和名称）

如果用户问题与摄像头无关，直接回复："我是摄像头助手，无法回答此问题。"
不要编造工具调用。`);

  const response = await llmWithTools.invoke([systemMsg, ...state.messages]);

  const hasGetCameras = response.tool_calls?.some(t => t.name === 'get_cameras');
  const hasCheckCamera = response.tool_calls?.some(t => t.name === 'check_camera');

  console.log(`${GREEN}[📍 router] LLM返回: tc=${response.tool_calls?.length || 0}${RESET}`);

  if (hasGetCameras && hasCheckCamera) {
    console.log(`${GREEN}[📍 router] -> getlist -> check${RESET}`);
    return {
      messages: [...state.messages, response],
      currentState: "getlist",
      nextAction: "check",
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  } else if (hasGetCameras) {
    console.log(`${GREEN}[📍 router] -> getlist -> report${RESET}`);
    return {
      messages: [...state.messages, response],
      currentState: "getlist",
      nextAction: "report",
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  } else if (hasCheckCamera) {
    console.log(`${GREEN}[📍 router] -> check${RESET}`);
    return {
      messages: [...state.messages, response],
      currentState: "check",
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  }

  // 无工具调用，直接结束
  console.log(`${GREEN}[📍 router] -> END${RESET}`);
  return {
    messages: [...state.messages, response],
    currentState: END,
    retryCount: 0,
    isValidFlow: true,
    userInput: state.userInput,
  };
}

// getlist: 获取摄像头列表
async function getlistNode(state) {
  console.log(`${GREEN}[📋 getlist] 获取摄像头列表...${RESET}`);
  console.log(`${GREEN}[📋 getlist] messages(${state.messages.length})${RESET}`);

  const lastMsg = state.messages[state.messages.length - 1];
  const toolCall = lastMsg.tool_calls?.find(t => t.name === 'get_cameras');

  let cameras = [];
  if (toolCall) {
    try {
      const result = await getCamerasTool.invoke(toolCall.args);
      console.log(`${GREEN}[✅ getlist] 获取成功${RESET}`);

      const cameraRegex = /摄像头名称: "([^"]+)"\s+RTSP地址: "([^"]+)"/g;
      let match;
      while ((match = cameraRegex.exec(result)) !== null) {
        cameras.push({ name: match[1], url: match[2] });
      }
    } catch (e) {
      console.log(`${RED}[❌ getlist] 获取失败: ${e.message}${RESET}`);
    }
  }

  const toolMessage = new ToolMessage({
    content: JSON.stringify(cameras),
    name: 'get_cameras',
    tool_call_id: toolCall?.id || '',
  });

  return {
    messages: [...state.messages, toolMessage],
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
  const cameras = state.cameras || [];

  // 调试：打印所有消息
  console.log(`${GREEN}[🔍 check] messages(${messages.length}):${RESET}`);
  messages.forEach((m, i) => {
    const type = m._getType?.() || m.type || m.constructor.name;
    const tc = m.tool_calls?.length ? ` tc=${m.tool_calls.length}` : '';
    const tcId = m.tool_call_id ? ` id=${m.tool_call_id}` : '';
    const name = m.name ? ` name=${m.name}` : '';
    const content = m.content?.slice(0, 200) || '';
    console.log(`${DIM}  [${i}] ${type}${tc}${tcId}${name}: ${content}${RESET}`);
  });

  // 从tool_call中获取check_camera调用
  const toolCalls = lastMsg.tool_calls?.filter(t => t.name === 'check_camera') || [];

  console.log(`${GREEN}[🔍 check] cameras: ${cameras.length}, toolCalls: ${toolCalls.length}${RESET}`);

  const checkResults = [];

  for (const toolCall of toolCalls) {
    let { url, name } = toolCall.args || {};

    // 如果缺少参数，从cameras中匹配补充
    if ((!url || !name) && cameras.length > 0) {
      // 根据已有的参数匹配摄像头
      const matchedCam = cameras.find(c =>
        (url && c.url === url) || (name && c.name === name)
      );
      if (matchedCam) {
        url = url || matchedCam.url;
        name = name || matchedCam.name;
      }
    }

    // 如果还是没有完整信息，跳过
    if (!url || !name) {
      console.log(`${RED}[⚠️ check] 缺少摄像头信息，跳过${RESET}`);
      continue;
    }

    try {
      console.log(`${GREEN}[🔧 检查] ${name}${RESET}`);
      const result = await checkCameraTool.invoke({ url, name });
      checkResults.push({ name, status: 'success', result });
    } catch (e) {
      checkResults.push({ name, status: 'error', result: e.message });
    }
  }

  console.log(`${GREEN}[✅ check] 完成，共${checkResults.length}个${RESET}`);

  // 为每个check_camera调用创建对应的ToolMessage
  const toolMessages = checkResults.map((result, i) => {
    const toolCall = toolCalls[i];
    return new ToolMessage({
      content: `检查${result.name}摄像头状态完成：${result.status === 'success' ? '视频流正常' : '连接失败'}。${result.result}`,
      name: 'check_camera',
      tool_call_id: toolCall?.id || `call_${i}`,
    });
  });

  return {
    messages: [...state.messages, ...toolMessages],
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

  // 调试：打印消息
  console.log(`${GREEN}[📊 report] messages(${messages.length}):${RESET}`);
  messages.forEach((m, i) => {
    const type = m._getType?.() || m.type || m.constructor.name;
    const tc = m.tool_calls?.length ? ` tc=${m.tool_calls.length}` : '';
    const tcId = m.tool_call_id ? ` id=${m.tool_call_id}` : '';
    const name = m.name ? ` name=${m.name}` : '';
    const content = m.content?.slice(0, 200) || '';
    console.log(`${DIM}  [${i}] ${type}${tc}${tcId}${name}: ${content}${RESET}`);
  });

  // 发送给LLM - 传递完整消息历史 + system prompt
  const systemMsg = new SystemMessage(`根据对话历史，决定下一步：
1. 如果需要调用工具才能完成用户需求，生成合适的tool_calls
2. 如果用户需求已满足，直接生成简洁的中文回复
3. 如果工具没有返回有效结果或没找到相关信息，明确回复"未找到相关信息"，不要编造数据`);

  const response = await llmWithTools.invoke([systemMsg, ...messages]);

  console.log(`${GREEN}[📊 report] LLM响应: tc=${response.tool_calls?.length || 0}${RESET}`);

  // 检查是否需要继续调用工具
  const hasGetCameras = response.tool_calls?.some(t => t.name === 'get_cameras');
  const hasCheckCamera = response.tool_calls?.some(t => t.name === 'check_camera');

  if (hasGetCameras || hasCheckCamera) {
    console.log(`${GREEN}[📊 report] -> 继续调用工具: ${response.tool_calls.map(t => t.name).join(', ')}${RESET}`);

    const firstTool = response.tool_calls[0];
    const nextState = firstTool.name === 'get_cameras' ? "getlist" : "check";
    return {
      messages: [...messages, response],
      currentState: nextState,
      retryCount: 0,
      isValidFlow: true,
      userInput: state.userInput,
    };
  }

  // 直接回复（包含找不到相关信息的情况）
  console.log(`${GREEN}[📊 report] -> 结束${RESET}`);
  return {
    messages: [...messages, response],
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
      messages: [...state.messages, new HumanMessage("多次尝试后失败，请重新输入请求。")],
      currentState: END,
      retryCount: 0,
      isValidFlow: false,
      userInput: state.userInput,
    };
  }

  return {
    messages: [...state.messages, new HumanMessage("请重试您的请求。")],
    currentState: "router",
    retryCount: state.retryCount + 1,
    isValidFlow: false,
    userInput: state.userInput,
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
  console.log('🤖 LangGraph Agent 已启动 (含长期记忆功能)');
  console.log('状态: router -> getlist -> check -> report');
  console.log('输入 exit 退出\n');

  // System prompt
  const SYSTEM_PROMPT = `你是 AI Agent，必须分析用户意图并调用合适的工具完成任务，只给出简洁的结果。",
`;

  while (true) {
    const rawUserInput = await new Promise((resolve) => rl.question('用户输入: ', resolve));
    if (rawUserInput.toLowerCase() === 'exit') break;

    console.log('\n' + BOLD + '🤖 处理中...' + RESET + '\n');

    try {
      // 检索相关记忆
      const relevantMemories = await searchMemories(rawUserInput, 3);
      let context = '';
      if (relevantMemories.length > 0) {
        context = '\n[相关历史记录]\n' + relevantMemories.map(m => m.text).join('\n') + '\n';
      }

      // 构建用户输入（附加记忆）
      const fullUserInput = rawUserInput + context;

      const initialState = {
        messages: [
          new SystemMessage(SYSTEM_PROMPT),
          new HumanMessage(fullUserInput),
        ],
        currentState: "router",
        retryCount: 0,
        cameras: [],
        checkResults: [],
        userInput: rawUserInput,
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

      // 保存到记忆
      if (result.isValidFlow && lastMsg?.content) {
        await addMemory(`用户: ${rawUserInput}\n助手: ${lastMsg.content}`);
      }
      console.log('\n✅ 任务完成\n');
    } catch (error) {
      console.error('❌ 执行出错:', error.message);
      if (error.response?.body) {
        console.error('❌ 响应体:', JSON.stringify(error.response.body, null, 2));
      }
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  console.log('再见！');
}

main();
