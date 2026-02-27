import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { execSync } from 'child_process';
import readline from 'readline';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:10808';
setGlobalDispatcher(new ProxyAgent(proxyUrl));

const MODEL = process.env.MODEL || 'gpt-3.5-turbo';
const BASE_URL = process.env.BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.API_KEY || process.env.OPENAI_API_KEY || '';

// 调试开关：设为 true 显示详细日志，false 只显示正常输出
const DEBUG = true;

// 调试日志函数
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 使用 LangChain tool 定义
const getCamerasTool = tool(
  async () => {
    const cameras = [
      { id: 1, name: '门口', url: 'rtsp://172.21.132.230/url1' },
      { id: 2, name: '办公室', url: 'rtsp://172.21.132.230:554/rtp/32020000002000000003_32020000001320000020?originTypeStr=rtp_push' },
      { id: 3, name: '广场', url: 'rtsp://172.21.132.230/url3' },
    ];
    let resp = '已成功获取所有摄像头，列表如下：';
    cameras.forEach(cam => {
      resp += `${cam.name}摄像头，RTSP播放地址:${cam.url}。\r\n`;
    });
    resp += "以上为全部结果。自动使用check_camera检查摄像头的rtsp地址判断摄像头状态。";
    return resp;
  },
  {
    name: "get_cameras",
    description: "获取所有在线的网络摄像头，返回结果包含摄像头的名称、编号和RTSP地址。",
    schema: z.object({}), // 显式定义空参数对象
  }
);

const checkCameraTool = tool(
  async ({ name, url }) => {
    console.log(`执行ffprobe检查RTSP流...`);
    try {
      const output = execSync(
        `ffprobe -timeout 3000000 -v error -show_entries stream=codec_name,codec_type -of default=noprint_wrappers=1 '${url}'`,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 1024 * 1024
        }
      );
      console.log('ffprobe 执行成功');
      return `检查${name}摄像头状态完成：视频流正常。ffprobe输出：${output.slice(0, 1500)}`;
    } catch (err) {
      console.error('ffprobe 执行失败:', err.stderr?.toString()?.substring(0, 200) || err.message);
      const errorOutput = err.stderr?.toString() || err.message || '无法连接';
      return `检查${name}摄像头状态完成：连接失败。错误信息：${errorOutput.slice(0, 1500)}`;
    }
  },
  {
    name: "check_camera",
    description: "使用获取到的摄像头的RTSP播放地址来检查摄像头的状态，输出结果是ffprobe程序的输出。",
    schema: z.object({
      name: z.string().describe("指定摄像头的名称"),
      url: z.string().describe("指定摄像头的RTSP地址"),
    }),
  }
);

const tools = [getCamerasTool, checkCameraTool];
const toolsMap = {
  get_cameras: getCamerasTool,
  check_camera: checkCameraTool,
};

