// Delivers a rendered carousel to Telegram for manual publishing: the slides as
// a media group, then the caption as a separate (easy-to-copy) text message.
// Reads TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from the environment.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { log } from '../lib/logger.js';

const API = 'https://api.telegram.org';
const MEDIA_GROUP_MAX = 10; // Telegram limit (also Instagram's carousel max)

interface TelegramConfig {
  token: string;
  chatId: string;
}

function getConfig(): TelegramConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set for delivery');
  }
  return { token, chatId };
}

export interface MediaGroupItem {
  type: 'photo';
  media: string;
}

// Pure: maps attachment field names to InputMediaPhoto entries.
export function buildMediaGroup(fieldNames: string[]): MediaGroupItem[] {
  return fieldNames.map((name) => ({ type: 'photo', media: `attach://${name}` }));
}

async function callTelegram(token: string, method: string, body: FormData | object): Promise<void> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: 'POST', body }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };

  const res = await fetch(`${API}/bot${token}/${method}`, init);
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? res.statusText}`);
  }
}

export interface DeliverOptions {
  slidePaths: string[];
  caption?: string;
}

export async function deliverToTelegram(opts: DeliverOptions): Promise<void> {
  const { token, chatId } = getConfig();
  const slides = opts.slidePaths.slice(0, MEDIA_GROUP_MAX);
  if (opts.slidePaths.length > MEDIA_GROUP_MAX) {
    log.warn(`Carousel has ${opts.slidePaths.length} slides; only first ${MEDIA_GROUP_MAX} sent`);
  }

  const form = new FormData();
  form.append('chat_id', chatId);
  const fieldNames: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const field = `photo-${i}`;
    fieldNames.push(field);
    const data = await readFile(slides[i]!);
    form.append(field, new Blob([new Uint8Array(data)], { type: 'image/png' }), basename(slides[i]!));
  }
  form.append('media', JSON.stringify(buildMediaGroup(fieldNames)));

  await callTelegram(token, 'sendMediaGroup', form);

  // Caption as its own message so it can be copied verbatim when publishing.
  if (opts.caption) {
    await callTelegram(token, 'sendMessage', {
      chat_id: chatId,
      text: opts.caption,
      disable_web_page_preview: true,
    });
  }

  log.info('Delivered carousel to Telegram', { slides: slides.length, chatId });
}

// ── Reels delivery ───────────────────────────────────────────────────────────

export interface DeliverReelsOptions {
  mode: 'fallback' | 'video';
  videoPath?: string;
  scriptMdPath: string;
  caption?: string;
  missingTags?: string[];
}

export async function deliverReelsToTelegram(opts: DeliverReelsOptions): Promise<void> {
  const { token, chatId } = getConfig();

  if (opts.mode === 'video' && opts.videoPath) {
    const form = new FormData();
    form.append('chat_id', chatId);
    const data = await readFile(opts.videoPath);
    form.append(
      'video',
      new Blob([new Uint8Array(data)], { type: 'video/mp4' }),
      basename(opts.videoPath),
    );
    if (opts.caption) form.append('caption', opts.caption.slice(0, 1024));
    form.append('supports_streaming', 'true');
    await callTelegram(token, 'sendVideo', form);
    log.info('Delivered reels video to Telegram', { videoPath: opts.videoPath, chatId });
    return;
  }

  // Fallback: deliver the Markdown script as a document + a banner explaining
  // why we're not sending a video yet.
  const banner =
    `🎬 *РИЛС · только сценарий*\n\n` +
    `Видео не собрано: библиотека клипов в \`data/assets/footage/\` пуста ` +
    (opts.missingTags && opts.missingTags.length > 0
      ? `для тегов: ${opts.missingTags.map((t) => `\`${t}\``).join(', ')}.`
      : 'для всех нужных тегов.') +
    `\n\nДоложи клипы — пайплайн сам соберёт MP4 в следующий раз.`;

  await callTelegram(token, 'sendMessage', {
    chat_id: chatId,
    text: banner,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });

  const form = new FormData();
  form.append('chat_id', chatId);
  const data = await readFile(opts.scriptMdPath);
  form.append(
    'document',
    new Blob([new Uint8Array(data)], { type: 'text/markdown' }),
    basename(opts.scriptMdPath),
  );
  await callTelegram(token, 'sendDocument', form);

  if (opts.caption) {
    await callTelegram(token, 'sendMessage', {
      chat_id: chatId,
      text: opts.caption,
      disable_web_page_preview: true,
    });
  }

  log.info('Delivered reels script to Telegram', { mode: 'fallback', chatId });
}
