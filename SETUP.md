# CPCT-Dashboard — Quick Setup

1. Clone the repo:

```
git clone <repo-url>
cd CPCT-Dashboard
```

2. Create and activate a virtual environment (Windows PowerShell):

```
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

3. Install dependencies:

```
pip install -r requirements.txt
```

4. Copy environment file and fill values (use same `SUPABASE_URL`/keys on other machines to share the same project):

```
copy .env.example .env
# then edit .env and fill SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, SECRET_KEY
```

5. Run the app locally:

```
python -m flask run
```

Notes:
- Keep your `SUPABASE_SERVICE_ROLE_KEY` secret — do not commit it.
- Use the same `SUPABASE_URL` and keys on any other machine to point to the same Supabase backend and database.
