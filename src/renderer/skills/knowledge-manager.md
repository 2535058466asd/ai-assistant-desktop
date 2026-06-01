---
name: knowledge_manager
description: 知识库管理
tools: [knowledge_add, knowledge_import_file, knowledge_import_image]
keywords: [知识库, 导入, PDF, Word, Excel, 文档导入, 添加知识, import, RAG, 向量]
---

操作知识库时，先用 knowledge_search 检索已有内容，避免重复导入。
导入文件支持 PDF、Word、Excel、TXT、MD 格式，会自动切片。
导入图片会先走视觉识别再转为知识片段。
添加知识时可以用 category 参数分类，方便后续检索。
