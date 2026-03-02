import os from 'os';

/**
 * 获取当前系统性能指标
 * @param {Object} params - 获取参数
 * @param {boolean} [params.detail=false] - 是否返回详细硬件信息
 * @returns {Promise<string>} 格式化后的 JSON 字符串
 */
export async function run({ detail = false }) {
  const stats = {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    uptime: `${(os.uptime() / 3600).toFixed(2)} hours`,
    loadavg: os.loadavg()
  };

  if (detail) {
    stats.memory = {
      total: `${(os.totalmem() / 1e9).toFixed(2)} GB`,
      free: `${(os.freemem() / 1e9).toFixed(2)} GB`,
      usage: `${((1 - os.freemem() / os.totalmem()) * 100).toFixed(2)}%`
    };
    stats.cpus = os.cpus().map(cpu => cpu.model).slice(0, 4); // 仅列出前 4 个 CPU
  }

  return JSON.stringify(stats, null, 2);
}

// 支持 CLI 直接调用
if (process.argv[1].endsWith('get_system_stats.js')) {
  const detail = process.argv.includes('--detail');
  run({ detail }).then(console.log);
}
