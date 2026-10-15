// Скрипт → чанки под лимит OmniHuman (kie.ai): модель деградирует на аудио
// длиннее ~15с, поэтому длинное видео собирается из нескольких клипов ≤~14с,
// склеиваемых ffmpeg. Здесь — разбиение текста по границам предложений так,
// чтобы каждый чанк укладывался в бюджет символов (≈14с русской речи).
//
// Оценка: русская речь ~14 симв/сек → 200 символов ≈ 14с (безопасно < 15с).

/** Границы предложений: .!?… и переводы строк. Разделитель остаётся в чанке. */
function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .trim()
    // разрез ПОСЛЕ знака конца предложения (с учётом кавычек/скобок)
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts;
}

/** Если одно предложение длиннее бюджета — режем по словам. */
function hardSplit(sentence: string, maxChars: number): string[] {
  const words = sentence.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Разбить скрипт на чанки, каждый ≤ maxChars, по границам предложений
 * (жадная упаковка). Возвращает не более maxChunks кусков; хвост, не влезший
 * в бюджет, отбрасывается (вызывающий уже обрезал скрипт до общего лимита).
 */
export function segmentScript(
  script: string,
  opts: { maxChars: number; maxChunks: number },
): string[] {
  const { maxChars, maxChunks } = opts;
  const sentences = splitSentences(script).flatMap((s) =>
    s.length > maxChars ? hardSplit(s, maxChars) : [s],
  );

  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const next = cur ? `${cur} ${s}` : s;
    if (next.length > maxChars && cur) {
      chunks.push(cur);
      cur = s;
    } else {
      cur = next;
    }
    if (chunks.length >= maxChunks) break;
  }
  if (cur && chunks.length < maxChunks) chunks.push(cur);

  return chunks.slice(0, maxChunks);
}
