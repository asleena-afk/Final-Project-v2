import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
# New projects call it the publishable key; v1 called it the anon key. Either works here.
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
# Optional safety net: only these emails can create projects (become a PM). Empty = any signed-in user.
PM_EMAILS = {e.strip().lower() for e in os.getenv("PM_EMAILS", "").split(",") if e.strip()}
TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Kuala_Lumpur")
# Needed only to send invitation emails to people who have no account yet. Server-side only: never put this key in the frontend.
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
# Where the invitation email sends people (they set their password there). Defaults to the first CORS origin.
APP_URL = (os.getenv("APP_URL") or (CORS_ORIGINS[0] if CORS_ORIGINS else "http://localhost:5173")).rstrip("/")
