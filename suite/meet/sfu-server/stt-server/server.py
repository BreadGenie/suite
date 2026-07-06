#!/usr/bin/env python3
"""
FastAPI server for real-time STT using NVIDIA Nemotron 3.5 ASR via NeMo.

Endpoints:
  GET  /health           -> { status: "ok" }
  POST /transcribe-pcm   -> SSE data lines from ASR PCM s16le, 16kHz mono
  WS   /stream           -> session-scoped PCM stream with transcript deltas
"""

import asyncio
import json
import os
import re
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import nemo.collections.asr as nemo_asr
import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from nemo.collections.asr.parts.utils.streaming_utils import CacheAwareStreamingAudioBuffer
from starlette.requests import Request

NEMOTRON_MODEL = os.getenv("NEMOTRON_MODEL", "nvidia/nemotron-3.5-asr-streaming-0.6b")
NEMOTRON_LANGUAGE = os.getenv("NEMOTRON_LANGUAGE", "en-US").strip() or "en-US"
NEMOTRON_ATT_CONTEXT_SIZE = os.getenv("NEMOTRON_ATT_CONTEXT_SIZE", "56,3")
NEMOTRON_FINAL_SILENCE_MS = int(os.getenv("NEMOTRON_FINAL_SILENCE_MS", "600"))

model = None
transcribe_semaphore = None
ready = False


def parse_att_context_size() -> list[int]:
	try:
		parts = [int(part.strip()) for part in NEMOTRON_ATT_CONTEXT_SIZE.split(",")]
	except ValueError:
		parts = [56, 1]
	return parts if len(parts) == 2 else [56, 1]


def _label(**parts) -> None:
	parts_str = " ".join(f"{k}={v}" for k, v in parts.items())
	print(f"[stt] {parts_str}")


def pcm16le_to_float32(audio_bytes: bytes) -> np.ndarray:
	audio_i16 = np.frombuffer(audio_bytes, dtype=np.int16)
	return audio_i16.astype(np.float32) / 32768.0


def clean_transcript(text: str) -> str:
	text = re.sub(r"\s*<[a-z]{2,3}(?:-[a-z0-9]{2,8})?>\s*", " ", text, flags=re.IGNORECASE)
	return re.sub(r"\s+", " ", text).strip()


def model_device():
	try:
		return next(model.parameters()).device
	except (AttributeError, StopIteration):
		return None


def move_to_model_device(value):
	device = model_device()
	if device is not None and torch.is_tensor(value):
		return value.to(device)
	return value


def load_model() -> None:
	global model
	device = "cuda" if torch.cuda.is_available() else "cpu"
	att_context_size = parse_att_context_size()
	print("╔══════════════════════════════════════════════╗")
	print("║  Loading Nemotron 3.5 ASR (NeMo)            ║")
	print(f"║  Model   : {NEMOTRON_MODEL:<35s}║")
	print(f"║  Device  : {device:<35s}║")
	print(f"║  Lang    : {NEMOTRON_LANGUAGE:<35s}║")
	print(f"║  Context : {att_context_size!s:<35s}║")
	print("╚══════════════════════════════════════════════╝")
	t0 = time.time()

	model = nemo_asr.models.ASRModel.from_pretrained(NEMOTRON_MODEL).eval()
	if device == "cuda":
		model = model.to("cuda")
	model.set_inference_prompt(NEMOTRON_LANGUAGE)
	model.encoder.set_default_att_context_size(att_context_size)
	_label(event="loaded", backend="nemo", elapsed=f"{time.time() - t0:.2f}s")


class NemoStreamingDecoder:
	def __init__(self, language: str):
		self.language = language or NEMOTRON_LANGUAGE
		model.set_inference_prompt(self.language)
		self.reset()

	def reset(self) -> None:
		self.buffer = CacheAwareStreamingAudioBuffer(model, online_normalization=False)
		self.cfg = model.encoder.streaming_cfg
		self.cache_last_channel, self.cache_last_time, self.cache_last_channel_len = (
			model.encoder.get_initial_cache_state(batch_size=1)
		)
		self.cache_last_channel = move_to_model_device(self.cache_last_channel)
		self.cache_last_time = move_to_model_device(self.cache_last_time)
		self.cache_last_channel_len = move_to_model_device(self.cache_last_channel_len)
		self.previous_hypotheses = None
		self.step = 0
		self.last_text = ""

	def append_audio(self, audio: np.ndarray) -> None:
		if audio.size == 0:
			return
		self.buffer.append_audio(audio, stream_id=-1)

	def process_pending(self) -> tuple[str, int]:
		chunk_count = 0
		for chunk, chunk_len in self.buffer:
			chunk_count += 1
			chunk = move_to_model_device(chunk)
			chunk_len = move_to_model_device(chunk_len)
			with torch.inference_mode():
				(
					_,
					_,
					self.cache_last_channel,
					self.cache_last_time,
					self.cache_last_channel_len,
					self.previous_hypotheses,
				) = model.conformer_stream_step(
					processed_signal=chunk,
					processed_signal_length=chunk_len,
					cache_last_channel=self.cache_last_channel,
					cache_last_time=self.cache_last_time,
					cache_last_channel_len=self.cache_last_channel_len,
					previous_hypotheses=self.previous_hypotheses,
					drop_extra_pre_encoded=self.cfg.drop_extra_pre_encoded if self.step else 0,
					keep_all_outputs=self.buffer.is_buffer_empty(),
					return_transcription=True,
				)
			self.step += 1
			if self.previous_hypotheses:
				self.last_text = clean_transcript(self.previous_hypotheses[0].text)
		return self.last_text, chunk_count


