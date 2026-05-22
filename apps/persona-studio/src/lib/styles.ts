export type AvatarStyle = {
  slug: string;
  label: string;
  description: string;
  /**
   * Описание ИЗМЕНЯЕМОГО (wardrobe + setting + lighting) — не «portrait of X».
   * Промпт-сборщик подставляет это после «NEW SETTING:» в edit-mode шаблоне,
   * чтобы модель меняла окружение, а не лицо. См. buildAvatarPrompt в prompts.ts.
   */
  promptStyle: string;
  /**
   * Если true — пропустить блок COMPOSITION REQUIREMENTS (half-body, hands, micro-pose).
   * Нужен для стилей, где композиция стиля сама диктует rigid frontal pose
   * (editorial-fashion, instagram-educator с centered composition).
   */
  allowRigidPose?: boolean;
};

export const AVATAR_STYLES: AvatarStyle[] = [
  {
    slug: 'luxury-founder',
    label: 'Luxury Founder',
    description: 'Тёмный кабинет, тёплый свет, премиум-костюм.',
    promptStyle:
      'wearing a premium tailored navy or charcoal suit with crisp white shirt, ' +
      'sitting in a dark mahogany luxury office, warm tungsten and amber rim lighting, ' +
      'blurred leather-bound bookshelves behind, leather chair, shallow depth of field, ' +
      'magazine editorial composition.',
  },
  {
    slug: 'podcast-studio',
    label: 'Podcast Studio',
    description: 'Микрофон в кадре, янтарные блики, ambient creator studio.',
    promptStyle:
      'wearing a stylish smart-casual outfit (knit sweater or unbuttoned shirt over a tee), ' +
      'seated in a content-creator podcast studio, large professional microphone clearly visible in the foreground, ' +
      'warm amber accent lighting with soft neon panels in the background, ' +
      'blurred soundproofing foam wall behind, atmospheric depth of field.',
  },
  {
    slug: 'cinematic-creator',
    label: 'Cinematic Creator',
    description: 'Film grain, teal & orange palette, широкий cinema lens.',
    promptStyle:
      'wearing a dark casual outfit, in a moody cinematic scene with teal-and-orange color grading, ' +
      'subtle film grain texture, anamorphic 35mm lens flares, dramatic side key light from a window, ' +
      'shallow depth of field, movie-still aesthetic with atmospheric haze.',
  },
  {
    slug: 'instagram-educator',
    label: 'Instagram Educator',
    description: 'Чистый светлый фон, мягкий дневной свет, Reels-ready.',
    promptStyle:
      'wearing a clean modern casual outfit (light shirt or simple tee), ' +
      'against a minimal bright off-white or pastel studio background, ' +
      'soft natural daylight, approachable friendly expression, ' +
      'centered composition with negative space for headline overlay, Reels-ready cover composition.',
    allowRigidPose: true,
  },
  {
    slug: 'tech-entrepreneur',
    label: 'Tech Entrepreneur',
    description: 'LED panel backdrop, cyan accents, demo-day energy.',
    promptStyle:
      'wearing a modern minimal outfit (dark zip hoodie or unstructured blazer over a tee), ' +
      'standing or seated in a modern tech office, large LED panel backdrop with subtle cyan accent lighting, ' +
      'clean architectural lines, Y Combinator demo-day style, sharp confident composition.',
  },
  {
    slug: 'viral-reels-cover',
    label: 'Viral Reels Cover',
    description: 'Magenta pop, hi-contrast, hook-ready key frame.',
    promptStyle:
      'wearing a bold contemporary outfit, against a vivid magenta and hot-pink lit background, ' +
      'high contrast theatrical lighting, dynamic expressive pose and slight surprise expression, ' +
      'hook-ready key-frame composition with negative space on one side for a big headline.',
  },
  {
    slug: 'editorial-fashion',
    label: 'Editorial Fashion',
    description: 'Vogue monochrome editorial, fashion magazine spread.',
    promptStyle:
      'wearing a designer high-fashion outfit (sharp black or monochrome silhouette), ' +
      'in a monochrome Vogue-style editorial setting, dramatic studio key light with deep shadows, ' +
      'minimal seamless background, confident editorial pose, fashion magazine spread aesthetic.',
    allowRigidPose: true,
  },
  {
    slug: 'dark-premium',
    label: 'Dark Premium',
    description: 'Noir, золотой rim, chiaroscuro lighting.',
    promptStyle:
      'wearing a luxury black turtleneck or dark blazer, ' +
      'against a near-black backdrop with a single golden rim light from one side, ' +
      'chiaroscuro Rembrandt lighting, mysterious confident expression, ' +
      'luxury accent details (subtle gold watch or chain), film-noir mood.',
  },
  {
    slug: 'ai-visionary',
    label: 'AI Visionary',
    description: 'Lime-neon glow, futurist studio, sci-fi cover.',
    promptStyle:
      'wearing a modern dark structured jacket, ' +
      'in a futurist studio setting with subtle lime-green neon glow and faint holographic UI overlays behind, ' +
      'sci-fi atmospheric lighting, confident forward-looking expression, premium product-launch composition.',
  },
  {
    slug: 'minimal-apple-style',
    label: 'Minimal Apple Style',
    description: 'White studio, soft shadow, product-keynote crispness.',
    promptStyle:
      'wearing a minimal modern outfit (charcoal merino sweater or simple dark tee), ' +
      'against a pure off-white seamless studio backdrop with a single soft directional shadow, ' +
      'crisp Apple-keynote photography lighting, neutral confident expression, ultra clean composition.',
  },
];

export function styleBySlug(slug: string) {
  return AVATAR_STYLES.find((s) => s.slug === slug) ?? null;
}
