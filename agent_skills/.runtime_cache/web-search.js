import { execSync } from 'child_process';

export async function run({ query, numResults = 5 }) {
  try {
    const output = execSync(
      `ddgr --json -n ${numResults} "${query.replace(/"/g, '"')}" 2>/dev/null`,
      { encoding: 'utf8', timeout: 10000 }
    );
    const results = JSON.parse(output);
    return `搜索结果 (共${results.length}条):

${results.map((r, i) => 
      `${i+1}. ${r.title}
   ${r.url}
   ${r.snippet}`
    ).join('

')}`;
  } catch (error) {
    return `搜索"${query}"过程中出现异常，请稍后尝试。`;
  }
}