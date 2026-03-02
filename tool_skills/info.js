import { execSync } from 'child_process';

export async function get_weather({ city }) {
  try {
    // 使用 ddgr 搜索天气，抓取前 3 条结果作为背景
    const output = execSync(
      `ddgr --json -n 3 "${city} 实时天气" 2>/dev/null`,
      { encoding: 'utf8', timeout: 8000 }
    );
    const results = JSON.parse(output);
    if (results && results.length > 0) {
      return `[联网查询结果] ${city} 实时天气：\n\n${results.map(r => r.snippet).join('\n\n')}`;
    }
    throw new Error('未找到搜索结果');
  } catch (error) {
    return `联网获取${city}天气失败，请稍后重试。原因: ${error.message}`;
  }
}

export async function get_current_time({ timezone = 'Asia/Shanghai' }) {
  const now = new Date();
  return `当前时间 (${timezone}): ${now.toLocaleString('zh-CN', { timeZone: timezone })}`;
}