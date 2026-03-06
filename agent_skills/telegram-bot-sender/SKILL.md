---
name: telegram-bot-sender
description: 通过 Telegram Bot 发送文件、图片和消息到指定 Chat ID
---

# Telegram Bot Sender 技能

此技能允许通过 Telegram Bot API 发送文件、图片和消息。

## 配置

需要以下环境变量：

```bash
TELEGRAM_BOT_TOKEN=你的Bot Token
TELEGRAM_CHAT_ID=你的Chat ID
```

## 使用方法

### 发送文件

```bash
node agent_skills/telegram-bot-sender/scripts/send-file.js <文件路径> [说明文字]
```

示例：
```bash
node agent_skills/telegram-bot-sender/scripts/send-file.js /path/to/screenshot.png "UI 设计截图"
```

### 发送消息

```bash
node agent_skills/telegram-bot-sender/scripts/send-message.js "你的消息内容"
```

示例：
```bash
node agent_skills/telegram-bot-sender/scripts/send-message.js "任务完成！"
```

### 发送图片

```bash
node agent_skills/telegram-bot-sender/scripts/send-photo.js <图片路径> [说明文字]
```

示例：
```bash
node agent_skills/telegram-bot-sender/scripts/send-photo.js /path/to/photo.png "这是我的截图"
```

## API 说明

### sendDocument API

发送任意文件（支持文档、图片等）：

```bash
curl -X POST "https://api.telegram.org/bot{BOT_TOKEN}/sendDocument" \
  -F "chat_id={CHAT_ID}" \
  -F "document=@{文件路径}" \
  -F "caption={说明文字}"
```

### sendMessage API

发送文本消息（支持 Markdown）：

```bash
curl -X POST "https://api.telegram.org/bot{BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "{CHAT_ID}",
    "text": "{消息内容}",
    "parse_mode": "Markdown"
  }'
```

### sendPhoto API

发送图片（自动生成缩略图）：

```bash
curl -X POST "https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto" \
  -F "chat_id={CHAT_ID}" \
  -F "photo=@{图片路径}" \
  -F "caption={说明文字}"
```

## 注意事项

1. **文件大小限制**：文档最大 50MB，图片最大 10MB
2. **格式支持**：支持图片、文档、视频等多种格式
3. **权限要求**：Bot 需要有发送消息和文件的权限
4. **环境变量**：确保设置了正确的 BOT_TOKEN 和 CHAT_ID

## 示例工作流

完整的文件发送流程：

```bash
# 1. 生成文件
node generate-report.js > report.html

# 2. 发送到 Telegram
node agent_skills/telegram-bot-sender/scripts/send-file.js report.html "月度报告"

# 3. 发送确认消息
node agent_skills/telegram-bot-sender/scripts/send-message.js "✅ 报告已发送完成"
```

## 错误处理

如果遇到以下错误：

- **401 Unauthorized**：Bot Token 无效
- **403 Forbidden**：Bot 没有权限访问该 Chat
- **400 Bad Request**：文件不存在或格式不支持
- **413 Payload Too Large**：文件超过大小限制

请检查配置和文件路径。