# Universal / App Links — files to host on clyzio.com

The app declares `applinks:clyzio.com` (iOS, `app.config.ts` → `ios.associatedDomains`)
and autoVerified Android App Links (`android.intentFilters`). Both only work once
these two files are served from the **domain root** of clyzio.com.

Until they're live, shared links open the website instead of the app — no crash,
just a degraded experience.

## 1. `apple-app-site-association`
Serve at **both**:
- `https://clyzio.com/.well-known/apple-app-site-association`
- `https://www.clyzio.com/.well-known/apple-app-site-association`

Requirements:
- `Content-Type: application/json`
- **No** `.json` file extension in the URL
- **No** redirects (Apple's CDN fetches it directly, 200 only)
- Served over HTTPS with a valid certificate

## 2. `assetlinks.json`
Serve at `https://clyzio.com/.well-known/assetlinks.json`, `Content-Type: application/json`.

**Before hosting**, replace `REPLACE_WITH_SHA256_FROM_eas_credentials` with the
release signing certificate's SHA-256 fingerprint:

```bash
eas credentials --platform android
# → select the production profile → "Keystore: Manage everything…"
# → copy the SHA-256 Certificate Fingerprint (format AA:BB:CC:…)
```

## Verifying after deploy
- iOS: `curl -sI https://clyzio.com/.well-known/apple-app-site-association` → 200 + `application/json`
- Android: https://developers.google.com/digital-asset-links/tools/generator
- On device: install a build, then tap a `https://clyzio.com/ride/<id>` link in Messages/Notes
  (not the browser address bar — that always stays in the browser).
