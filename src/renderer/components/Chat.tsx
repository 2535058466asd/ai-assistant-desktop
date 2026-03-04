import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Message as MessageType } from '../types';

interface ChatProps {
  messages: MessageType[];
  onSendMessage: (content: string) => Promise<void>;
}

const Chat: React.FC<ChatProps> = ({ messages, onSendMessage }) => {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const handleSendMessage = async () => {
    if (inputText.trim() === '' || isLoading) return;

    setIsLoading(true);
    
    try {
      await onSendMessage(inputText);
      setInputText('');
    } catch (error) {
      console.error('发送消息失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const messageVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <div className="chat-container-minimal">
      <div className="chat-header-minimal">
        <div className="chat-header-left">
          <div className="assistant-avatar">🌟</div>
          <span className="assistant-name">启源 AI</span>
        </div>
      </div>
      
      <div className="messages-minimal">
        {messages.map(message => (
          <motion.div 
            key={message.id} 
            className={`message ${message.role}`}
            initial="initial"
            animate="animate"
            variants={messageVariants}
          >
            <div className="message-text">
              {message.content}
            </div>
            <div className="message-time">{formatTime(message.timestamp)}</div>
          </motion.div>
        ))}
        
        {isLoading && (
          <motion.div 
            className="message ai loading"
            initial="initial"
            animate="animate"
            variants={messageVariants}
          >
            <div className="loading-animation">
              <div className="loading-dot">●</div>
              <div className="loading-dot">●</div>
              <div className="loading-dot">●</div>
            </div>
            <div className="message-text">启源正在思考...</div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="input-area-minimal">
        <div className="input-main">
          <textarea 
            ref={inputRef}
            className="message-input" 
            placeholder="和启源聊聊天吧～"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isLoading}
          />
          <button 
            className="send-button" 
            onClick={handleSendMessage}
            disabled={isLoading}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
