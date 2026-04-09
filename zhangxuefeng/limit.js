/**
 * 限流中间件
 * - 输入长度限制：300字
 * - 频率限制：每用户每分钟5次
 */
import { Router } from 'express';

const router = Router();

// 限流存储（内存版，生产环境建议用 Redis）
const rateLimitStore = new Map();

// 配置
const MAX_MESSAGE_LENGTH = 300;  // 最大输入长度
const RATE_LIMIT_WINDOW = 60000; // 1分钟窗口
const RATE_LIMIT_MAX = 5;        // 每分钟最大请求次数

/**
 * 清理过期记录
 */
function cleanupExpired() {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW) {
      rateLimitStore.delete(key);
    }
  }
}

// 定期清理（每分钟）
setInterval(cleanupExpired, 60000);

/**
 * 获取用户标识（基于 IP + User-Agent）
 */
function getUserKey(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  return `${ip}:${ua.slice(0, 50)}`;
}

/**
 * 检查限流
 */
function checkRateLimit(key) {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record) {
    // 新用户，创建记录
    rateLimitStore.set(key, { startTime: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  // 检查是否在窗口内
  if (now - record.startTime <= RATE_LIMIT_WINDOW) {
    if (record.count >= RATE_LIMIT_MAX) {
      // 超过限制
      const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - record.startTime)) / 1000);
      return { allowed: false, retryAfter };
    }
    // 增加计数
    record.count++;
    return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
  }
  
  // 窗口过期，重置
  rateLimitStore.set(key, { startTime: now, count: 1 });
  return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
}

/**
 * 输入长度检查中间件（仅检查 POST 请求的 body）
 */
export function validateInputLength(req, res, next) {
  // 只检查 POST 请求
  if (req.method !== 'POST') {
    return next();
  }
  
  const { message } = req.body || {};
  
  // 某些 POST 接口不需要 message（如 /api/chat/reset）
  if (!message) {
    return next();
  }
  
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `输入过长，最多${MAX_MESSAGE_LENGTH}字`,
      currentLength: message.length,
      maxLength: MAX_MESSAGE_LENGTH
    });
  }
  
  next();
}

/**
 * 限流中间件
 */
export function rateLimit(req, res, next) {
  const key = getUserKey(req);
  const result = checkRateLimit(key);
  
  // 设置响应头
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  
  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter);
    return res.status(429).json({
      error: '请求过于频繁，请稍后再试',
      retryAfter: result.retryAfter,
      limit: RATE_LIMIT_MAX,
      window: '1分钟'
    });
  }
  
  next();
}

/**
 * GET /api/limit/status
 * 获取限流状态
 */
router.get('/status', (req, res) => {
  const key = getUserKey(req);
  const record = rateLimitStore.get(key);
  
  res.json({
    maxLength: MAX_MESSAGE_LENGTH,
    rateLimit: {
      limit: RATE_LIMIT_MAX,
      window: '1分钟',
      remaining: record ? RATE_LIMIT_MAX - record.count : RATE_LIMIT_MAX,
      currentCount: record ? record.count : 0
    }
  });
});

export default router;