from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str
    BOT_TOKEN: str
    JWT_SECRET: str

    APP_URL: str = ""
    WEBAPP_DEEPLINK: str = ""
    CORS_ORIGIN: str = ""
    LOG_LEVEL: str = "info"

settings = Settings()
