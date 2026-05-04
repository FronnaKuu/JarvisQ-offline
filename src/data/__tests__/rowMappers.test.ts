import { describe, it, expect } from 'vitest';
import {
  rowToConversation,
  rowToMessage,
  type ConversationRow,
  type MessageRow,
} from '../rowMappers';

const baseConversationRow: ConversationRow = {
  id: 'c1',
  title: 'Test',
  created_at: 1700000000000,
  last_updated_at: 1700000060000,
  system_prompt: 'You are helpful.',
  max_context_turns: 10,
  temperature: 0.7,
  tts_speed: 1.0,
  max_response_tokens: 256,
  mode: 'conversation',
  source_lang: null,
  target_lang: null,
};

describe('rowToConversation', () => {
  it('maps every column and preserves the conversation mode', () => {
    const conv = rowToConversation(baseConversationRow);
    expect(conv).toEqual({
      id: 'c1',
      title: 'Test',
      mode: 'conversation',
      createdAt: 1700000000000,
      lastUpdatedAt: 1700000060000,
      systemPrompt: 'You are helpful.',
      maxContextTurns: 10,
      temperature: 0.7,
      ttsSpeed: 1.0,
      maxResponseTokens: 256,
      sourceLang: null,
      targetLang: null,
    });
  });

  it('keeps the translation mode when set in the row', () => {
    const conv = rowToConversation({
      ...baseConversationRow,
      mode: 'translation',
      source_lang: 'it',
      target_lang: 'en',
    });
    expect(conv.mode).toBe('translation');
    expect(conv.sourceLang).toBe('it');
    expect(conv.targetLang).toBe('en');
  });

  it('treats NULL mode as conversation (legacy schema)', () => {
    const conv = rowToConversation({ ...baseConversationRow, mode: null });
    expect(conv.mode).toBe('conversation');
  });

  it('treats unrecognized mode strings as conversation', () => {
    const conv = rowToConversation({
      ...baseConversationRow,
      mode: 'something-else',
    });
    expect(conv.mode).toBe('conversation');
  });
});

describe('rowToMessage', () => {
  const baseRow: MessageRow = {
    id: 'm1',
    conversation_id: 'c1',
    role: 'user',
    text: 'hello',
    timestamp_ms: 1700000000000,
    is_streaming: 0,
  };

  it('maps each column and converts is_streaming to a boolean', () => {
    expect(rowToMessage(baseRow)).toEqual({
      id: 'm1',
      conversationId: 'c1',
      role: 'user',
      text: 'hello',
      timestampMs: 1700000000000,
      isStreaming: false,
    });
  });

  it('reads is_streaming = 1 as true', () => {
    const msg = rowToMessage({ ...baseRow, is_streaming: 1 });
    expect(msg.isStreaming).toBe(true);
  });

  it('preserves the assistant role', () => {
    const msg = rowToMessage({ ...baseRow, role: 'assistant', text: 'hi' });
    expect(msg.role).toBe('assistant');
    expect(msg.text).toBe('hi');
  });
});
