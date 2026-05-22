import { NextRequest, NextResponse } from 'next/server'

import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  answerPreCheckoutQuery,
  createInvoiceLink,
  type InlineKeyboardButton,
  type ReplyMarkup,
} from '@/lib/bot-api'
import {
  getOrCreateUser,
  getUserByTelegramId,
  grantProDays,
  recordStarsPayment,
  upsertCloneDraft,
  getCloneDraft,
  clearCloneDraft,
  type UserTier,
} from '@/lib/users-db'

export const runtime = 'nodejs'

const STARS_PRICE_PRO = parseInt(process.env.STARS_PRICE_PRO ?? '750', 10)
const PRO_SUBSCRIPTION_DAYS = parseInt(process.env.PRO_SUBSCRIPTION_DAYS ?? '30', 10)
const TMA_URL = process.env.TMA_URL ?? 'https://tma.46-62-215-11.nip.io/'
// viral_clone dispatch — куда POST'ить `/clone <url|@handle>`. Обрабатывается
// office worker'ом (роут /worker/viral-clone/dispatch). Внутри docker-сети
// `infra_internal`/`aisales_aisales-net` worker не виден напрямую, поэтому
// зовём через публичный URL ai-office домена (Caddy → worker).
const VIRAL_DISPATCH_URL =
  process.env.VIRAL_CLONE_DISPATCH_URL ??
  'https://ai-office.46-62-215-11.nip.io/worker/viral-clone/dispatch'
const VIRAL_DISPATCH_SECRET = process.env.VIRAL_CLONE_DISPATCH_SECRET ?? ''
// Те же worker'ы, что и dispatch, но другие маршруты — список фото и
// upload нового фото. Берём базу из dispatch-URL, чтобы был один env.
const VIRAL_PHOTOS_URL = VIRAL_DISPATCH_URL.replace(/\/viral-clone\/dispatch$/, '/clone/photos')
const VIRAL_PHOTO_UPLOAD_URL = VIRAL_DISPATCH_URL.replace(/\/viral-clone\/dispatch$/, '/clone/photo')
// /voice flow — обучение голоса клиента под /clone audio-path.
const VIRAL_VOICE_UPLOAD_URL = VIRAL_DISPATCH_URL.replace(/\/viral-clone\/dispatch$/, '/clone/voice')
const VIRAL_VOICES_URL = VIRAL_DISPATCH_URL.replace(/\/viral-clone\/dispatch$/, '/clone/voices')

type TgUser = { id: number; first_name?: string; username?: string; language_code?: string }
type TgChat = { id: number; type: string }

type TgSuccessfulPayment = {
  currency: string
  total_amount: number
  invoice_payload: string
  telegram_payment_charge_id: string
  provider_payment_charge_id: string
}

type TgPhotoSize = { file_id: string; file_size?: number; width?: number; height?: number }
type TgVoice = { file_id: string; duration?: number; mime_type?: string; file_size?: number }
type TgAudio = { file_id: string; duration?: number; mime_type?: string; file_size?: number; title?: string }

type TgMessage = {
  message_id: number
  from?: TgUser
  chat: TgChat
  text?: string
  photo?: TgPhotoSize[]
  voice?: TgVoice
  audio?: TgAudio
  successful_payment?: TgSuccessfulPayment
}

type TgPreCheckoutQuery = {
  id: string
  from: TgUser
  currency: string
  total_amount: number
  invoice_payload: string
}

type TgCallbackQuery = {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}

type TgUpdate = {
  update_id: number
  message?: TgMessage
  pre_checkout_query?: TgPreCheckoutQuery
  callback_query?: TgCallbackQuery
}

type PaymentPayload = {
  user_id: string
  tier: UserTier
  days: number
}

