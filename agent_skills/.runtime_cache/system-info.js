import os from 'os';

export async function run({ detail }) {
  const info = {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    uptime: (os.uptime() / 3600).toFixed(2) + ' hours'
  };
  
  if (detail) {
    info.totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    info.freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  
  return JSON.stringify(info, null, 2);
}