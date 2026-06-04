declare module 'turndown' {
  interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    bulletListMarker?: '-' | '*' | '+';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: string;
    emDelimiter?: '_' | '*';
    strongDelimiter?: '**' | '__';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
    [key: string]: unknown;
  }

  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string): string;
    addRule(key: string, rule: { filter: string | string[] | ((node: HTMLElement) => boolean); replacement: (...args: unknown[]) => string }): void;
    remove(tags: string | string[]): void;
    keep(filter: string | string[] | ((node: HTMLElement) => boolean)): void;
  }

  export default TurndownService;
}