export async function POST(req: NextRequest) {
  // Verify Telegram-signed secret token (set when configuring webhook).
  // Without this check, anyone who knows the webhook URL could forge updates.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expected) {
    const got = req.headers.get('x-telegram-bot-api-secret-token')
    if (got !== expected) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  let update: TgUpdate
  try {
    update = (await req.json()) as TgUpdate
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Always respond 200 to Telegram — otherwise it keeps retrying the update.
  try {
    if (update.pre_checkout_query) {
      await handlePreCheckout(update.pre_checkout_query)
    } else if (update.message?.successful_payment) {
      await handleSuccessfulPayment(update.message)
    } else if (update.callback_query) {
      await handleCallback(update.callback_query)
    } else if (update.message?.photo) {
      await handlePhoto(update.message)
    } else if (update.message?.voice || update.message?.audio) {
      await handleAudio(update.message)
    } else if (update.message?.text) {
      await handleCommand(update.message)
    }
  } catch (e: any) {
    console.error('[telegram/webhook] handler error:', e?.message)
  }

  return NextResponse.json({ ok: true })
}

// ── Command router. Each branch is intentionally explicit so existing
// behavior (/start, /clone) keeps working unchanged when new feature
// commands are added.
async function handleCommand(msg: TgMessage) {
  const text = (msg.text ?? '').trim()
  const cmd = text.split(/\s+/)[0].replace(/@\S+$/, '').toLowerCase()

  if (cmd === '/start') {
    await handleStart(msg)
    return
  }
  if (cmd === '/clone') {
    await handleClone(msg)
    return
  }
  if (cmd === '/voice') {
    await handleVoice(msg)
    return
  }
  if (cmd === '/menu' || cmd === '/help') {
    await sendMainMenu(msg.chat.id)
    return
  }
  if (cmd === '/transcribe') {
    await sendFeatureCard(msg.chat.id, 'transcribe')
    return
  }
  if (cmd === '/me') {
    await sendFeatureCard(msg.chat.id, 'me')
    return
  }
  if (cmd === '/assistants') {
    await sendFeatureCard(msg.chat.id, 'assistants')
    return
  }
  if (cmd === '/pro' || cmd === '/billing' || cmd === '/subscription') {
    await sendFeatureCard(msg.chat.id, 'pro', msg.from)
    return
  }

  // Не команда и не команда выше — возможно это название для только что
  // загруженного фото (state=awaiting_name в clone-draft), либо ссылка/handle
  // после тапа кнопки «Клон рилса» (state=awaiting_clone_url).
  if (msg.from) {
    const draft = await getCloneDraft(msg.from.id)
    if (draft?.state === 'awaiting_name' && draft.pending_file_id) {
      await applyPhotoName(msg, draft.pending_file_id, text)
      return
    }
    if (draft?.state === 'awaiting_clone_url') {
      const synthetic: TgMessage = { ...msg, text: `/clone ${text}` }
      await handleClone(synthetic)
      return
    }
  }
}

// ── Feature catalog. Single source of truth for menu labels, command
// descriptions, and the in-app target page each feature opens.
type FeatureKey = 'transcribe' | 'me' | 'assistants' | 'clone' | 'pro'

const FEATURES: Record<FeatureKey, { label: string; appPath?: string; render: () => string }> = {
  transcribe: {
    label: '🎬 Транскрибация',
    appPath: 'transcribe',
    render: () =>
      '🎬 <b>Транскрибация</b>\n\n' +
      'Расшифровываю YouTube, Reels или TikTok и сразу выдаю 4 артефакта:\n' +
      '• карусель Instagram (8 PNG 1080×1080)\n' +
      '• Reels-сценарий с hook и CTA\n' +
      '• TG-пост с живым тоном\n' +
      '• перевод на 50+ языков\n\n' +
      '<b>Как пользоваться:</b>\n' +
      '1. Нажми «Открыть приложение»\n' +
      '2. Вставь ссылку на видео\n' +
      '3. Через 1–2 минуты получишь готовый контент\n\n' +
      '<i>Free — 60 минут в месяц. Pro — безлимит.</i>',
  },
  me: {
    label: '🧠 Мой второй мозг',
    appPath: 'me',
    render: () =>
      '🧠 <b>Мой второй мозг</b>\n\n' +
      'Личная база знаний. Загружаешь документы, заметки, ссылки — превращаю в умного помощника, который отвечает по твоим материалам.\n\n' +
      '<b>Как пользоваться:</b>\n' +
      '1. Открой раздел и загрузи материалы (PDF, текст, ссылки)\n' +
      '2. Задай вопрос — отвечу по твоей базе, а не по интернету\n' +
      '3. Возвращайся когда надо вспомнить контекст',
  },
  assistants: {
    label: '🤖 AI-ассистенты',
    appPath: 'assistants',
    render: () =>
      '🤖 <b>AI-ассистенты</b>\n\n' +
      'Готовые помощники под разные задачи: контент, продажи, аналитика, продукт. У каждого свой тон и фокус.\n\n' +
      '<b>Как пользоваться:</b>\n' +
      '1. Открой раздел и выбери ассистента\n' +
      '2. Опиши задачу одной фразой\n' +
      '3. Получи готовый результат — текст, план, разбор',
  },
  clone: {
    label: '🎥 Клон рилса',
    render: () =>
      '🎥 <b>Клон рилса</b>\n\n' +
      'Берёшь чужой залетевший рилс — получаешь свой ремейк с твоим аватаром и стилем за 3–7 минут.\n\n' +
      '<b>Как пользоваться:</b>\n' +
      'Просто пришли мне следующим сообщением:\n' +
      '• ссылку на рилс — <code>https://www.instagram.com/reel/XXXX/</code>\n' +
      '• или <code>@конкурент</code> — сам найду самый залетевший рилс за 30 дней\n\n' +
      '🎙 Чтобы клон говорил <b>твоим</b> голосом — сначала запусти ' +
      '<code>/voice</code> и пришли 1-минутный сэмпл (обучение ~30 сек).\n\n' +
      '<i>Pipeline: research → download → transcribe → rewrite → HeyGen → Submagic (Hormozi 2 + B-rolls) → готовый mp4 сюда.</i>',
  },
  pro: {
    label: '💎 Pro-подписка',
    render: () =>
      '💎 <b>Pro-подписка</b>\n\n' +
      `Free: 60 минут транскрибации в месяц.\n` +
      `Pro: безлимит транскрибации, карусели, Reels-сценарии, переводы, приоритетная очередь.\n\n` +
      `<b>Цена:</b> ${STARS_PRICE_PRO}⭐ / ${PRO_SUBSCRIPTION_DAYS} дней (Telegram Stars).\n\n` +
      `Оплата проходит внутри Telegram — открой /start, там кнопка покупки.`,
  },
}

const FEATURE_ORDER: FeatureKey[] = ['transcribe', 'me', 'assistants', 'clone', 'pro']

function menuKeyboard(): ReplyMarkup {
  // 2 columns: visually compact, всё видно без скролла.
  const rows: InlineKeyboardButton[][] = []
  for (let i = 0; i < FEATURE_ORDER.length; i += 2) {
    const pair = FEATURE_ORDER.slice(i, i + 2).map<InlineKeyboardButton>(k => ({
      text: FEATURES[k].label,
      callback_data: `feat:${k}`,
    }))
    rows.push(pair)
  }
  rows.push([{ text: '🚀 Открыть приложение', web_app: { url: TMA_URL } }])
  return { inline_keyboard: rows }
}

function featureDetailKeyboard(key: FeatureKey): ReplyMarkup {
  const buttons: InlineKeyboardButton[] = []
  const feat = FEATURES[key]
  if (feat.appPath) {
    buttons.push({
      text: '🚀 Открыть в приложении',
      web_app: { url: TMA_URL + feat.appPath },
    })
  }
  return {
    inline_keyboard: [
      ...(buttons.length ? [buttons] : []),
      [{ text: '← Назад в меню', callback_data: 'feat:menu' }],
    ],
  }
}

const MENU_TEXT =
  '📋 <b>Что я умею</b>\n\n' +
  'Выбери функцию — расскажу, что она делает и как с ней работать. Все инструменты доступны внутри приложения.'

async function sendMainMenu(chatId: number) {
  await sendMessage(chatId, MENU_TEXT, {
    parse_mode: 'HTML',
    reply_markup: menuKeyboard(),
    disable_web_page_preview: true,
  })
}

async function sendFeatureCard(chatId: number, key: FeatureKey, _from?: TgUser) {
  await sendMessage(chatId, FEATURES[key].render(), {
    parse_mode: 'HTML',
    reply_markup: featureDetailKeyboard(key),
    disable_web_page_preview: true,
  })
}

async function handleCallback(cb: TgCallbackQuery) {
  const data = cb.data ?? ''
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id

  // Always ack first so the spinner disappears even on no-op.
  if (!chatId || !messageId) {
    await answerCallbackQuery(cb.id)
    return
  }

  if (data === 'feat:menu') {
    await editMessageText(chatId, messageId, MENU_TEXT, {
      parse_mode: 'HTML',
      reply_markup: menuKeyboard(),
      disable_web_page_preview: true,
    })
    await answerCallbackQuery(cb.id)
    return
  }

  if (data.startsWith('feat:')) {
    const key = data.slice('feat:'.length) as FeatureKey
    if (key in FEATURES) {
      // Кнопка «Клон рилса» — вооружаем awaiting_clone_url, чтобы юзеру
      // достаточно было прислать ссылку без префикса /clone.
      if (key === 'clone' && cb.from) {
        await upsertCloneDraft({
          telegram_user_id: cb.from.id,
          chat_id: chatId,
          source_url: null,
          competitor_account: null,
          state: 'awaiting_clone_url',
          photo_id: null,
          pending_file_id: null,
          voice_id: null,
        })
      }
      await editMessageText(chatId, messageId, FEATURES[key].render(), {
        parse_mode: 'HTML',
        reply_markup: featureDetailKeyboard(key),
        disable_web_page_preview: true,
      })
      await answerCallbackQuery(cb.id)
      return
    }
  }

  // ── /clone callbacks ───────────────────────────────────────────────
  // Фото выбрано из памяти → запоминаем photo_id в draft и показываем
  // меню голоса (по аналогии с фото-меню). Сам dispatch — после выбора
  // голоса.
  if (data.startsWith('clone:use:')) {
    await answerCallbackQuery(cb.id)
    const photoId = parseInt(data.slice('clone:use:'.length), 10)
    const draft = cb.from ? await getCloneDraft(cb.from.id) : null
    if (!draft || !Number.isFinite(photoId)) {
      await editMessageText(chatId, messageId, '⚠️ Сессия /clone истекла. Запусти заново: <code>/clone &lt;url&gt;</code>', { parse_mode: 'HTML' })
      return
    }
    await upsertCloneDraft({
      telegram_user_id: cb.from!.id,
      chat_id: draft.chat_id,
      source_url: draft.source_url,
      competitor_account: draft.competitor_account,
      state: 'awaiting_voice_choice',
      photo_id: photoId,
      pending_file_id: null,
      voice_id: null,
    })
    await editVoiceChoice(chatId, messageId, cb.from!.id)
    return
  }

  if (data === 'clone:new') {
    await answerCallbackQuery(cb.id)
    if (cb.from) {
      const draft = await getCloneDraft(cb.from.id)
      if (draft) {
        await upsertCloneDraft({
          telegram_user_id: cb.from.id,
          chat_id: draft.chat_id,
          source_url: draft.source_url,
          competitor_account: draft.competitor_account,
          state: 'awaiting_photo',
          photo_id: null,
          pending_file_id: null,
          voice_id: null,
        })
      }
    }
    await editMessageText(
      chatId,
      messageId,
      '📷 Пришли мне <b>фото</b> следующим сообщением.\n\n' +
        'Подойдёт фасовое фото (лицо по центру, 1 человек). Я «оживлю» его через HeyGen — оно будет говорить твой Reels-сценарий.',
      { parse_mode: 'HTML' },
    )
    return
  }

  // ── Voice picker callbacks (после выбора фото) ─────────────────────
  if (data.startsWith('clone:voice:')) {
    const choice = data.slice('clone:voice:'.length)
    const draft = cb.from ? await getCloneDraft(cb.from.id) : null
    if (!draft || draft.state !== 'awaiting_voice_choice' || draft.photo_id == null) {
      await answerCallbackQuery(cb.id, '⚠️ Сессия истекла')
      await editMessageText(chatId, messageId, '⚠️ Сессия /clone истекла. Запусти заново: <code>/clone &lt;url&gt;</code>', { parse_mode: 'HTML' })
      return
    }

    if (choice === 'new') {
      await answerCallbackQuery(cb.id)
      await upsertCloneDraft({ ...draft, state: 'awaiting_voice_audio_for_clone' })
      await editMessageText(
        chatId,
        messageId,
        '🎙 <b>Запиши голос (≥30 сек, лучше около минуты)</b>\n\n' +
          'Прочитай любой текст спокойно, в тихой комнате, без эха.\n' +
          'После записи я обучу модель и сразу запущу клон.\n\n' +
          '<i>Подсказка: можно прислать voice-сообщение или mp3-файл.</i>',
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '✕ Отмена', callback_data: 'clone:cancel' }]] },
        },
      )
      return
    }

    await answerCallbackQuery(cb.id, 'Запускаю…')
    // choice === 'default' → null (HeyGen дефолт); иначе это eleven_voice_id
    const voiceId = choice === 'default' ? null : choice
    const photoId = draft.photo_id
    await clearCloneDraft(cb.from!.id)
    await editMessageText(chatId, messageId, '🎬 Запускаю клон…', { parse_mode: 'HTML' })
    await dispatchPipeline({
      chatId: draft.chat_id,
      userTelegramId: cb.from!.id,
      sourceUrl: draft.source_url,
      competitorAccount: draft.competitor_account,
      photoId,
      voiceId,
    })
    return
  }

  if (data === 'clone:cancel') {
    await answerCallbackQuery(cb.id, 'Отменил')
    if (cb.from) await clearCloneDraft(cb.from.id)
    await editMessageText(chatId, messageId, '✕ Отменил /clone. Запусти заново когда будешь готов.')
    return
  }

  await answerCallbackQuery(cb.id)
}

