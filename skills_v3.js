// 使用 js-yaml 重构的版本，无需硬编码 indent
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const implementationCache = new Map();

async function loadImplementation(implementationPath) {
  if (implementationCache.has(implementationPath)) {
    return implementationCache.get(implementationPath);
  }

  const [modulePath, functionName] = implementationPath.split('#');
  const fullPath = join(__dirname, modulePath);
  
  try {
    const module = await import(fullPath);
    const impl = module[functionName];
    
    if (typeof impl !== 'function') {
      throw new Error(`函数 ${functionName} 未在 ${modulePath} 中找到`);
    }
    
    implementationCache.set(implementationPath, impl);
    return impl;
  } catch (error) {
    console.error(`加载实现失败 ${implementationPath}:`, error.message);
    return null;
  }
}

async function loadConfig() {
  const configPath = join(__dirname, 'skills.config.yaml');
  try {
    const yamlContent = await readFile(configPath, 'utf8');
    return yaml.load(yamlContent);
  } catch (error) {
    console.error('加载配置文件失败:', error.message);
    return { skills: {}, meta: {} };
  }
}

function generateZodSchema(parameters) {
  const schemaFields = {};
  for (const [key, param] of Object.entries(parameters)) {
    let field;
    switch (param.type) {
      case 'string':
        field = z.string();
        break;
      case 'number':
        field = z.number();
        if (param.min !== undefined) field = field.min(param.min);
        if (param.max !== undefined) field = field.max(param.max);
        break;
      case 'boolean':
        field = z.boolean();
        break;
      default:
        field = z.any();
    }
    
    if (param.default !== undefined) {
      field = field.default(param.default);
    } else if (!param.required) {
      field = field.optional();
    }
    
    if (param.description) {
      field = field.describe(param.description);
    }
    
    schemaFields[key] = field;
  }
  return z.object(schemaFields);
}

async function generateLangChainTools(config) {
  const tools = [];
  for (const [skillKey, skill] of Object.entries(config.skills)) {
    if (!skill.enabled) continue;
    
    if (!skill.implementation) {
      console.warn(`跳过 ${skillKey}: 未指定实现路径`);
      continue;
    }
    
    const implementation = await loadImplementation(skill.implementation);
    if (!implementation) {
      console.warn(`跳过 ${skillKey}: 实现加载失败`);
      continue;
    }
    
    const schema = generateZodSchema(skill.parameters);
    
    tools.push(
      tool(
        implementation,
        {
          name: skillKey,
          description: skill.description,
          schema
        }
      )
    );
  }
  return tools;
}

function generateSkillsManifest(config) {
  return {
    version: config.meta.version || "3.0.0",
    author: config.meta.author || "AI Agent",
    description: config.meta.description || "多功能技能集合（配置驱动）",
    skills: Object.entries(config.skills).map(([key, skill]) => ({
      id: key,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      enabled: skill.enabled
    }))
  };
}

function generateOpenAIFunctions(config) {
  const functions = [];
  for (const [skillKey, skill] of Object.entries(config.skills)) {
    if (!skill.enabled) continue;
    
    const properties = {};
    const required = [];
    
    for (const [paramKey, param] of Object.entries(skill.parameters)) {
      properties[paramKey] = { type: param.type };
      if (param.description) properties[paramKey].description = param.description;
      if (param.default !== undefined) properties[paramKey].default = param.default;
      if (param.required) required.push(paramKey);
    }
    
    functions.push({
      type: "function",
      function: {
        name: skillKey,
        description: skill.description,
        parameters: {
          type: "object",
          properties,
          required: required.length > 0 ? required : undefined
        }
      }
    });
  }
  return functions;
}

function generateMCPTools(config) {
  const tools = [];
  for (const [skillKey, skill] of Object.entries(config.skills)) {
    if (!skill.enabled) continue;
    
    const properties = {};
    const required = [];
    
    for (const [paramKey, param] of Object.entries(skill.parameters)) {
      properties[paramKey] = { type: param.type };
      if (param.description) properties[paramKey].description = param.description;
      if (param.default !== undefined) properties[paramKey].default = param.default;
      if (param.min !== undefined) properties[paramKey].minimum = param.min;
      if (param.max !== undefined) properties[paramKey].maximum = param.max;
      if (param.required) required.push(paramKey);
    }
    
    tools.push({
      name: skillKey,
      description: skill.description,
      inputSchema: {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined
      }
    });
  }
  return tools;
}

async function buildHandlers(config) {
  const handlers = {};
  for (const [skillKey, skill] of Object.entries(config.skills)) {
    if (skill.implementation) {
      const impl = await loadImplementation(skill.implementation);
      if (impl) handlers[skillKey] = impl;
    }
  }
  return handlers;
}

async function loadSkills() {
  const config = await loadConfig();
  
  const langChainTools = await generateLangChainTools(config);
  const SKILLS_MANIFEST = generateSkillsManifest(config);
  const openAIFunctions = generateOpenAIFunctions(config);
  const mcpTools = generateMCPTools(config);
  const handlers = await buildHandlers(config);
  
  return {
    manifest: SKILLS_MANIFEST,
    langchain: langChainTools,
    openAI: openAIFunctions,
    mcp: mcpTools,
    handlers
  };
}

export default await loadSkills();
export { loadSkills };