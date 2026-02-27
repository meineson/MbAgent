export async function read_file({ filePath }) {
  try {
    const fs = await import('fs');
    const content = fs.readFileSync(filePath, 'utf8');
    return `文件内容:\n${content}`;
  } catch {
    return '读取文件失败: 文件不存在或无权限';
  }
}

export async function write_file({ filePath, content }) {
  try {
    const fs = await import('fs');
    fs.writeFileSync(filePath, content, 'utf8');
    return `文件已保存: ${filePath}`;
  } catch {
    return '写入文件失败: 请检查路径或权限';
  }
}