// ── /clone <url|@handle> — двух-шаговый запуск viral_clone pipeline.
// До запуска бот спрашивает фото-аватар: либо выбрать ранее сохранённое
// (из clone_user_photos), либо загрузить новое. Сам pipeline исполняется
// в `infra-aisales-worker-1` после POST на /worker/viral-clone/dispatch.
async function handleClone(msg: TgMessage) {
  const chatId = msg.chat.id
  const from = msg.from
  if (!from) return

  const raw = (msg.text ?? '').trim()
  const arg = raw.replace(/^\/clone(@\S+)?\s*/i, '').trim()

  if (!arg) {
    await sendFeatureCard(chatId, 'clone')
    return
  }

  let sourceUrl: string | null = null
  let competitorAccount: string | null = null
  if (/^https?:\/\//i.test(arg)) {
    sourceUrl = arg.split(/\s+/)[0]
  } else if (/^@?[A-Za-z0-9._]{2,}$/.test(arg)) {
    competitorAccount = arg.startsWith('@') ? arg : '@' + arg
  } else {
    await sendMessage(chatId, 'Не понял аргумент. Жду ссылку (https://…) или @handle.')
    return
  }

  if (!VIRAL_DISPATCH_SECRET) {
    await sendMessage(chatId, '⚠️ /clone выключен: VIRAL_CLONE_DISPATCH_SECRET не настроен на проде.')
    console.error('[telegram/webhook] /clone called but VIRAL_CLONE_DISPATCH_SECRET unset')
    return
  }

  const photos = await fetchUserPhotos(from.id)
  const sourceLabel = sourceUrl
    ? `Ссылка: <code>${escapeHtml(sourceUrl)}</code>`
    : `Конкурент: <code>${escapeHtml(competitorAccount!)}</code>`

  if (photos.length === 0) {
    await upsertCloneDraft({
      telegram_user_id: from.id,
      chat_id: chatId,
      source_url: sourceUrl,
      competitor_account: competitorAccount,
      state: 'awaiting_photo',
      photo_id: null,
      pending_file_id: null,
      voice_id: null,
    })
    await sendMessage(
      chatId,
      `🎥 <b>Клон рилса</b>\n\n${sourceLabel}\n\n` +
        '📷 Чтобы оживить аватар, мне нужно <b>фото</b>. Пришли его следующим сообщением.\n\n' +
        '<i>Подойдёт фасовое фото — лицо по центру, 1 человек. Я попрошу название, чтобы потом ты мог выбрать его «из памяти».</i>',
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✕ Отмена', callback_data: 'clone:cancel' }]] },
      },
    )
    return
  }

  await upsertCloneDraft({
    telegram_user_id: from.id,
    chat_id: chatId,
    source_url: sourceUrl,
    competitor_account: competitorAccount,
    state: 'awaiting_photo_choice',
    photo_id: null,
    pending_file_id: null,
    voice_id: null,
  })

  const rows: InlineKeyboardButton[][] = photos.map(p => [
    { text: `📷 ${p.name}`, callback_data: `clone:use:${p.id}` },
  ])
  rows.push([{ text: '🆕 Новое фото', callback_data: 'clone:new' }])
  rows.push([{ text: '✕ Отмена', callback_data: 'clone:cancel' }])

  await sendMessage(
    chatId,
    `🎥 <b>Клон рилса</b>\n\n${sourceLabel}\n\n` +
      'Выбери фото-аватар из памяти или загрузи новое:',
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } },
  )
}