class StreamSession:
	def __init__(self, metadata: dict):
		self.session_id = metadata["sessionId"]
		self.room_id = metadata["roomId"]
		self.participant_id = metadata["participantId"]
		self.producer_id = metadata["producerId"]
		self.participant_name = metadata.get("participantName")
		self.sample_rate = int(metadata.get("sampleRate") or 16000)
		self.language = metadata.get("language") or NEMOTRON_LANGUAGE
		self.sequence = 0
		self.last_sent_text = ""
		self.utterance_audio: list[np.ndarray] = []

	def append(self, audio_bytes: bytes) -> None:
		audio = pcm16le_to_float32(audio_bytes)
		self.utterance_audio.append(audio)

	def transcribe_utterance(self) -> str:
		if not self.utterance_audio:
			return ""
		audio = np.concatenate(self.utterance_audio)
		if NEMOTRON_FINAL_SILENCE_MS > 0:
			audio = np.concatenate(
				[
					audio,
					np.zeros(
						int(self.sample_rate * NEMOTRON_FINAL_SILENCE_MS / 1000),
						dtype=np.float32,
					),
				]
			)
		decoder = NemoStreamingDecoder(self.language)
		decoder.append_audio(audio)
		text, _ = decoder.process_pending()
		return text

	def audio_duration_seconds(self) -> float:
		return sum(len(audio) for audio in self.utterance_audio) / self.sample_rate

	def reset_utterance(self) -> None:
		self.last_sent_text = ""
		self.utterance_audio = []

	def transcript_event(self, text: str, is_final: bool, duration_ms: float) -> dict:
		self.sequence += 1
		return {
			"type": "transcript",
			"sessionId": self.session_id,
			"roomId": self.room_id,
			"participantId": self.participant_id,
			"producerId": self.producer_id,
			"sequence": self.sequence,
			"text": text,
			"isFinal": is_final,
			"durationMs": duration_ms,
		}


def transcribe_audio(audio: np.ndarray, language: str = NEMOTRON_LANGUAGE) -> str:
	decoder = NemoStreamingDecoder(language)
	decoder.append_audio(audio)
	text, _ = decoder.process_pending()
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
			{"status": "loading", "backend": "nemo", "model": NEMOTRON_MODEL},
			status_code=503,
		)
	return {"status": "ok", "backend": "nemo", "model": NEMOTRON_MODEL}


@app.post("/transcribe-pcm")
async def transcribe_pcm(request: Request):
	if not ready or model is None:
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


def validate_start_message(message: dict) -> tuple[dict | None, str | None]:
	if message.get("type") != "start":
		return None, "First stream message must be type=start"

	missing = [
		key
		for key in ("sessionId", "roomId", "participantId", "producerId", "sampleRate")
		if not message.get(key)
	]
	if missing:
		return None, f"Missing required stream metadata: {', '.join(missing)}"

	try:
		message["sampleRate"] = int(message["sampleRate"])
	except (TypeError, ValueError):
		return None, "sampleRate must be an integer"

	return message, None


@app.websocket("/stream")
async def stream(websocket: WebSocket):
	await websocket.accept()
	if not ready or model is None:
		await websocket.close(code=1013, reason="Model not loaded")
		return

	session: StreamSession | None = None
	try:
		start_text = await websocket.receive_text()
		try:
			start_message = json.loads(start_text)
		except json.JSONDecodeError:
			await websocket.close(code=1003, reason="Invalid JSON start message")
			return

		metadata, error = validate_start_message(start_message)
		if error:
			await websocket.close(code=1008, reason=error)
			return

		session = StreamSession(metadata)
		_label(
			event="stream_start",
			session=session.session_id,
			room=session.room_id,
			participant=session.participant_id,
			producer=session.producer_id,
			language=session.language,
		)

		while True:
			message = await websocket.receive()
			if message["type"] == "websocket.disconnect":
				break

			if message.get("bytes") is not None:
				session.append(message["bytes"])
				continue

			text_message = message.get("text")
			if text_message is None:
				continue

			try:
				control = json.loads(text_message)
			except json.JSONDecodeError:
				print(f"[stt] ignoring invalid control message session={session.session_id}")
				continue

			if control.get("sessionId") != session.session_id:
				print(f"[stt] ignoring mismatched control message session={session.session_id}")
				continue

			message_type = control.get("type")
			if message_type == "final":
				duration_ms = float(control.get("durationMs") or 0)
				t0 = time.time()
				async with transcribe_semaphore:
					text = await asyncio.to_thread(session.transcribe_utterance)
				elapsed = time.time() - t0
				_label(
					event="stream_final",
					session=session.session_id,
					audio_seconds=f"{session.audio_duration_seconds():.1f}",
					text_len=len(text),
					duration_ms=f"{duration_ms:.0f}",
					elapsed=f"{elapsed:.2f}s",
				)
				await websocket.send_json(session.transcript_event(text.strip(), True, duration_ms))
				session.reset_utterance()
			elif message_type == "end":
				break
	except WebSocketDisconnect:
		pass
	finally:
		if session is not None:
			_label(event="stream_end", session=session.session_id)


if __name__ == "__main__":
	host = os.getenv("STT_HOST", "127.0.0.1")
	port = int(os.getenv("STT_PORT", "8000"))
	uvicorn.run(app, host=host, port=port)
