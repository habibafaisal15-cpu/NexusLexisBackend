# Hostinger upload pack (Google signup)

Upload **both** files into `public_html` (next to `index.html`):

1. `.htaccess` — fixes `/login` `/signup` 404s  
2. `google-auth.html` — finishes Google redirect sign-in  

Or download from the live Auth API after deploy:

- https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/hostinger/google-auth.html  
- https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/hostinger/.htaccess  

Then change the Google button to `/google/start`.

**Full FE handoff:** [`../Frontend_Hostinger_Google_SignIn_Handoff.md`](../Frontend_Hostinger_Google_SignIn_Handoff.md)