// ── Photo upload handler. Юзер прислал фото — если ждём awaiting_photo,
// сохраняем pending_file_id и просим название.
async function handlePhoto(msg: TgMessage) {
  const chatId = msg.chat.id
  const from = msg.from
  if (!from || !msg.photo?.length) return

  const draft = await getCloneDraft(from.id)
  if (!draft || draft.state !== 'awaiting_photo') {
    await sendMessage(
      chatId,
      'Сейчас я не жду фото. Чтобы запустить клон рилса, напиши <code>/clone &lt;ссылка&gt;</code>.',
      { parse_mode: 'HTML' },
    )
    return
  }

  const largest = msg.photo.reduce(
    (best, p) => ((p.file_size ?? 0) > (best.file_size ?? 0) ? p : best),
    msg.photo[0],
  )

  await upsertCloneDraft({
    telegram_user_id: from.id,
    chat_id: chatId,
    source_url: draft.source_url,
    competitor_account: draft.competitor_account,
    state: 'awaiting_name',
    photo_id: null,
    pending_file_id: largest.file_id,
    voice_id: null,
  })

  await sendMessage(
    chatId,
    '✓ Фото получил.\n\n' +
      '🏷 <b>Как его назвать?</b>\n' +
      'Напиши коротко одной фразой — например: <code>студия</code>, <code>офис</code>, <code>с белым фоном</code>. Я сохраню его в памяти, чтобы потом можно было выбрать одним тапом.',
    { parse_mode: 'HTML' },
  )
}

