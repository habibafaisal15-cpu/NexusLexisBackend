"""LLM client — Google Gemini (cloud) or Qwen via Ollama (local).

Set LLM_PROVIDER=gemini for production (no Ollama required).
Set LLM_PROVIDER=ollama for local dev with Ollama.
"""
import threading
import requests
from django.conf import settings

_ollama_lock = threading.Lock()


class LLMConnectionError(Exception):
    pass


def _provider() -> str:
    return (getattr(settings, 'LLM_PROVIDER', None) or 'gemini').strip().lower()


# ─── Gemini ──────────────────────────────────────────────────────────────────

def _gemini_generate_url(model: str) -> str:
    model_id = model or settings.GEMINI_MODEL
    return (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_id}:generateContent"
    )


def _messages_to_gemini_contents(messages: list) -> list:
    contents = []
    for msg in messages:
        role = msg.get("role", "user")
        if role == "assistant":
            role = "model"
        if role not in ("user", "model"):
            continue
        text = str(msg.get("content") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})
    return contents


def _chat_completion_gemini(
    messages: list,
    *,
    system: str | None = None,
    max_tokens: int = 1500,
    model: str | None = None,
    timeout: int | None = None,
) -> str:
    api_key = getattr(settings, 'GEMINI_API_KEY', '') or ''
    if not api_key:
        raise LLMConnectionError('GEMINI_API_KEY is not set')

    body = {
        "contents": _messages_to_gemini_contents(messages),
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.7,
        },
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    try:
        response = requests.post(
            _gemini_generate_url(model),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            json=body,
            timeout=timeout if timeout is not None else settings.LLM_GENERATION_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        resp = getattr(exc, 'response', None)
        detail = resp.text if resp is not None else str(exc)
        raise LLMConnectionError(detail or str(exc)) from exc

    candidates = data.get("candidates") or []
    if not candidates:
        block = (data.get("promptFeedback") or {}).get("blockReason")
        raise LLMConnectionError(block or "Gemini returned no candidates")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise LLMConnectionError("Gemini returned an empty response")
    return text


def check_gemini_health() -> dict:
    api_key = getattr(settings, 'GEMINI_API_KEY', '') or ''
    if not api_key:
        return {"ok": False, "error": "GEMINI_API_KEY not configured", "provider": "gemini"}

    model = settings.GEMINI_MODEL
    try:
        response = requests.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": api_key},
            params={"pageSize": 100},
            timeout=10,
        )
        if response.status_code == 401:
            return {"ok": False, "error": "Invalid GEMINI_API_KEY", "provider": "gemini"}
        response.raise_for_status()
        names = [m.get("name", "").split("/")[-1] for m in response.json().get("models", [])]
        available = any(model in name for name in names)
        return {
            "ok": True,
            "provider": "gemini",
            "configured_model": model,
            "model_available": available,
        }
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc), "provider": "gemini"}


# ─── Ollama ──────────────────────────────────────────────────────────────────

def _ollama_chat_url() -> str:
    base = settings.LLM_BASE_URL.rstrip('/')
    return f"{base}/api/chat"


def _chat_completion_ollama(
    messages: list,
    *,
    system: str | None = None,
    max_tokens: int = 1500,
    model: str | None = None,
    timeout: int | None = None,
) -> str:
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
                _ollama_chat_url(),
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
    base = settings.LLM_BASE_URL.rstrip('/')
    try:
        tags = requests.get(f"{base}/api/tags", timeout=5).json()
        names = [m.get("name", "") for m in tags.get("models", [])]
        model = settings.LLM_MODEL
        available = any(model in name or name.startswith(model.split(":")[0]) for name in names)
        return {
            "ok": True,
            "provider": "ollama",
            "models": names,
            "configured_model": model,
            "model_available": available,
        }
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc), "provider": "ollama"}


# ─── Public API ──────────────────────────────────────────────────────────────

def chat_completion(
    messages: list,
    *,
    system: str | None = None,
    max_tokens: int = 1500,
    model: str | None = None,
    timeout: int | None = None,
) -> str:
    if _provider() == "ollama":
        return _chat_completion_ollama(
            messages,
            system=system,
            max_tokens=max_tokens,
            model=model or settings.LLM_MODEL,
            timeout=timeout,
        )
    return _chat_completion_gemini(
        messages,
        system=system,
        max_tokens=max_tokens,
        model=model or settings.GEMINI_MODEL,
        timeout=timeout,
    )


def check_llm_health() -> dict:
    if _provider() == "ollama":
        return check_ollama_health()
    return check_gemini_health()
