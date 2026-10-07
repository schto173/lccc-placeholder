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