// ── /voice — обучение голоса клиента. Ставит draft в awaiting_voice_audio
// и шлёт инструкцию. Следующее voice/audio-сообщение от юзера попадает в
// handleAudio() и улетает в worker → ElevenLabs IVC.
async function handleVoice(msg: TgMessage) {
  const chatId = msg.chat.id
  const from = msg.from
  if (!from) return

  if (!VIRAL_DISPATCH_SECRET) {
    await sendMessage(chatId, '⚠️ /voice выключен: VIRAL_CLONE_DISPATCH_SECRET не настроен на проде.')
    return
  }

  await upsertCloneDraft({
    telegram_user_id: from.id,
    chat_id: chatId,
    source_url: null,
    competitor_account: null,
    state: 'awaiting_voice_audio',
    photo_id: null,
    pending_file_id: null,
    voice_id: null,
  })

  await sendMessage(
    chatId,
    '🎙 <b>Обучу твой голос</b>\n\n' +
      'Запиши <b>голосовое сообщение</b> (зажми микрофон в TG) или пришли <b>mp3/m4a</b> на ~60 секунд. ' +
      'Прочитай любой текст из своего обычного контента — спокойно, без эмоций-крайностей.\n\n' +
      '<b>Что важно:</b>\n' +
      '• тихая комната, без эха\n' +
      '• один спикер (без фоновых голосов и музыки)\n' +
      '• микрофон в 10–20 см ото рта\n' +
      '• естественный темп и интонация\n\n' +
      '<b>Образец текста</b> (можешь читать его или свой):\n' +
      '<i>«Привет. Меня зовут [имя]. Я делаю контент про [тема]. ' +
      'Сегодня хочу разобрать одну ошибку, которую вижу у 9 из 10 моих клиентов. ' +
      'Многие думают, что результат приходит от количества попыток, но на самом деле — от качества каждой. ' +
      'Покажу на примере, почему это работает именно так, и что с этим делать прямо сейчас.»</i>\n\n' +
      'После записи я обучу модель за ~30 секунд, и <code>/clone</code> начнёт говорить твоим голосом.',
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '✕ Отмена', callback_data: 'clone:cancel' }]] },
    },
  )
}

