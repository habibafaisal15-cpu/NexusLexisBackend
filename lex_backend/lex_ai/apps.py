from django.apps import AppConfig


class LexAiConfig(AppConfig):
    name = 'lex_ai'

    def ready(self):
        # Warm the Excel question-bank cache so first chat is not slow
        import threading

        def _warm_cache():
            try:
                from .services import get_optimized_rag_matrix
                get_optimized_rag_matrix()
            except Exception as exc:
                print(f"[lex_ai] RAG cache warm-up skipped: {exc}")

        def _warm_llm():
            from django.conf import settings as django_settings
            if (getattr(django_settings, 'LLM_PROVIDER', 'gemini') or 'gemini').lower() != 'ollama':
                return
            import time
            time.sleep(15)
            try:
                from .llm_client import check_ollama_health, chat_completion
                health = check_ollama_health()
                if not health.get("ok") or not health.get("model_available"):
                    return
                chat_completion(
                    [{"role": "user", "content": "hi"}],
                    max_tokens=1,
                    timeout=120,
                )
                print("[lex_ai] Ollama model pre-loaded")
            except Exception as exc:
                print(f"[lex_ai] Ollama warm-up skipped: {exc}")

        threading.Thread(target=_warm_cache, daemon=True).start()
        threading.Thread(target=_warm_llm, daemon=True).start()
