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
      description: "打开应用程序或网页链接。当用户说'打开微信'、'帮我打开百度'时使用。重要：target 参数必须使用实际的可执行文件名（带.exe后缀）或系统命令名，不是中文名。例如：微信用 WeChat.exe，QQ用 QQ.exe，记事本用 notepad，计算器用 calc，画图用 mspaint，浏览器用 msedge，文件管理器用 explorer，控制台用 cmd，VS Code 用 code。如果是 URL（以 http 或 https 开头）则直接打开浏览器。如果不确定文件名，可以先用 exec_command 执行 where 命令查找，例如 where WeChat。注意：不要只传应用名不带.exe，否则可能误打开同名文件夹。",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "应用的可执行文件名（如 WeChat）或完整 URL（如 https://www.baidu.com）" }
        },
        required: ["target"]
      }
    }
  }
];