// ── Voice/audio handler — принимает сэмпл и для standalone /voice, и для
// inline-обучения внутри /clone (после выбора фото → «Новый голос»).
// Различает по draft.state.
async function handleAudio(msg: TgMessage) {
  const chatId = msg.chat.id
  const from = msg.from
  if (!from) return

  const draft = await getCloneDraft(from.id)
  if (!draft) return
  const isInClone = draft.state === 'awaiting_voice_audio_for_clone'
  const isStandalone = draft.state === 'awaiting_voice_audio'
  if (!isInClone && !isStandalone) return

  const fileId = msg.voice?.file_id || msg.audio?.file_id
  const duration = msg.voice?.duration ?? msg.audio?.duration ?? 0
  if (!fileId) return

  if (duration > 0 && duration < 25) {
    await sendMessage(
      chatId,
      `⚠️ Сэмпл слишком короткий (${duration}с). Нужно от 30 секунд — лучше около минуты. Запиши ещё раз.`,
    )
    return
  }

  await sendMessage(chatId, '⏳ Обучаю голос (~30 сек)…')

  let res: Response
  try {
    res = await fetch(VIRAL_VOICE_UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dispatch-secret': VIRAL_DISPATCH_SECRET },
      body: JSON.stringify({
        tg_user_id: from.id,
        file_id: fileId,
        name: `${from.first_name ?? 'Клиент'} · ${new Date().toISOString().slice(0, 10)}`,
      }),
    })
  } catch (e: any) {
    await sendMessage(chatId, `⚠️ Не дотянулся до воркера: ${e?.message ?? 'network'}`)
    return
  }
  if (!res.ok) {
    const t = await res.text()
    await sendMessage(chatId, `⚠️ Обучение не удалось (${res.status}): ${t.slice(0, 200)}`)
    return
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; voice_id?: string; name?: string }
  if (!json.ok || !json.voice_id) {
    await sendMessage(chatId, '⚠️ Воркер вернул некорректный ответ. Попробуй ещё раз.')
    return
  }

  if (isInClone && draft.photo_id != null) {
    // Голос обучен в рамках /clone — сразу запускаем pipeline свежим voice_id.
    await clearCloneDraft(from.id)
    await sendMessage(chatId, '✓ Голос обучен. 🎬 Запускаю клон…')
    await dispatchPipeline({
      chatId: draft.chat_id,
      userTelegramId: from.id,
      sourceUrl: draft.source_url,
      competitorAccount: draft.competitor_account,
      photoId: draft.photo_id,
      voiceId: json.voice_id,
    })
    return
  }

  // Standalone /voice — просто фиксируем и подсказываем дальнейшее действие.
  await clearCloneDraft(from.id)
  await sendMessage(
    chatId,
    `✓ Голос обучен.\n\nТеперь запусти <code>/clone &lt;ссылка&gt;</code> — клон будет говорить твоим голосом.`,
    { parse_mode: 'HTML' },
  )
}

// ── Юзер прислал имя для свежезагруженного фото — заливаем в HeyGen
// через worker, чистим draft, запускаем pipeline.
async function applyPhotoName(msg: TgMessage, fileId: string, rawName: string) {
  const chatId = msg.chat.id
  const from = msg.from!
  const name = rawName.trim().slice(0, 80)
  if (!name) {
    await sendMessage(chatId, 'Название не должно быть пустым. Напиши пару слов.')
    return
  }

  await sendMessage(chatId, '⏳ Загружаю фото в HeyGen…')

  let uploadRes: Response
  try {
    uploadRes = await fetch(VIRAL_PHOTO_UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dispatch-secret': VIRAL_DISPATCH_SECRET },
      body: JSON.stringify({ tg_user_id: from.id, file_id: fileId, name }),
    })
  } catch (e: any) {
    await sendMessage(chatId, `⚠️ Не дотянулся до воркера: ${e?.message ?? 'network'}`)
    return
  }
  if (!uploadRes.ok) {
    const t = await uploadRes.text()
    await sendMessage(chatId, `⚠️ Загрузка фото в HeyGen не удалась (${uploadRes.status}): ${t.slice(0, 200)}`)
    return
  }
  const upJson = (await uploadRes.json().catch(() => ({}))) as { ok?: boolean; photo_id?: number; name?: string }
  if (!upJson.ok || !upJson.photo_id) {
    await sendMessage(chatId, '⚠️ Воркер вернул некорректный ответ. Попробуй ещё раз.')
    return
  }

  const draft = await getCloneDraft(from.id)
  if (!draft) {
    await clearCloneDraft(from.id)
    await sendMessage(
      chatId,
      `✓ Сохранил фото «${escapeHtml(name)}». Запусти <code>/clone &lt;ссылка&gt;</code> — выберешь его одним тапом.`,
      { parse_mode: 'HTML' },
    )
    return
  }

  // Фото загружено → продвигаем в voice-picker, как и при выборе из памяти.
  await upsertCloneDraft({
    telegram_user_id: from.id,
    chat_id: chatId,
    source_url: draft.source_url,
    competitor_account: draft.competitor_account,
    state: 'awaiting_voice_choice',
    photo_id: upJson.photo_id,
    pending_file_id: null,
    voice_id: null,
  })
  await sendMessage(chatId, `✓ Сохранил фото «${escapeHtml(name)}» в памяти.`, { parse_mode: 'HTML' })
  await sendVoiceChoice(chatId, from.id)
}

