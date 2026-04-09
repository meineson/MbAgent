/**
 * 张雪峰视角 Agent
 * 基于 LangChain 构建的受限对话代理
 */
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { loadSkill } from './skill.js';

let agentCache = null;

/**
 * 创建 Agent 实例
 */
export async function createAgent() {
  if (agentCache) {
    return agentCache;
  }
  
  const skill = await loadSkill();
  
  // 使用环境变量中的模型配置（适配 .env 变量名）
  const model = process.env.MODEL || process.env.OPENAI_MODEL || 'glm-5';
  const baseUrl = process.env.BASE_URL || process.env.OPENAI_BASE_URL || undefined;
  const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('API_KEY or OPENAI_API_KEY not found in environment');
  }
  
  const llm = new ChatOpenAI({
    model: model,
    temperature: 0.7,  // 稍高温度保持张雪峰的表达风格
    apiKey: apiKey,
    configuration: baseUrl ? {
      baseURL: baseUrl,
    } : undefined,
  });
  
  agentCache = {
    skill,
    llm,
    
    /**
     * 执行对话
     * @param {string} userMessage 用户消息
     * @param {Array} history 对话历史 [{role: 'human'|'ai', content: '...'}]
     * @returns {Promise<string>} AI 回复
     */
    async chat(userMessage, history = []) {
      // 构建消息序列
      const messages = [
        new SystemMessage(skill.systemPrompt),
        ...history.map(h => 
          h.role === 'human' 
            ? new HumanMessage(h.content) 
            : new AIMessage(h.content)
        ),
        new HumanMessage(userMessage),
      ];
      
      const response = await llm.invoke(messages);
      return response.content;
    },
    
    /**
     * 获取技能信息
     */
    getSkillInfo() {
      return {
        name: skill.name,
        description: skill.description,
      };
    },
  };
  
  return agentCache;
}

/**
 * 清除 Agent 缓存
 */
export function clearAgentCache() {
  agentCache = null;
}

export default createAgent;