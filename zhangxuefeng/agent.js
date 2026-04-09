/**
 * 张雪峰视角 Agent
 * OpenAI 兼容 API + Gemini WebSearch 工具
 */
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { loadSkill } from './skill.js';
import { webSearchTool } from './tools/gemini-search.js';

let agentCache = null;

/**
 * 创建 Agent 实例
 */
export async function createAgent() {
  if (agentCache) {
    return agentCache;
  }
  
  const skill = await loadSkill();
  const model = process.env.MODEL || 'glm-5';
  const baseUrl = process.env.BASE_URL || process.env.OPENAI_BASE_URL;
  const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('API_KEY / OPENAI_API_KEY not found in environment');
  }
  
  console.log('🔧 使用 OpenAI 兼容 API:', baseUrl || '默认', model);
  
  // 基础 LLM
  const llm = new ChatOpenAI({
    model: model,
    temperature: 0.7,
    apiKey: apiKey,
    configuration: baseUrl ? { baseURL: baseUrl } : undefined,
  });
  
  // 工具列表
  const tools = [webSearchTool];
  
  // 如果配置了 GOOGLE_API_KEY，使用 React Agent（支持工具调用）
  const searchEnabled = Boolean(process.env.GOOGLE_API_KEY);
  
  if (searchEnabled) {
    console.log('🔧 已启用 Gemini WebSearch 工具');
    
    // 使用 LangGraph React Agent - 可以自主决定何时调用工具
    const reactAgent = await createReactAgent({
      llm,
      tools,
    });
    
    agentCache = {
      skill,
      llm,
      reactAgent,
      model,
      searchEnabled,
      
      /**
       * 执行对话
       */
      async chat(userMessage, history = []) {
        // 构建 React Agent 输入
        const messages = [
          new SystemMessage(skill.systemPrompt),
          ...history.map(h => 
            h.role === 'human' 
              ? new HumanMessage(h.content) 
              : new AIMessage(h.content)
          ),
          new HumanMessage(userMessage),
        ];
        
        // React Agent 会自动判断是否需要调用 web_search
        const result = await reactAgent.invoke({ messages });
        
        // 提取最终回复
        const lastMessage = result.messages[result.messages.length - 1];
        return lastMessage.content;
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
          searchType: 'Gemini Google Search',
          tools: ['web_search'],
        };
      },
    };
  } else {
    // 无搜索工具，直接对话
    console.log('🔧 未启用搜索工具（未配置 GOOGLE_API_KEY）');
    
    agentCache = {
      skill,
      llm,
      model,
      searchEnabled: false,
      
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
        return response.content;
      },
      
      /**
       * 获取技能信息
       */
      getSkillInfo() {
        return {
          name: skill.name,
          description: skill.description,
          model: this.model,
          searchEnabled: false,
          searchType: '无',
          tools: [],
        };
      },
    };
  }
  
  return agentCache;
}

/**
 * 清除 Agent 缓存
 */
export function clearAgentCache() {
  agentCache = null;
}

export default createAgent;