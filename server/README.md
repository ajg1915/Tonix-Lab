# Tonix vocal server

Runs an Ultimate-Vocal-Remover-style AI (MDX-Net, via the `audio-separator` library) on your own computer.
No accounts, no limits. Songs never leave your machine.

## Start it
1. Install Docker Desktop (free) and start it.
2. Open a terminal in this `server` folder and run:  `docker compose up -d --build`
3. Check it: open http://localhost:8765/health in your browser. You should see `{"ok":true,...}`.
4. Open the site's Vocal remover page and use the **My server** panel.

The first song downloads the AI model (a few minutes, one time; it is kept in the `models` folder).
On a processor-only computer a 4-minute song takes a few minutes.

## Stop / update
- Stop: `docker compose down`
- Update after changes: `docker compose up -d --build`

## Notes
- `ALLOWED_ORIGINS` in `docker-compose.yml` lists the websites that may use the server.
- Reaching it from a phone or another network needs a secure public address (https). See the site's help.
- Uses MDX-Net models from the UVR project (MIT licence) and the `audio-separator` library (MIT).
