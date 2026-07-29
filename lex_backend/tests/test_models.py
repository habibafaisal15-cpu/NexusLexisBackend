"""Verify Ollama + Qwen are available for LEX AI."""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.conf import settings
from lex_ai.llm_client import check_ollama_health, chat_completion

print(f"LLM base URL: {settings.LLM_BASE_URL}")
print(f"LLM model:    {settings.LLM_MODEL}")

health = check_ollama_health()
if not health.get("ok"):
    print("\n--- OLLAMA NOT REACHABLE ---")
    print(health.get("error"))
    print("\nInstall Ollama from https://ollama.com then run:")
    print(f"  ollama pull {settings.LLM_MODEL}")
    raise SystemExit(1)

print("\n--- OLLAMA MODELS ---")
for name in health.get("models", []):
    print(f"  - {name}")

if not health.get("model_available"):
    print(f"\nWARNING: {settings.LLM_MODEL} not found. Run:")
    print(f"  ollama pull {settings.LLM_MODEL}")
    raise SystemExit(1)

print("\n--- TEST CHAT ---")
reply = chat_completion(
    [{"role": "user", "content": "Reply with exactly: LEX OK"}],
    max_tokens=20,
)
print(f"Response: {reply}")
print("\n--- SUCCESS ---")
