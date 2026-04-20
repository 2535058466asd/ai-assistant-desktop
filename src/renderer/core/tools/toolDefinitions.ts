/**
 * 启源 AI - 工具定义
 * 
 * 定义8个标准工具的JSON Schema，用于豆包API的tools字段
 */

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "exec_command",
      description: "执行系统命令。用于控制系统、管理进程、查看系统信息。Windows用cmd命令如tasklist/taskkill/start，Mac用bash命令如ps/kill/open。",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "要执行的命令" }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取文件内容。当用户想查看某个文件的内容时使用。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件完整路径" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "创建或修改文件。当用户想保存内容、新建文件、修改文件时使用。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件完整路径" },
          content: { type: "string", description: "要写入的内容" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "搜索互联网信息。当用户需要查询实时信息、新闻、知识、教程时使用。不适用于查天气。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "clipboard_read",
      description: "读取剪贴板内容。当用户说'帮我翻译刚才复制的'、'总结一下我复制的内容'时使用。",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "clipboard_write",
      description: "将内容写入剪贴板。当用户说'帮我写一段xxx我要复制'、'生成xxx方便我粘贴'时使用。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "要复制到剪贴板的内容" }
        },
        required: ["text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "screenshot",
      description: "截取当前屏幕。当用户说'看看我的屏幕'、'这个报错是什么意思'、'帮我看看这个网页'时使用。",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_app",
      description: "打开应用程序或网页链接。当用户说'打开微信'、'帮我打开百度'时使用。注意用户说的中文，但对应的实际英文应用名需要自行转换。",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "应用名称或URL" }
        },
        required: ["target"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "获取指定URL的网页内容。当用户说'帮我看看这个链接的内容'、'抓取这个网页'时使用。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "要获取的网页URL" }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "列出指定目录下的文件和文件夹。当用户想查看某个文件夹里有什么文件时使用。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "目录路径" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "在指定目录中搜索包含特定关键词的文件名。当用户想找某个文件但不知道具体路径时使用。",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "搜索的目录路径" },
          keyword: { type: "string", description: "文件名中包含的关键词" }
        },
        required: ["directory", "keyword"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep_content",
      description: "在文件内容中搜索包含特定关键词的行。当用户想查找文件中是否包含某段文字时使用。",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "文件路径" },
          pattern: { type: "string", description: "要搜索的关键词或正则表达式" }
        },
        required: ["file_path", "pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "knowledge_search",
      description: "搜索本地知识库。当用户询问已存储的知识、产品信息、技术文档等内容时使用。从向量数据库中检索最相关的文档片段。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索查询文本" },
          n_results: { type: "number", description: "返回结果数量，默认3" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "knowledge_add",
      description: "向知识库添加新的知识内容。当用户说'记住这个'、'存到知识库'、'学习这段内容'时使用。支持批量添加多条文档。",
      parameters: {
        type: "object",
        properties: {
          documents: {
            type: "array",
            items: { type: "string" },
            description: "要添加的文档内容数组，每条为一个独立的知识片段"
          },
          category: { type: "string", description: "知识分类，如'产品'、'技术'、'FAQ'等" }
        },
        required: ["documents"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "knowledge_import_file",
      description: "导入文件到知识库。支持PDF、Word(.docx)、Excel(.xlsx)、TXT、MD文件。自动解析文件内容并切分为知识片段存入向量数据库。当用户说'学习这个文件'、'导入这个文档'时使用。",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "文件完整路径" },
          category: { type: "string", description: "知识分类，如'产品目录'、'技术文档'等" }
        },
        required: ["file_path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "knowledge_import_image",
      description: "识别图片内容并导入知识库。使用AI视觉模型识别图片中的文字、表格、参数等信息，然后存入知识库。当用户说'学习这张图片'、'识别这个截图'时使用。",
      parameters: {
        type: "object",
        properties: {
          image_path: { type: "string", description: "图片文件完整路径" },
          category: { type: "string", description: "知识分类" }
        },
        required: ["image_path"]
      }
    }
  }
];
