# StreamOS Source Provider Registry

StreamOS can add additional authorized source providers without requiring a new FireTV UI flow. The backend calls provider endpoints, normalizes direct `.m3u8` / `.mp4` links, and sends them to the native player before embed fallbacks.

## Environment Variables

`DIRECT_SOURCE_ENDPOINTS`

Comma-separated or newline-separated endpoint templates for general direct-link providers.

`SFX_SOURCE_ENDPOINTS` or `SFX_PROVIDER_ENDPOINTS`

Comma-separated or newline-separated endpoint templates for SFX-style direct-link providers.

`STREAMEX_SOURCE_ENDPOINTS` or `STREAMEX_PROVIDER_ENDPOINTS`

Comma-separated or newline-separated endpoint templates for StreameX-style direct-link providers.

`CINEMAOS_SOURCE_ENDPOINTS` or `CINEMAOS_PROVIDER_ENDPOINTS`

Comma-separated or newline-separated endpoint templates for CinemaOS-style direct-link providers.

`VID2_SOURCE_ENDPOINTS` or `VID2_PROVIDER_ENDPOINTS`

Comma-separated or newline-separated endpoint templates for Vid2-style direct-link providers.

`VIDEASY_SOURCE_ENDPOINTS` or `VIDEASY_PROVIDER_ENDPOINTS`

Comma-separated or newline-separated endpoint templates for Videasy-style direct-link providers.

`VIDPRO_SOURCE_ENDPOINTS` or `VIDPRO_PROVIDER_ENDPOINTS`

Comma-separated or newline-separated endpoint templates for VidPro-style direct-link providers.

`SOURCE_PROVIDER_CONFIG` or `STREAMOS_SOURCE_PROVIDERS`

JSON registry for additional named providers.

```json
[
  {
    "name": "Provider Name",
    "tier": "provider-name",
    "endpoints": [
      "https://provider.example/stream?tmdb={tmdb}&type={type}&title={title}&year={year}&season={season}&episode={episode}"
    ]
  }
]
```

## Supported Template Tokens

`{tmdb}`, `{type}`, `{title}`, `{year}`, `{season}`, `{episode}`

## Supported Response Shapes

Providers may return JSON arrays, nested objects, or newline-separated URLs. StreamOS looks for direct-link fields such as `url`, `file`, `stream`, `playlistUrl`, `hls`, and `mp4`. Optional fields include `provider`, `server`, `quality`, `referer`, `origin`, `cookie`, and `headers`.

Embed-only links are intentionally ignored by the direct-provider registry; browser embed fallbacks remain handled separately by the app.

## Bee-Compatible Presets

`ENABLE_BEE_COMPAT_SOURCES`

Enabled by default. Set to `false` to disable the API-style provider presets found in the BeeTV working package. These are queried in parallel and normalized before iframe fallbacks.

Included preset patterns:

`cinemaos.live/api/cinemaos`

`tom.autoembed.cc/api/getVideoSource`

`vidrock.net/api/{type}/{tmdb}`

`moviesapi.club/{type}/{tmdb}`

`fsapi.xyz/{type}/{tmdb}`

`vidsrc.cc/api/source/{tmdb}`

`embed.su/api/e/{tmdb}`

`player.voxzer.org/list/{tmdb}`

`api.whvx.net/source?resourceId=tmdb:{tmdb}`

## Stremio-Compatible Addons

`STREMIO_ADDON_URLS` or `STREAMOS_STREMIO_ADDONS`

Comma-separated or newline-separated Stremio addon base URLs or `manifest.json` URLs. StreamOS calls `/stream/{type}/{id}.json` and normalizes direct `url`, `file`, `hls`, or `playlistUrl` stream entries.
