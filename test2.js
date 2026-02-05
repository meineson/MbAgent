import { execSync } from 'child_process';
import readline from 'readline';
import OpenAI from 'openai';

const MODEL = "minimax/minimax-m2.1"; 
// const BASE_URL = "http://172.21.240.16:8000/v1";
const BASE_URL = "https://api.qnaigc.com/v1"
// const MODEL = 'deepseek/deepseek-v3.2-251201';

// 初始化 OpenAI 客户端（使用本地 API）
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
  baseURL: BASE_URL,
  timeout: 10000,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const tools = [  
  {
    type: "function",
    function: {
      name: "get_cameras",
      description: "获取所有在线的网络摄像头，返回结果包含摄像头的名称、编号和RTSP地址。",
    }
  },
  {
    type: "function",
    function: {
      name: "check_camera",
      description: "使用获取到的摄像头的RTSP播放地址来检查摄像头的状态，输出结果是ffprobe程序的输出。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "指定摄像头的名称" },
          url: { type: "string", description: "指定摄像头的RTSP地址" }
        },
        required: ["url", "name"]
      }
    }
  }
];

async function runTool(action, params) {
  if (action === "get_cameras") {
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
  } else if (action === "check_camera") {
    const url = params.url;
    const name = params.name;
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
  }
  return "未知工具";
}

async function sendMessage() {
  let messages = [
    { role: 'system', content: '你是 AI Agent，分析用户意图并决定要调用哪个工具。不要生成代码，不要重复执行。' }
  ];

  while (true) {
    const userInput = await new Promise(resolve => rl.question('用户输入: ', resolve));
    if (userInput.toLowerCase() === 'exit') break;

    messages.push({ role: 'user', content: userInput });

    let done = false;
    while (!done) {
      console.log("\n🤖 AI 思考中...");
      console.log('─'.repeat(50));

      let assistantMessage = { role: 'assistant', content: '', tool_calls: [] };
      let toolCallsBuffer = [];

      try {
        // 使用 OpenAI SDK 发送流式请求
        const stream = await client.chat.completions.create({
          model: MODEL,
          messages: messages,
          tools: tools,
          tool_choice: 'auto',
          stream: true,
        });

        // 处理流式响应
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          // 处理内容
          if (delta?.content) {
            process.stdout.write(delta.content);
            assistantMessage.content += delta.content;
          }

          // 处理工具调用
          if (delta?.tool_calls) {
            for (const toolDelta of delta.tool_calls) {
              const index = toolDelta.index;

              if (!toolCallsBuffer[index]) {
                toolCallsBuffer[index] = {
                  id: toolDelta.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' }
                };
              }

              if (toolDelta.function?.name) {
                toolCallsBuffer[index].function.name += toolDelta.function.name;
              }
              if (toolDelta.function?.arguments) {
                toolCallsBuffer[index].function.arguments += toolDelta.function.arguments;
              }
              if (toolDelta.id) {
                toolCallsBuffer[index].id = toolDelta.id;
              }
            }
          }
        }

        console.log('\n' + '─'.repeat(50));

        // 如果有工具调用
        if (toolCallsBuffer.length > 0) {
          // 按规范：工具调用消息的 content 设为 null
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: toolCallsBuffer
          });

          // 如果流中有 content，作为思考过程单独显示
          if (assistantMessage.content) {
            console.log('💭 AI 思考过程:', assistantMessage.content);
          }

          // 执行工具
          for (let i = 0; i < toolCallsBuffer.length; i++) {
            const toolCall = toolCallsBuffer[i];
            const action = toolCall.function.name;
            const params = JSON.parse(toolCall.function.arguments);

            console.log(`\n🔧 [${i}] 工具调用：`, action, params);

            const toolResult = await runTool(action, params);
            console.log(`✅ [${i}] 工具返回完成`);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult
            });
          }

          console.log('\n🔄 工具执行完成，等待 AI 分析结果...\n');
        } else {
          // 普通回复
          if (assistantMessage.content) {
            console.log('\n✨ AI助手回复:', assistantMessage.content);
            messages.push(assistantMessage);
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

sendMessage();
