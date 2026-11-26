# Task Meeting Tracker v2

A multi-user project, task and meeting tracker. Anyone can **view** projects, tasks, the team and the calendar. Only people
invited by a project manager (PM) can sign in and change things, and what they can change depends on their role.

Stack: FastAPI (backend), Supabase (Postgres and Auth), React with Vite (frontend), Gemini (meeting summaries).

## How it works

1. **The PM signs in first.** Your first account is created by hand in Supabase. You create a project and become its PM.
2. **The PM invites the team.** On the project's Team tab, the PM enters an email and a role (BA, Dev, QA or Infra).
   - Email already has an account: they are added straight away.
   - New email: they get an invitation email from Supabase. They click the link, set a password, and land in the app already on the project.
     (The email can name the PM and project once you connect your own email sender. See "Optional" in Supabase Auth settings.)
3. **People work in their projects.** Members add tasks and update their own. The PM assigns work, edits everything and runs meetings.
4. **Visitors can look around.** Anyone without an account sees all projects read-only. Meetings, transcripts, logs and emails stay private.

There is no public sign-up. People can only join by invitation.

## Who can do what

|                                                  | Visitor | Member (BA, Dev, QA, Infra)             | PM (owner of the project)     |
| ------------------------------------------------ | ------- | --------------------------------------- | ----------------------------- |
| View dashboard, projects, tasks, team, calendar  | yes     | yes                                     | yes                           |
| See member emails                                | no      | no                                      | yes                           |
| See meetings and transcripts                     | no      | no                                      | yes, own projects             |
| See Logs                                         | no      | yes, own projects                       | yes                           |
| Add a task (a due date is required)              | no      | yes                                     | yes                           |
| Change status, ticket stage, blocker, notes      | no      | only on tasks assigned to them          | all tasks                     |
| Edit title, assignee, due date, priority, other  | no      | no                                      | yes                           |
| Move a task to the trash and restore it          | no      | only tasks they created                 | any task                      |
| Delete a task forever                            | no      | no                                      | yes, from the trash only      |
| Create or edit a project, invite people, roles   | no      | no                                      | yes                           |

A person can have a different role on each project, for example PM on one and QA on another.

## Pages

| Page | What it does |
| --- | --- |
| **Dashboard** | KPI tiles, status chart, project table and a Today card. A selector switches between **All Projects**, **My Projects** and **My Tasks**. Click **Blocked** to see blocked tasks. Visitors see All Projects only. |
| **Calendar** | Task deadlines in a monthly or weekly view. Click a day to see its tasks, open a task, or add one. The PM also sees meetings. The sidebar badge counts tasks due today or overdue. |
| **All Projects** | Every project, with filters for My projects and for a PM. |
| **My Projects** (sidebar) | Your projects. Opening one starts on **My Tasks**; switch to **All** to see everyone's. |
| **Project page** | Table and Board views, a Team tab with progress per person, and a Trash tab. Click a task for its details and history. |
| **Team** | Everyone with their role, tasks and progress per project. The PM can add people here too. |
| **Meetings** (PM only) | Attendees (Internal and Client), transcript, AI summary, Excel download and action items. See below. |
| **Logs** (members) | Who created, edited, deleted or restored what, in Malaysia time. |
| **Profile** | Change your name, see your projects and tasks, change your password. |

### Tasks

- Four statuses: To Do, In Progress, Pending Review, Done. A blocked task needs a reason.
- A **ticket stage** decides the status. For example FOR TESTING gives Pending Review and CLOSED gives Done.
- Deleted tasks go to the project's Trash. Their creator or the PM can restore them. Only the PM can delete them forever.
- Every change is recorded in the Logs. History stays even after a task is deleted forever.

### Meetings

1. Create a meeting and add Internal and Client attendees, date and time.
2. Upload a transcript (.docx, .vtt, .srt or .txt) or paste text. It stays collapsed behind **Show transcript**.
3. Press **Summarise with AI** to get a summary table and next actions. You can edit action items and summarise again.
4. Turn action items into tasks and assign them to project members. Created tasks are listed under the meeting.
5. Download the summary as Excel.

## Setup

### 1. Database

In the Supabase SQL editor, run `backend/schema.sql` as a new query. It creates a separate schema called `tt2` (so nothing else in
your project is touched), sets the time zone to Asia/Kuala_Lumpur, and is safe to run twice.

To see the data, open the Table Editor and switch the schema dropdown from `public` to `tt2`.

> Already have `tt2` tables from an earlier version? Running `schema.sql` again does not change existing tables. Add what is missing
> with a separate query (for example `alter table tt2.tasks add column if not exists due_time text;`), or drop the schema with
> `drop schema tt2 cascade;` and run `schema.sql` again if you only have test data.

