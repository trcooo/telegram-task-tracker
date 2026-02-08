from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = Field(default="")
    BOT_TOKEN: str = Field(default="")
    JWT_SECRET: str = Field(default="dev_change_me_to_random_32+chars")

    APP_URL: str = ""
    CORS_ORIGIN: str = ""
    LOG_LEVEL: str = "info"

settings = Settings()
