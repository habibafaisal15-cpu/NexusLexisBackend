from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _

class LexAISystemPrompt(models.Model):
    """
    Stores the active system prompt instructions in the DB
    so admins can modify them live without re-deploying code.
    """
    prompt_text = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True,
        related_name="updated_prompts"
    )

    class Meta:
        ordering = ['-updated_at']
        verbose_name = _("Lex AI System Prompt")

    def __str__(self):
        return f"Prompt version: {self.updated_at.strftime('%Y-%m-%d %H:%M')}"


class KnowledgeBaseEntry(models.Model):
    """
    The Lawyer-contributed Question Bank.
    Provides direct localized matches for our initial verification layer.
    """
    category = models.CharField(max_length=100, db_index=True)
    question_en = models.TextField()
    answer_en = models.TextField()
    question_ur = models.TextField(blank=True, null=True)
    answer_ur = models.TextField(blank=True, null=True)
    is_verified = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = _("Knowledge Base Entries")

    def __str__(self):
        return f"[{self.category}] {self.question_en[:40]}"


class ConversationSession(models.Model):
    """
    Groups dialogue turns into a unique session.
    Tracks if a visitor is a public guest or an authenticated user.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True
    )
    session_key = models.CharField(max_length=255, unique=True, db_index=True)
    title = models.CharField(max_length=255, default="New Chat Session")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Session {self.session_key[:8]}"


class ConversationLog(models.Model):
    """
    Complete tracking architecture for every individual Q&A turn 
    to populate analytic metrics.
    """
    class Languages(models.TextChoices):
        ENGLISH = 'EN', _('English')
        URDU = 'UR', _('Urdu')

    class Registers(models.TextChoices):
        PLAIN = 'PLAIN', _('Plain Language')
        LEGAL = 'LEGAL', _('Legal Terminology')

    session = models.ForeignKey(ConversationSession, on_delete=models.CASCADE, related_name="logs")
    question_text = models.TextField()
    response_text = models.TextField()
    
    language_detected = models.CharField(max_length=2, choices=Languages.choices, default=Languages.ENGLISH)
    register_detected = models.CharField(max_length=10, choices=Registers.choices, default=Registers.PLAIN)
    find_lawyer_shown = models.BooleanField(default=False)
    find_lawyer_clicked = models.BooleanField(default=False)
    
    is_flagged = models.BooleanField(default=False, db_index=True)
    flagged_note = models.TextField(blank=True, null=True)
    
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']

# Create your models here.
from django.db import models

class LexChatHistory(models.Model):
    """
    Stores individual chat exchanges processed through the Lex AI RAG pipeline
    for logging, analytics, and conversational memory context.
    """
    session_key = models.CharField(max_length=255, db_index=True)
    user_message = models.TextField()
    ai_response = models.TextField()
    language = models.CharField(max_length=10, default="EN")
    register = models.CharField(max_length=10, default="PLAIN")
    show_lawyer = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = "Lex Chat History"
        verbose_name_plural = "Lex Chat Histories"

    def __str__(self):
        return f"Session {self.session_key[:8]}... - {self.created_at.strftime('%Y-%m-%d %H:%M')}"
