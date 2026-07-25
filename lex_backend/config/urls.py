from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    # Admin dashboard
    path('admin/', admin.site.urls),
    
    # Direct routing to our AI application
    path('api/v1/lex/', include('lex_ai.urls')),
]