import type { AgentProcessEvent, Message, ToolProcessEvent } from '../../types';
import type { StreamCallbacks } from '../orchestrator';

export class AgentEventBridge {
  private messageCallback: ((message: Message) => void) | null = null;
  private streamCallbacks: StreamCallbacks | null = null;

  setMessageCallback(callback: ((message: Message) => void) | null): void {
    this.messageCallback = callback;
  }

  setStreamCallbacks(callbacks: StreamCallbacks | null): void {
    this.streamCallbacks = callbacks;
  }

  emitMessage(message: Message): void {
    this.messageCallback?.(message);
  }

  emitStreamStart(message: Message): void {
    if (this.streamCallbacks) {
      this.streamCallbacks.onStreamStart(message);
      return;
    }
    this.emitMessage(message);
  }

  emitStreamChunk(messageId: string, content: string): void {
    this.streamCallbacks?.onStreamChunk(messageId, content);
  }

  emitStreamEnd(messageId: string): void {
    this.streamCallbacks?.onStreamEnd(messageId);
  }

  emitToolEvent(messageId: string, event: ToolProcessEvent): void {
    this.streamCallbacks?.onToolEvent?.(messageId, event);
    this.streamCallbacks?.onProcessEvent?.(messageId, event);
  }

  emitProcessEvent(messageId: string, event: AgentProcessEvent): void {
    this.streamCallbacks?.onProcessEvent?.(messageId, event);
  }
}

