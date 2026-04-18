# Deployment Guide — POS System

## Step 1 — Set up the database on Neon.tech (free)

1. Go to neon.tech → Sign up free
2. Create a new project → name it "pos-system"
3. Copy the connection string — looks like:
   postgresql+psycopg2://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb
4. Run your Alembic migrations against this URL:
   ```
   DATABASE_URL=<your-neon-url> alembic upgrade head
   ```

---

## Step 2 — Deploy backend to Render.com (free tier)

1. Push your code to GitHub
2. Go to render.com → Sign up → New Web Service
3. Connect your GitHub repo
4. Set Root Directory to: `backend`
5. Build command: `pip install -r requirements.txt`
6. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
7. Add Environment Variables in Render dashboard:
   - DATABASE_URL = your Neon URL
   - SECRET_KEY   = generate at: openssl rand -hex 32
   - ALGORITHM    = HS256
   - ACCESS_TOKEN_EXPIRE_MINUTES = 480
   - SHOP_NAME, SHOP_OWNER_WHATSAPP, TWILIO_* (when ready)
8. Deploy — Render gives you a URL like: https://pos-backend.onrender.com

---

## Step 3 — Update frontend API URL

In `frontend/pos-frontend/src/api/api.js`, change:
```js
baseURL: "http://127.0.0.1:8000",
```
to:
```js
baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
```

Create `frontend/pos-frontend/.env.production`:
```
VITE_API_URL=https://pos-backend.onrender.com
```

---

## Step 4 — Deploy frontend to Vercel (free)

1. Go to vercel.com → Sign up with GitHub
2. Import your repository
3. Set Root Directory to: `frontend/pos-frontend`
4. Framework Preset: Vite
5. Add Environment Variable:
   - VITE_API_URL = https://pos-backend.onrender.com
6. Deploy — Vercel gives you: https://pos-system.vercel.app

---

## Step 5 — Custom domain (Whogohost)

1. Buy domain at whogohost.com e.g. vendtrack.ng (~₦5,000/year)
2. In Vercel → your project → Settings → Domains
3. Add your domain: pos.vendtrack.ng
4. Vercel shows you DNS records to add
5. In Whogohost DNS settings, add the CNAME record Vercel provides
6. Wait 15–30 mins for propagation

Your app is now live at: https://pos.vendtrack.ng

---

## Step 6 — WhatsApp reports setup

1. Go to twilio.com → Sign up free
2. Console → Messaging → Try it out → Send a WhatsApp message
3. You get a sandbox number and instructions to join it
4. Add your Twilio credentials to Render environment variables
5. Test: POST https://pos-backend.onrender.com/reports/send-whatsapp
6. You'll receive the daily report on WhatsApp immediately

---

## Add Render backend URL to CORS (important)

After deploying frontend, update `backend/app/main.py`:
```python
origins = [
    "http://localhost:5173",
    "https://pos-system.vercel.app",      # your Vercel URL
    "https://pos.vendtrack.ng",           # your custom domain
]
```
Then redeploy backend.

---

## Free tier limits to know

| Service  | Free limit                          | When to upgrade         |
|----------|-------------------------------------|-------------------------|
| Neon     | 0.5 GB storage, 1 compute unit      | When DB > 400MB         |
| Render   | 750 hrs/month, sleeps after 15 mins | When you have 5+ customers |
| Vercel   | 100GB bandwidth                     | Almost never for this app |

**Render sleep issue:** Free tier sleeps after 15 mins of inactivity.
First request after sleep takes ~30 seconds. Fix: upgrade to $7/month Starter
plan when you have paying customers. That's ₦11,000/month — one customer covers it.