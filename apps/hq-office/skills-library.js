/* Библиотека скиллов офиса — скиллы, которые реально установлены у команды и хранятся в
   приватном репозитории kleber2009-alt/aicex-library (снимок архива от 28 октября 2026).
   На сайт идут только названия; файлы скиллов закрыты. extra — свои скиллы, которых ещё нет
   в досье агентов (agent-content.js). Обновить: README.md → «Библиотека скиллов». */
window.OFFICE_SKILLS_LIBRARY = {
  updated:'2026-10-28', repo:'aicex-library',
  // skills/claude-code — 76
  code:[
    'big-type-stack', 'broll-stacked-text-edit', 'bs-creatormotion-cards-action-checklist', 'bs-creatormotion-type-title-takeover', 'bs-grokbot-avatar',
    'business-short-form-reels', 'cinematic-type-reel', 'clone-versus-reel', 'coaching-call-clips', 'copper-landing',
    'copper-slides-pdf', 'creator-setup', 'cutout-backdrop-reel', 'cutout-grid-reel', 'depth-ui-reel',
    'dual-role-dialogue', 'ear-to-ear-captions', 'edit-review', 'editing-styles', 'educational-youtube-editor',
    'explainer-panel-reel', 'figma', 'fitted-stacked-captions', 'glass-explainer-reel', 'heroui-site',
    'hyperframes', 'hyperframes-animation', 'hyperframes-audio', 'hyperframes-cli', 'hyperframes-core',
    'hyperframes-creative', 'hyperframes-keyframes', 'hyperframes-registry', 'hyperframes-studio', 'if-then-grid-reel',
    'image-cluster-reel', 'karusel', 'lesson-doc-builder', 'media-use', 'montazh-rils',
    'montazh-rils-arena', 'montazh-rils-aura', 'montazh-rils-gloss', 'montazh-rils-hud', 'montazh-rils-kobalt',
    'montazh-rils-scheme', 'montazh-rils-uimotion', 'montazh-rils-vibecode', 'natural-story-reel', 'origin-story-reel',
    'personal-broll-library', 'personal-short-form-reels', 'pro-web-design', 'promo-pulse', 'ranking-format',
    'rapid-list', 'reels-herk', 'remotion-to-hyperframes', 'screen-camera-tutorial', 'scroll-craft',
    'slideshow', 'soft-teacher', 'split-reel', 'split-screen-document-plus-animations', 'sprint-landing',
    'sprint-slides', 'this-versus-that-format', 'tiktok-style-edit', 'tips-breakdown-youtube', 'top-five-ranking',
    'video-to-written-content', 'visual-essay-reel', 'vlog-editor', 'watch', 'yap-and-show',
    'youtube-clips',
  ],
  // skills/claude-desktop — 34
  desktop:[
    'brand-guidelines', 'canvas-design', 'consolidate-memory', 'deep-research', 'direct-ai-weekly-review',
    'direct-materials-catalog', 'docs', 'explain-usage', 'google-workspace', 'ilia-carousel-style',
    'import-memory', 'landing-emerald', 'landing-gold', 'landing-light', 'landing-neon',
    'landing-poster', 'lead-magnet', 'mcp-builder', 'montazh-dlinnogo-video-youtube', 'morning',
    'niche-outlier-research', 'reels-herk', 'reels-neon-schema', 'reels-promo-face', 'reels-promo-story',
    'reels-script', 'reels-ui-motion', 'setup-claude', 'setup-cowork', 'skill-creator',
    'slack-gif-creator', 'theme-factory', 'threads-telegram-funnel', 'web-artifacts-builder',
  ],
  extra:[
    { name:'ilia-carousel-style', title:'Ремикс каруселей', agents:['carousel'],
      desc:'Берёт уже вышедшие слайды @ilia.paliy, сохраняет картинки, скриншоты и стиль, меняет обложку, хук, порядок и призыв.' },
    { name:'threads-telegram-funnel', title:'Трафик Threads → Telegram', agents:['funnels', 'publish', 'scripts'],
      desc:'Ветки-инструменты, хуки, переходы в канал, план публикаций и переупаковка победителей — механика разобранного аккаунта на 143K.' },
    { name:'direct-ai-weekly-review', title:'Разбор ИИ-менеджера в Директе', agents:['chats', 'consult'],
      desc:'Раз в неделю разбирает переписки ИИ-менеджера в Instagram Direct и воронки кодовых слов, готовит отчёт с правками.' },
    { name:'direct-materials-catalog', title:'Каталог бесплатных материалов', agents:['consult', 'chats'],
      desc:'Пересканирует Telegram-канал и обновляет каталог материалов и правила, по которым ИИ в Директе выдаёт подарки.' },
  ],
};
