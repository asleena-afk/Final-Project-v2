# Task Tracker v2

Multi-user version of the Task Tracker. Anyone can **view** the dashboard, projects, tasks, team and calendar. Only signed-in
members can change things, and what they can change depends on their role. FastAPI + Supabase (Postgres, Auth) + React/Vite.

## Who can do what

|                                                 | Visitor | Member (BA, Dev, QA, Infra)    | PM (project owner)               |
| ----------------------------------------------- | ------- | ------------------------------ | -------------------------------- |
| View dashboard, projects, tasks, team, calendar | yes     | yes                            | yes                              |
| See member emails, meetings, transcripts        | no      | no                             | yes (own projects)               |
| See Logs                                        | no      | yes (own projects)             | yes                              |
| Add a task                                      | no      | yes                            | yes                              |
| Change status, blocker, notes, ticket stage     | no      | only on tasks assigned to them | all tasks                        |
| Edit title, assignee, due date, priority...     | no      | no                             | yes                              |
| Delete / restore / permanently delete tasks     | no      | no                             | yes (delete goes to trash first) |
| Create or edit project, add members, set roles  | no      | no                             | yes                              |

## Setup

1. **Database.** In the Supabase SQL editor run `backend/schema.sql`. It creates a separate schema `tt2`, so v1 tables are untouched.
   It also sets the database time zone to Asia/Kuala_Lumpur. Safe to run twice.
2. **Backend.** `cd backend`, copy `.env.example` to `.env` and fill it in, then
   `pip install -r requirements.txt` and `uvicorn app.main:app --reload`. API docs at http://localhost:8000/docs.
   `GEMINI_MODEL=gemini-3.8-flash` is already in `.env.example`.
3. **Frontend.** `cd frontend`, copy `.env.example` to `.env`, `npm install`, `npm run dev`. Open http://localhost:5173.
4. **First user.** There is no public sign-up. Create the first account in Supabase (Authentication > Users > Add user, or Invite user),
   sign in, then create a project: you become its PM. After that, add people on the project's **Team** tab with their email and a role:
   - Already has an account in the app: added straight away.
   - New email: they get an invitation email, set a password from the link, and join the project when they sign in. Pending invitations show on the Team tab and can be cancelled.
   Set `PM_EMAILS` in `backend/.env` if only certain people should create projects.
   Invitations need `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` (server only, never in the frontend) and `APP_URL` set to the frontend address.
   Also turn off public sign-ups in Supabase (Authentication > Providers > Email > "Allow new users to sign up") so people can only join by invitation.
5. **Demo data (optional).** `python seed/load_sample_data.py your-email@example.com`. It talks to the database directly with
   `DATABASE_URL`, so it needs no email, password or token. The sample people are not accounts yet, so their tasks are unassigned
   with the intended name in the notes.

In Supabase Auth settings, add your site URL and `http://localhost:5173/reset-password` to the allowed redirect URLs so the forgot-password and invitation emails work.

## Tests

`pytest` runs the tests that need no database. For the full permission tests use a scratch Postgres (never your Supabase project,
the tests empty the tables). The instructions are at the top of `backend/tests/conftest.py`.

## Notes

- The API uses a privileged database connection and enforces every rule itself. Row level security is on with no policies,
  so the browser can never read or write these tables directly.
- Deleted tasks are soft deleted. Activity history is kept even after a task is permanently deleted.
- Deploy: backend on Render (start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`), frontend on Vercel. Set `CORS_ORIGINS` to the frontend URL
  and `VITE_API_URL` to the backend URL.
- Not built yet: AI chat. Add it last, with a server-side Gemini key and a signed-in-only endpoint.
