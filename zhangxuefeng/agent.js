/**
 * 张雪峰视角 Agent
 * 支持 Gemini (Google Search grounding) 和 OpenAI 兼容 API
 */
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { loadSkill } from './skill.js';

let agentCache = null;

/**
 * 判断是否使用原生 Gemini API（支持 Google Search grounding）
 */
function useNativeGemini() {
  // 如果有 GOOGLE_API_KEY，使用原生 Gemini API
  return Boolean(process.env.GOOGLE_API_KEY);
}

/**
 * 判断是否使用 Gemini 模型（但通过 OpenAI 兼容接口）
 */
function isGeminiModel() {
  const model = process.env.MODEL || '';
  return model.startsWith('gemini');
}

/**
 * 创建 Agent 实例
 */
export async function createAgent() {
  if (agentCache) {
    return agentCache;
  }
  
  const skill = await loadSkill();
  const model = process.env.MODEL || 'glm-5';
  
  let llm;
  let searchEnabled = false;
  
  if (useNativeGemini() && isGeminiModel()) {
    // 原生 Gemini API + Google Search grounding
    console.log('🔧 使用原生 Gemini API + Google Search:', model);
    
    const googleApiKey = process.env.GOOGLE_API_KEY;
    
    llm = new ChatGoogleGenerativeAI({
      model: model,
      apiKey: googleApiKey,
      temperature: 0.7,
      // Google Search grounding - 自动搜索并引用来源
      tools: [
        {
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 0.5, // 触发搜索的阈值
            }
          }
        }
      ],
    });
    
    searchEnabled = true;
  } else {
    // OpenAI 兼容 API (阿里百炼、火山方舟、Gemini OpenAI兼容等)
    const baseUrl = process.env.BASE_URL || process.env.OPENAI_BASE_URL;
    const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY not found');
    }
    
    console.log('🔧 使用 OpenAI 兼容 API:', baseUrl || '默认', model);
    
    llm = new ChatOpenAI({
      model: model,
      temperature: 0.7,
      apiKey: apiKey,
      configuration: baseUrl ? { baseURL: baseUrl } : undefined,
    });
    
    searchEnabled = false;
  }
  
  agentCache = {
    skill,
    llm,
    model,
    searchEnabled,
    
    /**
     * 执行对话
     */
    async chat(userMessage, history = []) {
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
      let reply = response.content;
      
      // Gemini 搜索来源提取
      if (this.searchEnabled && response.additional_kwargs) {
        const grounding = response.additional_kwargs.groundingMetadata;
        if (grounding?.groundingChunks?.length > 0) {
          // 有搜索结果被引用
          const sources = grounding.groundingChunks
            .map(c => c.web?.title || c.web?.uri)
            .filter(Boolean)
            .slice(0, 3);
          
          if (sources.length > 0) {
            reply += `\n\n---\n📊 数据来源：${sources.join('、')}`;
          }
        }
      }
      
      return reply;
    },
    
    /**
     * 获取技能信息
     */
    getSkillInfo() {
      return {
        name: skill.name,
        description: skill.description,
        model: this.model,
        searchEnabled: this.searchEnabled,
        searchType: this.searchEnabled ? 'Google Search Grounding' : '无',
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