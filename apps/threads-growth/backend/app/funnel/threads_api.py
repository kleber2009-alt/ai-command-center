"""Публикатор Threads API для веток (официальный Graph API, graph.threads.net).

Цепочка из N постов: пост 1 публикуется (текст / картинка / карусель), каждый
следующий создаётся с reply_to_id предыдущего и публикуется через threads_publish.
Права приложения: threads_basic, threads_content_publish, threads_manage_replies,
threads_manage_insights. Лимиты: 500 символов на пост, 250 публикаций и 1000
ответов за 24 часа, картинка — JPEG/PNG по публичной ссылке до 8 МБ, карусель 2–20.
Токен живёт 60 дней — refresh_token() раз в неделю (крон `token`).
"""
from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field

from app.config import settings

MEDIA_METRICS = ("views", "likes", "replies", "reposts", "quotes", "shares")
POLL_INTERVAL = 3.0
POLL_TIMEOUT = 120.0


class ThreadsError(RuntimeError):
    pass


class ChainError(ThreadsError):
    """Цепочка опубликована не целиком: published — id уже вышедших постов."""

    def __init__(self, message: str, published: list[str]):
        super().__init__(message)
        self.published = published


def _host() -> str:
    """https://graph.threads.net (без версии) — для refresh_access_token."""
    base = settings.threads_api_base.rstrip("/")
    return base.rsplit("/v", 1)[0] if "/v" in base.split("//", 1)[-1] else base


@dataclass
class ThreadsAPI:
    access_token: str
    user_id: str
    base: str = field(default_factory=lambda: settings.threads_api_base)
    sleep: Callable[[float], None] = time.sleep   # подменяется в тестах

    def _http(self):
        import httpx

        return httpx.Client(base_url=self.base, timeout=60.0)

    def _req(self, method: str, path: str, params: dict) -> dict:
        with self._http() as h:
            r = h.request(method, path, params={**params, "access_token": self.access_token})
        try:
            body = r.json()
        except ValueError:
            body = {}
        if r.status_code >= 400 or "error" in body:
            err = body.get("error") or {}
            raise ThreadsError(f"{method} {path}: {err.get('message') or r.text[:300]}")
        return body

    # ── публикация ───────────────────────────────────────────────────────────
    def create_container(self, **params) -> str:
        return self._req("POST", f"/{self.user_id}/threads", params)["id"]

    def wait_ready(self, container_id: str) -> None:
        """Контейнер с медиа обрабатывается не сразу — ждём FINISHED перед публикацией."""
        waited = 0.0
        while True:
            st = self._req("GET", f"/{container_id}", {"fields": "status,error_message"})
            status = st.get("status")
            if status in (None, "FINISHED", "PUBLISHED"):
                return
            if status in ("ERROR", "EXPIRED"):
                raise ThreadsError(f"контейнер {container_id}: {status} {st.get('error_message', '')}")
            if waited >= POLL_TIMEOUT:
                raise ThreadsError(f"контейнер {container_id}: не готов за {POLL_TIMEOUT:.0f} с")
            self.sleep(POLL_INTERVAL)
            waited += POLL_INTERVAL

    def publish(self, container_id: str) -> str:
        return self._req("POST", f"/{self.user_id}/threads_publish", {"creation_id": container_id})["id"]

    def _first_post(self, text: str, image_urls: list[str]) -> str:
        if not image_urls:
            cid = self.create_container(media_type="TEXT", text=text)
        elif len(image_urls) == 1:
            cid = self.create_container(media_type="IMAGE", image_url=image_urls[0], text=text)
        else:
            children = []
            for url in image_urls[:20]:
                child = self.create_container(media_type="IMAGE", image_url=url, is_carousel_item="true")
                self.wait_ready(child)
                children.append(child)
            cid = self.create_container(media_type="CAROUSEL", children=",".join(children), text=text)
        self.wait_ready(cid)
        return self.publish(cid)

    def publish_chain(self, posts: list[str], image_urls: list[str] | None = None,
                      already: list[str] | None = None) -> list[str]:
        """Публикует ветку. already — id уже вышедших постов (продолжение после сбоя)."""
        for i, p in enumerate(posts, start=1):
            if len(p) > 500:
                raise ThreadsError(f"пост {i}/{len(posts)}: {len(p)} > 500 символов")
        published = list(already or [])
        try:
            if not published:
                published.append(self._first_post(posts[0], image_urls or []))
            for text in posts[len(published):]:
                cid = self.create_container(media_type="TEXT", text=text, reply_to_id=published[-1])
                self.wait_ready(cid)
                published.append(self.publish(cid))
        except ThreadsError as e:
            raise ChainError(str(e), published) from e
        return published

    def reply(self, text: str, reply_to_id: str) -> str:
        cid = self.create_container(media_type="TEXT", text=text[:500], reply_to_id=reply_to_id)
        self.wait_ready(cid)
        return self.publish(cid)

    def publishing_limit(self) -> dict:
        data = self._req("GET", f"/{self.user_id}/threads_publishing_limit",
                         {"fields": "quota_usage,config,reply_quota_usage,reply_config"}).get("data") or [{}]
        return data[0]

    def permalink(self, media_id: str) -> str | None:
        return self._req("GET", f"/{media_id}", {"fields": "permalink"}).get("permalink")

    # ── комментарии ──────────────────────────────────────────────────────────
    def conversation(self, media_id: str, limit_pages: int = 5) -> list[dict]:
        """Все ответы в ветке (плоско): id, text, username, timestamp, replied_to."""
        out: list[dict] = []
        params = {"fields": "id,text,username,timestamp,replied_to", "reverse": "false"}
        path = f"/{media_id}/conversation"
        for _ in range(limit_pages):
            body = self._req("GET", path, params)
            out.extend(body.get("data") or [])
            after = ((body.get("paging") or {}).get("cursors") or {}).get("after")
            if not after or not (body.get("paging") or {}).get("next"):
                break
            params = {**params, "after": after}
        return out

    # ── метрики ──────────────────────────────────────────────────────────────
    def media_insights(self, media_id: str) -> dict[str, int]:
        body = self._req("GET", f"/{media_id}/insights", {"metric": ",".join(MEDIA_METRICS)})
        out: dict[str, int] = {}
        for item in body.get("data") or []:
            values = item.get("values") or [{}]
            total = item.get("total_value") or {}
            out[item.get("name")] = int(total.get("value", values[0].get("value", 0)) or 0)
        return out

    def link_clicks(self, since: int, until: int) -> dict[str, int]:
        """Клики по каждой ссылке в постах за период (unix-секунды) → {url: клики}."""
        body = self._req("GET", f"/{self.user_id}/threads_insights",
                         {"metric": "clicks", "since": since, "until": until})
        out: dict[str, int] = {}
        for item in body.get("data") or []:
            for lv in item.get("link_total_values") or []:
                url = lv.get("link_url")
                if url:
                    out[url] = out.get(url, 0) + int(lv.get("value", 0) or 0)
        return out


def refresh_token(token: str) -> tuple[str, int]:
    """Продлевает долгоживущий токен (60 дней). Возвращает (новый токен, срок в секундах)."""
    import httpx

    r = httpx.get(f"{_host()}/refresh_access_token",
                  params={"grant_type": "th_refresh_token", "access_token": token}, timeout=30.0)
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "access_token" not in body:
        raise ThreadsError(f"refresh_access_token: {(body.get('error') or {}).get('message') or r.text[:300]}")
    return body["access_token"], int(body.get("expires_in", 0) or 0)
