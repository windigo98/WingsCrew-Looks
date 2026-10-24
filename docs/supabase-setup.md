# Turn on live share links

Until you do these steps, **Share link** is a demo. The link only opens on the phone that made it. The app says: Demo: links only open on this phone until sharing goes live.

When the steps are done, a link works for anyone. They do not need an account or the app installed. Each phone can vote Fit or Miss once. You see the counts on your Looks tab, and you can stop the link.

Supabase has a free plan. You do not put a password in the app. The only key that goes in the app is the public **anon** key.

1. Open [https://supabase.com](https://supabase.com) and create a free account.
2. Click **New project**. Name it `WingsCrew Looks`. Pick a region close to you.
3. Create a database password. Save it in a password manager. You will not paste this password into WingsCrew Looks.
4. Wait until the project page says it is ready.
5. In the left menu, open **SQL Editor**. Click **New query**.
6. On your computer, open the file `supabase/schema.sql` in this project. Select the whole file, copy it, and paste it into the query box.
7. Click **Run**. Wait until it says success.
8. In the left menu, open **Table Editor**. You should see two tables: `shared_looks` and `votes`.
9. Open **Storage**. You should see a bucket named `looks`. Leave it private.
10. Open the gear icon, **Project Settings**, then **API**.
11. Copy the **Project URL**.
12. Copy the **anon public** key. This key is safe to put in the app. Do **not** copy the **service_role** key. Leave that key on the Supabase page. It is a secret.
13. In this project, open `index.html`. Find `window.WCL_SUPABASE_URL` and `window.WCL_SUPABASE_ANON_KEY`. The WingsCrew project values are already filled in. If this is your own Supabase project, replace them with your Project URL and anon public key. Save the file. If **Stop sharing** fails on a project created before that button worked, open **SQL Editor**, paste `supabase/migrations/002_revoke_look.sql`, and click **Run**.
14. Put that `index.html` on the site (for GitHub Pages, commit it on the `main` branch and wait a minute). Open a saved look, tap **Share link**, and send the link. Another phone should open it and vote once.

The link looks like `https://windigo98.github.io/WingsCrew-Looks/#/v/` followed by a long id.

To stop a link, open the look and tap **Stop sharing**. The page then says the link is not available. Old votes stay on your phone's counts.
