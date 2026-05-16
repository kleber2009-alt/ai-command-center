---
name: pro-web-design
description: Создавай сайты, прототипы и веб-интерфейсы профессионального уровня — не «приличные», а такие, которые выглядят как работа топ-студии. Используй когда пользователь просит сделать сайт, лендинг, дашборд, прототип интерфейса, HTML-документ с продуманным дизайном, или когда твой собственный HTML-вывод должен производить wow-эффект, а не быть «generic Bootstrap». Триггерится на запросы: «сделай сайт», «дизайн», «лендинг», «дашборд», «прототип», «UI», «landing page», «hero», «сделай красиво», «прокачай дизайн», «portfolio site». Не применяется к чисто backend / API / database задачам без UI.
---

# Pro Web Design — система создания топ-уровневых веб-интерфейсов

## Цель скилла

Сдвинуть твой default-вывод с «прилично выглядящий HTML» на «дизайн уровня Linear / Vercel / Rauno / Anthropic». Это другой уровень — не больше украшений, а другая философия.

---

## Ядро философии

### 1. Дизайн = редактура, не декорация

Топ-сайты не выглядят круто потому что в них много элементов. Они круто выглядят потому что в них убрано лишнее. Каждый раз перед добавлением блока — задай вопрос: «что произойдёт если я этого НЕ добавлю?». Если ответ «ничего» — не добавляй.

### 2. Плотность > воздух

Generic-сайты залиты воздухом (`padding: 80px`, `max-width: 800px`, кучи `margin-bottom`). Топ-сайты плотные. Воздух — это инструмент, а не дефолт. Используй воздух чтобы разделить смысл, а не чтобы «выглядело свободнее».

**Default к которому стремимся:**
- Gap между блоками: **2px** (как граница, не воздух)
- Padding внутри блока: 14-22px, не 40px+
- Line-height: 1.45-1.55 для прозы, 1.1-1.2 для заголовков
- Max-width контента: 1480-1640px на десктопе, не 800px

### 3. Граница > тень

Тени (`box-shadow`) — generic-приём, пахнущий Bootstrap'ом 2014 года. Используй **границы** (1px solid с тёмным цветом) — они дают структуру без визуального шума.

```css
/* generic */
.card { background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px; }

/* pro */
.card { background: #0f0f0f; border: 1px solid #1a1a1a; }
```

### 4. Acent ≠ декорация

В большинстве дизайнов акцент-цвет — это **только** для CTA и положительного состояния. Не для иконок, не для линков в тексте, не для «оживить». Один акцент работает в 10 раз сильнее десяти «акцентов».

### 5. Типографика делает 60% работы

Большинство сайтов отличаются от топ-сайтов **в первую очередь шрифтами и их использованием**. Не цветом, не layout — типографикой.

---

## Дизайн-системы для применения

### Система A: AI Mastery (тёмная, плотная, технологичная)

Используй для: дашбордов, AI-проектов, технических интерфейсов, B2B SaaS.

```css
/* COLORS */
--bg: #080808;           /* почти-чёрный, не #000 */
--surface: #0f0f0f;      /* панели */
--surface-2: #141414;    /* hover, sub-surfaces */
--border: #1a1a1a;       /* основные границы */
--border-2: #2a2a2a;     /* акцентные границы */
--text: #f5f0e8;         /* warm white, не чисто белый */
--text-dim: #b8b3a8;     /* dimmed для метаданных */
--text-mute: #5a5550;    /* muted для подсказок */
--text-faint: #3a3a3a;   /* почти невидимый — для outline-номеров */

--accent-lime: #c8f060;  /* действия, положительное, CTA */
--accent-cyan: #60c8f0;  /* метаданные, навигация, информация */
--accent-pink: #f06090;  /* алерты, эскалации, негатив */

/* TYPOGRAPHY */
--font-serif: Georgia, 'Times New Roman', serif;   /* заголовки, числа, проза */
--font-mono: 'SF Mono', 'JetBrains Mono', Menlo, monospace;  /* labels, code, метаданные */

/* SCALE */
--text-12: 12px;  /* проза */
--text-14: 14px;  /* проза */
--text-15: 15px;  /* default body */
--text-18: 18px;  /* topbar */
--text-22: 22px;  /* H3 */
--text-32: 32px;  /* hero numbers */
--text-48: 48px;  /* big metric numbers */
--text-64: 64px;  /* xl hero */

/* LABEL PATTERN — все labels */
.label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-dim);
  font-weight: 700;
}

/* OUTLINE NUMBERS — декоративная нумерация секций */
.sec-num {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--accent-lime);
  font-weight: 700;
}
.sec-num::before { content: '/'; }  /* /01 /02 /03 */
```

