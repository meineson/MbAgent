/**
 * API 路由
 */
import { Router } from 'express';
import { createAgent, clearAgentCache } from './agent.js';
import { clearCache } from './skill.js';

const router = Router();

// Agent 实例（懒加载）
let agent = null;

async function getAgent() {
  if (!agent) {
    agent = await createAgent();
  }
  return agent;
}

/**
 * POST /api/chat
 * 对话接口
 * Body: { message: string, history: Array<{role: string, content: string}> }
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    
    const agentInstance = await getAgent();
    const reply = await agentInstance.chat(message, history);
    
    res.json({ 
      success: true,
      reply,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * GET /api/skill/info
 * 获取技能信息
 */
router.get('/skill/info', async (req, res) => {
  try {
    const agentInstance = await getAgent();
    const info = agentInstance.getSkillInfo();
    
    res.json({
      success: true,
      skill: info,
    });
  } catch (error) {
    console.error('Skill info error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chat/reset
 * 重置对话（服务端缓存清理，实际会话由前端 localStorage 管理）
 */
router.post('/chat/reset', async (req, res) => {
  try {
    clearAgentCache();
    clearCache();
    agent = null;
    
    res.json({ 
      success: true,
      message: 'Session reset, skill reloaded',
    });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/reload
 * 热重载技能（开发用）
 */
router.post('/reload', async (req, res) => {
  try {
    clearAgentCache();
    clearCache();
    agent = null;
    
    // 重新加载
    agent = await createAgent();
    const info = agent.getSkillInfo();
    
    res.json({ 
      success: true,
      message: 'Skill reloaded',
      skill: info,
    });
  } catch (error) {
    console.error('Reload error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;