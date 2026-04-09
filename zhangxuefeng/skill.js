/**
 * 张雪峰视角技能加载器
 * 从 SKILL.md 加载并解析技能定义
 */
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 技能路径：优先使用 .env 配置，否则使用默认路径
const DEFAULT_SKILL_PATH = join(process.env.HOME, '.agents/skills/zhangxuefeng-perspective/SKILL.md');
const SKILL_PATH = process.env.SKILL_PATH ? join(process.env.SKILL_PATH, 'SKILL.md') : DEFAULT_SKILL_PATH;

let skillCache = null;

/**
 * 解析 SKILL.md 的 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }
  
  const yamlStr = match[1];
  const body = match[2];
  
  // 简单解析 YAML frontmatter
  const yaml = {};
  const lines = yamlStr.split('\n');
  let currentKey = null;
  let currentValue = [];
  
  for (const line of lines) {
    // 新的 key
    if (line.match(/^(\w+):\s*(.*)$/)) {
      // 保存上一个 key
      if (currentKey) {
        yaml[currentKey] = currentValue.length > 0 
          ? currentValue.join('\n').trim() 
          : yaml[currentKey];
        currentValue = [];
      }
      
      const [, key, value] = line.match(/^(\w+):\s*(.*)$/);
      currentKey = key;
      if (value) {
        yaml[key] = value;
      }
    }
    // 多行值
    else if (line.startsWith('  ') || line.startsWith('\t')) {
      currentValue.push(line.replace(/^[\t ]+/, ''));
    }
  }
  
  // 保存最后一个 key
  if (currentKey && currentValue.length > 0) {
    yaml[currentKey] = currentValue.join('\n').trim();
  }
  
  return { yaml, body };
}

/**
 * 提取技能核心内容用于 system prompt
 */
function extractSystemPrompt(body) {
  // 直接返回 SKILL.md 内容，让 LLM 理解全部规则
  return body.trim();
}

/**
 * 加载技能定义
 */
export async function loadSkill() {
  if (skillCache) {
    return skillCache;
  }
  
  const content = await readFile(SKILL_PATH, 'utf-8');
  const { yaml, body } = parseFrontmatter(content);
  
  skillCache = {
    name: yaml.name || 'zhangxuefeng-perspective',
    description: yaml.description || '张雪峰的思维框架与表达方式',
    systemPrompt: extractSystemPrompt(body),
    rawContent: content,
  };
  
  return skillCache;
}

/**
 * 清除缓存（用于热重载）
 */
export function clearCache() {
  skillCache = null;
}

export default loadSkill;