// Меню выбора голоса. Используется после выбора фото (и нового, и из памяти).
// Опции:
//   • Дефолт (HeyGen built-in) — пусто voice_id, для owner это его HeyGen voice
//   • Список обученных voices юзера (если есть)
//   • «Записать новый» — уходим в awaiting_voice_audio_for_clone
//   • «Отмена»
function buildVoiceKeyboard(voices: { id: number; name: string; eleven_voice_id: string }[]): ReplyMarkup {
  const rows: InlineKeyboardButton[][] = []
  rows.push([{ text: '🎙 Дефолтный голос (HeyGen)', callback_data: 'clone:voice:default' }])
  for (const v of voices) {
    rows.push([{ text: `🎤 ${v.name}`, callback_data: `clone:voice:${v.eleven_voice_id}` }])
  }
  rows.push([{ text: '➕ Записать новый голос', callback_data: 'clone:voice:new' }])
  rows.push([{ text: '✕ Отмена', callback_data: 'clone:cancel' }])
  return { inline_keyboard: rows }
}

const VOICE_PICKER_TEXT =
  '🎙 <b>Выбери голос</b>\n\n' +
  '• Дефолтный — встроенный голос HeyGen.\n' +
  '• Свой обученный — клон твоего голоса (если уже обучал командой /voice).\n' +
  '• Новый — пришли voice-сообщение на ~60 сек, обучу и сразу запущу клон.'

async function sendVoiceChoice(chatId: number, tgUserId: number) {
  const voices = await fetchUserVoices(tgUserId)
  await sendMessage(chatId, VOICE_PICKER_TEXT, {
    parse_mode: 'HTML',
    reply_markup: buildVoiceKeyboard(voices),
  })
}

async function editVoiceChoice(chatId: number, messageId: number, tgUserId: number) {
  const voices = await fetchUserVoices(tgUserId)
  await editMessageText(chatId, messageId, VOICE_PICKER_TEXT, {
    parse_mode: 'HTML',
    reply_markup: buildVoiceKeyboard(voices),
  })
}

async function dispatchPipeline(args: {
  chatId: number
  userTelegramId: number
  sourceUrl?: string | null
  competitorAccount?: string | null
  photoId: number
  voiceId?: string | null // ElevenLabs voice_id; null/undefined = HeyGen default
}) {
  const payload: Record<string, unknown> = {
    chat_id: args.chatId,
    user_telegram_id: args.userTelegramId,
    photo_id: args.photoId,
  }
  if (args.sourceUrl) payload.source_url = args.sourceUrl
  if (args.competitorAccount) payload.competitor_account = args.competitorAccount
  if (args.voiceId) payload.voice_id = args.voiceId

  let res: Response
  try {
    res = await fetch(VIRAL_DISPATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dispatch-secret': VIRAL_DISPATCH_SECRET },
      body: JSON.stringify(payload),
    })
  } catch (e: any) {
    await sendMessage(args.chatId, `⚠️ Не дотянулся до воркера: ${e?.message ?? 'network'}`)
    return
  }
  if (!res.ok) {
    const t = await res.text()
    await sendMessage(args.chatId, `⚠️ Воркер ответил ${res.status}: ${t.slice(0, 200)}`)
    return
  }
  await res.json().catch(() => ({}))
  await sendMessage(
    args.chatId,
    '🎬 Поставил в работу.\nКак только закончу, пришлю видео в этот чат.',
  )
}

