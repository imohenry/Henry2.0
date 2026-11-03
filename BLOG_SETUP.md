# Connect Henry's blog to Google Sheets

The blog works immediately as an archive of Henry's existing Medium posts. Connecting a Google Sheet turns on native posts, likes, moderated comments, and a private publishing desk at `/admin.html`.

The production data flow stays deliberately small:

```text
Visitor → static portfolio → Netlify Function → Google Apps Script → Google Sheet
```

There is no database bill, no admin password in the browser, and no framework or package to maintain. The small Netlify Functions make requests reliable across browsers, keep secrets out of client code, and give the admin a signed, 12-hour HttpOnly session. Google Sheets remains the authoritative store.

## 1. Create the spreadsheet

1. Create a blank Google Sheet named `Henry Blog`.
2. Open **Extensions → Apps Script** from that Sheet.
3. Rename the Apps Script project to `Henry Blog API`.
4. Replace the starter code with all of [`google-apps-script-blog/Code.gs`](google-apps-script-blog/Code.gs).
5. Save the project.

You do not need to create tabs or headers by hand.

## 2. Initialize the database

1. Select `setupHenryBlog` in the function picker at the top of Apps Script.
2. Select **Run**.
3. Review and allow the spreadsheet permission Google requests.
4. Confirm the execution completes successfully.

The setup function creates and protects the schema of three tabs:

- `Posts`: the publishing table and lightweight CMS.
- `Comments`: a moderation queue. New comments always start as `pending`.
- `Likes`: anonymous, hashed browser likes. No email address or account is collected.

It also seeds `Posts` with the five Medium articles already shown in the portfolio.

## 3. Deploy the API

1. In Apps Script, select **Deploy → New deployment**.
2. Choose **Web app** as the deployment type.
3. Description: `Henry Blog production API`.
4. Set **Execute as** to `Me`.
5. Set **Who has access** to `Anyone`.
6. Select **Deploy** and finish any requested authorization.
7. Copy the production web-app URL. It must end in `/exec`, not `/dev`.

The URL is public by design. Unauthenticated actions can only read rows whose status is `published`, return comments whose status is `approved`, toggle a hashed browser like, or add a comment to the moderation queue. Post editing, deletion, and moderation operations are rejected unless they carry the separate server-side admin secret.

## 4. Create the admin secrets

Generate two different random values in a terminal:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use the first as `HENRY_BLOG_ADMIN_SECRET`. This secret authenticates Netlify to Apps Script.

Use the second as `HENRY_BLOG_SESSION_SECRET`. This secret signs admin login sessions and must remain only in Netlify.

Choose a separate admin password of at least 12 characters. A long, unique passphrase is better than a short complicated password.

In the Apps Script project:

1. Open **Project Settings**.
2. Under **Script properties**, add `HENRY_BLOG_ADMIN_SECRET`.
3. Paste the first generated value as its value.
4. Save the property.

Do not place any of these values in GitHub, `blog-config.js`, `netlify.toml`, or the Google Sheet itself.

## 5. Connect Netlify

In the Netlify project for the portfolio:

1. Open **Project configuration → Environment variables**.
2. Add these environment variables:

   | Name | Value |
   | --- | --- |
   | `HENRY_BLOG_APPS_SCRIPT_URL` | The production `/exec` URL copied in the previous step |
   | `HENRY_BLOG_ADMIN_SECRET` | The first generated value; it must exactly match the Apps Script property |
   | `HENRY_BLOG_SESSION_SECRET` | The second generated value |
   | `HENRY_BLOG_ADMIN_PASSWORD` | Your separate, unique admin password or passphrase |

3. Trigger a new production deploy so the Functions receive the values.

The public blog calls `/api/blog`. The private desk calls `/api/blog-admin`. [`netlify.toml`](netlify.toml) routes those paths to separate Functions, and only the admin Function can send authenticated write operations to Apps Script.

## Use the publishing desk

1. Open `https://YOUR-SITE/admin.html`.
2. Enter `HENRY_BLOG_ADMIN_PASSWORD`.
3. Select **New** to start a post, or choose an existing post to edit it.
4. Add an HTTPS cover-image URL from your preferred image host.
5. Use **Save draft** to keep the post private or **Publish post** to make it public.
6. Open the **Comments** tab to approve, reject, or return comments to the pending queue.

The editor includes a safe live Markdown preview. The password is sent only to the same-origin Netlify Function and is exchanged for a signed HttpOnly cookie; it is never stored in browser JavaScript or local storage. Logging out expires the cookie. The login Function also applies a best-effort short lockout after repeated failed attempts.

Deleting a post also deletes its associated likes and comments. The confirmation screen makes this explicit; Google Sheet version history remains the recovery path.

## Publish directly from the Sheet

The Sheet remains editable if you ever need a manual fallback. Add one row to `Posts` using these fields:

| Column | What to enter |
| --- | --- |
| `slug` | Lowercase words separated by hyphens, for example `how-i-built-pocket-plan` |
| `title` | The public article title |
| `excerpt` | A one- or two-sentence description used on cards and in page metadata |
| `content` | The article in the supported Markdown format below |
| `category` | A short topic such as `Engineering`, `Writing`, or `Personal notes` |
| `cover_image` | An `https://` image URL from your image host or a site path such as `images/blog/my-cover.jpg` |
| `published_at` | A date such as `2026-11-02` |
| `reading_time` | Whole minutes; use `1` if you want a minimal value |
| `featured` | `TRUE` for the lead story; keep only one current post featured |
| `status` | `draft` keeps it private; `published` makes it public |
| `external_url` | Leave blank for a native post. Use an `https://` URL for an archive link such as Medium. |

The blog supports headings, paragraphs, links, bold, italics, inline code, fenced code blocks, blockquotes, ordered lists, unordered lists, and horizontal rules:

````text
## A section heading

This has **bold text**, *italic text*, `inline code`, and [a link](https://example.com).

> A useful pull quote.

- One point
- Another point

```js
console.log("A code block");
```
````

The renderer creates safe DOM nodes instead of injecting Sheet content as HTML.

## Moderate comments

Every new comment appears in the `Comments` tab with `status` set to `pending`.

- Change `pending` to `approved` to publish it.
- Change it to `rejected` to retain it without publishing.
- Delete the row to remove it permanently.

Names and comment bodies beginning with spreadsheet formula characters are neutralized before storage. A honeypot and a short per-browser rate limit reduce simple spam, but public forms can never be perfectly spam-free. Review comments before approving them.

## Update the Apps Script later

Code changes do not automatically update an existing Apps Script deployment:

1. Open **Deploy → Manage deployments**.
2. Edit the production deployment.
3. Select **New version**.
4. Select **Deploy**.

Editing rows in the Google Sheet does not require a redeploy.

## Limits and migration path

Google Sheets plus Apps Script is a sensible free backend for a personal blog with modest traffic. Apps Script has daily quotas and is not intended for a high-volume social platform. If the blog grows beyond those limits, the UI can stay in place while the small API is moved to a hosted database later.
