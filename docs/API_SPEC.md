# API 接口规范

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **认证**: 需通过 `/api/auth/verify` 验证密码

---

## 认证接口

### POST /api/auth/verify

验证访问密码。

**请求体**:
```json
{
  "password": "string"
}
```

**响应**:
```json
// 成功
{
  "success": true,
  "message": "Authentication successful"
}

// 失败
{
  "success": false,
  "error": "Invalid password"
}
```

**状态码**:
- `200`: 成功
- `400`: 缺少 password
- `401`: 密码错误

---

### GET /api/auth/status

检查是否需要认证。

**响应**:
```json
{
  "required": true,
  "message": "Password authentication required"
}
```

---

## 对话接口

### POST /api/chat

发送消息并获取 AI 回复。

**请求体**:
```json
{
  "message": "string",
  "history": [
    { "role": "human", "content": "..." },
    { "role": "ai", "content": "..." }
  ]
}
```

**参数说明**:
- `message`: 用户消息（必填）
- `history`: 对话历史（可选，用于多轮对话）

**响应**:
```json
{
  "success": true,
  "reply": "AI回复内容...",
  "timestamp": "2026-04-09T05:10:00.000Z"
}
```

**状态码**:
- `200`: 成功
- `400`: 缺少 message
- `500`: 内部错误

---

### GET /api/skill/info

获取当前加载的技能信息。

**响应**:
```json
{
  "success": true,
  "skill": {
    "name": "zhangxuefeng-perspective",
    "description": "张雪峰的思维框架..."
  }
}
```

---

### POST /api/chat/reset

重置服务端缓存，重新加载技能。

**响应**:
```json
{
  "success": true,
  "message": "Session reset, skill reloaded"
}
```

---

### POST /api/reload

热重载技能（开发调试用）。

**响应**:
```json
{
  "success": true,
  "message": "Skill reloaded",
  "skill": { ... }
}
```

---

## 健康检查

### GET /health

**响应**:
```json
{
  "status": "ok",
  "timestamp": "2026-04-09T05:10:00.000Z"
}
```

---

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `API_KEY` | LLM API 密钥 | `sk-sp-xxx` |
| `BASE_URL` | LLM API 地址 | `https://coding.dashscope.aliyuncs.com/v1` |
| `MODEL` | 模型名称 | `glm-5` |
| `AUTH_PASSWORD` | 访问密码 | `zhangxuefeng2026` |
| `SKILL_PATH` | 技能路径 | `/Users/mac/.agents/skills/zhangxuefeng-perspective` |
| `PORT` | 服务端口 | `3000` |