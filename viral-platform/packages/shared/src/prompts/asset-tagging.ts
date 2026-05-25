/**
 * Vision tagging prompt for user-library assets (§4.4.3). Sent to Gemini 2.0
 * Flash with 1–3 extracted frames; output is validated and stored as
 * user_assets.ai_metadata, plus its description+tags feed the embedding.
 */
export const ASSET_TAGGING_PROMPT = `Опиши это изображение/видеокадр для поиска по B-roll медиатеке.
Верни строго JSON:
{
  "description": "1-2 предложения, что в кадре",
  "tags": ["10-20 ключевых слов на английском"],
  "scene_type": "indoor" | "outdoor" | "abstract" | "product" | "person" | "screen",
  "mood": ["energetic" | "calm" | "professional" | "dramatic" | ...],
  "dominant_colors": ["#hex", "#hex", "#hex"],
  "has_faces": boolean,
  "has_text_overlay": boolean,
  "motion_intensity": "static" | "slow" | "medium" | "fast",
  "usability_score": 0-100
}`;
