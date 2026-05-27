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
import { createDigestStore } from './db/digests.js';
import { createDigestGenerator } from './digest.js';
import { startDigestScheduler } from './scheduler.js';

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
  const digests = createDigestStore(pool);

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

  const digestGenerator = createDigestGenerator({
    apiKey: config.anthropicApiKey,
    model: config.digestModel,
  });

  const digestScheduler = startDigestScheduler({
    store: digests,
    generator: digestGenerator,
    notifier,
    logger,
    dailyHourUtc: config.digestDailyHourUtc,
    windowHours: config.digestWindowHours,
  });

  const admin = startAdminServer({
    config,
    logger,
    pool,
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
    digests,
    digestScheduler,
  });

  // Best-effort startup ping so the owner knows the bot is up and where
  // to grab a magic link.
  await notifier.send(
    `✅ ig-agent online. Кабинет: ${config.adminPublicUrl ?? `http://localhost:${config.adminPort}`}`,
    { silent: true },
  );

  const shutdown = async (sig: string) => {
    logger.info('shutdown signal', { sig });
    // Owner-facing alert: any unexpected SIGTERM means the IG inbox is going
    // dark — SendPulse webhooks will start failing within seconds. Best-effort,
    // short timeout: we can't block shutdown if Telegram is slow.
    try {
      await Promise.race([
        notifier.send(`🚨 ig-agent останавливается (signal: ${sig}). Если не я — кто-то снял контейнер.`),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (err) {
      logger.warn('shutdown notify failed', { err: err instanceof Error ? err.message : String(err) });
    }
    try {
      digestScheduler.stop();
    } catch (err) {
      logger.warn('digest scheduler stop failed', { err: err instanceof Error ? err.message : String(err) });
    }
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