### 2. Supabase Auth settings

1. **Authentication > Providers > Email:** turn **off** "Allow new users to sign up" so people can only join by invitation.
2. **Authentication > URL Configuration:** add your site URL and `http://localhost:5173/reset-password` to the allowed redirect URLs.
   Invitation and forgot-password links open there.
3. Create your own account: **Authentication > Users > Add user** (tick auto confirm), or use **Invite user**.
4. **Optional, later: PM name in the invitation email.** New free projects cannot edit email templates while they use Supabase's
   built-in sender. If you want it, connect your own sender under **Authentication > Emails > SMTP Settings** (a free plan from
   Brevo or Resend works), then paste the subject and body from `invite_email_template.html` into **Templates > Invite user**.
   Until then the default invitation email is sent, and everything else works the same.
   For real use, your own sender is also worth having, because the built-in one only allows a few emails per hour.

### 3. Backend

```
cd backend
copy .env.example .env        (Windows)   or   cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

| Setting in `backend/.env` | What it is |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | From Supabase > Project Settings > API |
| `DATABASE_URL` | Database connection string (use the session pooler if your host has no IPv6) |
| `CORS_ORIGINS` | The frontend address, for example `http://localhost:5173` |
| `GEMINI_API_KEY` | For meeting summaries |
| `GEMINI_MODEL` | For example `gemini-3.8-flash`. Set `GEMINI_MODELS` instead to list several, separated by commas. If one is busy, the next is tried. |
| `PM_EMAILS` | Optional. Only these emails can create projects. Empty means any signed-in user. |
| `SUPABASE_SERVICE_ROLE_KEY` | Needed to send invitations. **Secret. Backend only.** |
| `APP_URL` | The frontend address that invitation links open |

### 4. Frontend

```
cd frontend
copy .env.example .env        (Windows)   or   cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. In `frontend/.env`, set `VITE_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
`frontend/.env.production` holds the same three values for the deployed site (public values only).

### 5. First run

1. Sign in with the account you created in Supabase.
2. Open **All Projects**, create a project and you become its PM.
3. Open the project's **Team** tab, choose **Add member**, enter an email and a role.
4. The invited person opens the email, sets a password and is on the project when they sign in.

## Keeping secrets safe

- `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` live in `backend/.env` and in your backend host's settings only.
  Never put them in the frontend, in `.env.production`, or in Git.
- Only the publishable key may appear in frontend files.
- `.env` files are ignored by Git. Check `git status` before each commit.

## Tests

`pytest` (from `backend`) runs the tests that need no database. For the full set, including every permission rule, use a scratch
Postgres, never your Supabase project, because the tests empty the tables. Setup steps are at the top of `backend/tests/conftest.py`.

## Deploy

Frontend on **Cloudflare Pages**, backend on **Render**, database and login on Supabase (all with free plans).

**Backend (Render web service)**

| Field | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/health` |

Add every variable from the backend table above as an environment variable in Render. For `DATABASE_URL`, use the Supabase **Session pooler**
connection string (port 5432), because Render's free plan has no IPv6. Set `CORS_ORIGINS` and `APP_URL` to your Cloudflare address, for example
`https://your-app.pages.dev`. Use `https://`, no trailing slash. To allow local development too, separate with a comma:
`https://your-app.pages.dev,http://localhost:5173`. `APP_URL` takes only the first one.

**Frontend (Cloudflare Pages)**

| Field | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variables | `VITE_API_URL` (the Render address, no trailing slash), `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Changing a `VITE_` variable needs a new build before it takes effect. Never add the service role key or database password to Cloudflare.

**Then connect login**

In Supabase, go to Authentication > URL Configuration. Set **Site URL** to your Cloudflare address and add `https://your-app.pages.dev/reset-password`
to the redirect URLs. Invitation and forgot-password links return there.

Render's free backend sleeps after 15 minutes without traffic, so the first request after a quiet period can take about a minute.

## Troubleshooting

| Problem | Likely cause |
| --- | --- |
| "Invitations are not set up yet" | `SUPABASE_SERVICE_ROLE_KEY` is missing from `backend/.env` |
| The invitation email never arrives | Check the spam folder, then the SMTP settings (built-in sender is heavily limited) |
| Invitation email does not show the PM's name | Expected with Supabase's built-in sender. See "Optional" in the Supabase Auth settings above. |
| I can't see the tables in Supabase | Switch the Table Editor schema from `public` to `tt2` |
| A project looks empty when I open it | It opened on **My Tasks**. Switch the task scope to **All**. |
| "Not signed in" errors after a long time | Your session expired. Sign in again. |

## Not built yet

- AI chat for the PM (needs a server-side Gemini key and a signed-in-only endpoint)
- Reports page (currently a placeholder)
