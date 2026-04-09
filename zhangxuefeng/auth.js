/**
 * 认证中间件
 * 简单密码验证
 */
import { Router } from 'express';

const router = Router();

/**
 * POST /api/auth/verify
 * 验证密码
 */
router.post('/verify', (req, res) => {
  const { password } = req.body;
  
  // 动态读取环境变量（避免 import 时读取）
  const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'sbxf2026';
  
  if (!password) {
    return res.status(400).json({ error: 'password is required' });
  }
  
  if (password === AUTH_PASSWORD) {
    res.json({
      success: true,
      message: 'Authentication successful',
    });
  } else {
    res.status(401).json({
      success: false,
      error: 'Invalid password',
    });
  }
});

/**
 * GET /api/auth/status
 * 检查是否需要认证
 */
router.get('/status', (req, res) => {
  const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'sbxf2026';
  res.json({
    required: Boolean(AUTH_PASSWORD),
    message: AUTH_PASSWORD ? 'Password authentication required' : 'No authentication required',
  });
});

export default router;