import { createBot } from './bot.js';
import { createClassifier } from './classifier.js';
import { loadConfig } from './config.js';
import { loadKnowledgeBase } from './knowledge/index.js';
import { createLogger } from './logger.js';
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

  const bot = createBot({ config, logger, classifier, responder });

  const shutdown = async (signal: string) => {
    logger.info('shutdown requested', { signal });
    await bot.stop();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  logger.info('starting bot', {
    classifierModel: config.classifierModel,
    responderModel: config.responderModel,
    confidenceThreshold: config.confidenceThreshold,
    allowlistSize: config.allowedChatIds.size,
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