async function main() {
  // 初始化 LangChain ChatOpenAI，绑定工具
  const model = new ChatOpenAI({
    modelName: MODEL,
    apiKey: API_KEY,
    configuration: { baseURL: BASE_URL },
    streaming: true,
    temperature: 0,
  }).bindTools(tools);

  let messages = [
    new SystemMessage('你是 AI Agent，分析用户意图并决定要调用哪个工具。不要生成代码，不要重复执行。')
  ];

  console.log('🤖 LangChain Agent 已启动（流式模式），输入 exit 退出\n');

  while (true) {
    const userInput = await new Promise(resolve => rl.question('用户输入: ', resolve));
    if (userInput.toLowerCase() === 'exit') break;

    messages.push(new HumanMessage(userInput));

    let done = false;
    while (!done) {
      console.log("\n🤖 AI 思考中...");
      console.log('─'.repeat(50));

      let fullContent = '';
      let toolCallsBuffer = [];

      try {
        debugLog('[DEBUG] 开始调用 model.stream(), messages 数量:', messages.length);
        debugLog('[DEBUG] messages:', JSON.stringify(messages.map(m => ({
          role: m.role || m._getType?.(),
          content: typeof m.content === 'string' ? m.content.slice(0, 100) : m.content,
          tool_calls: m.tool_calls?.length || 0,
          tool_call_id: m.tool_call_id
        })), null, 2));
        
        // 使用 LangChain 的 stream 方法
        const stream = await model.stream(messages);
        let chunkCount = 0;
        
        // 用于收集工具调用片段
        const toolCallChunks = {};

        for await (const chunk of stream) {
          chunkCount++;
          
          // DEBUG: 打印每个 chunk 的关键信息
          if (DEBUG && (chunkCount === 1 || chunkCount % 10 === 0)) {
            debugLog(`[DEBUG] Chunk #${chunkCount}, has content: ${!!chunk.content}, has tool_call_chunks: ${!!chunk.tool_call_chunks}`);
          }
          
          // 处理内容
          if (chunk.content) {
            const content = String(chunk.content);
            
            // 处理 <think> 标签灰色显示
            if (content.includes('<think>') || content.includes('</think>') || fullContent.includes('<think>')) {
              const gray = '\x1b[90m';
              const reset = '\x1b[0m';
              
              if (content.includes('<think>')) {
                process.stdout.write(gray + content.replace('<think>', '[思考] ') + reset);
              } else if (content.includes('</think>')) {
                process.stdout.write(gray + content.replace('</think>', '') + reset);
              } else if (fullContent.includes('<think>')) {
                process.stdout.write(gray + content + reset);
              } else {
                process.stdout.write(content);
              }
            } else {
              process.stdout.write(content);
            }
            fullContent += content;
          }
          
          // 收集工具调用片段（关键！流式中是分散的）
          if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
            debugLog('[DEBUG] tool_call_chunks:', JSON.stringify(chunk.tool_call_chunks, null, 2));
            for (const tcChunk of chunk.tool_call_chunks) {
              const index = tcChunk.index ?? 0;
              debugLog(`[DEBUG] tcChunk index=${index}, id=${tcChunk.id}, name=${tcChunk.name}, args=${tcChunk.args?.slice(0, 50)}...`);
              if (!toolCallChunks[index]) {
                toolCallChunks[index] = {
                  id: tcChunk.id || '',
                  name: '',
                  args: ''
                };
              }
              if (tcChunk.name) toolCallChunks[index].name += tcChunk.name;
              if (tcChunk.args) toolCallChunks[index].args += tcChunk.args;
              if (tcChunk.id && !toolCallChunks[index].id) {
                toolCallChunks[index].id = tcChunk.id;
              }
            }
          }
        }

        console.log('\n' + '─'.repeat(50));
        debugLog('[DEBUG] 流式响应结束，总 chunk 数:', chunkCount);
        debugLog('[DEBUG] 最终 fullContent 长度:', fullContent.length);
        debugLog('[DEBUG] 收集到的 toolCallChunks:', Object.keys(toolCallChunks).length);
        
        // 组装工具调用
        if (Object.keys(toolCallChunks).length > 0) {
          debugLog('[DEBUG] 检测到工具调用片段，组装中...');
          toolCallsBuffer = Object.values(toolCallChunks).map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.args || '{}'
            }
          }));
        } else {
          debugLog('[DEBUG] 未检测到工具调用片段');
        }

        // 检查是否有工具调用
        const validToolCalls = toolCallsBuffer.filter(tc => tc.function.name);
        debugLog('[DEBUG] 有效工具调用数量:', validToolCalls.length);

        if (validToolCalls.length > 0) {
          debugLog('[DEBUG] 进入工具调用分支');
          
          const aiMsg = new AIMessage({
            content: fullContent || '',
            additional_kwargs: {
              tool_calls: validToolCalls
            }
          });
          messages.push(aiMsg);

          for (let i = 0; i < validToolCalls.length; i++) {
            const toolCall = validToolCalls[i];
            const action = toolCall.function.name;
            const argsStr = toolCall.function.arguments || '{}';
            debugLog('[DEBUG] 工具调用 arguments 原始值:', argsStr);
            
            let params;
            try {
              params = JSON.parse(argsStr);
            } catch (parseErr) {
              console.error('[ERROR] JSON 解析失败:', parseErr.message);
              console.error('[ERROR] 原始 arguments:', argsStr);
              params = {};
            }

            console.log(`\n🔧 [${i}] 工具调用：`, action, params);

            const toolFunc = toolsMap[action];
            let toolResult;
            if (toolFunc) {
              toolResult = await toolFunc.invoke(params);
            } else {
              toolResult = "未知工具";
            }
            
            console.log(`✅ [${i}] 工具返回完成`);

            messages.push(new ToolMessage({
              content: toolResult,
              tool_call_id: toolCall.id,
            }));
          }

          console.log('\n🔄 工具执行完成，等待 AI 分析结果...\n');
        } else {
          debugLog('[DEBUG] 进入普通回复分支，fullContent:', fullContent ? '有内容' : '无内容');
          if (fullContent) {
            console.log('\n✨ AI助手回复:', fullContent);
            messages.push(new AIMessage(fullContent));
          } else {
            console.log('[WARNING] AI 没有返回任何内容');
          }
          console.log("\n✅ agent任务结束，等待下一个指令。\n");
          done = true;
          break;
        }

      } catch (error) {
        console.error('请求 AI 服务失败：', error.message);
        break;
      }
    }
  }

  rl.close();
}

main();
