"""Run the FastAPI backend on Windows (http://localhost:8001).

    .venv\Scripts\python.exe scripts\dev_backend.py

psycopg's async mode needs the selector event loop, which Windows does not use by default, so this
launcher switches to it and then starts uvicorn. Connection settings come from the repo .env.
"""
import asyncio
import sys
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn

ROOT = Path(__file__).resolve().parent.parent
# loop="none": leave the loop alone so the policy above is the one asyncio.run() uses.
uvicorn.run("app.main:app", app_dir=str(ROOT / "backend"), host="127.0.0.1", port=8001, loop="none")
