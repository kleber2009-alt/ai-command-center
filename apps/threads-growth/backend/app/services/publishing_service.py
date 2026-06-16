"""Publishing Engine — Threads Graph API (§10).

Двухшаговая публикация: create container → publish. Публикуем ТОЛЬКО при
approved (на MVP — без исключений, гейт в воркере/эндпоинте). httpx ленивый.

Поддержка: текстовый пост, пост с картинкой, цепочка-тред, реплай.
Токен аккаунта расшифровывается через core.security перед вызовом.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import decrypt_token
from app.models.account import Account
from app.models.generated_content import GeneratedContent
from app.models.published_post import PublishedPost
from app.models.reply import Reply
from app.models.reply_target import ReplyTarget


@dataclass
class ThreadsClient:
    access_token: str
    user_id: str

    def _http(self):
        import httpx

        return httpx.Client(base_url=settings.threads_api_base, timeout=30.0)

    def _publish(self, params: dict) -> str:
        with self._http() as h:
            r = h.post(f"/{self.user_id}/threads", params={**params, "access_token": self.access_token})
            r.raise_for_status()
            creation_id = r.json()["id"]
            r2 = h.post(f"/{self.user_id}/threads_publish",
                        params={"creation_id": creation_id, "access_token": self.access_token})
            r2.raise_for_status()
            return r2.json()["id"]

    def publish_text_post(self, text: str) -> str:
        if len(text) > 500:
            raise ValueError(f"Пост {len(text)}>500 символов (§2).")
        return self._publish({"media_type": "TEXT", "text": text})

    def publish_image_post(self, text: str, image_url: str) -> str:
        return self._publish({"media_type": "IMAGE", "text": text, "image_url": image_url})

    def publish_reply(self, text: str, reply_to_id: str) -> str:
        return self._publish({"media_type": "TEXT", "text": text, "reply_to_id": reply_to_id})


def _client_for(account: Account) -> ThreadsClient:
    token = decrypt_token(account.access_token or "")
    if not token or not account.threads_user_id:
        raise RuntimeError(f"Аккаунт {account.handle}: нет threads_user_id/access_token.")
    return ThreadsClient(access_token=token, user_id=account.threads_user_id)


def publish_content(db: Session, content_id: int) -> PublishedPost:
    """Публикует одобренный generated_content. Жёсткий гейт: только approved (§10)."""
    gc = db.get(GeneratedContent, content_id)
    if gc is None:
        raise RuntimeError("Контент не найден.")
    if gc.status not in ("approved", "scheduled"):
        raise RuntimeError(f"Публикация запрещена: статус '{gc.status}', нужен 'approved' (§10).")
    account = db.get(Account, gc.account_id)
    if account is None:
        raise RuntimeError("Аккаунт не найден.")

    try:
        media_id = _client_for(account).publish_text_post(gc.content or "")
    except Exception as e:  # noqa: BLE001
        gc.status = "failed"
        db.flush()
        raise RuntimeError(f"Публикация упала: {e}") from e

    gc.status = "published"
    pub = PublishedPost(
        generated_content_id=gc.id, account_id=account.id, threads_post_id=media_id,
        content=gc.content, source="generated", status="published",
    )
    db.add(pub)
    db.flush()
    return pub


def publish_reply(db: Session, reply_id: int) -> PublishedPost:
    """Публикует одобренный реплай через reply_to_id цели (§9)."""
    reply = db.get(Reply, reply_id)
    if reply is None:
        raise RuntimeError("Реплай не найден.")
    if reply.status not in ("approved", "draft"):  # на прогреве draft→approved; после — авто
        raise RuntimeError(f"Реплай в статусе '{reply.status}' нельзя публиковать.")
    account = db.get(Account, reply.account_id)
    target = db.get(ReplyTarget, reply.target_id)
    if account is None or target is None:
        raise RuntimeError("Нет аккаунта или цели реплая.")

    try:
        media_id = _client_for(account).publish_reply(reply.text or "", target.external_id)
    except Exception as e:  # noqa: BLE001
        reply.status = "failed"
        db.flush()
        raise RuntimeError(f"Реплай не опубликован: {e}") from e

    reply.status = "published"
    reply.threads_media_id = media_id
    target.status = "replied"
    pub = PublishedPost(
        account_id=account.id, threads_post_id=media_id, content=reply.text,
        source="reply", status="published",
    )
    db.add(pub)
    db.flush()
    return pub
