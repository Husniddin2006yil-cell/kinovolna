# Music provider research — 2026-10-22

## Jamendo

Jamendo’s API documentation says applications use a registered developer application and its API terms. The API gives access to a large catalog and read methods, but the license of each content item is the item’s own Creative Commons license. Jamendo’s API terms state that API use is free for non-commercial use; commercial use, including monetary compensation, affiliation or advertising revenue, requires contacting Jamendo licensing. The application must credit the artist and Jamendo and provide a direct backlink to each content page. Content must not be cached as a dedicated offline replica. Sources: [1] and [2].

This project currently has no Jamendo client ID in its checked configuration, so Jamendo was not enabled by guessing or requesting a secret. It should only be enabled after the owner deliberately adds a registered Jamendo application credential and confirms the intended commercial/non-commercial use and attribution UI.

## Free Music Archive

FMA states that each track carries its own license and FMA does not own or relicense the music. CC BY and CC BY-SA permit commercial use with attribution; CC BY-NC variants do not permit commercial use; CC0 allows commercial use, subject to the public-domain dedication’s scope. FMA also notes that some old limited licenses allow only personal downloading/listening/streaming. Therefore a general FMA search endpoint cannot be treated as a blanket audio license: each track’s license and attribution must be retained and shown. Source: [3].

## Free To Use

The official API page says its public API needs no API key or account and exposes search and stream endpoints. It also states free use has conditions while commercial use requires a paid license. It is not safe to present all returned tracks as commercially cleared without checking the Free To Use license and the project’s intended use. Source: [4].

## Decision for the current app

YouTube search remains metadata/external-link only; no YouTube video is embedded for music playback and no audio is extracted. The in-app audio catalog remains Deezer’s 30-second licensed preview plus a small statically curated Wikimedia Commons open archive list with per-track source and status links. This satisfies the audio-only UI without pretending that YouTube search grants audio playback rights. A future Jamendo/FMA/Free To Use integration needs per-track license metadata, attribution rendering, provider terms acceptance, and an explicit credential/license decision.

[1]: https://developer.jamendo.com/v3.0/docs "Jamendo API documentation"
[2]: https://devportal.jamendo.com/api_terms_of_use "Jamendo API terms of use"
[3]: https://freemusicarchive.org/License_Guide "Free Music Archive License Guide"
[4]: https://freetouse.com/api "Free To Use official public API"
[5]: https://core.telegram.org/bots/webapps "Telegram Mini Apps initData validation and viewport documentation"
[6]: https://core.telegram.org/bots/api "Telegram Bot API update delivery and message methods"
