# Arbitration Hackathon Backend (FastAPI + Supabase + OpenAI)

This backend gives you the basic plumbing your frontend currently fakes in local state:

- Auth (signup/login) via Supabase Auth
- Projects CRUD (create/list/view/edit/delete)
- Document uploads per project (Supabase Storage + DB metadata)
- Per-project chat with AI (messages stored per project)

It does **not** implement your seat-change reasoning or report generation yet.

## What you need to set up in Supabase

1) Create a Supabase project.

2) Run the SQL in `migrations/001_init.sql` in the Supabase SQL editor.

3) Create a Storage bucket:
- Bucket name: `project-files`
- Public: **ON** (simplest for a hackathon)
  - If you want private files later, you will need storage RLS policies + signed URLs.

## Environment variables

Copy `.env.example` to `.env`.

Required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `OPENAI_API_KEY`

Optional:
- `CORS_ORIGINS` (comma-separated list)
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `STORAGE_BUCKET` (default: `project-files`)

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## API overview

Auth:
- `POST /auth/signup` { email, password }
- `POST /auth/login` { email, password }
- `GET /auth/me` (requires Bearer token)

Projects:
- `POST /projects` (requires Bearer token)
- `GET /projects`
- `GET /projects/{project_id}`
- `PATCH /projects/{project_id}`
- `DELETE /projects/{project_id}`

Documents:
- `POST /projects/{project_id}/documents/upload` (multipart)
- `GET /projects/{project_id}/documents`
- `DELETE /projects/{project_id}/documents/{document_id}`

Chat:
- `GET /projects/{project_id}/chat/messages`
- `POST /projects/{project_id}/chat/send` { message }

## Notes

- This backend uses the Supabase **service role key** to keep uploads/simple CRUD working without you having to fight RLS during a hackathon.
- It still checks that the authenticated user owns the project before it lets them list/edit/delete/upload.
- If you accidentally expose your service role key in the frontend, you’ve basically lost control of your database. Keep it server-only.
