"""
Knowledge Loader
Uploads rulebook files from ./knowledge_base to the Gemini Files API
and returns references for use in generate_content calls.
"""

import io
import mimetypes
import pathlib

import streamlit as st
from dotenv import load_dotenv
from google import genai


class AsciiNameFileWrapper(io.IOBase):
    """File-like wrapper that presents a clean ASCII-only name attribute.
    This prevents HTTP header encoding crashes (e.g. 'ascii' codec can't encode...)
    in underlying multipart request libraries when files have Unicode filenames,
    while allowing the original Unicode name to be preserved in display_name.
    """
    def __init__(self, filepath: pathlib.Path):
        self.file = open(filepath, 'rb')
        # Replace any non-ASCII characters in the filename with underscores
        clean_name = "".join(
            c if ord(c) < 128 else "_" for c in filepath.name
        )
        self.name = clean_name
        self.mode = 'rb'

    def read(self, *args, **kwargs):
        return self.file.read(*args, **kwargs)

    def seek(self, *args, **kwargs):
        return self.file.seek(*args, **kwargs)

    def tell(self):
        return self.file.tell()

    def close(self):
        self.file.close()

    def readable(self):
        return True

    def seekable(self):
        return True



KNOWLEDGE_DIR = pathlib.Path("./knowledge_base")

# Ensure common extensions are registered (Python's mimetypes DB can miss these)
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("text/markdown", ".markdown")


def _guess_mime(filepath: pathlib.Path) -> str:
    """Return a MIME type for *filepath*, falling back to
    ``text/plain`` when detection fails."""
    mime, _ = mimetypes.guess_type(str(filepath))
    return mime or "text/plain"


@st.cache_resource(show_spinner="Uploading rulebooks to Gemini…")
def load_knowledge_files() -> list:
    """Load .env, initialise the genai Client, and ensure every file in
    ./knowledge_base is uploaded to the Gemini Files API.

    Returns:
        A list of genai File objects ready to be passed to generate_content.
    """
    load_dotenv()

    client = genai.Client()

    if not KNOWLEDGE_DIR.exists():
        KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
        return []

    # Collect local file paths
    local_files = [
        p for p in KNOWLEDGE_DIR.iterdir()
        if p.is_file() and not p.name.startswith(".")
    ]
    if not local_files:
        return []

    # Build a lookup of files already uploaded (keyed by display_name)
    existing = {}
    for f in client.files.list():
        existing[f.display_name] = f

    uploaded: list = []
    for filepath in local_files:
        display_name = filepath.name
        if display_name in existing:
            uploaded.append(existing[display_name])
        else:
            try:
                mime = _guess_mime(filepath)
                with AsciiNameFileWrapper(filepath) as f:
                    result = client.files.upload(
                        file=f,
                        config={
                            "mime_type": mime,
                            "display_name": display_name
                        },
                    )
                uploaded.append(result)
            except Exception as exc:
                st.warning(f"⚠️ Skipped uploading {display_name}: {exc}")

    return uploaded


def get_client() -> genai.Client:
    """Return a genai Client (re-uses the env already loaded by
    load_knowledge_files)."""
    load_dotenv()
    return genai.Client()
