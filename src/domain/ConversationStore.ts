// ─── Conversation Store (Zustand) ────────────────────────────────────────────

import { create } from 'zustand';
import type { Conversation, Message } from './types';
import {
  getAllConversations,
  insertConversation,
  updateConversation,
  deleteConversation,
  makeNewConversation,
} from '@data/repositories/ConversationRepository';
import {
  getMessagesByConversation,
  insertMessage,
  updateMessageText,
  makeMessage,
} from '@data/repositories/MessageRepository';

interface ConversationStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoaded: boolean;

  loadConversations: () => Promise<void>;
  createConversation: () => Promise<Conversation>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (
    id: string,
    fields: Partial<Omit<Conversation, 'id' | 'createdAt'>>,
  ) => Promise<void>;

  addUserMessage: (text: string) => Promise<Message>;
  addAssistantMessage: () => Promise<Message>;
  appendAssistantToken: (messageId: string, token: string) => Promise<void>;
  finalizeAssistantMessage: (messageId: string, text: string) => Promise<void>;

  activeConversation: () => Conversation | null;
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoaded: false,

  loadConversations: async () => {
    const conversations = await getAllConversations();
    set({ conversations, isLoaded: true });
  },

  createConversation: async () => {
    const conv = makeNewConversation();
    await insertConversation(conv);
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: conv.id,
      messages: [],
    }));
    return conv;
  },

  selectConversation: async (id) => {
    const messages = await getMessagesByConversation(id);
    set({ activeConversationId: id, messages });
  },

  deleteConversation: async (id) => {
    await deleteConversation(id);
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      const activeConversationId =
        s.activeConversationId === id
          ? (conversations[0]?.id ?? null)
          : s.activeConversationId;
      return { conversations, activeConversationId };
    });
  },

  updateConversation: async (id, fields) => {
    await updateConversation(id, fields);
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, ...fields } : c,
      ),
    }));
  },

  addUserMessage: async (text) => {
    const { activeConversationId } = get();
    if (!activeConversationId) throw new Error('No active conversation');
    const msg = makeMessage(activeConversationId, 'user', text, false);
    await insertMessage(msg);
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },

  addAssistantMessage: async () => {
    const { activeConversationId } = get();
    if (!activeConversationId) throw new Error('No active conversation');
    const msg = makeMessage(activeConversationId, 'assistant', '', true);
    await insertMessage(msg);
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },

  appendAssistantToken: async (messageId, token) => {
    set((s) => {
      const messages = s.messages.map((m) =>
        m.id === messageId ? { ...m, text: m.text + token } : m,
      );
      return { messages };
    });
    // Persist asynchronously without blocking UI
    const { messages } = get();
    const msg = messages.find((m) => m.id === messageId);
    if (msg) {
      void updateMessageText(messageId, msg.text, true);
    }
  },

  finalizeAssistantMessage: async (messageId, text) => {
    await updateMessageText(messageId, text, false);
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, text, isStreaming: false } : m,
      ),
    }));
  },

  activeConversation: () => {
    const { conversations, activeConversationId } = get();
    return conversations.find((c) => c.id === activeConversationId) ?? null;
  },
}));
