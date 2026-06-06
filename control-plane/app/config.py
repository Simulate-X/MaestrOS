from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    # Scheduler
    SCHEDULER_TICK_INTERVAL: int = 5    # saniye, her tick arasi
    SCHEDULER_MAX_CONCURRENT: int = 4   # paralel wake tavani
    LEASE_TIMEOUT_SECONDS: int = 600    # 10 dk → orphan reclaim esigi

    # Faz 4.1: cloud adapter API keys (SecretStr — repr'de maskelenir)
    ANTHROPIC_API_KEY: SecretStr | None = None   # null → adapter çağrısı reddedilir
    OPENROUTER_API_KEY: SecretStr | None = None

    # Faz 5: CEO autonomous model swap feature flag
    # False (default) → max_reworks aşıldığında mevcut davranış (insan bloğu) korunur
    # True → CEO önce adjudicate eder, başarısızlık sonrası insana iletir
    CEO_AUTONOMOUS_SWAP: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
