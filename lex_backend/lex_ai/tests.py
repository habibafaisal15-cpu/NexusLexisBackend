from django.test import TestCase, Client
from django.urls import reverse
import json
import numpy as np
from .services import SimpleTFIDF, run_lex_rag_pipeline, get_optimized_rag_matrix
from .models import ConversationSession, LexChatHistory, LexAISystemPrompt

class TFIDFTestCase(TestCase):
    def test_tfidf_semantic_search(self):
        # Instantiate SimpleTFIDF
        tfidf = SimpleTFIDF()
        
        # Fit with sample legal questions & answers
        questions = [
            "How to register a trademark in Pakistan?",
            "What are SECP company registration requirements?",
            "How to write a tenancy agreement lease contract?",
            "Property partition dispute process in civil court."
        ]
        answers = [
            "Apply at IPO Pakistan using TM-1 form.",
            "Provide company name, directors, capital, and SECP forms.",
            "Tenancy agreements must be registered with Rent Control.",
            "Partition suits are filed in Civil Court under Land Revenue Act."
        ]
        
        tfidf.fit_transform(questions, answers)
        
        # Test Case 1: Exact match
        ans, found, score = tfidf.search("How to register a trademark in Pakistan?", threshold=0.40)
        self.assertTrue(found)
        self.assertEqual(ans, answers[0])
        
        # Test Case 2: Changed wording / paraphrasing
        # "trademark registration pakistan how-to" -> matches question 1
        ans, found, score = tfidf.search("trademark registration in pakistan", threshold=0.40)
        self.assertTrue(found)
        self.assertEqual(ans, answers[0])
        
        # Test Case 3: SECP company registration matching
        ans, found, score = tfidf.search("secp requirements company registration", threshold=0.40)
        self.assertTrue(found)
        self.assertEqual(ans, answers[1])
        
        # Test Case 4: Non-matching query (should not match)
        ans, found, score = tfidf.search("What is the capital of France?", threshold=0.40)
        self.assertFalse(found)


class ViewsTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        # Set up a prompt in the DB
        LexAISystemPrompt.objects.create(prompt_text="You are Lex, a Pakistani legal AI assistant.")
        
    def test_session_management_and_history(self):
        session_key = "session_test_999"
        
        # Create a mock session directly
        session = ConversationSession.objects.create(
            session_key=session_key,
            title="Trademark Consulting"
        )
        
        # Add messages to LexChatHistory
        LexChatHistory.objects.create(
            session_key=session_key,
            user_message="How to register trademark?",
            ai_response="Use Form TM-1 with IPO.",
            language="EN",
            register="PLAIN",
            show_lawyer=False
        )
        
        # Step 2: Fetch sessions list via API
        url_list = reverse('lex_sessions_list')
        response = self.client.get(url_list)
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['session_key'], session_key)
        self.assertEqual(data[0]['title'], "Trademark Consulting")
        
        # Step 3: Fetch session message history via API
        url_detail = reverse('lex_session_detail', kwargs={'session_key': session_key})
        response = self.client.get(url_detail)
        self.assertEqual(response.status_code, 200)
        
        detail_data = response.json()
        self.assertEqual(detail_data['session_key'], session_key)
        self.assertEqual(len(detail_data['messages']), 2)  # 1 user + 1 lex response
        
        self.assertEqual(detail_data['messages'][0]['sender'], 'user')
        self.assertEqual(detail_data['messages'][0]['text'], "How to register trademark?")
        self.assertEqual(detail_data['messages'][1]['sender'], 'lex')
        self.assertEqual(detail_data['messages'][1]['text'], "Use Form TM-1 with IPO.")
