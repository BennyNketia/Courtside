export interface TextSegment {
  kind: 'text';
  text: string;
}

export interface ToolSegment {
  kind: 'tool';
  toolCallId: string;
  tool: string;
  state: 'pending' | 'done' | 'failed';
  latencyMs?: number;
}

export type MessageSegment = TextSegment | ToolSegment;

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  segments: MessageSegment[];
  streaming: boolean;
}

export type Message = UserMessage | AssistantMessage;
