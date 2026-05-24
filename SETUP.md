# RepPolice setup

One-time steps to get the platform running locally. Should take ~10 minutes.

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in.
2. Click **New project**. Pick any name (e.g., `reppolice`), set a database password (save it somewhere), pick the region closest to you.
3. Wait ~1 minute for the project to provision.

## 2. Configure environment variables

In the Supabase dashboard:

- **Project Settings → API** → copy:
  - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then in the project root:

```bash
cp .env.example .env.local
# edit .env.local and paste in the two values
```

## 3. Run the SQL migration

In the Supabase dashboard:

- **SQL Editor** → **New query** → paste the contents of `supabase/migrations/0001_init.sql` → **Run**.

This creates:

- The `submissions` table with row-level security so users only see their own rows.
- The `videos` storage bucket (private) with policies that scope each user to their own `{user_id}/...` folder.

## 4. Enable auth providers

In the Supabase dashboard:

### Email
- **Authentication → Providers → Email** → make sure it's enabled.
- For local dev you may want to turn **Confirm email** OFF temporarily so you can sign in without clicking a confirmation link. (Re-enable for production.)

### Google
- **Authentication → Providers → Google** → toggle on.
- Get a Google OAuth client:
  - Go to https://console.cloud.google.com → create a project (or pick one).
  - **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
  - Application type: **Web application**.
  - Authorized redirect URIs: add the callback URL shown in the Supabase Google provider settings (looks like `https://<your-project-ref>.supabase.co/auth/v1/callback`).
  - Copy the **Client ID** and **Client secret** back into the Supabase Google provider settings.

### Redirect URLs
- **Authentication → URL Configuration → Redirect URLs** → add:
  - `http://localhost:3000/auth/callback`
  - For production, also add `https://your-domain.com/auth/callback`.

## 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

## 6. Verify it works

End-to-end sanity check:

1. Land on `/` — see the marketing page.
2. Click **Get Started** → land on `/login`. Sign up with an email.
   - If you turned off email confirmation, you're signed in immediately.
   - If not, click the link in the confirmation email.
3. Land on `/submit`. Drag in a small (<50MB) `.mp4` → progress bar fills → redirected to `/submissions`.
4. See your upload listed with status `uploaded`.
5. Click the row → see the video play back.
6. In the Supabase dashboard:
   - **Storage → videos** → file exists at `{your-user-id}/{submission-id}.mp4`.
   - **Table Editor → submissions** → row exists.
7. Sign out, create a second account, visit `/submissions` → empty (RLS works).

## File size

Supabase free tier caps individual uploads at **50 MB**. To raise it, go to **Storage → Settings → Upload file size limit** (paid plans allow up to 50 GB).
