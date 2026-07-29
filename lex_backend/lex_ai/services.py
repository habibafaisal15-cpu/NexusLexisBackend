import io
import time
import math
import re
import requests
import numpy as np
import pandas as pd
from collections import Counter
from django.conf import settings
from .models import LexAISystemPrompt, LexChatHistory, ConversationSession
from .intro_qa import LEX_INTRO_QA
from .llm_client import chat_completion, LLMConnectionError, check_ollama_health
from .law_guard import keyword_law_check

# ==========================================
# 1. INITIALIZATION, TF-IDF ENGINE & GLOBAL CACHE
# ==========================================

# Direct Public Download link for your targeted Live Document Excel Sheet
EXCEL_DOWNLOAD_URL = "https://docs.google.com/spreadsheets/d/1jbWsT2dzag38-F97tnqW9S0YdtZnbiiv/export?format=xlsx"

ENGLISH_STOP_WORDS = {
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren', "aren't",
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot',
    'could', 'couldn', "couldn't", 'did', 'didn', "didn't", 'do', 'does', 'doesn', "doesn't", 'doing', 'don', "don't",
    'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn', "hadn't", 'has', 'hasn', "hasn't",
    'have', 'haven', "haven't", 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
    'i', 'if', 'in', 'into', 'is', 'isn', "isn't", 'it', "it's", 'its', 'itself', 'just', 'me', 'more', 'most',
    'mustn', "mustn't", 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
    'ours', 'ourselves', 'out', 'over', 'own', 'same', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them',
    'themselves', 'then', 'there', "there's", 'these', 'they', "they'd", "they'll", "they're", "they've", 'this',
    'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn', "wasn't", 'we', "we'd", "we'll",
    "we're", "we've", 'were', 'weren', "weren't", 'what', 'when', "when't", 'where', 'which', 'while', 'who', 'whom',
    'why', 'with', 'won', "won't", 'would', 'wouldn', "wouldn't", 'you', "you'd", "you'll", "you're", "you've",
    'your', 'yours', 'yourself', 'yourselves'
}

URDU_STOP_WORDS = {
    'ہیں', 'ہے', 'تھا', 'تھی', 'تھے', 'گا', 'گی', 'گے', 'کا', 'کی', 'کے', 'کو', 'نے', 'میں', 'پر', 'سے',
    'تک', 'اور', 'یا', 'کہ', 'کر', 'کیا', 'کون', 'کیسے', 'کیوں', 'کب', 'کہاں', 'کتنا', 'جیسے', 'جس',
    'جو', 'ہر', 'ہم', 'آپ', 'تم', 'وہ', 'یہ', 'ان', 'اس', 'انہیں', 'اسے', 'میں', 'مجھے', 'ہمارا', 'تمہارا'
}

