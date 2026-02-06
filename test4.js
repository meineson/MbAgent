import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BufferMemory } from 'langchain/memory';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import readline from 'readline';
import { execSync } from 'child_process';

const MODEL = 'minimax/minimax-m2.1';
// const MODEL = 'deepseek/deepseek-v3.2-251201';

const BASE_URL = 'http://172.21.240.16:8000';
// const BASE_URL = "https://api.qnaigc.com/v1"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 定义工具
const getCamerasTool = tool(
  async () => {
    console.log('🔧 [get_cameras] 工具被调用');
    const cameras = [
      { id: 1, name: '门口', url: 'rtsp://172.21.132.230/url1' },
      { id: 2, name: '办公室', url: 'rtsp://172.21.132.230:554/rtp/32020000002000000003_32020000001320000020?originTypeStr=rtp_push' },
      { id: 3, name: '广场', url: 'rtsp://172.21.132.230/url3' },
    ];
    let resp = '已成功获取所有摄像头，列表如下：\n\n';
    cameras.forEach((cam) => {
      resp += `摄像头名称: "${cam.name}"\nRTSP地址: "${cam.url}"\n\n`;
    });
    resp += '\n重要：现在你必须使用上述真实RTSP地址调用check_camera工具检查每个摄像头，严禁编造任何地址！\n';
    resp += '调用示例：check_camera({"name": "门口", "url": "rtsp://172.21.132.230/url1"})';
    return resp;
  },
  {
    name: 'get_cameras',
    description: '获取所有在线的网络摄像头，返回结果包含摄像头的名称、编号和RTSP地址。',
    schema: z.object({}),
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
          maxBuffer: 1024 * 1024,
        }
      );
      console.log('✅ ffprobe 执行成功');
      return `检查${name}摄像头状态完成：视频流正常。ffprobe输出：${output.slice(0, 1500)}`;
    } catch (err) {
      console.error('❌ ffprobe 执行失败:', err.stderr?.toString()?.substring(0, 200) || err.message);
      const errorOutput = err.stderr?.toString() || err.message || '无法连接';
      return `检查${name}摄像头状态完成：连接失败。错误信息：${errorOutput.slice(0, 1500)}`;
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

// 初始化工具数组
const tools = [getCamerasTool, checkCameraTool];

// 初始化模型 - 绑定工具
const model = new ChatOpenAI({
  modelName: MODEL,
  openAIApiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: BASE_URL,
  },
  temperature: 0,
  streaming: false,
}).bindTools(tools);

// 创建提示模板
const prompt = ChatPromptTemplate.fromMessages([
  ['system', `你是 AI Agent，必须分析用户意图并调用合适的工具完成任务。

严格规则：
1. 调用 get_cameras 工具获取摄像头列表
2. 必须使用 get_cameras 返回的真实RTSP地址调用 check_camera，绝不能编造地址
3. get_cameras 会返回类似 "门口摄像头，RTSP播放地址:rtsp://172.21.132.230/url1" 的信息
4. 调用 check_camera 时必须使用这些真实地址
5. 不要编造任何数据，所有参数必须来自工具返回结果`],
  new MessagesPlaceholder('chat_history'),
  ['human', '{input}'],
  new MessagesPlaceholder('agent_scratchpad'),
]);

// 创建 Agent
const agent = await createToolCallingAgent({
  llm: model,
  tools,
  prompt,
});

// 创建记忆
const memory = new BufferMemory({
  memoryKey: 'chat_history',
  returnMessages: true,
  inputKey: 'input',
  outputKey: 'output',
});

// 创建AgentExecutor
const agentExecutor = new AgentExecutor({
  agent,
  tools,
  memory,
  verbose: false,
  maxIterations: 15,
});

async function main() {
  console.log('🤖 AI Agent 已启动');
  console.log('输入 exit 退出\n');

  while (true) {
    const userInput = await new Promise((resolve) => rl.question('用户输入: ', resolve));
    if (userInput.toLowerCase() === 'exit') break;

    console.log('\n🤖 AI 思考中...\n');

    try {
      const result = await agentExecutor.invoke({
        input: userInput,
      });

      console.log('\n✨ AI助手回复:', result.output);
      console.log('\n✅ 任务完成，记忆已自动保存\n');
    } catch (error) {
      console.error('❌ 执行出错:', error.message);
      console.error(error.stack);
    }
  }

  rl.close();
  console.log('再见！');
}

main();
