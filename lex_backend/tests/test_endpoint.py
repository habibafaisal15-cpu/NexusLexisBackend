import requests
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

URL = "http://127.0.0.1:8001/api/v1/lex/chat/"

def test_query(message, description):
    print(f"\n--- TESTING: {description} ---")
    print(f"Sending Message: '{message}'")
    
    payload = {
        "message": message,
        "session_key": "test_session_123"
    }
    
    try:
        response = requests.post(URL, json=payload)
        print(f"Status Code: {response.status_code}")
        print("Response JSON:")
        print(json.dumps(response.json(), indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Test 1: Non-Legal Query (Should trigger the Guardrail bypass)
    test_query("What is the capital of France?", "Guardrail Check (Non-Legal)")
    
    # Test 2: Legal Query in Urdu (To test language symmetry and legal routing)
    test_query("پاکستان میں کمپنی رجسٹر کروانے کا کیا طریقہ ہے؟", "Legal Query in Urdu")
    
    # Test 3: RAG or LLM Fallback
    test_query("What are the requirements for registering an LLC in Pakistan?", "Legal Query in English")
