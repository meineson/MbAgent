# API 接口规范

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **认证**: 需通过 `/api/auth/verify` 验证密码

---

## 限流策略

| 限制类型 | 参数 | 说明 |
|----------|------|------|
| 输入长度 | `MAX_MESSAGE_LENGTH = 300` | 单条消息最多 300 字 |
| 请求频率 | `RATE_LIMIT = 5` / 分钟 | 每 IP 每分钟最多 5 次请求 |

响应头：
- `X-RateLimit-Limit`: 总限额
- `X-RateLimit-Remaining`: 剩余限额
- `Retry-After`: 超出限制时返回，需要等待的秒数

错误响应（超出限制）：
```json
{
  "error": "请求过于频繁，请稍后再试",
  "retryAfter": 45,
  "limit": 5,
  "window": "1分钟"
}
```

状态码 `429`。

错误响应（输入过长）：
```json
{
  "error": "输入过长，最多300字",
  "currentLength": 450,
  "maxLength": 300
}
```

状态码 `400`。

---

## 限流接口

### GET /api/limit/status

获取当前限流状态。

**响应**:
```json
{
  "maxLength": 300,
  "rateLimit": {
    "limit": 5,
    "window": "1分钟",
    "remaining": 3,
    "currentCount": 2
  }
}
```

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
- `message`: 用户消息（必填，长度 ≤ 300）
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
- `400`: 缺少 message 或输入过长
- `429`: 请求频率超出限制
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
| `MAX_MESSAGE_LENGTH` | 最大消息长度（可选） | `300` |
| `RATE_LIMIT_MAX` | 每分钟请求限制（可选） | `5` |