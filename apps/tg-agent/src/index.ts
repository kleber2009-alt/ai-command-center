import { startAdminServer, type AdminHandle } from './admin/server.js';
import { createBot } from './bot.js';
import { createClassifier } from './classifier.js';
import { loadConfig } from './config.js';
import { createChatService } from './db/chats.js';
import { openDb } from './db/index.js';
import { createLeadService } from './db/leads.js';
import { createMessageStore } from './db/messages.js';
import { loadKnowledgeBase } from './knowledge/index.js';
import { createLogger } from './logger.js';
import { createNotifier } from './notifier.js';
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

  const { bot, attachNotifier } = createBot({
    config,
    logger,
    classifier,
    responder,
    chats,
    leads,
    messages,
  });

  const notifier = createNotifier(bot, config.ownerTelegramId, logger);
  attachNotifier(notifier);

  let admin: AdminHandle | null = null;
  if (config.adminPassword) {
    admin = startAdminServer({
      chats,
      leads,
      messages,
      logger,
      port: config.adminPort,
      username: config.adminUsername,
      password: config.adminPassword,
    });
  } else {
    logger.warn('ADMIN_PASSWORD not set — admin UI disabled');
  }

  const shutdown = async (signal: string) => {
    logger.info('shutdown requested', { signal });
    try {
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
