#!/usr/bin/env node
/**
 * Telegram Bot Photo Sender
 * 发送图片到 Telegram
 *
 * 使用方法：
 * node send-photo.js <图片路径> [说明文字]
 *
 * 示例：
 * node send-photo.js /path/to/photo.png "这是我的截图"
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
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

const filePath = process.argv[2];
const caption = process.argv[3] || '';

if (!filePath) {
  console.error('❌ 错误: 请提供图片路径');
  console.log('使用方法: node send-photo.js <图片路径> [说明文字]');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ 错误: 文件不存在: ${filePath}`);
  process.exit(1);
}

try {
  console.log(`📤 正在发送图片: ${path.basename(filePath)}`);

  const command = `curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto" \
    -F "chat_id=${CHAT_ID}" \
    -F "photo=@${filePath}" \
    -F "caption=${caption}"`;

  const result = execSync(command, { encoding: 'utf8' });
  const response = JSON.parse(result);

  if (response.ok) {
    console.log('✅ 图片发送成功！');
    console.log(`   文件ID: ${response.result.photo[response.result.photo.length - 1].file_id}`);
    console.log(`   文件大小: ${response.result.photo[response.result.photo.length - 1].file_size} bytes`);
    console.log(`   消息ID: ${response.result.message_id}`);
  } else {
    console.error('❌ 发送失败:', response.description);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ 发送失败:', error.message);
  process.exit(1);
}