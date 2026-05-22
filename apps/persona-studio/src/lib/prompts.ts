import type { AvatarStyle } from './styles';

/**
 * Identity-preserving avatar prompt for Nano Banana 2.
 *
 * Key technique (validated 2026-05-21):
 *   1) Frame as EDIT, not GENERATE — "re-photograph the same person" not "create a portrait".
 *   2) Repeat identity constraint 2× with explicit list of features to preserve.
 *   3) Style block describes SETTING only (wardrobe + background + lighting), never "portrait of X".
 *   4) Negative constraints: no different person, no idealization, no face swap.
 */
export function buildAvatarPrompt(style: AvatarStyle) {
  const composition = style.allowRigidPose
    ? null
    : [
        '',
        'COMPOSITION REQUIREMENTS (critical for downstream animation):',
        '- Hands MUST be visible in frame (resting, gesturing, or holding object).',
        '- Shoulders clearly defined, slight asymmetry preferred over rigid frontal pose.',
        '- Avoid arms-crossed, hands-in-pockets, or hands fully behind object.',
        '- Dynamic micro-pose: head slightly tilted, weight on one side, natural breathing posture.',
        '- Loose half-body framing with breathing room above the head and beside the shoulders, not a tight crop.',
      ].join('\n');

  const framing = style.allowRigidPose
    ? '- 3:4 portrait, social-media ready.'
    : '- 3:4 half-body portrait (waist-up, hands in frame), social-media ready.';

  return [
    'TASK: Re-photograph the EXACT same person shown in the input image in a new setting.',
    '',
    'CRITICAL IDENTITY RULE — read this first:',
    '- The output MUST clearly show the SAME individual as the input photo.',
    '- Preserve face shape, eye shape and color, nose shape, lip shape, eyebrow shape,',
    '  hairline, skin tone, ethnicity, apparent age, beard / stubble pattern, scars, moles,',
    '  and every distinguishing feature 100%.',
    '- Do NOT generate a different person who merely looks similar.',
    '- Do NOT idealize, beautify, age-shift, slim down, or substitute the face.',
    '- Treat the input as a reference portrait of the subject; the output must be',
    '  immediately recognizable as the same subject by someone who knows them.',
    '',
    `NEW SETTING — ${style.label}:`,
    style.promptStyle,
    composition,
    '',
    'OUTPUT REQUIREMENTS:',
    framing,
    '- Photorealistic, high-end editorial quality.',
    '- Sharp facial details, natural skin texture, no plastic look.',
    '- Single person only in the frame.',
    '- No text, no logos, no watermark.',
    '- Same person, new wardrobe and surroundings as described above.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/**
 * Carousel cover prompt — same identity-first technique applied to a viral cover.
 */
export function buildCoverPrompt(opts: {
  title: string;
  subtitle?: string | null;
  cta?: string | null;
  niche?: string | null;
  styleLabel: string;
  aspect: string;
}) {
  return [
    'TASK: Build a premium Instagram carousel cover featuring the EXACT same person shown in the input image as the hero on the cover.',
    '',
    'CRITICAL IDENTITY RULE:',
    '- The person on the cover MUST be the SAME individual as the input image.',
    '- Preserve face shape, eyes, nose, lips, eyebrows, hairline, skin tone, ethnicity,',
    '  apparent age, and all distinguishing features 100%.',
    '- Do NOT swap the face. Do NOT idealize. Do NOT generate a similar-looking different person.',
    '',
    'COVER CONTENT:',
    `- Main headline (large, readable, accurate spelling): ${opts.title}`,
    opts.subtitle ? `- Subtitle / supporting line: ${opts.subtitle}` : null,
    opts.cta ? `- CTA element: ${opts.cta}` : null,
    opts.niche ? `- Audience / niche: ${opts.niche}` : null,
    `- Style mood: ${opts.styleLabel}`,
    `- Aspect ratio: ${opts.aspect}`,
    '',
    'COMPOSITION:',
    '- Strong viral carousel composition with the person clearly visible.',
    '- Bold readable typography integrated with the design (no random or misspelled text).',
    '- Premium modern aesthetic, cinematic lighting, high contrast.',
    '- Clean layout with breathing room for the headline.',
    `- ${opts.aspect} Instagram-ready format.`,
    '- No watermark, no extra random text, no logos other than the typography above.',
  ]
    .filter(Boolean)
    .join('\n');
}
