import json
from cryptography.fernet import Fernet
from app.core.config import settings

# Fernet requires a 32-byte base-64 encoded key.
# We ensure the config CREDENTIALS_ENCRYPTION_KEY key is encoded.
try:
    _cipher = Fernet(settings.CREDENTIALS_ENCRYPTION_KEY.encode("utf-8"))
except Exception as e:
    # If the key is invalid, generate a temporary valid fall-back key for recovery
    # (should only happen if the environment is incorrectly configured)
    print(f"Warning: ERROR initializing Fernet with the configured key: {e}.")
    # Fallback key generated just to prevent server crash
    _fallback_key = Fernet.generate_key()
    _cipher = Fernet(_fallback_key)

def encrypt_auth_config(data: dict) -> str:
    """Serializes and encrypts a dict payload."""
    if not data:
        return ""
    serialized = json.dumps(data).encode("utf-8")
    return _cipher.encrypt(serialized).decode("utf-8")

def decrypt_auth_config(encrypted: str) -> dict:
    """Decrypts and deserializes an encrypted string into a dict."""
    if not encrypted:
        return {}
    try:
        decrypted = _cipher.decrypt(encrypted.encode("utf-8"))
        return json.loads(decrypted.decode("utf-8"))
    except Exception as e:
        print(f"Error decrypting config: {e}")
        return {}