async function fetchUserVoices(tgUserId: number): Promise<{ id: number; name: string; eleven_voice_id: string }[]> {
  if (!VIRAL_DISPATCH_SECRET) return []
  try {
    const res = await fetch(`${VIRAL_VOICES_URL}?tg=${tgUserId}`, {
      headers: { 'x-dispatch-secret': VIRAL_DISPATCH_SECRET },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { ok?: boolean; voices?: { id: number; name: string; eleven_voice_id: string }[] }
    return data.voices ?? []
  } catch {
    return []
  }
}

async function fetchUserPhotos(tgUserId: number): Promise<{ id: number; name: string }[]> {
  if (!VIRAL_DISPATCH_SECRET) return []
  try {
    const res = await fetch(`${VIRAL_PHOTOS_URL}?tg=${tgUserId}`, {
      headers: { 'x-dispatch-secret': VIRAL_DISPATCH_SECRET },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { ok?: boolean; photos?: { id: number; name: string }[] }
    return data.photos ?? []
  } catch {
    return []
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function handleStart(msg: TgMessage) {
  const from = msg.from
  if (!from) return

  const user = await getOrCreateUser({
    id: from.id,
    username: from.username,
    first_name: from.first_name,
  })

  const isPaid = user?.subscription_tier === 'pro' || user?.subscription_tier === 'team'

  const buttons: InlineKeyboardButton[][] = [
    [{ text: '🎬 Открыть приложение', web_app: { url: TMA_URL } }],
    [{ text: '📋 Меню функций', callback_data: 'feat:menu' }],
  ]

  if (!isPaid && user) {
    const payload: PaymentPayload = {
      user_id: user.id,
      tier: 'pro',
      days: PRO_SUBSCRIPTION_DAYS,
    }
    const link = await createInvoiceLink({
      title: `Transcribe Pro · ${PRO_SUBSCRIPTION_DAYS} дней`,
      description:
        'Безлимитные транскрипции, карусели для Instagram, Reels-сценарии и TG-посты. ' +
        `Доступ на ${PRO_SUBSCRIPTION_DAYS} дней.`,
      payload: JSON.stringify(payload),
      currency: 'XTR',
      prices: [{ label: `Pro · ${PRO_SUBSCRIPTION_DAYS} дней`, amount: STARS_PRICE_PRO }],
    })
    if (link) {
      buttons.push([
        { text: `⭐ Купить Pro · ${STARS_PRICE_PRO}⭐ / ${PRO_SUBSCRIPTION_DAYS} дней`, url: link },
      ])
    }
  }

  const greet = from.first_name ? `, ${from.first_name}` : ''
  const tail = isPaid
    ? '\n\n✓ У тебя активен Pro.'
    : '\n\nFree: 60 минут транскрибации в месяц. Pro — безлимит.'

  await sendMessage(
    msg.chat.id,
    `Привет${greet}! Я Транскрипция.\n\n` +
      'Вставь ссылку YouTube, Reels или TikTok — получишь:\n' +
      '• карусель Instagram (8 PNG 1080×1080)\n' +
      '• Reels-сценарий с hook + CTA\n' +
      '• TG-пост с живым тоном\n' +
      '• перевод на 50+ языков\n\n' +
      'Жми «Открыть приложение» или «Меню функций», чтобы выбрать инструмент.' +
      tail,
    { reply_markup: { inline_keyboard: buttons }, disable_web_page_preview: true },
  )
}

async function handlePreCheckout(q: TgPreCheckoutQuery) {
  if (q.currency !== 'XTR') {
    await answerPreCheckoutQuery(q.id, false, 'Только Telegram Stars поддерживаются.')
    return
  }

  let payload: PaymentPayload | null = null
  try {
    payload = JSON.parse(q.invoice_payload) as PaymentPayload
  } catch {}

  if (!payload?.user_id) {
    await answerPreCheckoutQuery(q.id, false, 'Невалидный payload. Открой /start заново.')
    return
  }

  const user = await getUserByTelegramId(q.from.id)
  if (!user || user.id !== payload.user_id) {
    await answerPreCheckoutQuery(q.id, false, 'Юзер не найден. Открой /start заново.')
    return
  }

  await answerPreCheckoutQuery(q.id, true)
}

async function handleSuccessfulPayment(msg: TgMessage) {
  const sp = msg.successful_payment!
  const from = msg.from
  if (!from) return

  const user = await getUserByTelegramId(from.id)
  if (!user) {
    console.error('[telegram/webhook] successful_payment for unknown user', from.id)
    return
  }

  let payload: PaymentPayload | null = null
  try {
    payload = JSON.parse(sp.invoice_payload) as PaymentPayload
  } catch {}

  const days = Math.max(1, Number(payload?.days) || PRO_SUBSCRIPTION_DAYS)
  const tier: UserTier = payload?.tier === 'team' ? 'team' : 'pro'

  await recordStarsPayment({
    userId: user.id,
    telegramPaymentChargeId: sp.telegram_payment_charge_id,
    providerPaymentChargeId: sp.provider_payment_charge_id || null,
    starsAmount: sp.total_amount,
    tier,
    daysGranted: days,
    payload,
  })

  const newExpires = await grantProDays(user.id, days)

  const expiresStr = newExpires
    ? new Date(newExpires).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

  await sendMessage(
    msg.chat.id,
    `✓ Pro активирован!\n\n` +
      `Безлимитные транскрипции и контент — до ${expiresStr}.\n\n` +
      `Открой приложение и поехали.`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: '🎬 Открыть приложение', web_app: { url: TMA_URL } }]],
      },
    },
  )
}
