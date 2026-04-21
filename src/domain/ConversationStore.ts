// ─── Conversation Store (Zustand) ────────────────────────────────────────────

import { create } from 'zustand';
import type { Conversation, ConversationMode, Message } from './types';
import {
  getAllConversations,
  insertConversation,
  updateConversation,
  deleteConversation,
  makeNewConversation,
  type NewConversationOptions,
} from '@data/repositories/ConversationRepository';
import {
  getMessagesByConversation,
  insertMessage,
  updateMessageText,
  makeMessage,
} from '@data/repositories/MessageRepository';

// Throttle SQL persistence during streaming: an LLM generating 40–60 tok/s
// would otherwise fire one UPDATE per token over JSI, saturating the JS
// thread and stalling subsequent token callbacks coming back from
// llama.cpp. In-memory state is still updated on every token so the UI
// streams smoothly; the row on disk just catches up in batches. The final
// text is always persisted by finalizeAssistantMessage().
const STREAMING_FLUSH_INTERVAL_MS = 400;

interface ConversationStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoaded: boolean;

  loadConversations: () => Promise<void>;
  createConversation: (
    mode?: ConversationMode,
    opts?: NewConversationOptions,
  ) => Promise<Conversation>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (
    id: string,
    fields: Partial<Omit<Conversation, 'id' | 'createdAt'>>,
  ) => Promise<void>;

  addUserMessage: (text: string) => Promise<Message>;
  addAssistantMessage: () => Promise<Message>;
  /** Synchronous so the LLM token callback does not create a microtask
   *  chain per token. SQL persistence is throttled and fire-and-forget. */
  appendAssistantToken: (messageId: string, token: string) => void;
  finalizeAssistantMessage: (messageId: string, text: string) => Promise<void>;

  activeConversation: () => Conversation | null;
}

const streamingFlushAt = new Map<string, number>();

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoaded: false,

  loadConversations: async () => {
    const conversations = await getAllConversations();
    set({ conversations, isLoaded: true });
  },

  createConversation: async (mode = 'conversation', opts = {}) => {
    const conv = makeNewConversation(mode, opts);
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

  appendAssistantToken: (messageId, token) => {
    let nextText = '';
    set((s) => {
      const messages = s.messages.map((m) => {
        if (m.id !== messageId) return m;
        nextText = m.text + token;
        return { ...m, text: nextText };
      });
      return { messages };
    });

    const now = Date.now();
    const lastAt = streamingFlushAt.get(messageId) ?? 0;
    if (now - lastAt >= STREAMING_FLUSH_INTERVAL_MS) {
      streamingFlushAt.set(messageId, now);
      void updateMessageText(messageId, nextText, true);
    }
  },

  finalizeAssistantMessage: async (messageId, text) => {
    streamingFlushAt.delete(messageId);
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
