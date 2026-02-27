import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { execSync } from 'child_process';
import readline from 'readline';

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:10808';
setGlobalDispatcher(new ProxyAgent(proxyUrl));

const MODEL = process.env.MODEL || 'gpt-3.5-turbo';
const BASE_URL = (process.env.BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const API_KEY = process.env.API_KEY || process.env.OPENAI_API_KEY || '';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const tools = [
  {
    "type": "function",
    "function": {
      name: "get_weather",
      description: "获取指定城市的实时天气信息",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "要查询天气的城市名称" }
        },
        required: ["city"]
      }
    }
  },{
    "type": "function",
    "function": {
      name: "get_cameras",
      description: "获取所有在线的网络摄像头，返回结果包含摄像头的名称、编号和RTSP地址。",      
    }
  },{
    "type": "function",
    "function": {
      name: "check_camera",
      description: "使用获取到的获取头的RTSP播放地址来检查摄像头的状态，输出结果是ffplay程序的输出,没有输出表示正常。",   
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

let messages = [
  // { role: 'system', content: '如果有人问你天气怎样样，请不要直接回答，而是输出 JSON，格式：{ "action": "get_weather", "city": "<城市名>" }' }
  { role: 'system', content: '你是 AI Agent，分析用户意图并决定要调用哪个工具。不要生成代码，不要重复执行。' }
];

async function runTool(action, params) {
  if (action === "get_weather") {
    const city = params.city;
    // 模拟 API
    return `${city}今天晴，气温20°C`;
  }else if (action === "get_cameras") {    
    // 模拟 API
    const cameras = [
      {id:1, name:'门口', url:'rtsp://172.21.132.230/url1'},
      {id:2, name:'办公室', url:'rtsp://172.21.132.230:554/rtp/32020000002000000003_32020000001320000020?originTypeStr=rtp_push'},
      {id:3, name:'广场', url:'rtsp://172.21.132.230/url3'},
    ];
    let resp = '已成功获取所有摄像头，列表如下：';
    cameras.forEach(cam => {
      resp += `${cam.name}摄像头，RTSP播放地址:${cam.url}。\r\n`;
    })
    resp += "以上为全部结果。自动使用check_camera检查摄像头的rtsp地址判断摄像头状态。"
    return resp;
  }else if (action === "check_camera") {    
    const url = params.url;
    const name = params.name;
    console.log(`执行ffprobe检查RTSP流...`);

    try {
      const output = execSync(
        `ffprobe -timeout 3000000 -v error -show_entries stream=codec_name,codec_type -of default=noprint_wrappers=1 '${url}'`,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 30000, // 30秒超时
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

async function handleStreamResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let fullToolCalls = {};
  let currentToolCallIndex = -1;
  
  console.log('\n🤖 AI 思考中...');
  console.log('─'.repeat(50));
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      
      const data = line.slice(6).trim();
      if (data === '[DONE]' || !data) continue;
      
      try {
        const json = JSON.parse(data);
        const delta = json.choices[0]?.delta;
        
        if (delta?.content) {
          // 显示思考内容
          process.stdout.write(delta.content);
          fullContent += delta.content;
        }
        
        // 处理工具调用
        if (delta?.tool_calls) {
          for (const toolDelta of delta.tool_calls) {
            const index = toolDelta.index;
            
            if (!fullToolCalls[index]) {
              fullToolCalls[index] = {
                id: toolDelta.id || '',
                type: 'function',
                function: {
                  name: '',
                  arguments: ''
                }
              };
            }
            
            if (toolDelta.function?.name) {
              fullToolCalls[index].function.name += toolDelta.function.name;
            }
            if (toolDelta.function?.arguments) {
              fullToolCalls[index].function.arguments += toolDelta.function.arguments;
            }
            if (toolDelta.id) {
              fullToolCalls[index].id = toolDelta.id;
            }
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }
  
  console.log('\n' + '─'.repeat(50));
  
  const result = {
    content: fullContent || null,
    tool_calls: Object.keys(fullToolCalls).length > 0 
      ? Object.values(fullToolCalls) 
      : null
  };
  
  return result;
}

async function sendMessage() {
  while (true) {

    const userInput = await new Promise(resolve => rl.question('用户输入: ', resolve));
    if (userInput.toLowerCase() === 'exit') break;
    
    messages.push({ role: 'user', content: userInput });

    let done = false;
    while (!done) {
      console.log("ai 请求发送中\r\n")          
      // console.log("-----DEBUG------");
      // messages.forEach((item, i) => {
      //   console.log(`message ${i}:`, item);
      // });    
      console.log("等待响应...\r\n")          

      console.log('开始向 AI 服务发送请求...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('请求已超过 30 秒，正在中止本次请求...');
        controller.abort();
      }, 30000);

      let message;
      try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            stream: true,
            model: MODEL,
            messages: messages,
            tools: tools,
            tool_choice: 'auto'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        
        message = await handleStreamResponse(response);
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('请求 AI 服务失败：', error);
        break;
      }

      let aiReply;

      if (message.tool_calls) {
        messages.push({
          role: 'assistant',
          content: message.content || '',
          tool_calls: message.tool_calls
        });
        
        for (let i = 0; i < message.tool_calls.length; i++) {
          const toolCall = message.tool_calls[i];

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
      }
      else if (message.content) {
        aiReply = message.content;
        console.log('\n✨ AI助手回复:', aiReply);
        messages.push({ role: 'assistant', content: aiReply });

        console.log("\n✅ agent任务结束，等待下一个指令。\n")
        done = true;
        break;
      }
      else {
        console.log('[WARN] AI 返回空响应，结束循环');
        done = true;
        break;
      }
    }
  }

  rl.close();
}

sendMessage();

