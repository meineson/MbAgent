# 赛博雪峰 Web 服务 - 实现计划

## 项目概述

基于 LangChain + Express 构建的技能对话 Web 服务，加载用户目录下的 AgentSkills，提供 Web 交互界面。

---

## 实现阶段

### ✅ Phase 1: 核心功能（已完成）

**目标**：基础对话服务

| 任务 | 状态 | 说明 |
|------|------|------|
| 技能解析器 | ✅ | `zhangxuefeng/skill.js` - 解析 SKILL.md |
| LangChain Agent | ✅ | `zhangxuefeng/agent.js` - 对话代理 |
| Express API | ✅ | `zhangxuefeng/routes.js` - REST 接口 |
| Web 前端 | ✅ | `public/index.html` - 聊天界面 |

**Git Commit**: `feat: 核心功能完成 - 技能加载、Agent、API、前端`

---

### 🔄 Phase 2: 配置优化（进行中）

**目标**：灵活配置，支持多技能

| 任务 | 状态 | 说明 |
|------|------|------|
| 密码认证 | ⏳ | 前端密码输入 + 后端验证 |
| 技能路径配置 | ⏳ | `.env` 配置 SKILL_PATH，支持切换 |
| 多技能支持 | ⏳ | 配置多个技能，前端选择 |

**新增 .env 配置项**:
```env
# 认证密码
AUTH_PASSWORD=your_password_here

# 技能配置（支持多个）
SKILL_PATH=/Users/mac/.agents/skills/zhangxuefeng-perspective
# SKILL_PATH=/Users/mac/.agents/skills/other-skill
```

---

### 📝 Phase 3: 文档与测试

**目标**：完善的文档和测试覆盖

| 任务 | 状态 | 说明 |
|------|------|------|
| API 接口规范 | ⏳ | `docs/API_SPEC.md` |
| 测试用例 | ⏳ | `tests/` 目录 |
| 开发进度文档 | ⏳ | `docs/PROGRESS.md` |

---

### 🚀 Phase 4: 增强功能（可选）

| 任务 | 状态 | 说明 |
|------|------|------|
| WebSearch 工具 | 📋 | Agent 自动搜索就业数据 |
| 技能热重载 | 📋 | 修改 SKILL.md 后自动生效 |
| 会话持久化 | 📋 | Redis/MongoDB 存储 |

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 后台框架 | Express.js |
| LLM 框架 | LangChain.js |
| 模型 | 阿里百炼 glm-5（可配置） |
| 前端 | 原生 HTML + Tailwind CSS |
| 认证 | 简单密码（localStorage） |
| 配置 | dotenv |

---

## 目录结构

```
/Users/mac/AIagent/octest/
├── server.js                 # Express 主服务
├── zhangxuefeng/
│   ├── skill.js             # 技能加载器
│   ├── agent.js             # LangChain Agent
│   └── routes.js            # API 路由
├── public/
│   └── index.html           # Web 前端
├── docs/
│   ├── IMPLEMENTATION_PLAN.md  # 实现计划
│   ├── API_SPEC.md          # 接口规范
│   └── PROGRESS.md          # 开发进度
├── tests/
│   ├── skill.test.js        # 技能加载测试
│   ├── agent.test.js        # Agent 测试
│   └── api.test.js          # API 测试
└── .env                     # 配置文件
```

---

## 启动命令

```bash
cd /Users/mac/AIagent/octest
npm run zhangxuefeng
```

访问：http://localhost:3000