#学习步骤：
- 原始HTTP API调用云端大模型
- opensdk调用
- 本地部署7B模型
- langchain调用

>全程AI编程智能体输出所有demo代码：
<img width="1024" alt="image" src="https://github.com/user-attachments/assets/86cb7e21-60ce-49af-a749-8c22ac362de3" />

# Camera Agent - AI 摄像头监控代理

使用不同技术栈实现的 AI Agent，用于监控 RTSP 摄像头状态。

## 项目结构

```
camera-agent/
├── package.json          # 项目依赖和脚本
├── README.md            # 本文档
├── test.js              # 原生 fetch 实现（原始版本）
├── test2.js             # OpenAI SDK 实现
├── test3.js             # LangChain 流式工作示例
└── test4.js             # LangChain Agent 实现（生产环境推荐）
```

## 四个版本对比

| 版本 | 技术栈 | 特点 | 推荐场景 |
|------|--------|------|----------|
| test.js | 原生 fetch | 无依赖，手动处理 SSE 流 | 学习、调试 |
| test2.js | OpenAI SDK | 代码简洁，自动处理流式 | 快速开发 |
| test3.js | LangChain | LangChain 流式工作示例，完整处理工具调用 | 学习流式 |
| test4.js | LangChain Agent | 自动完成 memory 和工具调用，工程化最佳实践 | 生产环境 |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 设置环境变量

```bash
export OPENAI_API_KEY="your-api-key"
```

### 3. 运行 Agent

```bash
# LangChain 版本（推荐）
npm start

# 或
node test3.js

# OpenAI SDK 版本
npm run start:sdk

# 原生 fetch 版本
npm run start:legacy
```

## 功能说明

### 可用工具

1. **get_cameras** - 获取所有摄像头列表
   - 返回：摄像头名称、ID、RTSP 地址

2. **check_camera** - 检查指定摄像头状态
   - 使用 ffprobe 探测 RTSP 流
   - 返回：视频流是否正常、编解码器信息

### 使用示例

```
用户输入: 检查所有摄像头状态
AI: 我将为您检查所有摄像头的状态...
[工具调用 get_cameras]
[工具调用 check_camera] 门口摄像头
[工具调用 check_camera] 办公室摄像头
...

摄像头状态汇总：
- 门口：正常 ✓
- 办公室：连接失败 ✗
- 广场：正常 ✓
```

## 技术栈

### LangChain 版本 (test3.js)

- **LangChain v0.3** - Agent 框架
- **@langchain/core** - 核心工具定义
- **@langchain/openai** - OpenAI 模型集成
- **Zod** - 工具参数校验

特点：
- 类型安全的工具定义
- 标准化的消息流处理
- 可扩展的工具注册机制
- 更好的错误处理

### OpenAI SDK 版本 (test2.js)

- **OpenAI SDK v4** - 官方 SDK

特点：
- 代码简洁
- 自动流式处理
- 快速上手

### 原生版本 (test.js)

- **原生 fetch** - 无外部依赖
- **手动 SSE 解析** - 完整控制流式过程

特点：
- 零依赖（除 Node.js 内置模块）
- 完全透明，便于学习原理

## 系统要求

- Node.js >= 18.0.0
- ffprobe (通常随 ffmpeg 安装)
- 网络摄像头 RTSP 流可访问

## 配置

### 模型配置

在代码顶部修改：

```javascript
const MODEL = "minimax/minimax-m2.1";
const BASE_URL = "http://172.21.240.16:8000/v1";
```

### 摄像头列表

在 `get_cameras` 工具中修改：

```javascript
const cameras = [
  { id: 1, name: '门口', url: 'rtsp://...' },
  // 添加更多摄像头...
];
```

## 开发建议

1. **本地测试**：先使用 test2.js 或 test3.js 快速验证功能
2. **学习原理**：阅读 test.js 理解底层实现
3. **生产部署**：使用 test3.js，添加日志、监控、重试机制

## 调试

```bash
# 查看详细日志
DEBUG=1 node test3.js

# 测试 ffprobe
ffprobe -v error -show_entries stream=codec_name,codec_type rtsp://your-camera-url
```

## License

MIT
