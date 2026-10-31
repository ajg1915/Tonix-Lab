# Tonix Lab

A studio and live streaming hub that works on phones, tablets and computers.

- **Studio** (`studio.html`): vocal channel strip and recorder. Presets Spotlight, Super Studio, New Wave and Old Soul, plus your own. Live spectrum, meters, backing track, camera and takes.
- **Go live**: camera and mic preview with full control of resolution, frame rate, video and audio bitrate, encoder and audio processing.
- **Share & embed**: viewer, guest and OBS/Streamlabs links, social sharing, and a player builder with embed code.
- **How to**: setup help for phones, OBS and Streamlabs, plus fixes for common problems.

Live rooms, soundboard, chat and saved offline loops are being added stage by stage.

Open the live page, then install it: Android Chrome shows **Install app**; on iPhone or iPad tap Share, then **Add to Home Screen**.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `app.css`, `app.js` | The hub: Home, Go live, Share & embed, How to |
| `vocal.html`, `vocal.js` | Vocal remover: removes or isolates the centered vocal in an audio file, all in the browser |
| `studio.html` | The Studio audio engine and recorder |
| `sw.js`, `manifest.webmanifest` | Offline support and install |

## Third-party code

- `vdo/`: self-hosted copy of VDO.Ninja (AGPL-3.0). See `vdo/README-TONIX.md`.
- `qr.js`: qrcode-generator by Kazuhiko Arase (MIT).
- `hls.light.min.js`: hls.js (Apache-2.0). Licence in `HLSJS-LICENSE.txt`.
