#!/usr/bin/env python3
"""
FastAPI server for real-time STT using NVIDIA Nemotron 3.5 ASR.

Endpoints:
  GET  /health           -> { status: "ok" }
  POST /transcribe-pcm   -> SSE data lines from raw PCM s16le, 16kHz mono
"""

import asyncio
import json
import os
import re
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.requests import Request
from transformers import AutoModelForRNNT, AutoProcessor

NEMOTRON_MODEL = os.getenv("NEMOTRON_MODEL", "nvidia/nemotron-3.5-asr-streaming-0.6b")
NEMOTRON_LANGUAGE = os.getenv("NEMOTRON_LANGUAGE", "en-US").strip() or "auto"
NEMOTRON_LOOKAHEAD_TOKENS = int(os.getenv("NEMOTRON_LOOKAHEAD_TOKENS", "6"))
NEMOTRON_KEEP_LANG_TAGS = os.getenv("NEMOTRON_KEEP_LANG_TAGS", "false").lower() in {
	"1",
	"true",
	"yes",
}

model = None
processor = None
transcribe_semaphore = None
ready = False


def _label(**parts) -> None:
	parts_str = " ".join(f"{k}={v}" for k, v in parts.items())
	print(f"[stt] {parts_str}")


def pcm16le_to_float32(audio_bytes: bytes) -> np.ndarray:
	audio_i16 = np.frombuffer(audio_bytes, dtype=np.int16)
	return audio_i16.astype(np.float32) / 32768.0


def load_model() -> None:
	global model, processor
	device = "cuda" if torch.cuda.is_available() else "cpu"
	print("╔══════════════════════════════════════════════╗")
	print("║  Loading Nemotron 3.5 ASR                   ║")
	print(f"║  Model   : {NEMOTRON_MODEL:<35s}║")
	print(f"║  Device  : {device:<35s}║")
	print(f"║  Lang    : {NEMOTRON_LANGUAGE:<35s}║")
	print("╚══════════════════════════════════════════════╝")
	t0 = time.time()

	processor = AutoProcessor.from_pretrained(NEMOTRON_MODEL)
	if hasattr(processor, "set_num_lookahead_tokens"):
		processor.set_num_lookahead_tokens(NEMOTRON_LOOKAHEAD_TOKENS)

	if device == "cuda":
		model = AutoModelForRNNT.from_pretrained(
			NEMOTRON_MODEL,
			device_map="auto",
			torch_dtype="auto",
		)
	else:
		model = AutoModelForRNNT.from_pretrained(NEMOTRON_MODEL)
		model.to(device)
	model.eval()
	_label(event="loaded", backend="nemotron", elapsed=f"{time.time() - t0:.2f}s")


def transcribe_audio(audio: np.ndarray) -> str:
	inputs = processor(
		audio,
		sampling_rate=processor.feature_extractor.sampling_rate,
		language=NEMOTRON_LANGUAGE,
		return_tensors="pt",
	)
	inputs = inputs.to(model.device, dtype=model.dtype)
	with torch.inference_mode():
		output = model.generate(**inputs, return_dict_in_generate=True)

	sequences = output.sequences[0] if getattr(output.sequences, "ndim", 1) > 1 else output.sequences
	text = processor.decode(
		sequences,
		skip_special_tokens=not NEMOTRON_KEEP_LANG_TAGS,
	).strip()
	if not NEMOTRON_KEEP_LANG_TAGS:
		text = re.sub(r"\s*<[^>]+>\s*$", "", text).strip()
	return text


def run_warmup() -> None:
	warmup_audio = np.zeros(16000, dtype=np.float32)
	t0 = time.time()
	transcribe_audio(warmup_audio)
	_label(event="warmup", elapsed=f"{time.time() - t0:.2f}s")


@asynccontextmanager
async def lifespan(app: FastAPI):
	global transcribe_semaphore, ready
	load_model()
	transcribe_semaphore = asyncio.Semaphore(1)

	print("[stt] Warming up model in background...")
	loop = asyncio.get_event_loop()

	def _warmup_and_mark_ready():
		global ready
		try:
			run_warmup()
		except Exception as e:
			print(f"[stt] Warmup failed (first request will retry): {e}")
		ready = True
		print("[stt] Model ready, accepting requests")

	loop.run_in_executor(None, _warmup_and_mark_ready)
	yield
	print("[stt] Shutting down...")


app = FastAPI(title="Nemotron STT Server", lifespan=lifespan)


@app.get("/health")
async def health():
	if not ready:
		return JSONResponse(
			{"status": "loading", "backend": "nemotron", "model": NEMOTRON_MODEL},
			status_code=503,
		)
	return {"status": "ok", "backend": "nemotron", "model": NEMOTRON_MODEL}


@app.post("/transcribe-pcm")
async def transcribe_pcm(request: Request):
	if not ready or model is None or processor is None:
		return JSONResponse({"error": "Model not loaded"}, status_code=503)

	audio_bytes = await request.body()
	if not audio_bytes:
		return JSONResponse({"error": "No audio data"}, status_code=400)

	audio_np = pcm16le_to_float32(audio_bytes)
	duration_s = len(audio_np) / 16000.0

	async def event_stream() -> AsyncGenerator[str, None]:
		t0 = time.time()
		async with transcribe_semaphore:
			text = await asyncio.to_thread(transcribe_audio, audio_np)
			if text:
				yield f"data: {json.dumps({'text': text, 'isFinal': True})}\n\n"
			else:
				_label(event="empty_transcript", seconds=f"{duration_s:.2f}", language=NEMOTRON_LANGUAGE)

		elapsed = time.time() - t0
		rtf = elapsed / duration_s if duration_s > 0 else 0
		print(f"[stt] {duration_s:.1f}s in {elapsed:.2f}s (RTF={rtf:.2f})")

	return StreamingResponse(event_stream(), media_type="text/event-stream")


if __name__ == "__main__":
	host = os.getenv("STT_HOST", "127.0.0.1")
	port = int(os.getenv("STT_PORT", "8000"))
	uvicorn.run(app, host=host, port=port)
