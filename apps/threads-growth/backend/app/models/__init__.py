"""Реэкспорт всех моделей. Импорт этого пакета регистрирует таблицы в Base.metadata
(нужно Alembic autogenerate и create_all)."""
from app.models.account import Account
from app.models.competitor import Competitor
from app.models.content_pattern import ContentPattern
from app.models.follower_snapshot import FollowerSnapshot
from app.models.generated_content import GeneratedContent
from app.models.post_analytics import PostAnalytics
from app.models.published_post import PublishedPost
from app.models.reply import Reply
from app.models.reply_target import ReplyTarget
from app.models.viral_post import ViralPost

__all__ = [
    "Account",
    "Competitor",
    "ContentPattern",
    "FollowerSnapshot",
    "GeneratedContent",
    "PostAnalytics",
    "PublishedPost",
    "Reply",
    "ReplyTarget",
    "ViralPost",
]