class SimpleTFIDF:
    """
    A lightweight, in-memory TF-IDF vectorizer and Cosine Similarity search engine.
    Does not require external ML packages like scikit-learn or PyTorch, making it extremely fast
    and portable. Handles both English and Urdu text.
    """
    def __init__(self):
        self.vocab = {}
        self.idf = []
        self.doc_vectors = []
        self.documents = []
        self.answers = []
        self.vocab_size = 0

    def fit_transform(self, questions, answers):
        self.documents = list(questions)
        self.answers = list(answers)
        
        # Tokenize each document
        tokenized_docs = [self._tokenize(q) for q in self.documents]
        
        # Build vocabulary
        vocab_set = set()
        for doc in tokenized_docs:
            vocab_set.update(doc)
        
        self.vocab = {term: idx for idx, term in enumerate(sorted(vocab_set))}
        self.vocab_size = len(self.vocab)
        
        if self.vocab_size == 0:
            return
            
        # Compute Document Frequency (DF)
        num_docs = len(self.documents)
        df = Counter()
        for doc in tokenized_docs:
            unique_terms = set(doc)
            for term in unique_terms:
                df[term] += 1
                
        # Compute Inverse Document Frequency (IDF)
        self.idf = np.zeros(self.vocab_size)
        for term, idx in self.vocab.items():
            # Standard IDF: log(N / df) + 1
            self.idf[idx] = math.log(num_docs / df[term]) + 1.0
            
        # Compute TF-IDF vectors for documents
        self.doc_vectors = []
        for doc in tokenized_docs:
            vec = np.zeros(self.vocab_size)
            term_counts = Counter(doc)
            for term, count in term_counts.items():
                if term in self.vocab:
                    idx = self.vocab[term]
                    vec[idx] = count * self.idf[idx]
            
            # L2 Normalization
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            self.doc_vectors.append(vec)
            
        self.doc_vectors = np.array(self.doc_vectors)

    def _tokenize(self, text):
        text = str(text).lower().strip()
        # \w+ without word-boundaries — \b breaks on Urdu/Arabic script
        tokens = re.findall(r'\w+', text, re.UNICODE)
        if len(tokens) < 2 and re.search(r'[\u0600-\u06FF]', text):
            tokens = [t.lower() for t in re.split(r'[\s\u060c,\.?!\u061f]+', text) if t.strip()]
        return [t for t in tokens if t not in ENGLISH_STOP_WORDS and t not in URDU_STOP_WORDS]

    def search(self, query, threshold=0.40):
        """
        Calculates cosine similarity of the query against the document corpus.
        Returns the best answer, a success flag, and the similarity score.
        """
        if self.vocab_size == 0 or len(self.doc_vectors) == 0:
            return None, False, 0.0
            
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return None, False, 0.0
            
        # Compute TF-IDF vector for query
        query_vec = np.zeros(self.vocab_size)
        term_counts = Counter(query_tokens)
        for term, count in term_counts.items():
            if term in self.vocab:
                idx = self.vocab[term]
                query_vec[idx] = count * self.idf[idx]
                
        # L2 Normalization of query vector
        norm = np.linalg.norm(query_vec)
        if norm > 0:
            query_vec = query_vec / norm
        else:
            return None, False, 0.0
            
        # Cosine similarity is the dot product of normalized vectors
        similarities = np.dot(self.doc_vectors, query_vec)
        best_idx = np.argmax(similarities)
        best_score = similarities[best_idx]
        
        if best_score >= threshold:
            return self.answers[best_idx], True, best_score
            
        return None, False, best_score

INTRO_QA_THRESHOLD = 0.45
BANK_QA_THRESHOLD = 0.40

OFF_TOPIC_MESSAGE = (
    "Hello! I am LEX, your dedicated Pakistani legal assistant. I can only answer "
    "queries explicitly related to law, regulatory compliance, and corporate matters. "
    "Please ask a law-related question."
)

LLM_UNAVAILABLE_EN = (
    "I couldn't find this in our verified question bank, and AI generation is temporarily "
    "offline. Please try rephrasing your question, browse our document library, or "
    "connect with a lawyer for personalised advice."
)

LLM_UNAVAILABLE_UR = (
    "یہ سوال ہمارے تصدیق شدہ سوالنامے میں نہیں ملا، اور AI فی الوقت دستیاب نہیں ہے۔ "
    "براہ کرم اپنا سوال دوبارہ لکھیں، دستاویزات دیکھیں، یا وکیل سے رابطہ کریں۔"
)
_CACHED_NUMPY_MATRIX = None
_CACHED_ETAG = None
_CACHED_TFIDF = None
_INTRO_TFIDF = None
_LAST_SYNC_TIME = 0
CACHE_TTL = 300  # Time-to-Live in seconds (5 minutes)


