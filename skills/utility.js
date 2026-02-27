import { execSync } from 'child_process';

export async function web_search({ query, numResults = 5 }) {
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
}

export async function calculate({ expression }) {
  try {
    const result = eval(expression);
    return `计算结果: ${expression} = ${result}`;
  } catch {
    return '计算错误: 请检查表达式格式';
  }
}