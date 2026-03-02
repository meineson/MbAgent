---
name: system-info
description: 获取当前系统的运行信息（架构、平台、内存等）。
parameters:
  detail:
    type: boolean
    description: 是否显示详细内存信息
    default: false
---

# System Info Skill

当你调用此工具获取系统信息时，请注意：
1. 内存信息以 GB 为单位显示。
2. 如果用户没有要求详细信息，只需概括平台和架构。

## 实现逻辑
下面是获取系统信息的 JS 代码：

```javascript
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
```
