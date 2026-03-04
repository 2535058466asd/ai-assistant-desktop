import React, { useState, useEffect, useRef } from 'react';
import Chat from './components/Chat';
import { ToastProvider } from './components/Toast';
import { getOrchestrator } from './core/orchestrator';
import type { Message } from './types';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const orchestratorRef = useRef(getOrchestrator());

  useEffect(() => {
    const orchestrator = orchestratorRef.current;
    
    // 设置消息回调
    orchestrator.onMessage((message) => {
      setMessages(prev => [...prev, message]);
    });

    // 加载历史消息
    const history = orchestrator.getHistory();
    if (history.length > 0) {
      setMessages(history);
    } else {
      // 发送欢迎消息
      const welcomeMessage: Message = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'assistant',
        content: orchestrator.getWelcomeMessage(),
        timestamp: Date.now(),
        sessionId: 'welcome'
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;
    
    const orchestrator = orchestratorRef.current;
    await orchestrator.processTextInput(content);
  };

  return (
    <ToastProvider>
      <div className="app-minimal">
        <Chat 
          messages={messages}
          onSendMessage={handleSendMessage}
        />
      </div>
    </ToastProvider>
  );
}

export default App;
