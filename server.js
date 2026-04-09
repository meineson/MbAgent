/**
 * 张雪峰视角 Web 服务
 * Express + LangChain 实现
 */
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件（前端）
app.use(express.static(join(__dirname, 'public')));

// API 路由
import zhangxuefengRoutes from './zhangxuefeng/routes.js';
import authRoutes from './zhangxuefeng/auth.js';
import limitRoutes, { validateInputLength, rateLimit } from './zhangxuefeng/limit.js';
app.use('/api/limit', limitRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', validateInputLength, rateLimit, zhangxuefengRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`🚀 张雪峰视角服务已启动`);
  console.log(`   本地访问: http://localhost:${PORT}`);
  console.log(`   API 文档: http://localhost:${PORT}/api/skill/info`);
  console.log(`   模型: ${process.env.OPENAI_MODEL || 'default'}`);
});

export default app;