#!/usr/bin/env node
/**
 * Telegram Bot Message Sender
 * 发送文本消息到 Telegram
 *
 * 使用方法：
 * node send-message.js "消息内容"
 *
 * 示例：
 * node send-message.js "任务完成！✅"
 */

import { execSync } from 'child_process';
import 'dotenv/config';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN) {
  console.error('❌ 错误: 未设置 TELEGRAM_BOT_TOKEN 环境变量');
  process.exit(1);
}

if (!CHAT_ID) {
  console.error('❌ 错误: 未设置 TELEGRAM_CHAT_ID 环境变量');
  process.exit(1);
}

const message = process.argv[2] || '';

if (!message) {
  console.error('❌ 错误: 请提供消息内容');
  console.log('使用方法: node send-message.js "消息内容"');
  process.exit(1);
}

try {
  console.log('📤 正在发送消息...');

  const command = `curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d '{
      "chat_id": ${CHAT_ID},
      "text": ${JSON.stringify(message)},
      "parse_mode": "Markdown"
    }'`;

  const result = execSync(command, { encoding: 'utf8' });
  const response = JSON.parse(result);

  if (response.ok) {
    console.log('✅ 消息发送成功！');
    console.log(`   消息ID: ${response.result.message_id}`);
    console.log(`   发送时间: ${new Date().toLocaleString()}`);
  } else {
    console.error('❌ 发送失败:', response.description);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ 发送失败:', error.message);
  process.exit(1);
}