import time
import secrets
import logging
import threading
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class InMemoryCache:
    """
    Thread-safe TTL cache with self-pruning dictionary storage.
    """
    def __init__(self):
        self._store: Dict[str, tuple] = {}  # {key: (value, expires_at)}
        self._lock = threading.Lock()

    def set(self, key: str, value: dict, ttl: int):
        with self._lock:
            now = time.time()
            # Self-prune expired keys during insertions to prevent memory bloat
            expired = [k for k, v in self._store.items() if now > v[1]]
            for k in expired:
                try:
                    del self._store[k]
                except KeyError:
                    pass
            self._store[key] = (value, now + ttl)

    def get(self, key: str) -> Optional[dict]:
        with self._lock:
            data = self._store.get(key)
            if not data:
                return None
            val, expires_at = data
            if time.time() > expires_at:
                try:
                    del self._store[key]
                except KeyError:
                    pass
                return None
            return val

    def delete(self, key: str):
        with self._lock:
            if key in self._store:
                try:
                    del self._store[key]
                except KeyError:
                    pass


# Dynamic Redis Cache with local fallback
class CacheService:
    def __init__(self):
        self.in_memory = InMemoryCache()
        self.redis_client = None
        
        try:
            import redis
            # Retrieve Redis URL if configured, otherwise default to localhost
            # We construct a client but evaluate connection lazily
            self.redis_client = redis.Redis(
                host="localhost",
                port=6379,
                db=0,
                socket_timeout=2.0,
                decode_responses=True
            )
            # Ping test
            self.redis_client.ping()
            logger.info("CacheService: Successfully connected to Redis.")
        except Exception:
            logger.info("CacheService: Redis not available. Falling back to thread-safe InMemoryCache.")
            self.redis_client = None

    def set_otp(self, employee_code: str, pin: str, ttl: int = 300):
        key = f"handover_otp:{employee_code}"
        data = {"pin": pin, "attempts": 0}
        
        if self.redis_client:
            try:
                import json
                self.redis_client.set(key, json.dumps(data), ex=ttl)
                return
            except Exception as e:
                logger.error(f"CacheService Redis set error: {e}. Writing to InMemoryCache.")
        
        self.in_memory.set(key, data, ttl)

    def get_otp(self, employee_code: str) -> Optional[dict]:
        key = f"handover_otp:{employee_code}"
        
        if self.redis_client:
            try:
                import json
                raw = self.redis_client.get(key)
                if raw:
                    return json.loads(raw)
                return None
            except Exception as e:
                logger.error(f"CacheService Redis get error: {e}. Reading from InMemoryCache.")
                
        return self.in_memory.get(key)

    def update_otp(self, employee_code: str, data: dict, ttl: int = 300):
        key = f"handover_otp:{employee_code}"
        
        if self.redis_client:
            try:
                import json
                self.redis_client.set(key, json.dumps(data), ex=ttl)
                return
            except Exception as e:
                logger.error(f"CacheService Redis update error: {e}. Writing to InMemoryCache.")
                
        self.in_memory.set(key, data, ttl)

    def delete_otp(self, employee_code: str):
        key = f"handover_otp:{employee_code}"
        
        if self.redis_client:
            try:
                self.redis_client.delete(key)
                return
            except Exception as e:
                logger.error(f"CacheService Redis delete error: {e}. Deleting from InMemoryCache.")
                
        self.in_memory.delete(key)


# Global singleton instance
cache_service = CacheService()
