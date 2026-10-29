"""Статистика Telegram-каналов автора: какая бесплатная польза реально зашла.

Ветки Threads ведут только на то, что лежит в канале. Чтобы вести на лучшее,
раз в день (вместе с задачей `research`) снимаем посты каналов и считаем, какие
отработали сильнее обычного:

- публичный канал (@username) — веб-превью t.me/s/<username>: просмотры и реакции,
  без ключей;
- закрытый канал (-100…) — через Telegram-аккаунт автора (Telethon, TG_API_ID /
  TG_API_HASH / TG_SESSION): просмотры, реакции, репосты, комментарии.

Сила поста относительная, как во всём приложении: score = среднее из
«просмотры / медиана канала» и «вовлечённость на просмотр / медиана канала».
Вовлечённость = реакции + 2·комментарии + 3·репосты (репост — «сохранил и
поделился», самый сильный сигнал пользы). Посты моложе 3 суток не оцениваем —
просмотры ещё набираются.

Источники — CHANNEL_STATS_SOURCES: «ai_razbory,-1001843525349».
Вход в Telegram один раз (QR):  docker compose run --rm -it api python -m app.funnel.channel login
Проверка чистой логики:     python -m app.funnel.channel
"""
from __future__ import annotations

import html
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import median

from app.config import settings

log = logging.getLogger("funnel.channel")

MIN_AGE = timedelta(days=3)       # моложе — просмотры ещё набираются
MIN_TEXT = 40                     # короче — подпись к альбому, а не пост


@dataclass
class ChannelPost:
    source: str                   # username или -100… — как в CHANNEL_STATS_SOURCES
    msg_id: int
    url: str
    text: str
    posted_at: datetime | None
    views: int = 0
    reactions: int = 0
    forwards: int = 0
    replies: int = 0

    @property
    def engagement(self) -> int:
        return self.reactions + 2 * self.replies + 3 * self.forwards


def sources() -> list[str]:
    return [s.strip().lstrip("@") for s in settings.channel_stats_sources.split(",") if s.strip()]


def links() -> dict[str, str]:
    """Канал → ссылка подписки из CHANNEL_LINKS («-100…=https://t.me/+…,name=https://t.me/name»)."""
    out = {}
    for part in settings.channel_links.split(","):
        key, _, url = part.partition("=")
        if key.strip() and url.strip():
            out[key.strip().lstrip("@")] = url.strip()
    return out


def subscribe_link(post_url_: str | None) -> str | None:
    """Ссылка подписки на тот канал, где лежит пост с материалом."""
    key = parse_url(post_url_ or "")
    return links().get(key[0]) if key else None


def is_private(source: str) -> bool:
    return source.lstrip("-").isdigit()


def post_url(source: str, msg_id: int) -> str:
    if is_private(source):
        bare = source[4:] if source.startswith("-100") else source.lstrip("-")
        return f"https://t.me/c/{bare}/{msg_id}"
    return f"https://t.me/{source}/{msg_id}"


def parse_url(url: str) -> tuple[str, int] | None:
    """t.me/c/123/45 → ('-100123', 45); t.me/name/45 → ('name', 45)."""
    m = re.search(r"t\.me/c/(\d+)/(\d+)", url or "")
    if m:
        return f"-100{m.group(1)}", int(m.group(2))
    m = re.search(r"t\.me/(?:s/)?([A-Za-z0-9_]{4,})/(\d+)", url or "")
    if m:
        return m.group(1), int(m.group(2))
    return None


# ── Публичный канал: веб-превью ──────────────────────────────────────────────
def _count(s: str) -> int:
    s = (s or "").strip().replace(",", ".").upper()
    mult = 1
    if s.endswith("K"):
        mult, s = 1_000, s[:-1]
    elif s.endswith("M"):
        mult, s = 1_000_000, s[:-1]
    try:
        return int(float(s) * mult)
    except ValueError:
        return 0


