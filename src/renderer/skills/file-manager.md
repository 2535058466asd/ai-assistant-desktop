---
name: file_manager
description: 文件管理
tools: [list_dir, search_files, grep_content, copy_file, move_file, delete_file, create_dir]
keywords: [目录, 文件夹, 文件名, 搜索文件, grep, 查找文件, 列出, 复制文件, 移动文件, 删除文件, 创建目录, list_dir, search_files, grep_content]
---

当用户需要操作文件时，优先使用专用文件工具而不是 exec_command。
搜索文件时先用 search_files 定位，再用 read_file 读取内容。
grep_content 支持正则（regex: true）和上下文行数（context_lines），适合代码搜索。
删除文件前务必确认用户意图。
