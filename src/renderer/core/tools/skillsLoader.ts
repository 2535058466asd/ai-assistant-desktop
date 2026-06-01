export interface Skill {
  name: string;
  description: string;
  tools: string[];
  keywords: RegExp[];
  instructions: string;
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function parseSkill(raw: string): Skill | null {
  const result = parseFrontmatter(raw);
  if (!result) return null;
  const { meta, body } = result;
  if (!meta.name || !meta.tools || !meta.keywords) return null;

  const tools = meta.tools.split(',').map((t) => t.trim()).filter(Boolean);
  const keywords = meta.keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => new RegExp(k, 'i'));

  return {
    name: meta.name,
    description: meta.description || meta.name,
    tools,
    keywords,
    instructions: body,
  };
}

const SKILL_FILES = [
  { name: 'file-manager', raw: `---
name: file_manager
description: 文件管理
tools: [list_dir, search_files, grep_content, copy_file, move_file, delete_file, create_dir]
keywords: [目录, 文件夹, 文件名, 搜索文件, grep, 查找文件, 列出, 复制文件, 移动文件, 删除文件, 创建目录, list_dir, search_files, grep_content]
---

当用户需要操作文件时，优先使用专用文件工具而不是 exec_command。
搜索文件时先用 search_files 定位，再用 read_file 读取内容。
grep_content 支持正则（regex: true）和上下文行数（context_lines），适合代码搜索。
删除文件前务必确认用户意图。` },
  { name: 'knowledge-manager', raw: `---
name: knowledge_manager
description: 知识库管理
tools: [knowledge_add, knowledge_import_file, knowledge_import_image]
keywords: [知识库, 导入, PDF, Word, Excel, 文档导入, 添加知识, import, RAG, 向量]
---

操作知识库时，先用 knowledge_search 检索已有内容，避免重复导入。
导入文件支持 PDF、Word、Excel、TXT、MD 格式，会自动切片。
导入图片会先走视觉识别再转为知识片段。
添加知识时可以用 category 参数分类，方便后续检索。` },
  { name: 'system-tools', raw: `---
name: system_tools
description: 系统工具
tools: [open_app, notify, get_system_info, clipboard_write]
keywords: [打开应用, 打开微信, 通知, 提醒, 系统信息, CPU, 内存, 磁盘, 写入剪贴板, 复制到剪贴板]
---

打开应用时直接传应用名称或 URL，工具会自动处理。
系统通知适合设置提醒或告知用户重要信息。
获取系统信息返回 CPU、内存、磁盘等硬件数据。` },
  { name: 'workspace', raw: `---
name: workspace
description: 工作台
tools: [workspace_create_task, workspace_update_project]
keywords: [任务, 待办, 工作台, 项目状态, 创建任务, 更新项目]
---

工作台用于管理个人项目和任务。
创建任务时可指定优先级（low/medium/high）。
更新项目时可修改状态（active/blocked/planning/done）、目标、下一步或阻塞点。` },
];

export const skills: Skill[] = SKILL_FILES
  .map((f) => parseSkill(f.raw))
  .filter((s): s is Skill => s !== null);

export function matchSkills(userInput: string): Skill[] {
  return skills.filter((s) => s.keywords.some((k) => k.test(userInput)));
}
