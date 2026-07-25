from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views import View
from django.http import JsonResponse
import json
from .services import run_lex_rag_pipeline
from .models import ConversationSession, LexChatHistory

@method_decorator(csrf_exempt, name='dispatch')
class LexChatEndpoint(View):
    def post(self, request, *args, **kwargs):
        try:
            data = json.loads(request.body)
            user_message = data.get("message", "").strip()
            session_key = data.get("session_key", "default_test_session")

            if not user_message:
                return JsonResponse({"error": "Message is required"}, status=400)

            # Fire execution pipeline
            result = run_lex_rag_pipeline(user_message, session_key)
            return JsonResponse(result, status=200)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class LexSessionListEndpoint(View):
    def get(self, request, *args, **kwargs):
        try:
            sessions = ConversationSession.objects.all().order_by('-created_at')
            data = []
            for s in sessions:
                # Try parsing numeric ID from session_key (e.g. session_1720556210000 -> 1720556210000)
                session_id = s.session_key
                if s.session_key.startswith("session_"):
                    try:
                        session_id = int(s.session_key.replace("session_", ""))
                    except ValueError:
                        pass
                
                data.append({
                    "id": session_id,
                    "session_key": s.session_key,
                    "title": s.title,
                    "created_at": s.created_at.isoformat(),
                    "messages": []
                })
            return JsonResponse(data, safe=False, status=200)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class LexSessionDetailEndpoint(View):
    def get(self, request, session_key, *args, **kwargs):
        try:
            session_obj = ConversationSession.objects.filter(session_key=session_key).first()
            if not session_obj:
                return JsonResponse({"error": "Session not found"}, status=404)
                
            chats = LexChatHistory.objects.filter(session_key=session_key).order_by('created_at')
            messages = []
            for chat in chats:
                # User message
                messages.append({
                    "id": f"u_{chat.id}",
                    "sender": "user",
                    "text": chat.user_message,
                })
                # AI response
                messages.append({
                    "id": f"l_{chat.id}",
                    "sender": "lex",
                    "text": chat.ai_response,
                    "showReferral": chat.show_lawyer,
                    "referralLabel": "وکیل تلاش کریں ←" if chat.language == "UR" else "Find a Lawyer →",
                    "referralType": "lawyer"
                })
                
            return JsonResponse({
                "session_key": session_key,
                "title": session_obj.title,
                "messages": messages
            }, status=200)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)