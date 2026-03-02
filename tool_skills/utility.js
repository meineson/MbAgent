export async function calculate({ expression }) {
  try {
    const result = eval(expression);
    return `计算结果: ${expression} = ${result}`;
  } catch {
    return '计算错误: 请检查表达式格式';
  }
}
