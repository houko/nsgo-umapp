-- Whether the Worker tracks the website through its Cloudflare routes, which `npm run deploy` sets, so Umapp knows the tracker needs no embedding.
ALTER TABLE website ADD COLUMN auto_track INTEGER NOT NULL DEFAULT 0;
