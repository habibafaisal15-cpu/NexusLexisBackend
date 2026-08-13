import os
from pathlib import Path

# 1. Base Directories
BASE_DIR = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / '.env')
except ImportError:
    pass

# 2. Security Settings (Development Mode)
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-nexus-lexis-core-key-2026')
DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() == 'true'
ALLOWED_HOSTS = ['*']

# 3. Application Definitions
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # API Engine
    'rest_framework',
    'lex_ai',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# 4. Local SQLite Database Configuration for seamless out-of-the-box development
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# 5. Internationalization & Localization Settings
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Karachi'                  # Set directly to Pakistan Standard Time
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# LLM provider: gemini (production) | ollama (local dev)
LLM_PROVIDER = os.environ.get('LLM_PROVIDER', 'gemini')

# Google Gemini — https://aistudio.google.com/apikey
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')

# Ollama + Qwen (local only)
LLM_BASE_URL = os.environ.get('LLM_BASE_URL', 'http://localhost:11434')
LLM_MODEL = os.environ.get('LLM_MODEL', 'qwen2.5:7b-instruct')
LLM_GUARD_MODEL = os.environ.get('LLM_GUARD_MODEL', LLM_MODEL)

# Question bank spreadsheet (Google Sheets public export URL)
LEX_QUESTION_BANK_URL = os.environ.get(
    'LEX_QUESTION_BANK_URL',
    'https://docs.google.com/spreadsheets/d/1I7F5GlelYco_LNzRHRrvjOjDEaJNnNhC/export?format=xlsx',
)

LLM_MAX_TOKENS = int(os.environ.get('LLM_MAX_TOKENS', '400'))
LLM_TIMEOUT = int(os.environ.get('LLM_TIMEOUT', '120'))
LLM_GUARD_TIMEOUT = int(os.environ.get('LLM_GUARD_TIMEOUT', '8'))
LLM_GENERATION_TIMEOUT = int(os.environ.get('LLM_GENERATION_TIMEOUT', '60'))

APPEND_SLASH = False