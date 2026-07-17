# Browser rendering sink audit

Phase 5 completed this audit on 2026-07-16. `public/app.js` remains a template-driven dashboard, so every `innerHTML` use is intentionally classified rather than treated as an automatic vulnerability.

## Central controls

- `public/app/core/safe-ui.js` owns context-aware text/attribute escaping plus the active URL policy. It strips event attributes, rejects unsafe navigation/media/frame URLs, and observes later DOM mutations.
- `lib/url-policy.js` applies the equivalent server-side URL checks before state can be persisted. It rejects control characters, protocol-relative values, credential-bearing URLs, and every scheme except approved HTTP(S).
- `public/app.js` exposes small local wrappers (`escapeText`, `escapeAttribute`, `safeExternalUrl`, `safeFrameUrl`, `safeMediaUrl`, `setSafeFrameSource`, `setSafeMediaSource`) so each renderer chooses the correct context.
- Any link opened in a new tab has `rel="noopener noreferrer"`; all pop-outs use `openSafeExternal`.
- Frames are HTTPS/provider allowlisted, receive a sandbox, a minimal `allow` value, and `referrerpolicy="no-referrer"`. Unsafe frame URLs resolve to `about:blank`.

## Sink classification

| Surface | Input class | Rendering rule |
| --- | --- | --- |
| Projects, tasks, notes, reminders, ideas, shortcuts, settings, backups | user-persisted state | Escape text or attributes. Project links use `safeExternalUrl`; unsafe shortcuts render as inert blocked cards. |
| Markdown previews in notes and tasks | user-persisted rich text | Escape raw input first, then generate only the small supported subset: paragraphs, lists, bold, italic, and underline. Links and raw HTML are not parsed. |
| RSS, email metadata/bodies, social and eBay payloads, NBA data | remote/untrusted integration data | Escape text/attributes before template output. Every action link passes the centralized external URL policy. |
| Camera, music, and live-stream inputs | user-persisted media configuration | `setSafeMediaSource` accepts same-origin paths, blobs, or HTTPS media. `setSafeFrameSource` accepts same-origin paths or approved HTTPS provider hosts only. |
| Home-device dialogs and settings forms | user-persisted device configuration | Escape dynamic text and IDs. No provider/device field becomes executable HTML, a popup target, or a direct frame source. |
| Static template fragments | application-controlled markup | `innerHTML` remains permitted for fixed layout fragments. Phase 5 removed all markup-level `style=` attributes so strict CSP can be enforced. |

## Active URL policy

Normal navigation permits only HTTP(S), rejects credentials and control characters, and never accepts protocol-relative URLs. Media permits same-origin paths, blobs, or HTTPS. Frame providers are limited to YouTube, Twitch, Kick, Vaughn Live, Rumble, Facebook, X/Twitter, plus same-origin pages. The CSP `frame-src` list mirrors that provider set.

## Content Security Policy

The server sends this policy on every response:

```text
default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://www.youtube.com; style-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data:; connect-src 'self' https://api.zippopotam.us https://api.open-meteo.com https://site.api.espn.com; frame-src 'self' https://youtu.be https://*.youtube.com https://*.youtube-nocookie.com https://*.twitch.tv https://*.kick.com https://vaughn.live https://*.vaughn.live https://rumble.com https://*.rumble.com https://*.facebook.com https://fb.watch https://x.com https://*.x.com https://twitter.com https://*.twitter.com
```

There is no `unsafe-inline` or `unsafe-eval`. The only third-party script is the existing YouTube iframe API. Direct browser connections are limited to the three declared weather/sports services; the remaining integrations stay same-origin through server routes.

## Remaining rich-content boundary

The Markdown renderer is deliberately the only application rich-text formatter. It is not a generic HTML renderer and must stay that way unless a future sanitizer with a documented allowlist is introduced. New HTML-producing renderers must use the helpers above, update this audit, and add an adversarial browser fixture.