def _get_intro_tfidf():
    global _INTRO_TFIDF
    if _INTRO_TFIDF is not None:
        return _INTRO_TFIDF

    questions = []
    answers = []
    for item in LEX_INTRO_QA:
        answer_payload = {"en": item["answer_en"], "ur": item["answer_ur"]}
        for question in item["questions"]:
            questions.append(question)
            answers.append(answer_payload)

    tfidf = SimpleTFIDF()
    tfidf.fit_transform(questions, answers)
    _INTRO_TFIDF = tfidf
    return _INTRO_TFIDF


def search_intro_qa(user_message: str) -> tuple:
    """
    Match against built-in LEX introductory Q&A before the external sheet bank.
    """
    normalized = user_message.strip().lower().rstrip("!.?،؟")
    for item in LEX_INTRO_QA:
        for question in item["questions"]:
            if normalized == question.strip().lower().rstrip("!.?،؟"):
                answer = {"en": item["answer_en"], "ur": item["answer_ur"]}
                print("--- LEX INTRO Q&A EXACT MATCH ---")
                return answer, True

    tfidf = _get_intro_tfidf()
    answer, found, score = tfidf.search(user_message, threshold=INTRO_QA_THRESHOLD)
    if found:
        print(f"--- LEX INTRO Q&A MATCH (Cosine Similarity Score: {score:.4f}) ---")
    return answer, found


# ==========================================
# 2. AUTOMATIC SYNC & TF-IDF PROCESSING
# ==========================================

def get_optimized_rag_matrix():
    """
    Checks if the remote file has updated using ETag signatures.
    Uses in-memory cache TTL of 5 minutes to prevent redundant HEAD requests.
    """
    global _CACHED_NUMPY_MATRIX, _CACHED_ETAG, _CACHED_TFIDF, _LAST_SYNC_TIME

    current_time = time.time()
    # Return cache immediately if within TTL limit
    if _CACHED_NUMPY_MATRIX is not None and _CACHED_TFIDF is not None and (current_time - _LAST_SYNC_TIME) < CACHE_TTL:
        return _CACHED_NUMPY_MATRIX, _CACHED_TFIDF

    try:
        # Step 1: Perform a quick HEAD request to verify file modifications
        headers = {}
        if _CACHED_ETAG:
            headers["If-None-Match"] = _CACHED_ETAG

        head_response = requests.head(EXCEL_DOWNLOAD_URL, headers=headers, timeout=5)

        # Status 304 means the document hasn't changed. Return cache instantly!
        if head_response.status_code == 304 and _CACHED_NUMPY_MATRIX is not None and _CACHED_TFIDF is not None:
            _LAST_SYNC_TIME = current_time  # Update sync check timestamp
            return _CACHED_NUMPY_MATRIX, _CACHED_TFIDF

        # Step 2: If file is modified, execute full download stream
        response = requests.get(EXCEL_DOWNLOAD_URL, timeout=10)
        if response.status_code != 200:
            print(f"RAG Sync Warning: Remote fetch failed ({response.status_code}). Using fallback cache.")
            return _CACHED_NUMPY_MATRIX, _CACHED_TFIDF

        _CACHED_ETAG = response.headers.get("ETag")

        # Step 3: Stream to Pandas and map down useful arrays
        file_stream = io.BytesIO(response.content)
        df = pd.read_excel(file_stream, sheet_name='Question Bank', skiprows=1)

        # Index 1 = Column B (Questions Text Verbatim)
        question_col = df.columns[1]
        
        # Clean structural validation (drop rows where question is completely empty)
        df_clean = df.dropna(subset=[question_col]).copy()
        
        # Index 12 = Column M (Answers written by lawyers)
        if len(df_clean.columns) > 12:
            answer_col = df_clean.columns[12]
            df_clean[answer_col] = df_clean[answer_col].fillna("").astype(str)
            numpy_matrix = df_clean[[question_col, answer_col]].to_numpy()
        else:
            numpy_matrix = df_clean[[question_col]].to_numpy()

        # Update cache container & fit TF-IDF model
        _CACHED_NUMPY_MATRIX = numpy_matrix
        _LAST_SYNC_TIME = current_time

        if numpy_matrix is not None and len(numpy_matrix) > 0:
            tfidf = SimpleTFIDF()
            questions = [row[0] for row in numpy_matrix]
            answers = [row[1] if len(row) > 1 else "" for row in numpy_matrix]
            tfidf.fit_transform(questions, answers)
            _CACHED_TFIDF = tfidf

        print("--- RAG CACHE UPDATED: New spreadsheet modifications loaded & TF-IDF fitted successfully ---")
        return _CACHED_NUMPY_MATRIX, _CACHED_TFIDF

    except Exception as e:
        print(f"--- AUTOMATIC RAG SYNC ERROR ---")
        print(e)
        print("---------------------------------")
        return _CACHED_NUMPY_MATRIX, _CACHED_TFIDF


