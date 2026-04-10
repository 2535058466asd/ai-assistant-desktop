/**
 * CSS Modules 类型声明
 * 让 TypeScript 识别 *.module.css 文件的导入
 * 导入后返回一个类名映射对象（key-value 形式）
 */

/* 声明所有 .module.css 模块的类型 */
declare module '*.module.css' {
  /* CSS 类名作为 key，值为字符串（编译后的实际类名）*/
  const classes: { readonly [key: string]: string };
  /* 默认导出类名映射 */
  export default classes;
}
