# Nemotron STT Runtime

GPU inference image for Frappe Meet captions using NVIDIA Nemotron 3.5 ASR through NeMo.

## Runtime Contract

- Container port: `8000`
- Health check: `GET /health`
- Streaming transcription: `WS /stream`
- PCM transcription fallback: `POST /transcribe-pcm`
- GPU: NVIDIA CUDA-compatible GPU

The model is downloaded at startup. Mount `/models` to persist the Hugging Face, NeMo, and Torch caches across container replacements.

## Configuration

| Variable | Default |
|---|---|
| `STT_HOST` | `0.0.0.0` |
| `STT_PORT` | `8000` |
| `NEMOTRON_MODEL` | `nvidia/nemotron-3.5-asr-streaming-0.6b` |
| `NEMOTRON_LANGUAGE` | `en-US` |
| `NEMOTRON_ATT_CONTEXT_SIZE` | `56,3` |
| `NEMOTRON_FINAL_SILENCE_MS` | `600` |
| `HF_TOKEN` | unset |

## Run

```bash
docker run --rm --gpus all \
  -p 8000:8000 \
  -v nemotron-models:/models \
  ghcr.io/frappe/suite/nemotron-stt:<tag>
```

The PR workflow publishes same-repository pull requests as `pr-<number>` and all feature branches as both their branch name and short commit SHA. Fork branches publish under the fork owner's GHCR namespace.
