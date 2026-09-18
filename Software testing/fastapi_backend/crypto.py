"""Symmetric encryption for stored test credentials.

CREDENTIAL_ENCRYPTION_KEY must be a urlsafe-base64 32-byte key, e.g. generated with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

import os
from cryptography.fernet import Fernet, InvalidToken

_KEY = os.getenv("CREDENTIAL_ENCRYPTION_KEY", "").strip()
_fernet = Fernet(_KEY.encode()) if _KEY else None


def credentials_configured() -> bool:
    return _fernet is not None


def encrypt_value(value: str) -> str:
    if not _fernet:
        raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY is not configured")
    return _fernet.encrypt(value.encode()).decode()


def decrypt_value(token: str) -> str:
    if not _fernet:
        raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY is not configured")
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Stored credential could not be decrypted") from exc


def mask_secrets(text: str, secret_values: list[str]) -> str:
    """Replace any occurrence of a resolved secret value with *** before the
    text is persisted or sent anywhere (step results, error messages, logs)."""
    if not text:
        return text
    masked = text
    for value in secret_values:
        if value:
            masked = masked.replace(value, "***")
    return masked
