/**
 * 启源 AI - 工具定义
 *
 * 定义12个标准工具的JSON Schema，用于豆包API的tools字段
 */

export const toolDefinitions = [
  // 豆包内置工具：联网搜索（官方实现，无需自己写搜索代码）
  { type: "web_search" },
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
      description: "搜索互联网信息。当用户需要查询实时信息、新闻、天气、知识、教程时使用。后台静默搜索，返回文字结果。",
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
      name: "web_fetch",
      description: "抓取网页文字内容。当需要读取某个网页的具体内容时使用，传入URL即可获取网页纯文本。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "网页URL地址" }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "列出目录中的文件和文件夹。当用户想查看某个文件夹里有什么时使用。",
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
      description: "按文件名搜索文件。当用户想找某个文件但不知道具体路径时使用，支持通配符如 *.txt。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "搜索的根目录" },
          pattern: { type: "string", description: "文件名模式，支持 * 和 ? 通配符，如 *.ts 或 report*" }
        },
        required: ["path", "pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep_content",
      description: "在文件中搜索指定文字内容。当用户想在文件里找某个关键词、某段代码时使用。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "搜索的根目录" },
          keyword: { type: "string", description: "要搜索的关键词" },
          file_pattern: { type: "string", description: "可选，只搜索特定类型的文件，如 *.ts" }
        },
        required: ["path", "keyword"]
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
      description: "打开应用程序或网页链接。当用户说'打开微信'、'帮我打开百度'时使用。传入应用名称或URL即可，代码会自动查找应用路径。",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "应用名称（如：微信、QQ、记事本）或 URL（如：https://www.baidu.com）" }
        },
        required: ["target"]
      }
    }
  }
];
