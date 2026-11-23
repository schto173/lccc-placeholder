# LCCC — coming soon

Placeholder page for https://lccc.lu while the new website is developed at https://beta.lccc.lu
(repository: [schto173/lcccWeb](https://github.com/schto173/lcccWeb)).

Only the `site/` folder is served.

## Server

Stop the old lccc.lu containers first (`docker compose down` in their folder), then:

```sh
git clone https://github.com/schto173/lccc-placeholder
cd lccc-placeholder
docker compose up -d
```

Update the page later with `git pull` in that folder.

## Vendor interest form

`site/vendors.html` (the target of the flyer QR code, `flyer/`) has a short form: name, email, shop and one
sentence about what they sell. The small `api` service saves sign-ups in `data/vendor-interest.json` on the
server (not in git), emails each sign-up to `NOTIFY_TO` and sends the vendor a confirmation.

Create a `.env` next to `docker-compose.yml` with the same mail settings as on beta:

```sh
NOTIFY_TO=royalfamilyeventing+web@gmail.com
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=xxxxxx@smtp-brevo.com
SMTP_PASS=xsmtpsib-...
MAIL_FROM=notifications@lccc.lu
MAIL_FROM_VENDORS=vendors@lccc.lu
MAIL_REPLY_TO=royalfamilyeventing+web@gmail.com
```

then `docker compose up -d`. To see all sign-ups: `cat data/vendor-interest.json`.
The privacy note on the page promises to delete them after the vendor selection for LCCC 2027.