def search_question_bank_numpy(user_message: str) -> tuple:
    """
    Scans the automatically sync'd NumPy array using TF-IDF similarity.
    Allows matching queries even if wording or word order is changed.
    """
    _, tfidf = get_optimized_rag_matrix()
    
    if tfidf is None:
        return None, False

    # Retrieve matching document using cosine similarity threshold of 0.40
    answer, found, score = tfidf.search(user_message, threshold=BANK_QA_THRESHOLD)
    if found and not str(answer or "").strip():
        print(f"--- RAG MATCH SKIPPED: empty answer (score: {score:.4f}) ---")
        return None, False
    if found:
        print(f"--- RAG SEMANTIC MATCH TRIGGERED (Cosine Similarity Score: {score:.4f}) ---")
        return answer, True
            
    return None, False


# ==========================================
# 3. FILTER GUARDRAILS & HISTORY
# ==========================================

def check_if_law_related(user_message: str) -> bool:
    """
    Guardrail filter before AI generation fallback.
    Keyword-based only — avoids a second slow Ollama call before generation.
    """
    keyword_result = keyword_law_check(user_message)
    if keyword_result is not None:
        return keyword_result
    # Ambiguous text on a legal platform — allow through to LLM rather than blocking
    return True


def build_conversational_history(session_key: str, current_message: str, limit: int = 5) -> list:
    """
    Assembles contextual multi-turn conversation lists.
    """
    past_chats = LexChatHistory.objects.filter(
        session_key=session_key
    ).exclude(
        ai_response__icontains="Connection error"
    ).order_by('-created_at')[:limit]

    past_chats = reversed(past_chats)
    messages = []

    for chat in past_chats:
        if chat.user_message and chat.ai_response and not chat.ai_response.startswith("Hello! I am LEX, your dedicated Pakistani legal assistant"):
            messages.append({"role": "user", "content": chat.user_message})
            messages.append({"role": "assistant", "content": chat.ai_response})

    messages.append({"role": "user", "content": current_message})
    return messages


# ==========================================
# 4. MASTER PIPELINE ENGINE
# ==========================================

