import { execSync } from 'child_process';

/**
 * 执行网络搜索任务
 * @param {Object} params - 搜索参数
 * @param {string} params.query - 搜索关键词
 * @param {number} [params.numResults=5] - 返回结果数量
 * @returns {Promise<string>} 格式化后的搜索结果
 */
export async function run({ query, numResults = 5 }) {
  if (!query) {
    throw new Error('搜索关键词 query 不能为空');
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const enhancedQuery = `${query} (current date: ${today})`;
    const safeQuery = enhancedQuery.replace(/"/g, '\\"');
    const command = `ddgr --json -n ${numResults} "${safeQuery}" 2>/dev/null`;
    
    const output = execSync(command, { 
      encoding: 'utf8', 
      timeout: 10000 
    });
    
    const results = JSON.parse(output);
    if (!results || results.length === 0) {
      return `针对关键词 "${query}" 未找到相关结果。`;
    }

    const formattedResults = results.map((r, i) => {
      return `[${i + 1}] ${r.title}\n   链接: ${r.url}\n   内容: ${r.snippet}`;
    }).join('\n\n');

    return `### 网络搜索结果 (共 ${results.length} 条)\n\n${formattedResults}`;
  } catch (error) {
    console.error('Web Search Script Error:', error);
    return `搜索执行失败: ${error.message}`;
  }
}

// 支持 CLI 直接调用 (用于调试)
if (process.argv[1].endsWith('web_search.js')) {
  const query = process.argv[2] || 'Node.js 教程';
  run({ query }).then(console.log);
}
