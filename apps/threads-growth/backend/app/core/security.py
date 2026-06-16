"""Шифрование секретов аккаунтов (§13: access_token[encrypted], §риски: pgcrypto/Vault).

Симметричное шифрование Fernet (AES-128-CBC + HMAC). Ключ — TOKEN_ENCRYPTION_KEY
из окружения. Без ключа encrypt/decrypt падают явно, а не молча хранят открытый токен.
"""
from __future__ import annotations

from functools import lru_cache

from app.config import settings


@lru_cache
def _fernet():
    if not settings.token_encryption_key:
        raise RuntimeError(
            "TOKEN_ENCRYPTION_KEY не задан. Сгенерируй: "
            'python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"'
        )
    from cryptography.fernet import Fernet

    return Fernet(settings.token_encryption_key.encode())


def encrypt_token(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    return _fernet().decrypt(ciphertext.encode()).decode()
