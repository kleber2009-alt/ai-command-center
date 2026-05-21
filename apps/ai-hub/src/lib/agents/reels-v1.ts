// Reels Agent v1 — multi-agent orchestrator.
//
// 5 phases, each = one Claude call with a focused role:
//   1) strategist       — niche/topic → positioning, audience, hook angles
//   2) hook_writer      — picks best angle, writes 3 hook options + chosen
//   3) visual_director  — 5 cinematic visual briefs (one per slide)
//   4) copywriter       — caption + hashtags + CTA
//   5) qa               — light review, surfaces risks/improvements
//
// Each phase emits agent_events rows: phase_started, phase_thinking,
// phase_completed (with output) — read by SSE endpoint and streamed live.

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chat, extractJson } from "@/lib/anthropic";

export type ReelsPhase =
  | "strategist" | "hook_writer" | "visual_director" | "copywriter" | "qa" | "finalize";

export interface ReelsInputV1 {
  niche: string;
  topic: string;
  tone: string;
  language: "ru" | "en";
}

interface Strategy {
  positioning: string;
  audience: string;
  angles: string[];
  hot_take: string;
}

interface HookOutput {
  chosen: { text: string; type: string; why_works: string };
  alternatives: Array<{ text: string; type: string }>;
}

interface VisualBrief {
  n: number;
  angle: string;
  voiceover: string;
  visual_brief: string;
  camera_motion: string;
}

interface Copy {
  caption: string;
  hashtags: string[];
  cta: string;
  estimated_duration_sec: number;
}

interface QA {
  score: number;                           // 0-100
  strengths: string[];
  risks: string[];
  recommendations: string[];
}

export interface ReelsPackageV1 {
  strategy: Strategy;
  hook: HookOutput;
  slides: VisualBrief[];
  copy: Copy;
  qa: QA;
  meta: { language: string; agents_used: string[]; total_tokens?: number };
}

// ===== Event emitter helper =====
async function emit(runId: string, phase: ReelsPhase, type: string, payload: Record<string, unknown> = {}) {
  await db.execute(sql`
    insert into agent_events (run_id, seq, phase, event_type, payload)
    values (${runId}::uuid, nextval('agent_events_seq_seq'), ${phase}, ${type}, ${JSON.stringify(payload)}::jsonb)
  `);
}

// ===== Phase runners =====

async function phaseStrategist(input: ReelsInputV1): Promise<Strategy> {
  const SYSTEM = `Ты — content strategist. Получаешь нишу + тему и быстро даёшь strategic brief.
Возвращай СТРОГО JSON. На русском (или английском если language=en).`;
  const USER = `Ниша: ${input.niche}
Тема: ${input.topic}
Тон: ${input.tone}
Язык: ${input.language}

Верни JSON:
{
  "positioning": "одна фраза — как этот ролик позиционирует креатора (например: «эксперт, который объясняет сложное на пальцах»)",
  "audience": "одна фраза про целевую аудиторию (демография + что их волнует)",
  "angles": ["3 разных угла подачи темы, от самых очевидных до неожиданных"],
  "hot_take": "одна провокационная мысль, которая сделает ролик заходящим"
}`;
  const ai = await chat({ system: SYSTEM, messages: [{ role: "user", content: USER }], maxTokens: 800 });
  const parsed = extractJson<Strategy>(ai.text);
  if (!parsed) throw new Error(`Strategist returned non-JSON: ${ai.text.slice(0, 200)}`);
  return parsed;
}

async function phaseHookWriter(input: ReelsInputV1, strategy: Strategy): Promise<HookOutput> {
  const SYSTEM = `Ты — hook writer для Instagram Reels. Берёшь strategic brief и пишешь 3 разных hook'a.
Затем сам выбираешь сильнейший. Возвращай СТРОГО JSON.`;
  const USER = `Стратегия:
${JSON.stringify(strategy, null, 2)}

Тема: ${input.topic}
Тон: ${input.tone}

Напиши 3 варианта hook'a (1-2 секунды каждый, цепляющий). Выбери лучший.
Верни JSON:
{
  "chosen": { "text": "сам hook", "type": "вопрос|шок|статистика|обещание|история|конфликт", "why_works": "почему этот сильнее остальных" },
  "alternatives": [{"text":"alt 1","type":"..."},{"text":"alt 2","type":"..."}]
}`;
  const ai = await chat({ system: SYSTEM, messages: [{ role: "user", content: USER }], maxTokens: 700 });
  const parsed = extractJson<HookOutput>(ai.text);
  if (!parsed) throw new Error(`Hook Writer returned non-JSON: ${ai.text.slice(0, 200)}`);
  return parsed;
}

async function phaseVisualDirector(input: ReelsInputV1, strategy: Strategy, hook: HookOutput): Promise<VisualBrief[]> {
  const SYSTEM = `Ты — visual director / DOP для Instagram Reels.
По выбранному hook'у раскладываешь 5 кадров (3-5 сек каждый = 15-25 сек ролик).
Каждый visual_brief должен быть достаточно конкретным чтобы прямо отдать в image-генерацию.
Camera motion — одно из: static, dolly_in, dolly_out, zoom_in, zoom_out, handheld, orbit, tracking.
Возвращай СТРОГО JSON.`;
  const USER = `Hook: "${hook.chosen.text}"
Стратегия: ${strategy.positioning}
Тон: ${input.tone}

Верни JSON-массив из 5 элементов:
[
  { "n": 1, "angle": "название/угол слайда", "voiceover": "1-2 фразы голосового сопровождения", "visual_brief": "image-prompt: композиция, свет, стиль, объекты", "camera_motion": "одно из 8 значений" }
]`;
  const ai = await chat({ system: SYSTEM, messages: [{ role: "user", content: USER }], maxTokens: 1500 });

  // Extract array — extractJson hunts for {...}, but here we need [...].
  let parsed: VisualBrief[] | null = null;
  const arr = ai.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arr) {
    try { parsed = JSON.parse(arr[0]) as VisualBrief[]; } catch { /* fall through */ }
  }
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Visual Director returned non-array: ${ai.text.slice(0, 200)}`);
  }
  return parsed.slice(0, 5);
}

async function phaseCopywriter(input: ReelsInputV1, strategy: Strategy, hook: HookOutput, slides: VisualBrief[]): Promise<Copy> {
  const SYSTEM = `Ты — copywriter. Пишешь caption + hashtags + CTA для готового Reels.
