import { execSync } from 'child_process';
import readline from 'readline';

const MODEL = "minimax/minimax-m2.1"; 
// const MODEL = 'deepseek/deepseek-v3.2-251201';

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
      description: "检查摄像头的状态，输出结果是ffplay程序的输出，需要你进一步解析判断是否状态正常。",   
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "指定摄像头的名称" },
          url: { type: "string", description: "指定摄像头的RTSP地址" }
        },
        required: ["url"]
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
    console.log(`执行命令：ffplay -loglevel debug '${url}'，3秒钟，并检查输出内容判断是否正常。`);

    try {

      const output = execSync(
        `ffplay -t 3 -loglevel debug -i '${url}'`,
        {
          stdio: ['ignore', 'pipe', 'pipe'], // 捕获 stdout + stderr
          encoding: 'utf8',
          timeout: 3000, // 3 秒超时
          maxBuffer: 1024 * 1024 * 10 // 增加缓冲区大小
        }
      );
      const lines = output.slice(0, 1000);
      console.log('ffplay exitd');
      return `检查${name}摄像头状态完成，自动分析下面的ffplay程序输出并给出摄像头状态结果：` + lines;
    } catch (err) {
      // ffplay 被 Ctrl+C / SIGINT / 超时杀掉时也会走这里
      console.error('ffplay exited');
      // console.error('stdout:\n', err.stdout?.toString());
      // console.error('stderr:\n', err.stderr?.toString());
      return `检查${name}摄像头状态完成，自动分析下面的ffplay输出并给出摄像头状态结果：` + err.stdout?.toString() + err.stderr?.toString();
    }
    
  }
  return "未知工具";
}

async function sendMessage() {
  while (true) {

    const userInput = await new Promise(resolve => rl.question('用户输入: ', resolve));
    if (userInput.toLowerCase() === 'exit') break;
    
    messages.push({ role: 'user', content: userInput });

    let done = false;
    while (!done) {
      console.log("ai 请求发送中\r\n")          
      console.log("-----DEBUG------");
      messages.forEach((item, i) => {
        console.log(`message ${i}:`, item);
      });    
      console.log("等待响应...\r\n")          

      console.log('开始向 AI 服务发送请求，最长等待 30 秒...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('请求已超过 30 秒，正在中止本次请求...');
        controller.abort();
      }, 30000);

      let data;
      try {
        const response = await fetch('https://api.qnaigc.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            stream: false,
            model: MODEL,
            messages: messages,
            tools: tools,
            tool_choice: 'auto'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('AI 服务响应已返回。');
        data = await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('请求 AI 服务失败：', error);
        // throw error;
        break;
      }
      if(data.error){
        console.error('Error:', data.error);
        break;
      }

      console.log("token usage:%d", data.usage?.total_tokens);

      const message = data.choices[0].message;
      let aiReply;

      if (message.tool_calls) {
        for (let i = 0; i < message.tool_calls.length; i++) {
          const toolCall = message.tool_calls[i];

          const action = toolCall.function.name;
          const params = JSON.parse(toolCall.function.arguments);

          console.log(`[${i}] 工具调用：`, action, params);

          const toolResult = await runTool(action, params); // ✅ 真正阻塞
          console.log(`[${i}] 工具返回：`, toolResult);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult
          });
          messages.push({role: 'assistant', content: toolResult});
        }

        // 👈 这里一定是在所有 tool 执行完之后
      }
      else if (message.content) {
        // 普通文本
        aiReply = message.content;
        console.log('AI助手回复:', aiReply);
        messages.push({ role: 'assistant', content: aiReply });

        console.log("agent任务结束，等待下一个指令。")
        done = true;
        break;
      }
    }
  }

  rl.close();
}

sendMessage();

