import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { openDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { createContactService } from './db/contacts.js';
import { createConversationService } from './db/conversations.js';
import { createMessageStore } from './db/messages.js';
import { createRecommendationStore } from './db/recommendations.js';
import { createPromptStore } from './db/prompts.js';
import { createSettingsService } from './db/settings.js';
import { createSendPulseClient } from './sendpulse/client.js';
import { createResponder } from './responder.js';
import { createAnalyst } from './analyst.js';
import { createNotifier } from './notifier.js';
import { createPipeline } from './pipeline.js';
import { startAdminServer } from './admin/server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info('ig-agent boot', {
    model: config.responderModel,
    adminPort: config.adminPort,
  });

  const pool = openDb({ connectionString: config.databaseUrl, logger });
  await runMigrations(pool);

  const contacts = createContactService(pool);
  const conversations = createConversationService(pool);
  const messages = createMessageStore(pool);
  const recommendations = createRecommendationStore(pool);
  const prompts = createPromptStore(pool);
  const settings = createSettingsService(pool);

  const sendPulse = createSendPulseClient({
    clientId: config.sendPulseClientId,
    clientSecret: config.sendPulseClientSecret,
    logger,
  });

  const notifier = createNotifier({
    botToken: config.telegramBotToken,
    ownerTelegramId: config.ownerTelegramId,
    logger,
  });

  const responder = createResponder({
    apiKey: config.anthropicApiKey,
    model: config.responderModel,
    prompts,
    logger,
  });

  const analyst = createAnalyst({
    apiKey: config.anthropicApiKey,
    model: config.analystModel,
    logger,
    contacts,
    messages,
    recommendations,
  });

  const pipeline = createPipeline({
    contacts,
    conversations,
    messages,
    settings,
    responder,
    analyst,
    sendPulse,
    notifier,
    logger,
    ignoredContactIds: config.ignoredContactIds,
    ownerTelegramId: config.ownerTelegramId,
  });

  const admin = startAdminServer({
    config,
    logger,
    contacts,
    conversations,
    messages,
    recommendations,
    prompts,
    settings,
    pipeline,
    analyst,
    sendPulse,
    notifier,
  });

  // Best-effort startup ping so the owner knows the bot is up and where
  // to grab a magic link.
  await notifier.send(
    `✅ ig-agent online. Кабинет: ${config.adminPublicUrl ?? `http://localhost:${config.adminPort}`}`,
    { silent: true },
  );

  const shutdown = async (sig: string) => {
    logger.info('shutdown signal', { sig });
    try {
      await admin.close();
    } catch (err) {
      logger.warn('admin close failed', { err: err instanceof Error ? err.message : String(err) });
    }
    try {
      await pool.end();
    } catch (err) {
      logger.warn('pg pool close failed', { err: err instanceof Error ? err.message : String(err) });
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('ig-agent fatal', err);
  process.exit(1);
});
