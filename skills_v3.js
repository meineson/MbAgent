import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execSync } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取配置文件
async function loadConfig() {
  const configPath = join(__dirname, 'skills.config.yaml');
  try {
    const yamlContent = await readFile(configPath, 'utf8');
    return parseYAML(yamlContent);
  } catch (error) {
    console.error('加载配置文件失败:', error.message);
    return { skills: {}, meta: {} };
  }
}

// 简单的 YAML 解析器
function parseYAML(yamlContent) {
  const lines = yamlContent.split('\n');
  const result = { skills: {}, meta: {} };
  let currentSkill = null;
  let currentParam = null;
  let section = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const indent = line.search(/\S/);
    
    if (trimmed === 'skills:') {
      section = 'skills';
      continue;
    }
    
    if (trimmed === 'meta:') {
      section = 'meta';
      continue;
    }
    
    if (section === 'meta' && indent === 2) {
      const colonPos = trimmed.indexOf(':');
      if (colonPos > 0) {
        const key = trimmed.slice(0, colonPos);
        const value = parseValue(trimmed.slice(colonPos + 1).trim());
        result.meta[key] = value;
      }
      continue;
    }
    
    if (section === 'skills' && indent === 2) {
      const colonPos = trimmed.indexOf(':');
      if (colonPos > 0) {
        const key = trimmed.slice(0, colonPos);
        if (key !== 'name' && key !== 'description' && key !== 'category' && key !== 'enabled' && key !== 'parameters') {
          currentSkill = key;
          result.skills[currentSkill] = {
            name: '',
            description: '',
            category: '',
            enabled: true,
            parameters: {}
          };
          currentParam = null;
        }
      }
      continue;
    }
    
    if (section === 'skills' && currentSkill && indent === 4) {
      const colonPos = trimmed.indexOf(':');
      if (colonPos > 0) {
        const key = trimmed.slice(0, colonPos);
        if (key === 'parameters') {
          currentParam = null;
        } else {
          result.skills[currentSkill][key] = parseValue(trimmed.slice(colonPos + 1).trim());
          currentParam = null;
        }
      }
      continue;
    }
    
    if (section === 'skills' && currentSkill && indent === 6) {
      const colonPos = trimmed.indexOf(':');
      if (colonPos > 0) {
        const key = trimmed.slice(0, colonPos);
        if (!currentParam) {
          currentParam = key;
          result.skills[currentSkill].parameters[currentParam] = {
            type: '',
            description: '',
            required: false
          };
        }
        const value = parseValue(trimmed.slice(colonPos + 1).trim());
        
        if (key === 'type' || key === 'description' || key === 'required') {
          result.skills[currentSkill].parameters[currentParam][key] = value;
        } else if (key === 'default') {
          result.skills[currentSkill].parameters[currentParam].default = value;
        } else if (key === 'min') {
          result.skills[currentSkill].parameters[currentParam].min = value;
        } else if (key === 'max') {
          result.skills[currentSkill].parameters[currentParam].max = value;
        } else {
          currentParam = key;
          result.skills[currentSkill].parameters[currentParam] = {
            type: '',
            description: '',
            required: false
          };
          result.skills[currentSkill].parameters[currentParam].type = value;
        }
      }
      continue;
    }
  }
  
  return result;
}

function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('"') || value.startsWith("'")) return value.slice(1, -1);
  if (!isNaN(Number(value))) return Number(value);
  return value;
}

