import os
from openai import OpenAI, AzureOpenAI

# Railway 환경변수로 Azure/OpenAI 선택
USE_AZURE = os.getenv("USE_AZURE_OPENAI", "false").lower() == "true"

if USE_AZURE:
    # Azure OpenAI 설정 (정식 SDK 방식)
    print("=" * 50)
    print("[OpenAI Client] 🔵 Using Azure OpenAI")
    print(f"[OpenAI Client] Endpoint: {os.getenv('AZURE_OPENAI_ENDPOINT')}")
    print(f"[OpenAI Client] API Version: {os.getenv('AZURE_OPENAI_API_VERSION', '2024-02-15-preview')}")
    print("=" * 50)
    client = AzureOpenAI(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-01-preview")
    )
else:
    # 기존 OpenAI 설정
    print("=" * 50)
    print("[OpenAI Client] 🟢 Using OpenAI")
    print("=" * 50)
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY")
    )
