import os
from openai import OpenAI

# Railway 환경변수로 Azure/OpenAI 선택
USE_AZURE = os.getenv("USE_AZURE_OPENAI", "false").lower() == "true"

if USE_AZURE:
    # Azure OpenAI 설정
    print("=" * 50)
    print("[OpenAI Client] 🔵 Using Azure OpenAI")
    print(f"[OpenAI Client] Endpoint: {os.getenv('AZURE_OPENAI_ENDPOINT')}")
    print("=" * 50)
    client = OpenAI(
        base_url=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=os.getenv("AZURE_OPENAI_API_KEY")
    )
else:
    # 기존 OpenAI 설정
    print("=" * 50)
    print("[OpenAI Client] 🟢 Using OpenAI")
    print("=" * 50)
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY")
    )
