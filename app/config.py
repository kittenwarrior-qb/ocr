from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/ocr_risk"

    # OCR provider: "nvidia" | "openrouter" | "auto" (dùng openrouter nếu có key, fallback nvidia)
    OCR_PROVIDER: str = "openrouter"
    # Số request OCR chạy song song — tăng nếu OpenRouter cho phép nhiều RPM hơn
    OCR_CONCURRENCY: int = 3

    # NVIDIA NIM (OpenAI-compatible)
    NVIDIA_API_KEY: str = ""
    NVIDIA_MODEL: str = "meta/llama-3.2-90b-vision-instruct"

    # OpenRouter — nhanh hơn NVIDIA, hỗ trợ Gemini Flash / nhiều model khác
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "google/gemini-2.5-flash"

    # MISA CRM Open API (crmconnect.misa.vn)
    APP_ID: str = ""
    MISA_CLIENT_SECRET: str = ""

    # External Email Gateway (crawls mailboxes, exposes /emails + /attachments)
    EMAIL_GATEWAY_URL: str = "https://email-gateway.longpt.io.vn/api"

    UPLOAD_DIR: str = "./uploads"
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    NOTIFICATION_EMAIL: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
