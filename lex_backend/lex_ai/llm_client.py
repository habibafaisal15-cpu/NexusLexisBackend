"""Local LLM client — Qwen via Ollama (OpenAI-compatible /api/chat)."""
import threading
import requests
from django.conf import settings

_ollama_lock = threading.Lock()


class LLMConnectionError(Exception):
    pass


def _chat_url() -> str:
    base = settings.LLM_BASE_URL.rstrip('/')
    return f"{base}/api/chat"


def chat_completion(
    messages: list,
    *,
    system: str | None = None,
    max_tokens: int = 1500,
    model: str | None = None,
    timeout: int | None = None,
) -> str:
    """
    Send a chat request to Ollama-hosted Qwen.
    messages: [{role, content}, ...] — user/assistant turns only unless system is omitted.
    """
    payload_messages = []
    if system:
        payload_messages.append({"role": "system", "content": system})
    payload_messages.extend(messages)

    body = {
        "model": model or settings.LLM_MODEL,
        "messages": payload_messages,
        "stream": False,
        "options": {"num_predict": max_tokens},
    }

    try:
        with _ollama_lock:
            response = requests.post(
                _chat_url(),
                json=body,
                timeout=timeout if timeout is not None else settings.LLM_TIMEOUT,
            )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise LLMConnectionError(str(exc)) from exc

    content = (data.get("message") or {}).get("content", "")
    if not str(content).strip():
        raise LLMConnectionError("LLM returned an empty response")
    return str(content).strip()


def check_ollama_health() -> dict:
    """Verify Ollama is running and the configured model is available."""
    base = settings.LLM_BASE_URL.rstrip('/')
    try:
        tags = requests.get(f"{base}/api/tags", timeout=5).json()
        names = [m.get("name", "") for m in tags.get("models", [])]
        model = settings.LLM_MODEL
        available = any(model in name or name.startswith(model.split(":")[0]) for name in names)
        return {"ok": True, "models": names, "configured_model": model, "model_available": available}
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc)}
