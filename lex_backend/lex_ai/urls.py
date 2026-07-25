from django.urls import path
from .views import LexChatEndpoint, LexSessionListEndpoint, LexSessionDetailEndpoint

urlpatterns = [
    # The active endpoint handling incoming JSON chat requests
    path('chat/', LexChatEndpoint.as_view(), name='lex_chat_api'),
    path('sessions/', LexSessionListEndpoint.as_view(), name='lex_sessions_list'),
    path('sessions/<str:session_key>/', LexSessionDetailEndpoint.as_view(), name='lex_session_detail'),
]