def _plain(fragment: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", fragment)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


_POST_RE = re.compile(r'data-post="([^"/]+)/(\d+)"')


def parse_preview(page: str) -> list[ChannelPost]:
    """HTML t.me/s/<username> → посты (текст, просмотры, реакции, дата)."""
    out: list[ChannelPost] = []
    starts = [(m.start(), m.group(1), int(m.group(2))) for m in _POST_RE.finditer(page)]
    for i, (pos, username, msg_id) in enumerate(starts):
        block = page[pos: starts[i + 1][0] if i + 1 < len(starts) else len(page)]
        texts = re.findall(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', block, re.S)
        text = "\n".join(_plain(t) for t in texts).strip()
        views = re.search(r'tgme_widget_message_views">([^<]*)<', block)
        when = re.search(r'<time datetime="([^"]+)"', block)
        reactions = sum(_count(n) for n in re.findall(r'class="tgme_reaction[^"]*">.*?</i>([^<]*)</span>', block, re.S))
        posted = None
        if when:
            try:
                posted = datetime.fromisoformat(when.group(1)).astimezone(timezone.utc)
            except ValueError:
                posted = None
        out.append(ChannelPost(source=username, msg_id=msg_id, url=post_url(username, msg_id), text=text,
                               posted_at=posted, views=_count(views.group(1)) if views else 0,
                               reactions=reactions))
    return out


def fetch_public(username: str, limit: int = 300) -> list[ChannelPost]:
    import httpx

    posts: dict[int, ChannelPost] = {}
    before: int | None = None
    with httpx.Client(timeout=30.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
        while len(posts) < limit:
            r = client.get(f"https://t.me/s/{username}", params={"before": before} if before else None)
            r.raise_for_status()
            page = [p for p in parse_preview(r.text) if p.msg_id not in posts]
            if not page:
                break
            for p in page:
                p.source = username
                posts[p.msg_id] = p
            before = min(p.msg_id for p in page)
            if before <= 1:
                break
    return sorted(posts.values(), key=lambda p: p.msg_id)


# ── Закрытый канал: аккаунт автора через Telethon ────────────────────────────
def private_ready() -> bool:
    return bool(settings.tg_api_id and settings.tg_api_hash and settings.tg_session)


def fetch_private(channel_id: str, limit: int = 300) -> list[ChannelPost]:
    if not private_ready():
        raise RuntimeError("закрытый канал: нет TG_API_ID / TG_API_HASH / TG_SESSION — "
                           "выполните `python -m app.funnel.channel login`")
    from telethon.sessions import StringSession
    from telethon.sync import TelegramClient

    out: list[ChannelPost] = []
    with TelegramClient(StringSession(settings.tg_session), settings.tg_api_id, settings.tg_api_hash) as client:
        try:
            entity = client.get_entity(int(channel_id))
        except ValueError:
            client.get_dialogs()            # канала нет в кеше сессии — подгружаем диалоги
            entity = client.get_entity(int(channel_id))
        for m in client.iter_messages(entity, limit=limit):
            text = m.message or ""
            reactions = sum(r.count for r in (m.reactions.results if m.reactions else []))
            out.append(ChannelPost(
                source=channel_id, msg_id=m.id, url=post_url(channel_id, m.id), text=text,
                posted_at=m.date.astimezone(timezone.utc) if m.date else None,
                views=m.views or 0, reactions=reactions, forwards=m.forwards or 0,
                replies=(m.replies.replies if m.replies else 0)))
    return sorted(out, key=lambda p: p.msg_id)


def fetch(source: str, limit: int | None = None) -> list[ChannelPost]:
    limit = limit or settings.channel_stats_limit
    return fetch_private(source, limit) if is_private(source) else fetch_public(source, limit)


# ── Оценка ───────────────────────────────────────────────────────────────────
def score(posts: list[ChannelPost], now: datetime | None = None) -> dict[int, float | None]:
    """msg_id → сила поста относительно своего канала (1.0 — обычный пост).
    None — пост моложе 3 суток или без текста/просмотров."""
    now = now or datetime.now(timezone.utc)
    ripe = [p for p in posts if p.views > 0 and len(p.text) >= MIN_TEXT
            and (p.posted_at is None or now - p.posted_at >= MIN_AGE)]
    out: dict[int, float | None] = {p.msg_id: None for p in posts}
    if not ripe:
        return out
    med_views = median(p.views for p in ripe) or 1
    rates = [p.engagement / p.views for p in ripe]
    med_rate = median(rates) or None
    for p, rate in zip(ripe, rates):
        views_xn = p.views / med_views
        eng_xn = rate / med_rate if med_rate else views_xn
        out[p.msg_id] = round(0.5 * views_xn + 0.5 * eng_xn, 2)
    return out


def human(n: int) -> str:
    return f"{n / 1000:.1f}K".replace(".0K", "K") if n >= 1000 else str(n)


# ── Вход в Telegram (один раз) ───────────────────────────────────────────────
def login(qr: bool = True) -> None:
    """Вход в Telegram один раз. По умолчанию — QR-кодом (Telegram → Настройки →
    Устройства → Подключить устройство): код в чат не нужен. `login code` — по коду."""
    if not (settings.tg_api_id and settings.tg_api_hash):
        raise SystemExit("Сначала TG_API_ID и TG_API_HASH в .env (my.telegram.org → API development tools).")
    from telethon.errors import SessionPasswordNeededError
    from telethon.sessions import StringSession
    from telethon.sync import TelegramClient

    client = TelegramClient(StringSession(), settings.tg_api_id, settings.tg_api_hash)
    client.connect()
    try:
        if qr:
            while True:
                q = client.qr_login()
                _print_qr(q.url)
                print("Телефон: Telegram → Настройки → Устройства → «Подключить устройство» и наведите камеру "
                      "на QR выше. Код обновляется раз в 30 секунд.")
                try:
                    client.loop.run_until_complete(q.wait(timeout=30))   # QRLogin telethon.sync не оборачивает
                    break
                except SessionPasswordNeededError:
                    _password(client)
                    break
                except TimeoutError:
                    print("\nНе успели — показываю новый QR.\n")
        else:
            client.start()
        me = client.get_me()
        session = client.session.save()
    finally:
        client.disconnect()
    print(f"\nВошли как {me.first_name} (@{me.username}). Добавьте в .env одну строку:\n\nTG_SESSION={session}\n\n"
          "Эта строка = доступ к вашему Telegram: не пересылайте её никому.")


def _password(client) -> None:
    """Облачный пароль Telegram: 3 попытки, с подсказкой, без нового QR."""
    import getpass

    from telethon.errors import PasswordHashInvalidError
    from telethon.tl.functions.account import GetPasswordRequest

    try:
        hint = client(GetPasswordRequest()).hint
    except Exception:  # noqa: BLE001 — подсказка не обязательна
        hint = None
    print("\nВключена двухэтапная проверка: нужен облачный пароль Telegram "
          "(Настройки → Конфиденциальность → Облачный пароль)." + (f" Подсказка: {hint}" if hint else ""))
    print("Проверьте раскладку (EN/RU) и Caps Lock: при вводе ничего не видно — так и должно быть.")
    for left in (2, 1, 0):
        pwd = getpass.getpass("Пароль (ввод скрыт): ").strip("\r\n")
        try:
            client.sign_in(password=pwd)
            return
        except PasswordHashInvalidError:
            if not left:
                raise SystemExit("Пароль не подошёл. Если забыли — восстановите его в Telegram и запустите вход снова.")
            print(f"Пароль не подошёл, осталось попыток: {left}.")


def _print_qr(url: str) -> None:
    try:
        import qrcode

        q = qrcode.QRCode(border=2)
        q.add_data(url)
        q.make(fit=True)
        q.print_ascii(invert=True)
    except ImportError:
        print(f"QR-ссылка (откройте в генераторе QR): {url}")


def _selftest() -> None:
    page = (
        '<div data-post="ai_razbory/10"><div class="tgme_widget_message_text js-message_text" dir="auto">'
        'Скилл <b>маркетинг</b>&#33;<br/>Забирайте архив в комментариях — там PDF и сам скилл.</div>'
        '<div class="tgme_widget_message_reactions"><span class="tgme_reaction"><i class="emoji"><b>❤</b></i>14</span>'
        '<span class="tgme_reaction"><i class="emoji"><b>🔥</b></i>1.2K</span></div>'
        '<span class="tgme_widget_message_views">2.19K</span><time datetime="2026-07-31T15:56:09+00:00"></time></div>'
        '<div data-post="ai_razbory/11"><span class="tgme_widget_message_views">900</span></div>'
    )
    posts = parse_preview(page)
    assert [p.msg_id for p in posts] == [10, 11]
    assert posts[0].views == 2190 and posts[0].reactions == 1214 and posts[0].text.startswith("Скилл маркетинг!\n")
    assert posts[0].url == "https://t.me/ai_razbory/10" and posts[0].posted_at.year == 2026
    assert parse_url("https://t.me/c/1843525349/2601") == ("-1001843525349", 2601)
    assert parse_url("https://t.me/ai_razbory/205") == ("ai_razbory", 205)
    assert post_url("-1001843525349", 7) == "https://t.me/c/1843525349/7"
    now = datetime(2026, 10, 29, tzinfo=timezone.utc)
    old = now - timedelta(days=10)
    long = "x" * 60
    ps = [ChannelPost("c", i, "", long, old, views=1000, reactions=10) for i in range(4)]
    ps += [ChannelPost("c", 9, "", long, old, views=3000, reactions=90, forwards=20),
           ChannelPost("c", 10, "", long, now - timedelta(hours=5), views=50)]
    sc = score(ps, now)
    assert sc[0] == 1.0 and sc[9] > 3 and sc[10] is None, sc
    assert human(2190) == "2.2K" and human(900) == "900"
    assert subscribe_link("https://t.me/c/1843525349/2601") == "https://t.me/+xP6G7c04QRZiY2My"
    assert subscribe_link("https://t.me/ai_razbory/205") == "https://t.me/ai_razbory"
    assert subscribe_link("https://t.me/other/1") is None and subscribe_link(None) is None
    print("channel selftest OK")


if __name__ == "__main__":
    import sys

    if sys.argv[1:2] == ["login"]:
        login(qr=sys.argv[2:3] != ["code"])
    else:
        _selftest()
