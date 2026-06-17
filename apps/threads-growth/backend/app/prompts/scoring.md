# Scoring reference (§6)

Скоринг — детерминированный, считается в `app/services/scoring_service.py` (без LLM).
Этот файл — справка по формулам для воспроизводимости и ревью.

```
xn_score        = views / author_median_views          # ГЛАВНЫЙ ранжир
velocity        = Δengagement / max(hours_since_post, 0.5)
engagement_rate = (likes + comments + reposts) / views
follower_efficiency = engagement / author_followers

rank = 0.6 * xn_score
     + 0.3 * norm(velocity)
     + 0.1 * norm(engagement_rate)
```

Категории по `xn_score`: **A ≥ 5 · B 3–5 · C 1.5–3 · D < 1.5**.

- A/B → очередь адаптации (генерация постов).
- Свежие A/B (<24ч) с положительной velocity → дополнительно в `reply_targets`.
- Абсолютные лайки/репосты — только тайбрейкер, не основа ранжирования.

`norm(x)` — clamp(x / reference, 0, 1); reference берётся из распределения
свежего окна (по умолчанию velocity≈500, engagement_rate≈0.1).
