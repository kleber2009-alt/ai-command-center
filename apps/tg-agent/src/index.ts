import { Bot } from 'grammy';

import { startAdminServer, type AdminHandle } from './admin/server.js';
import { startBackupScheduler, type BackupHandle } from './backup.js';
import { createBot } from './bot.js';
import { createClassifier } from './classifier.js';
import { loadConfig } from './config.js';
import { createChatService } from './db/chats.js';
import { createDigestStore } from './db/digests.js';
import { createDraftService } from './db/drafts.js';
import { openDb } from './db/index.js';
import { createLeadService } from './db/leads.js';
import { createMessageStore } from './db/messages.js';
import { createStatsService } from './db/stats.js';
import { createBillingService } from './db/billing.js';
import { createDealService } from './db/deals.js';
import {
  createDigestGenerator,
  startDigestScheduler,
  type DigestSchedulerHandle,
} from './digest.js';
import { createKbManager } from './kb-manager.js';
import { createPromptConfig } from './prompt-config.js';
import { dirname, resolve } from 'node:path';
import { createHealthMonitor } from './health.js';
import { loadKnowledgeBase } from './knowledge/index.js';
import { createLogger } from './logger.js';
import { createNotifier } from './notifier.js';
import { registerOwnerCommands } from './owner_commands.js';
import { startReportScheduler, type ReporterHandle } from './reporter.js';
import { createResponder } from './responder.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const promptConfig = createPromptConfig(dirname(resolve(config.databasePath)));

  const classifier = createClassifier({
    apiKey: config.anthropicApiKey,
    model: config.classifierModel,
    promptConfig,
  });
  const responder = createResponder({
    apiKey: config.anthropicApiKey,
    model: config.responderModel,
    promptConfig,
  });

  const kb = loadKnowledgeBase();
  logger.info('knowledge base loaded', { bytes: kb.bytes });

  const db = openDb({ path: config.databasePath, logger });
  const chats = createChatService(db);
  const leads = createLeadService(db);
  const messages = createMessageStore(db);
  const drafts = createDraftService(db);
  const stats = createStatsService(db);
  const dealService = createDealService(db);
  const billingService = createBillingService(db);
  const kbManager = createKbManager(dirname(resolve(config.databasePath)));
  const digestStore = createDigestStore(db);

  // Grammy bot lives separately from the createBot() wrapper so that
  // health + notifier can hold a reference before message handlers
  // are registered.
  const bot = new Bot(config.telegramBotToken);

  // Owner DM commands MUST register BEFORE createBot() so /pulse,
  // /chats, /digest, /context win over the generic owner-DM branch
  // in bot.ts. Force-reply'd edit-prompt replies still flow through.
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
      kbManager,
      dealService,
      billingService,
      stripeWebhookSecret: config.stripeWebhookSecret,
      stripeBasicPriceId: config.stripeBasicPriceId,
      stripeProPriceId: config.stripeProPriceId,
      stripeEnterprisePriceId: config.stripeEnterprisePriceId,
      sendOwnerMessage: config.ownerTelegramId
        ? async (text: string) => { await bot.api.sendMessage(config.ownerTelegramId!, text); }
        : undefined,
      promptConfig,
      dataDir: dirname(resolve(config.databasePath)),
      digestStore,
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

  // Reporter writes the per-chat markdown files that back the
  // "Проекты" tab in admin. Distinct from the digest scheduler
  // (which is an AI summary DM'd to the owner): reporter is plain
  // SQL → markdown, no LLM calls.
  let reporter: ReporterHandle | null = null;
  if (config.reportEnabled) {
    reporter = startReportScheduler({
      db,
      chats,
      leads,
      deals: dealService,
      dataDir: dirname(resolve(config.databasePath)),
      logger,
      reportHourUtc: config.reportHourUtc,
    });
    if (config.reportRunOnStart) {
      reporter.runOnce().catch((err) => {
        logger.error('reporter: run-on-start failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  } else {
    logger.info('reporter disabled (REPORT_ENABLED=false)');
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
      reporter?.stop();
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
