// Telegram channel autoposting via Bot API.
//
// Reuses the bot client (botCall) and TELEGRAM_BOT_TOKEN from telegram-tma.ts
// — the same bot used for Stars invoices. To post into a channel the bot must
// be an administrator of that channel.
//
// chatId accepts a numeric id (-100…) or a public @channelusername.

import { botCall, TelegramError } from '@/lib/telegram-tma';

export type TgChat = {
  id: number;
  title?: string;
  username?: string;
  type: string; // 'channel' | 'group' | 'supergroup' | 'private'
};

/** getChat — used at connect time to resolve title + validate the chat exists. */
export async function getChat(chatId: string): Promise<TgChat> {
  return botCall<TgChat>('getChat', { chat_id: chatId });
}

// Bot @username — resolved once via getMe and cached. Used in connect hints /
// error messages so the user knows exactly which bot to add to the channel.
let _botUsername: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  if (_botUsername) return _botUsername;
  try {
    const me = await botCall<{ username?: string }>('getMe', {});
    _botUsername = me.username ?? null;
  } catch {
    _botUsername = null;
  }
  return _botUsername;
}

/**
 * Verify the bot itself is an administrator of the channel. Throws a
 * TelegramError otherwise so connect/publish surface a readable reason.
 */
export async function assertBotIsAdmin(chatId: string): Promise<void> {
  const me = await botCall<{ id: number }>('getMe', {});
  const member = await botCall<{ status: string }>('getChatMember', {
    chat_id: chatId,
    user_id: me.id,
  });
  if (member.status !== 'administrator' && member.status !== 'creator') {
    throw new TelegramError(
      'BOT_NOT_ADMIN',
      'Бот не является администратором канала — добавьте его с правом публикации',
    );
  }
}

/**
 * Send a video to the channel. Telegram pulls the file by URL (must be
 * publicly reachable). Returns { messageId, permalink }.
 */
export async function sendChannelVideo(opts: {
  chatId: string;
  videoUrl: string;
  caption?: string;
}): Promise<{ messageId: number; permalink: string | null }> {
  const msg = await botCall<{
    message_id: number;
    chat: { id: number; username?: string };
  }>('sendVideo', {
    chat_id: opts.chatId,
    video: opts.videoUrl,
    caption: opts.caption ? opts.caption.slice(0, 1024) : undefined,
    supports_streaming: true,
  });

  // Public channels expose t.me/<username>/<message_id>; private ones don't.
  const permalink = msg.chat.username
    ? `https://t.me/${msg.chat.username}/${msg.message_id}`
    : null;
  return { messageId: msg.message_id, permalink };
}
