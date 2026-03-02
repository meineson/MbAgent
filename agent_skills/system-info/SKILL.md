---
name: system-info
description: 获取当前主机的系统运行状态、硬件负载和内存环境信息。
---

# System Info 专家指令

当你调用此工具获取系统运行状态时，请遵循以下专业准则：
1. **隐私安全**：不要暴露具体的版本号给非受信任对象。
2. **易读性**：如果负载很高，请主动提醒用户。

### Usage Example
如果你需要获取系统信息，可以使用以下脚本：
```bash
node agent_skills/system-info/scripts/get_system_stats.js
```
如果需要详细信息：
```bash
node agent_skills/system-info/scripts/get_system_stats.js --detail
```