### Система B: Editorial (светлая, прозовая, журналистская)

Для: лендингов, портфолио, контентных сайтов. Идём от газеты / журнала.

```css
--bg: #f8f5ee;           /* warm off-white */
--surface: #ffffff;
--text: #1a1a1a;
--text-dim: #6a6560;
--accent: #c8451c;       /* кирпично-красный — newspaper */
--font-serif: 'Charter', 'Georgia', serif;
--font-sans: 'Inter', -apple-system, sans-serif;
```

### Система C: Brutalist Minimal (тёмная или светлая, максимально аскетичная)

Для: одностраничников, портфолио разработчиков, манифестов.

```css
/* только 2 цвета, шрифты sans или mono */
--bg: #fff; --text: #000; --accent: #ff5500;
/* или инверсия */
--bg: #000; --text: #fff; --accent: #00ff88;
```

---

## Паттерны блоков (готовые)

### Hero metric — большое число с контекстом

```html
<div class="metric">
  <div class="metric-num">01</div>           <!-- outline-номер -->
  <div class="metric-label">Новые<br/>лиды</div>  <!-- ALL CAPS label -->
  <div class="metric-value">47</div>          <!-- Georgia 48px -->
  <div class="metric-delta up">▲ +12 ОТ ВЧЕРА</div>
</div>
```

### Section header с outline-нумерацией

```html
<div class="sec-head">
  <span class="sec-num">/01</span>
  <span class="sec-title">Метрики дня</span>     <!-- Georgia italic, dim -->
  <span class="sec-spacer"></span>                <!-- flex:1, border-bottom -->
</div>
```

### Log/feed строка

Моноширинный, плотный, как vim-лог:
```html
<div class="feed-row">
  <span class="t">21:04</span>                    <!-- 5a5550 -->
  <span class="ch ig">IG</span>                   <!-- цветная плашка -->
  <span class="who">@marina_v</span>              <!-- f5f0e8 -->
  <span class="act"><span class="ev">PAYMENT</span> 45 000 ₽</span>
  <span class="author">agent</span>               <!-- 5a5550, right-aligned -->
</div>
```

### Tag/chip

```css
.chip { 
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 3px 8px;
  letter-spacing: 0.12em;
  font-weight: 700;
  text-transform: uppercase;
}
.chip.lime { background: #2a3a14; color: #c8f060; }   /* tinted bg + accent text */
.chip.cyan { background: #0f2a3a; color: #60c8f0; }
.chip.pink { background: #28121b; color: #f06090; }
```

---

## Анти-паттерны — чего НЕ делать

### ❌ Большие border-radius

`border-radius: 16px` или `24px` смотрится дёшево. Если используешь rounded — максимум 4-6px. Лучше 0px — острые углы выглядят дороже.

### ❌ Gradient текст

`background: linear-gradient(...); -webkit-background-clip: text;` — это маркер 2021 года. Заменяй обычным цветом + хорошей типографикой.

### ❌ Floating cards с тенями

Тени делают сайт «корпоративным» и generic. Используй border вместо.

### ❌ Color на иконках

Иконки — нейтральный цвет (`#b8b3a8`). Цветной только тот элемент, который действительно требует внимания.

### ❌ Универсальная dark mode «invert»

Не делай dark mode через `filter: invert()`. Делай отдельную палитру с warm whites и не-чёрным фоном.

### ❌ 5+ акцентных цветов

Один акцент + два вспомогательных (cyan для info, pink для alerts). Больше — превращается в радугу.

### ❌ Loading skeletons как Facebook

Серые прямоугольники с animation — generic. Лучше:
- Точечный спиннер
- Прогресс-бар тонкий (2px)
- Просто текст «загружаю...» моноширинным

### ❌ Glassmorphism

`backdrop-filter: blur()` — было модно в 2022. Сейчас generic. Используй сплошные surface'ы.

### ❌ «Подложка для всего»

Если у тебя `body { padding: 40px; }` и потом каждый блок ещё с padding — это generic. Лучше `body { padding: 0; }` и блоки сами разруливают плотность.

---

## Чек-лист «дизайн на топ-уровне»

Перед публикацией проверь:

