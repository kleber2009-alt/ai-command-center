import type { Db } from './index.js';
import type { Logger } from '../logger.js';

export interface ChatState {
  chatId: number;
  title: string | undefined;
  autoReply: boolean;
}

export interface ChatService {
  // Upserts the chat row and returns the current state. Bot decisions
  // (auto_reply on/off) come from the DB. In stateless mode returns a
  // default "auto_reply on" state.
  touch(chatId: number, title: string | undefined): Promise<ChatState>;
}

const DEFAULT: ChatState = { chatId: 0, title: undefined, autoReply: true };

export function createChatService(db: Db, logger: Logger): ChatService {
  return {
    async touch(chatId, title): Promise<ChatState> {
      if (!db) return { ...DEFAULT, chatId, title };

      const { data, error } = await db
        .from('tg_chats')
        .upsert(
          { chat_id: chatId, title: title ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'chat_id', ignoreDuplicates: false },
        )
        .select('chat_id, title, auto_reply')
        .single();

      if (error || !data) {
        logger.error('chat upsert failed', { chatId, error: error?.message });
        return { ...DEFAULT, chatId, title };
      }

      return {
        chatId: Number(data.chat_id),
        title: data.title ?? undefined,
        autoReply: Boolean(data.auto_reply),
      };
    },
  };
}
