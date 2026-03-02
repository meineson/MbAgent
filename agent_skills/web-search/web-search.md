---
name: web-search
description: 在互联网上搜索实时信息、新闻、文档或任何你需要了解的内容。
implementation: ./scripts/web_search.js
parameters:
  query:
    type: string
    description: 搜索关键词
    required: true
  numResults:
    type: number
    description: 返回结果数量
    default: 5
---

# Web Search Skill

当你进行网络搜索时，请遵循以下专业准则：
1. **多维度分析**：查看多个搜索结果摘要，提取最准确、最及时的信息。
2. **来源评估**：优先参考权威文档、官方网站或知名技术社区的内容。
3. **综合总结**：不要只是简单列出结果，而是要根据用户的具体意图，对搜索到的零散信息进行逻辑化整合。

（注：本技能逻辑实现位于 `scripts/web_search.js`）