- [ ] Использован хотя бы один **outline-номер** или нестандартный навигационный приём
- [ ] **Border вместо shadow** на минимум 80% карточек
- [ ] **2-3 цвета** максимум, четко определены роли
- [ ] Сочетание **2 шрифтов** (serif + mono или sans + serif)
- [ ] **Микрокопия моноширинная** (timestamps, labels, метаданные)
- [ ] Иерархия размеров: разница между body и hero — минимум 3x (15px vs 48px+)
- [ ] **Нет анти-паттернов** из списка выше
- [ ] **Gap между блоками 2-4px**, не 16-32px
- [ ] **Italic Georgia** в подзаголовках секций (как акцент стиля)
- [ ] Есть один «фишечный» элемент: outline number / hero italic / тонкая моно-typeset / необычная навигация

---

## Топ-сайты для референса

- **linear.app** — плотность, типографика, dark mode
- **vercel.com** — landing, контраст, простота
- **rauno.me** — лайт-моде editorial portfolio
- **anthropic.com** — warm типографика, прозаический фокус
- **vercel.com/design** — sub-pages дизайн
- **stripe.com** — анимация при скролле, аккуратность
- **mux.com** — техно-эстетика, dark mode
- **planetscale.com** — карточки без теней
- **railway.app** — gradient backgrounds правильно

Когда сомневаешься — открой один из них и **копируй приёмы**, не контент.

---

## Когда применять скилл

### Always (default mode)
Когда генерируешь HTML/CSS — этот стиль по умолчанию. Не «сделать красиво по запросу», а «всегда так делаю».

### Specifically apply
- «Сделай сайт / лендинг / дашборд»
- «Прокачай дизайн этого HTML»
- «Сделай прототип интерфейса»
- «Hero-блок для...»
- Когда видишь что собственный default HTML вышел generic — переделать в эту систему

### Don't apply
- Pure backend / API tasks
- Когда явно просят «простой HTML без оформления»
- Email-templates (нужен совместимый код, тут другие правила)
- Print/PDF (используй pdf skill вместо)

---

## Workflow при создании нового HTML

1. **Определи систему** — A (тёмная техно), B (светлая editorial), C (brutalist)
2. **Скопируй CSS-переменные** из системы — не выдумывай цвета с нуля
3. **Спланируй структуру** — какие секции, в какой иерархии (3-7 секций оптимум)
4. **Используй паттерны** — outline-номера секций, label-конвенцию, метрики/feed/chips
5. **Удали 30% после первого черновика** — найди что можно убрать
6. **Проверь чек-лист** — все 10 пунктов
7. **Открой топ-референс рядом** — сравни. Если хуже — итерируй.

---

## Минимальный код-стартер (готовый файл)

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#080808">
<meta name="color-scheme" content="dark only">
<title>...</title>
<style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:#080808; color:#f5f0e8; min-height:100vh; }
  body { font-family:Georgia, 'Times New Roman', serif; font-size:15px; line-height:1.5; }
  .label { font-family:'SF Mono','JetBrains Mono','Menlo',monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.14em; color:#b8b3a8; font-weight:700; }
  .mono { font-family:'SF Mono','JetBrains Mono','Menlo',monospace; }
  .accent-lime { color:#c8f060; }
  .accent-cyan { color:#60c8f0; }
  .accent-pink { color:#f06090; }
  .shell { max-width:1480px; margin:0 auto; padding:18px 24px 80px; display:grid; gap:2px; }
  .sec-head { display:flex; align-items:baseline; gap:14px; padding:18px 2px 10px; }
  .sec-num { font-family:'SF Mono',monospace; font-size:10px; color:#c8f060; letter-spacing:0.18em; font-weight:700; }
  .sec-title { font-family:Georgia,serif; font-size:14px; font-style:italic; color:#b8b3a8; }
  .sec-spacer { flex:1; border-bottom:1px solid #1a1a1a; transform:translateY(-2px); }
  .panel { background:#0f0f0f; border:1px solid #1a1a1a; padding:18px 22px; }
</style>
</head>
<body>
<main class="shell">
  <div class="sec-head">
    <span class="sec-num">/01</span>
    <span class="sec-title">section title</span>
    <span class="sec-spacer"></span>
  </div>
  <div class="panel">
    ...
  </div>
</main>
</body>
</html>
```

Это **исходная точка**. Никогда не начинай с пустого файла — всегда форкай этот стартер.
