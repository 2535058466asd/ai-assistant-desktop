/**
 * WelcomeScreen 欢迎页组件
 * 在无对话或新建对话时显示的欢迎界面
 * 
 * 功能：
 * - 展示品牌 Logo（带脉冲发光动画）
 * - 显示品牌标语
 * - 提供快捷建议卡片（点击可快速发起对应话题）
 */

import React from 'react';
import styles from './WelcomeScreen.module.css';
import type { SuggestionCard } from '../../types/chat';

/* ==========================================
   默认快捷建议数据（设计稿中的 4 个入口）
   ========================================== */
const defaultSuggestions: SuggestionCard[] = [
  {
    icon: '\uD83D\uDCA1', // 💡 灯泡
    title: '解释一个概念',
    description: '用通俗易懂的语言解释复杂概念',
    prompt: '解释一个概念',
  },
  {
    icon: '\uD83D\uDD27', // 🔧 扳手
    title: '帮我写代码',
    description: '生成、调试、优化各种编程语言代码',
    prompt: '帮我写代码',
  },
  {
    icon: '\uD83D\uDCDD', // 📝 备忘录
    title: '帮我写文案',
    description: '撰写邮件、文章、营销文案等',
    prompt: '帮我写文案',
  },
  {
    icon: '\uD83D\uDD0D', // 🔍 放大镜
    title: '搜索信息',
    description: '帮你查找和整理各类信息资料',
    prompt: '搜索信息',
  },
];

/* ==========================================
   组件 Props 类型定义
   ========================================== */
interface WelcomeScreenProps {
  /** 自定义快捷建议列表（可选，不传则使用默认值） */
  suggestions?: SuggestionCard[];
  /** 点击建议卡片时的回调 */
  onSuggestionClick?: (prompt: string) => void;
}

/**
 * WelcomeScreen 欢迎页组件
 * @param props - 组件属性
 * @returns JSX 欢迎页元素
 */
const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  suggestions = defaultSuggestions,
  onSuggestionClick,
}) => {
  /**
   * 处理建议卡片点击事件
   * 将卡片的提示文本传递给父组件（填入输入框）
   * @param suggestion - 被点击的建议卡片数据
   */
  const handleCardClick = (suggestion: SuggestionCard) => {
    if (onSuggestionClick) {
      onSuggestionClick(suggestion.prompt);
    }
  };

  return (
    <div className={styles.welcomeScreen}>
      {/* ===== 1. 品牌 Logo（大号 + 发光动画）===== */}
      <div className={styles.welcomeLogo} title="Nova">
        <svg
          className={styles.welcomeLogoSvg}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* 星星图标 */}
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>

      {/* ===== 2. 品牌标题（渐变文字）===== */}
      <h1 className={styles.welcomeTitle}>你好，我是 Nova ✨</h1>

      {/* ===== 3. 副标题/引导文字 ===== */}
      <p className={styles.welcomeSubtitle}>
        我可以搜索、记忆、语音对话，还能调用工具帮你干活。
      </p>
      <p className={styles.welcomeSubtitle}>
        有什么我能帮你的？
      </p>

      {/* ===== 4. 快捷建议卡片网格（3列布局）===== */}
      <div className={styles.welcomeCards}>
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            className={styles.welcomeCard}
            onClick={() => handleCardClick(suggestion)}
            title={suggestion.description}
          >
            {/* 卡片图标 emoji */}
            <div className={styles.welcomeCardIcon}>{suggestion.icon}</div>
            {/* 卡片标题 */}
            <div className={styles.welcomeCardTitle}>{suggestion.title}</div>
            {/* 卡片描述 */}
            <div className={styles.welcomeCardDesc}>{suggestion.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default WelcomeScreen;
