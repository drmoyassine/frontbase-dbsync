# AI Inference Gateway

> Run AI models at the edge — OpenAI-compatible API with reasoning control.

## What It Does
Every Frontbase Edge Engine with GPU models attached automatically becomes an AI inference gateway. It exposes standard OpenAI-compatible endpoints that can be called from any client, with added support for Cloudflare Workers AI features like reasoning control.

## How It Works

| Endpoint | Purpose | Format |
|----------|---------|--------|
| `POST /v1/chat/completions` | Standard chat inference | OpenAI-compatible |
| `POST /v1/responses` | Responses API with reasoning | OpenAI Responses format |
| `POST /v1/embeddings` | Text embeddings | OpenAI-compatible |
| `POST /v1/images/generations` | Image generation | OpenAI-compatible |
| `POST /v1/audio/transcriptions` | Speech-to-text | OpenAI-compatible |
| `POST /v1/audio/speech` | Text-to-speech | OpenAI-compatible |

## Key Capabilities
- **OpenAI-compatible**: Drop-in replacement for any OpenAI SDK client
- **Reasoning control**: Adjust thinking depth (`low`/`medium`/`high`) and summary verbosity via `/v1/responses`
- **Multi-modality**: Text generation, embeddings, image gen, audio transcription, TTS
- **API key security**: All `/v1/*` endpoints secured by edge API keys (`fb_sk_*`)
- **Interactive test dialog**: Built-in UI for testing models with cURL snippets, schema reference, and endpoint switching

## Configuration
- Attach a GPU model to any engine via the Deploy Wizard or AI model dialog
- Create API keys in the Edge Infrastructure dashboard
- No additional setup needed — inference routes activate automatically when a model is attached

**Status**: ✅ Production
