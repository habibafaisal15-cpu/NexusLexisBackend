from django.contrib import admin
from .models import LexAISystemPrompt, KnowledgeBaseEntry, ConversationSession, ConversationLog

@admin.register(LexAISystemPrompt)
class LexAISystemPromptAdmin(admin.ModelAdmin):
    list_display = ('id', 'updated_at', 'updated_by')
    search_fields = ('prompt_text',)

@admin.register(KnowledgeBaseEntry)
class KnowledgeBaseEntryAdmin(admin.ModelAdmin):
    list_display = ('category', 'question_en', 'is_verified', 'created_at')
    list_filter = ('category', 'is_verified')
    search_fields = ('question_en', 'answer_en', 'question_ur', 'answer_ur')

@admin.register(ConversationSession)
class ConversationSessionAdmin(admin.ModelAdmin):
    list_display = ('session_key', 'user', 'title', 'created_at')
    search_fields = ('session_key', 'title')

@admin.register(ConversationLog)
class ConversationLogAdmin(admin.ModelAdmin):
    list_display = ('session', 'language_detected', 'register_detected', 'find_lawyer_shown', 'timestamp')
    list_filter = ('language_detected', 'register_detected', 'find_lawyer_shown', 'is_flagged')
    search_fields = ('question_text', 'response_text', 'flagged_note')