Caption: 2-4 предложения, без воды. Hashtags: 7-10, mix broad+niche. CTA: чёткое действие.
Возвращай СТРОГО JSON.`;
  const USER = `Hook: "${hook.chosen.text}"
Стратегия: ${strategy.positioning}
Аудитория: ${strategy.audience}
Тема: ${input.topic}
Тон: ${input.tone}
Слайдов: ${slides.length}

Верни JSON:
{
  "caption": "текст под пост",
  "hashtags": ["#tag1","#tag2",...],
  "cta": "конкретное действие в комментариях",
  "estimated_duration_sec": 15-25
}`;
  const ai = await chat({ system: SYSTEM, messages: [{ role: "user", content: USER }], maxTokens: 600 });
  const parsed = extractJson<Copy>(ai.text);
  if (!parsed) throw new Error(`Copywriter returned non-JSON: ${ai.text.slice(0, 200)}`);
  return parsed;
}

async function phaseQa(strategy: Strategy, hook: HookOutput, slides: VisualBrief[], copy: Copy): Promise<QA> {
  const SYSTEM = `Ты — senior QA-reviewer. Критикуешь готовый Reels-пакет: strenghts, risks, recommendations.
Score 0-100 — твоя оценка вероятности что ролик зайдёт у целевой аудитории.
Возвращай СТРОГО JSON.`;
  const USER = `Пакет:
- Hook: "${hook.chosen.text}"
- Positioning: ${strategy.positioning}
- Slides: ${slides.length} × visual_briefs
- Caption: "${copy.caption.slice(0, 200)}"
- CTA: "${copy.cta}"

Оцени пакет. Верни JSON:
{
  "score": 0-100,
  "strengths": ["2-3 сильные стороны"],
  "risks": ["2-3 риска или слабых места"],
  "recommendations": ["1-2 actionable улучшения"]
}`;
  const ai = await chat({ system: SYSTEM, messages: [{ role: "user", content: USER }], maxTokens: 700 });
  const parsed = extractJson<QA>(ai.text);
  if (!parsed) throw new Error(`QA returned non-JSON: ${ai.text.slice(0, 200)}`);
  return parsed;
}

// ===== Orchestrator =====
export async function runReelsAgentV1(runId: string, input: ReelsInputV1): Promise<ReelsPackageV1> {
  await db.execute(sql`update agent_runs set status='running' where id=${runId}::uuid`);

  // ----- Phase 1: Strategist -----
  await emit(runId, "strategist", "phase_started", { label: "Strategist", goal: "Find the angle" });
  await emit(runId, "strategist", "phase_thinking", { tip: "Анализирую нишу и тему" });
  const strategy = await phaseStrategist(input);
  await emit(runId, "strategist", "phase_completed", { output: strategy });

  // ----- Phase 2: Hook Writer -----
  await emit(runId, "hook_writer", "phase_started", { label: "Hook Writer", goal: "Craft the first 2 seconds" });
  await emit(runId, "hook_writer", "phase_thinking", { tip: "Пишу 3 варианта, выбираю сильнейший" });
  const hook = await phaseHookWriter(input, strategy);
  await emit(runId, "hook_writer", "phase_completed", { output: hook });

  // ----- Phase 3: Visual Director -----
  await emit(runId, "visual_director", "phase_started", { label: "Visual Director", goal: "Storyboard 5 slides" });
  await emit(runId, "visual_director", "phase_thinking", { tip: "Раскладываю кадры, камеру, voiceover" });
  const slides = await phaseVisualDirector(input, strategy, hook);
  await emit(runId, "visual_director", "phase_completed", { output: { slides } });

  // ----- Phase 4: Copywriter -----
  await emit(runId, "copywriter", "phase_started", { label: "Copywriter", goal: "Caption + hashtags + CTA" });
  await emit(runId, "copywriter", "phase_thinking", { tip: "Пишу caption, подбираю теги" });
  const copy = await phaseCopywriter(input, strategy, hook, slides);
  await emit(runId, "copywriter", "phase_completed", { output: copy });

  // ----- Phase 5: QA -----
  await emit(runId, "qa", "phase_started", { label: "QA Reviewer", goal: "Score the package" });
  await emit(runId, "qa", "phase_thinking", { tip: "Ищу слабые места, оцениваю по 100-балльной" });
  const qa = await phaseQa(strategy, hook, slides, copy);
  await emit(runId, "qa", "phase_completed", { output: qa });

  // ----- Final assembly -----
  const result: ReelsPackageV1 = {
    strategy, hook, slides, copy, qa,
    meta: {
      language: input.language,
      agents_used: ["strategist", "hook_writer", "visual_director", "copywriter", "qa"],
    },
  };

  await db.execute(sql`
    update agent_runs
       set status='completed', output=${JSON.stringify(result)}::jsonb, completed_at=now()
     where id=${runId}::uuid
  `);
  await emit(runId, "finalize", "run_completed", { score: qa.score });

  return result;
}