// 技能实现
const implementations = {
  web_search: async ({ query, numResults = 5 }) => {
    try {
      const output = execSync(
        `ddgr --json -n ${numResults} "${query.replace(/"/g, '\\"')}" 2>/dev/null`,
        { encoding: 'utf8', timeout: 10000 }
      );
      const results = JSON.parse(output);
      return `搜索结果 (共${results.length}条):\n\n${results.map((r, i) => 
        `${i+1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
      ).join('\n\n')}`;
    } catch {
      return `搜索"${query}"完成，找到${numResults}条相关结果（演示模式）`;
    }
  },
  
  get_weather: async ({ city }) => {
    const weatherData = {
      '北京': { temp: 15, condition: '晴', humidity: 45 },
      '上海': { temp: 22, condition: '多云', humidity: 65 },
      '广州': { temp: 28, condition: '小雨', humidity: 80 },
    };
    const w = weatherData[city] || { temp: 20, condition: '未知', humidity: 50 };
    return `${city}天气: ${w.condition}, 气温${w.temp}°C, 湿度${w.humidity}%`;
  },
  
  calculate: async ({ expression }) => {
    try {
      const result = eval(expression);
      return `计算结果: ${expression} = ${result}`;
    } catch {
      return '计算错误: 请检查表达式格式';
    }
  },
  
  get_current_time: async ({ timezone = 'Asia/Shanghai' }) => {
    const now = new Date();
    return `当前时间 (${timezone}): ${now.toLocaleString('zh-CN', { timeZone: timezone })}`;
  },
  
  read_file: async ({ filePath }) => {
    try {
      const fs = await import('fs');
      const content = fs.readFileSync(filePath, 'utf8');
      return `文件内容:\n${content}`;
    } catch {
      return '读取文件失败: 文件不存在或无权限';
    }
  },
  
  write_file: async ({ filePath, content }) => {
    try {
      const fs = await import('fs');
      fs.writeFileSync(filePath, content, 'utf8');
      return `文件已保存: ${filePath}`;
    } catch {
      return '写入文件失败: 请检查路径或权限';
    }
  },
  
  get_cameras: async ({ range }) => {
    const cameras = [
      { id: 1, name: '门口', url: 'rtsp://172.21.132.230/url1' },
      { id: 2, name: '办公室', url: 'rtsp://172.21.132.230:554/rtp/...' },
      { id: 3, name: '广场', url: 'rtsp://172.21.132.230/url3' },
    ];
    let resp = `已成功获取所有摄像头：\n\n`;
    cameras.forEach((cam) => {
      resp += `摄像头名称: "${cam.name}"\nRTSP地址: "${cam.url}"\n\n`;
    });
    return resp;
  },
  
  check_camera: async ({ url, name }) => {
    try {
      const output = execSync(
        `ffprobe -timeout 3000000 -v error -show_entries stream=codec_name,codec_type -of default=noprint_wrappers=1 '${url}'`,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 1024,
        }
      );
      return `检查${name}摄像头状态完成：视频流正常。ffprobe输出：${output.slice(0, 200)}`;
    } catch {
      return `检查${name}摄像头状态完成：连接失败。`;
    }
  }
};

// 生成 Zod schema
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

// 从配置生成 LangChain 工具
function generateLangChainTools(config) {
  const tools = [];
  for (const [skillKey, skill] of Object.entries(config.skills)) {
    if (!skill.enabled) continue;
    
    const implementation = implementations[skillKey];
    if (!implementation) continue;
    
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

// 生成 SKILLS_MANIFEST
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

// 生成 OpenAI Functions
function generateOpenAIFunctions(config) {
  const functions = [];
  for (const [skillKey, skill] of Object.entries(config.skills)) {
    if (!skill.enabled) continue;
    
    const properties = {};
    const required = [];
    
    for (const [paramKey, param] of Object.entries(skill.parameters)) {
      properties[paramKey] = {
        type: param.type
      };
      if (param.description) {
        properties[paramKey].description = param.description;
      }
      if (param.default !== undefined) {
        properties[paramKey].default = param.default;
      }
      if (param.required) {
        required.push(paramKey);
      }
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

// 生成 MCP Tools
function generateMCPTools(config) {
  const tools = [];
  for (const [skillKey, skill] of Object.entries(config.skills)) {
    if (!skill.enabled) continue;
    
    const properties = {};
    const required = [];
    
    for (const [paramKey, param] of Object.entries(skill.parameters)) {
      properties[paramKey] = {
        type: param.type
      };
      if (param.description) {
        properties[paramKey].description = param.description;
      }
      if (param.default !== undefined) {
        properties[paramKey].default = param.default;
      }
      if (param.min !== undefined) {
        properties[paramKey].minimum = param.min;
      }
      if (param.max !== undefined) {
        properties[paramKey].maximum = param.max;
      }
      if (param.required) {
        required.push(paramKey);
      }
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

// 主函数：加载配置并生成所有格式
async function loadSkills() {
  const config = await loadConfig();
  
  const langChainTools = generateLangChainTools(config);
  const SKILLS_MANIFEST = generateSkillsManifest(config);
  const openAIFunctions = generateOpenAIFunctions(config);
  const mcpTools = generateMCPTools(config);
  
  return {
    manifest: SKILLS_MANIFEST,
    langchain: langChainTools,
    openAI: openAIFunctions,
    mcp: mcpTools,
    handlers: implementations
  };
}

export default await loadSkills();
export { implementations };
export { loadSkills };