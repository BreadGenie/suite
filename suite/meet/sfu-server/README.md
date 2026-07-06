# Frappe Meet SFU Server

Mediasoup-based Selective Forwarding Unit (SFU) for Frappe Meet.

## Speech-to-Text (Captions)

Real-time captions are powered by an on-premise NVIDIA Nemotron ASR backend.

### Local Development

Set `STT_SERVER_URL` to a running STT service that implements `/health` and `/stream`.

### Docker Compose

The STT backend is included in the runtime image and started automatically as a sidecar container.

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `STT_SERVER_URL` | SFU URL for the STT service | — |
| `NEMOTRON_MODEL` | Hugging Face model ID | `nvidia/nemotron-3.5-asr-streaming-0.6b` |
| `NEMOTRON_LANGUAGE` | Locale prompt such as `en-US`, or `auto` for multilingual rooms | `en-US` |
| `NEMOTRON_ATT_CONTEXT_SIZE` | NeMo streaming attention context, `left,right` | `56,3` |
| `NEMOTRON_FINAL_SILENCE_MS` | Silence padding appended before final decode | `600` |
| `STT_SILENCE_MS` | Silence duration before finalizing an utterance | `500` |
| `STT_MIN_SPEECH_MS` | Minimum speech duration before normal silence final | `600` |
| `STT_MIN_TAIL_MS` | Minimum speech duration for short utterance final | `200` |
| `STT_SHORT_UTTERANCE_SILENCE_MS` | Silence duration before finalizing short utterances | `700` |
| `STT_VAD_THRESHOLD` | Speech detection sensitivity (0.0–1.0) | `0.012` |
| `HF_TOKEN` | Hugging Face token (optional, avoids rate limits) | — |

## Production Deployment

### Prerequisites

- A server with Docker and Docker Compose v2 installed
- A domain pointing to the server (e.g., `sfu.example.com`)
- Ports open: `80/tcp`, `443/tcp`, `40000-40200/udp`

### Quick Start

```bash
# Install on the server (downloads deploy files to /opt/meet-sfu)
curl -fsSL https://raw.githubusercontent.com/frappe/suite/develop/suite/meet/sfu-server/deploy/install.sh | bash

# Configure
cd /opt/meet-sfu
nano .env
```

Set the required values in `.env`:

| Variable | Description | Example |
|---|---|---|
| `JWT_SECRET` | Shared secret with Frappe (generate: `openssl rand -base64 32`) | `a1B2c3D4...` |
| `WEBRTC_ANNOUNCED_IP` | Server's public IP (find: `curl -4 ifconfig.me`) | `203.0.113.10` |
| `DOMAIN` | Domain pointing to this server | `sfu.example.com` |
| `SSL_EMAIL` | Email for Let's Encrypt notifications | `admin@example.com` |

Then run setup:

```bash
./deploy.sh setup
```

This will pull the SFU image, provision an SSL certificate, and start everything.

### Frappe Configuration

Add to your Frappe site's `site_config.json`:

```json
{
  "sfu_server_url": "https://sfu.example.com",
  "sfu_secret": "<same JWT_SECRET from .env>"
}
```

### Management Commands

```bash
./deploy.sh start      # Start all services
./deploy.sh stop       # Stop all services
./deploy.sh restart    # Restart all services
./deploy.sh update     # Pull latest image and restart SFU
./deploy.sh logs       # Tail logs (use: ./deploy.sh logs sfu)
./deploy.sh status     # Show health and container status
./deploy.sh ssl-renew  # Force SSL certificate renewal
```

### Updating

When new changes are pushed to `develop`, the GitHub Actions workflow builds and pushes a new Docker image. To update the SFU on your server:

```bash
cd /opt/meet-sfu
./deploy.sh update
```

### Firewall Rules

| Port | Protocol | Purpose |
|---|---|---|
| 80 | TCP | HTTP / ACME challenges |
| 443 | TCP | HTTPS |
| 40000-40200 | UDP | WebRTC media |
