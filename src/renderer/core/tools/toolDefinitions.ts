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
      description: "打开应用程序或网页链接。当用户说'打开微信'、'帮我打开百度'时使用,注意用户说的中文，但对应的实际英",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "应用名称或URL" }
        },
        required: ["target"]
      }
    }
  }
];
