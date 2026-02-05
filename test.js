import { execSync } from 'child_process';
import readline from 'readline';

// const MODEL = "minimax/minimax-m2.1"; 
const MODEL = 'deepseek/deepseek-v3.2-251201';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const tools = [
  {
    "type": "function",
    "function": {
      name: "get_cameras",
      description: "获取所有在线的网络摄像头",      
    }
  },{
    "type": "function",
    "function": {
      name: "check_camera",
      description: "检查输入的指定摄像头的状态",   
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "指定摄像头的RTSP地址" }
        },
        required: ["url"]
      }   
    }
  }
];

let messages = [
  // { role: 'system', content: '如果有人问你天气怎样样，请不要直接回答，而是输出 JSON，格式：{ "action": "get_weather", "city": "<城市名>" }' }
  { role: 'system', content: '你是 AI Agent，分析用户意图并决定要调用哪个工具。' }
];

async function runTool(action, params) {
  if (action === "get_cameras") {    
    // 模拟 API
    const cameras = [
      {id:1, name:'门口', url:'rtsp://172.21.132.230/url1'},
      {id:2, name:'办公室', url:'rtsp://172.21.132.230/url2'},
      {id:3, name:'广场', url:'rtsp://172.21.132.230/url3'},
    ];
    let resp = '';
    cameras.forEach(cam => {
      resp += `摄像头名称：${cam.name}，编号id:${cam.id}，RTSP播放地址:${cam.url}\r\n`;
    })
    return resp;
  }else if (action === "check_camera") {    
    const url = params.url;
    console.log(`执行命令：ffplay -loglevel debug '${url}'，3秒钟，并检查输出内容判断是否正常。`);
    try {
      const output = execSync(
        `ffplay -t 3 -loglevel debug -i '${url}'`,
        {
          stdio: ['ignore', 'pipe', 'pipe'], // 捕获 stdout + stderr
          encoding: 'utf8',
          timeout: 3000 // 3 秒超时
        }
      );
      console.log('ffplay output:\n', output);
      return "ffplay执行输出：" + output;
    } catch (err) {
      // ffplay 被 Ctrl+C / SIGINT / 超时杀掉时也会走这里
      console.error('ffplay exited');
      // console.error('stdout:\n', err.stdout?.toString());
      // console.error('stderr:\n', err.stderr?.toString());
      return "ffplay命令执行失败："+err.stdout?.toString()+err.stderr?.toString();
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
      console.log("ai 请求发送。。\r\n")

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
        })
      });

      const data = await response.json();
      console.log("token usage:%d", data.usage.total_tokens);

      const message = data.choices[0].message;

      let aiReply;
      if (message.tool_calls) {
        let toolCall = message.tool_calls[0];
        console.log(toolCall, message.content);
        // 模型选择了工具
        const action = toolCall.function.name;
        const params = JSON.parse(toolCall.function.arguments);
        // 这里可以调用对应工具
        aiReply = await runTool(action, params);
        messages.push({"role": "tool", "tool_call_id": toolCall.id, "content": aiReply})
      }else if (message.content) {
        // 普通文本
        aiReply = message.content;
        console.log('AI:', aiReply);
        // messages.push({ role: 'assistant', content: aiReply });
      }
      messages.push({"role": "assistant", "content": aiReply})

      // 检查工具调用
      const toolCalls = message.tool_calls || [];
      if (toolCalls.length === 0) {
        // console.log("\r\n -----DEBUG------");
        // messages.forEach((item, i) => {
        //   console.log(`message ${i}:`, item);
        // });    
        // console.log("\r\n -----DEBUG end------");
      
        console.log("agent结束，等待下一个指令")
        done = true;
        break;
      }else{
        console.log("\r\n------\r\nagent下一步。。。\r\n")
        messages.push({ role: 'user', content: "下一步。" });
      }
    }
  }

  rl.close();
}

sendMessage();