def run_lex_rag_pipeline(user_message: str, session_key: str) -> dict:
    """
    Primary engine router.
    1. Built-in intro Q&A
    2. Excel question bank (semantic TF-IDF)
    3. Law-topic guardrail (only before AI generation)
    4. Qwen fallback (Ollama)
    """
    is_urdu = any(u'\u0600' <= c <= u'\u06FF' for c in user_message)
    detected_lang = "UR" if is_urdu else "EN"
    detected_register = "LEGAL" if ("section" in user_message.lower() or "act" in user_message.lower() or "دفعہ" in user_message) else "PLAIN"

    # STEP 1: Manage Session Logging
    session_obj, session_created = ConversationSession.objects.get_or_create(
        session_key=session_key,
        defaults={"title": user_message[:50] + "..." if len(user_message) > 50 else user_message}
    )
    if not session_created and session_obj.title in ["New Conversation", "New Chat Session", "نیا مکالمہ"]:
        session_obj.title = user_message[:50] + "..." if len(user_message) > 50 else user_message
        session_obj.save()

    # STEP 2: Built-in LEX introductory Q&A, then external sheet bank (before guardrail)
    intro_answer, intro_found = search_intro_qa(user_message)
    if intro_found:
        response_text = intro_answer["ur"] if detected_lang == "UR" else intro_answer["en"]
        LexChatHistory.objects.create(
            session_key=session_key,
            user_message=user_message,
            ai_response=response_text,
            language=detected_lang,
            register="PLAIN",
            show_lawyer=False
        )
        return {
            "response": response_text,
            "language": detected_lang,
            "register": "PLAIN",
            "show_lawyer": False
        }

    bank_answer, found = search_question_bank_numpy(user_message)
    if found:
        LexChatHistory.objects.create(
            session_key=session_key,
            user_message=user_message,
            ai_response=bank_answer,
            language=detected_lang,
            register=detected_register,
            show_lawyer=False
        )
        return {
            "response": bank_answer,
            "language": detected_lang,
            "register": detected_register,
            "show_lawyer": False
        }

    # STEP 3: Law-topic filter — only for AI generation fallback
    if not check_if_law_related(user_message):
        LexChatHistory.objects.create(
            session_key=session_key,
            user_message=user_message,
            ai_response=OFF_TOPIC_MESSAGE,
            language=detected_lang,
            register="PLAIN",
            show_lawyer=False
        )
        return {
            "response": OFF_TOPIC_MESSAGE,
            "language": detected_lang,
            "register": "PLAIN",
            "show_lawyer": False
        }

    # STEP 4: Fallback Prompt Assembly
    active_prompt_record = LexAISystemPrompt.objects.first()
    system_instruction = active_prompt_record.prompt_text if active_prompt_record else "You are Lex, a legal information assistant."

    enforced_system_context = (
        f"{system_instruction}\n\n"
        "CRITICAL INSTRUCTION: If the user asks about exact company registration fees, corporate tax setup costs, "
        "or IP filing fees, do NOT quote specific currency figures. Explicitly direct them to use the "
        "Registration and Compliance Fee Calculator on our platform.\n\n"
        "LANGUAGE SYMMETRY REQUIREMENT: You must perfectly match the language vector of the user (e.g. English, Urdu, or Roman Urdu)."
    )

    conversation_payload = build_conversational_history(session_key, user_message)

    # STEP 5: Fallback to Qwen via Ollama (skip quickly if Ollama is down)
    llm_health = check_ollama_health()
    if not llm_health.get("ok") or not llm_health.get("model_available"):
        ai_response = LLM_UNAVAILABLE_UR if detected_lang == "UR" else LLM_UNAVAILABLE_EN
    else:
        try:
            ai_response = chat_completion(
                conversation_payload,
                system=enforced_system_context,
                max_tokens=settings.LLM_MAX_TOKENS,
                model=settings.LLM_MODEL,
                timeout=settings.LLM_GENERATION_TIMEOUT,
            )
        except LLMConnectionError as e:
            print("--- QWEN / OLLAMA GENERATION ERROR ---")
            print(e)
            ai_response = LLM_UNAVAILABLE_UR if detected_lang == "UR" else LLM_UNAVAILABLE_EN

    # STEP 6: Identify Urgent Context Flags
    urgency_keywords = ["sue", "court", "arrest", "fir", "dispute", "fraud", "police", "عدالت", "کیس", "تھانہ"]
    show_lawyer = any(keyword in user_message.lower() for keyword in urgency_keywords)

    # STEP 7: DB Commit Logs
    LexChatHistory.objects.create(
        session_key=session_key,
        user_message=user_message,
        ai_response=ai_response,
        language=detected_lang,
        register=detected_register,
        show_lawyer=show_lawyer
    )

    return {
        "response": ai_response,
        "language": detected_lang,
        "register": detected_register,
        "show_lawyer": show_lawyer
    }