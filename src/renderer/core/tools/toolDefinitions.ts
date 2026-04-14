/**
 * 启源 AI - 工具定义
 *
 * 定义12个标准工具的JSON Schema，用于豆包API的tools字段
 * 规范文档：docs/工具定义规范.md
 * 参考官方：https://www.volcengine.com/docs/82379/1262342
 */

export const toolDefinitions = [
  // 豆包内置工具：联网搜索（官方实现，无需自己写搜索代码）
  { type: "web_search" },

  // ===== 系统控制 =====
  {
    type: "function",
    function: {
      name: "exec_command",
      description: "执行系统命令，用于控制系统、管理进程、查看系统信息。当用户想查看系统状态、关闭进程、执行脚本时使用。Windows 示例：tasklist（查看进程）、taskkill /PID 1234（关闭进程）、start notepad（打开记事本）、dir（列出文件）、ipconfig（查看网络）。Mac 示例：ps aux（查看进程）、kill 1234（关闭进程）、open -a Safari（打开应用）。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的命令，例如 tasklist、dir C:\\Users、ps aux"
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_app",
      description: "打开应用程序或网页链接。当用户说'打开微信'、'帮我打开百度'、'启动记事本'时使用。传入应用名称（如微信、QQ、记事本、notepad、Chrome）或 URL（如 https://www.baidu.com）即可，系统会自动查找应用路径并启动。",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "应用名称（如：微信、QQ、记事本、notepad.exe、Chrome）或 URL（如：https://www.baidu.com）"
          }
        },
        required: ["target"]
      }
    }
  },

  // ===== 文件操作 =====
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取文件内容。当用户想查看某个文件的内容时使用。路径示例：~/Desktop/天气.txt（桌面文件）、~/Documents/笔记.md（文档）、C:\\Users\\xxx\\project\\index.ts（绝对路径）。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的完整路径，例如 ~/Desktop/天气.txt 或 C:\\Users\\xxx\\file.txt"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "创建或修改文件。当用户想保存内容、新建文件、修改文件时使用。路径示例：~/Desktop/新建文件.txt（桌面）、~/Documents/笔记.md（文档）。如果文件已存在会覆盖原内容。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的完整路径，例如 ~/Desktop/新建文件.txt"
          },
          content: {
            type: "string",
            description: "要写入的文件内容"
          }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "列出目录中的文件和文件夹。当用户想查看某个文件夹里有什么时使用。路径示例：~/Desktop（桌面）、~/Documents（文档）、~/Downloads（下载）、C:\\Users\\xxx\\project（项目目录）。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "目录路径，例如 ~/Desktop、~/Documents、C:\\Users\\xxx\\project"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "按文件名搜索文件。当用户想找某个文件但不知道具体路径时使用。支持通配符匹配，例如 *.txt（所有txt文件）、report*（以report开头的文件）、*.pdf（所有PDF文件）。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "搜索的根目录，例如 ~/Desktop、~/Documents、C:\\Users\\xxx\\project"
          },
          pattern: {
            type: "string",
            description: "文件名模式，支持 * 和 ? 通配符，例如 *.ts、report*、*.pdf"
          }
        },
        required: ["path", "pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep_content",
      description: "在文件中搜索指定文字内容。当用户想在文件里找某个关键词、某段代码、某个配置项时使用。可以指定文件类型缩小搜索范围。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "搜索的根目录，例如 ~/Documents、C:\\Users\\xxx\\project"
          },
          keyword: {
            type: "string",
            description: "要搜索的关键词，例如 'API_KEY'、'function handleSend'、'error'"
          },
          file_pattern: {
            type: "string",
            description: "可选，只搜索特定类型的文件，例如 *.ts、*.json、*.py"
          }
        },
        required: ["path", "keyword"]
      }
    }
  },

  // ===== 网页工具 =====
  {
    type: "function",
    function: {
      name: "web_search",
      description: "搜索互联网信息。当用户需要查询实时信息、新闻、天气、知识、教程时使用。后台静默搜索，返回文字结果。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词，例如 '今天成都天气'、'React Hooks 教程'、'Electron 打包'"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "抓取网页文字内容。当需要读取某个网页的具体内容时使用，传入URL即可获取网页纯文本。适用于读取文章、文档、API文档等。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "网页URL地址，例如 https://www.volcengine.com/docs/82379/1262342"
          }
        },
        required: ["url"]
      }
    }
  },

  // ===== 剪贴板 =====
  {
    type: "function",
    function: {
      name: "clipboard_read",
      description: "读取剪贴板内容。当用户说'帮我翻译刚才复制的'、'总结一下我复制的内容'、'看看我复制了什么'时使用。无需参数。",
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
      description: "将内容写入剪贴板。当用户说'帮我写一段xxx我要复制'、'生成xxx方便我粘贴'、'把这段话复制到剪贴板'时使用。",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "要复制到剪贴板的内容"
          }
        },
        required: ["text"]
      }
    }
  },

  // ===== 屏幕截图 =====
  {
    type: "function",
    function: {
      name: "screenshot",
      description: "截取当前屏幕。当用户说'看看我的屏幕'、'这个报错是什么意思'、'帮我看看这个网页'、'截个图'时使用。无需参数。",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
];
