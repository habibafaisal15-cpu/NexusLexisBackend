import os
import anthropic
from django.conf import settings
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

print("Initializing Anthropic client...")
client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

try:
    print("Fetching available models from your account tier...")
    # This queries the official models list endpoint
    models = client.models.list(limit=20)
    print("\n--- SUCCESS! YOUR KEY CAN ACCESS THESE MODELS ---")
    for model in models.data:
        print(f"- {model.id}")
    print("------------------------------------------------")
except Exception as e:
    print("\n--- ERROR FETCHING MODELS ---")
    print(e)