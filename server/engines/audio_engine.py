import os
import asyncio
from typing import List, Tuple
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import torch
import httpx

from server.database import SessionLog

async def process_session_audio(session_log_id: int, audio_file_path: str, db: AsyncSession):
    try:
        # Initialize Whisper model
        whisper_model = WhisperModel("base", device="cuda", compute_type="float16")
        
        # Load Pyannote speaker diarization pipeline
        diarization_pipeline = Pipeline.from_pretrained(
            'pyannote/speaker-diarization-3.1',
            use_auth_token=os.getenv('HF_AUTH_TOKEN')
        )
        if torch.cuda.is_available():
            diarization_pipeline.to(torch.device("cuda"))
        
        # Update the SessionLog to set audio_status='processing'
        result = await db.execute(select(SessionLog).where(SessionLog.id == session_log_id))
        session_log = result.scalars().first()
        if session_log:
            session_log.audio_status = 'processing'
            await db.commit()

        # Run Whisper transcription
        segments, info = whisper_model.transcribe(audio_file_path)

        # Run Pyannote diarization
        diarized_speech = diarization_pipeline(audio_file_path)
        
        # Merge Whisper words/segments with Pyannote diarization
        merged_transcript = []
        speaker_index = 0
        
        for segment in segments:
            start_time = segment.start * 1000  # Convert seconds to milliseconds
            end_time = segment.end * 1000  # Convert seconds to milliseconds
            
            # Pyannote crop uses seconds
            speaker_annotation = diarized_speech.crop(start=segment.start, end=segment.end)
            if not speaker_annotation:
                merged_transcript.append(f"Speaker {speaker_index}: {segment.text}")
                speaker_index += 1
            else:
                # Get the most prominent speaker in this segment
                dominant_speaker = None
                max_duration = 0
                for turn, _, speaker in speaker_annotation.itertracks(yield_label=True):
                    duration = turn.end - turn.start
                    if duration > max_duration:
                        max_duration = duration
                        dominant_speaker = speaker
                
                if dominant_speaker:
                    merged_transcript.append(f"{dominant_speaker}: {segment.text}")
                else:
                    merged_transcript.append(f"Unknown: {segment.text}")

        # Join the merged transcript into a single string
        raw_transcript = "\n".join(merged_transcript)

        # Call local Ollama API for summarization
        async with httpx.AsyncClient() as client:
            detailed_log_response = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "qwen2.5-coder:14b",
                    "prompt": f"Generate a detailed action log based on the following RPG session transcript:\n{raw_transcript}",
                    "stream": False
                },
                timeout=300.0
            )
            detailed_log_response.raise_for_status()
            detailed_log = detailed_log_response.json().get('response', '')

            summary_response = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "qwen2.5-coder:14b",
                    "prompt": f"Generate a player-friendly narrative summary based on the following RPG session transcript:\n{raw_transcript}",
                    "stream": False
                },
                timeout=300.0
            )
            summary_response.raise_for_status()
            summary = summary_response.json().get('response', '')

        # Update the SessionLog to set raw_transcript, detailed_log, summary, and audio_status='completed'
        result = await db.execute(select(SessionLog).where(SessionLog.id == session_log_id))
        session_log = result.scalars().first()
        if session_log:
            session_log.raw_transcript = raw_transcript
            session_log.detailed_log = detailed_log
            session_log.summary = summary
            session_log.audio_status = 'completed'
            await db.commit()

    except Exception as e:
        print(f"Error processing session {session_log_id}: {e}")
        
        # Handle exceptions by setting audio_status='failed'
        result = await db.execute(select(SessionLog).where(SessionLog.id == session_log_id))
        session_log = result.scalars().first()
        if session_log:
            session_log.audio_status = 'failed'
            await db.commit()
