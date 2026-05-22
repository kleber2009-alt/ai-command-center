import { Bot } from 'grammy';

import { startAdminServer, type AdminHandle } from './admin/server.js';
import { startBackupScheduler, type BackupHandle } from './backup.js';
import { createBot } from './bot.js';
import { createClassifier } from './classifier.js';
import { loadConfig } from './config.js';
import { createChatService } from './db/chats.js';
import { createDraftService } from './db/drafts.js';
import { openDb } from './db/index.js';
import { createDigestStore } from './db/digests.js';
import { createLeadService } from './db/leads.js';
import { createMessageStore } from './db/messages.js';
import { createStatsService } from './db/stats.js';
import { createHealthMonitor } from './health.js';
import {
  createDigestGenerator,
  startDigestScheduler,
  type DigestSchedulerHandle,
} from './digest.js';
import { loadKnowledgeBase } from './knowledge/index.js';
import { createLogger } from './logger.js';
import { createNotifier } from './notifier.js';
import { registerOwnerCommands } from './owner_commands.js';
import { createResponder } from './responder.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const classifier = createClassifier({
    apiKey: config.anthropicApiKey,
    model: config.classifierModel,
  });
  const responder = createResponder({
    apiKey: config.anthropicApiKey,
    model: config.responderModel,
  });

  const kb = loadKnowledgeBase();
  logger.info('knowledge base loaded', { bytes: kb.bytes });

  const db = openDb({ path: config.databasePath, logger });
  const chats = createChatService(db);
  const leads = createLeadService(db);
  const messages = createMessageStore(db);
  const drafts = createDraftService(db);
  const stats = createStatsService(db);
  const digestStore = createDigestStore(db);

  // Grammy bot lives separately from the createBot() wrapper so that
  // health + notifier can hold a reference before message handlers
  // are registered.
  const bot = new Bot(config.telegramBotToken);

  // Owner commands MUST register before createBot()'s generic
  // message:text handler so /pulse, /chats, /digest, /context win
  // over the catch-all owner-DM branch. Replies to draft edit
  // prompts (non-command DMs) still flow through to bot.ts.
  const digestGenerator = createDigestGenerator({
    apiKey: config.anthropicApiKey,
    model: config.digestModel,
  });
  if (config.digestEnabled && config.ownerTelegramId !== undefined) {
    registerOwnerCommands({
      bot,
      ownerTelegramId: config.ownerTelegramId,
      chats,
      store: digestStore,
      generator: digestGenerator,
      windowHours: config.digestWindowHours,
      logger,
    });
  } else if (!config.digestEnabled) {
    logger.info('digest disabled (DIGEST_ENABLED=false)');
  } else {
    logger.warn('digest disabled — OWNER_TELEGRAM_ID is not set');
  }

  const health = createHealthMonitor({
    bot,
    ownerTelegramId: config.ownerTelegramId,
    failureThreshold: config.healthFailureThreshold,
    alertCooldownMs: config.healthAlertCooldownMinutes * 60_000,
    logger,
  });

  const { attachNotifier } = createBot({
    bot,
    config,
    logger,
    classifier,
    responder,
    chats,
    leads,
    messages,
    drafts,
    health,
  });

  const notifier = createNotifier({
    bot,
    ownerTelegramId: config.ownerTelegramId,
    drafts,
    logger,
  });
  attachNotifier(notifier);

  let admin: AdminHandle | null = null;
  const sessionAuthReady =
    config.adminSessionSecret && config.ownerTelegramId !== undefined;
  if (config.adminPassword || sessionAuthReady) {
    admin = startAdminServer({
      chats,
      leads,
      messages,
      drafts,
      stats,
      health,
      logger,
      port: config.adminPort,
      username: config.adminUsername,
      password: config.adminPassword ?? '',
      sessionSecret: sessionAuthReady ? config.adminSessionSecret : undefined,
      ownerTelegramId: config.ownerTelegramId,
      publicUrl: config.adminPublicUrl,
      sendMagicLink: sessionAuthReady
        ? async (telegramId, url) => {
            await bot.api.sendMessage(
              telegramId,
              `Ссылка для входа в админку tg-agent (действует 10 минут):\n${url}`,
              { link_preview_options: { is_disabled: true } },
            );
          }
        : undefined,
    });
  } else {
    logger.warn('admin UI disabled — set ADMIN_PASSWORD or ADMIN_SESSION_SECRET');
  }

  let backup: BackupHandle | null = null;
  if (config.ownerTelegramId !== undefined) {
    backup = startBackupScheduler({
      db,
      bot,
      ownerTelegramId: config.ownerTelegramId,
      intervalHours: config.backupIntervalHours,
      logger,
    });
  } else if (config.backupIntervalHours > 0) {
    logger.warn(
      'backup disabled — OWNER_TELEGRAM_ID is not set, nowhere to send the file',
    );
  }

  let digest: DigestSchedulerHandle | null = null;
  if (config.digestEnabled && config.ownerTelegramId !== undefined) {
    digest = startDigestScheduler({
      bot,
      ownerTelegramId: config.ownerTelegramId,
      chats,
      store: digestStore,
      generator: digestGenerator,
      logger,
      dailyHourUtc: config.digestDailyHourUtc,
      windowHours: config.digestWindowHours,
    });
  }

  const shutdown = async (signal: string) => {
    logger.info('shutdown requested', { signal });
    try {
      backup?.stop();
      digest?.stop();
      await bot.stop();
      if (admin) await admin.close();
    } finally {
      db.close();
    }
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  logger.info('starting bot', {
    classifierModel: config.classifierModel,
    responderModel: config.responderModel,
    confidenceThreshold: config.confidenceThreshold,
    allowlistSize: config.allowedChatIds.size,
    ownerNotifications: config.ownerTelegramId !== undefined,
  });

  await bot.start({
    onStart: (info) => {
      logger.info('bot started', { username: info.username, id: info.id });
    },
  });
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'fatal startup error',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
