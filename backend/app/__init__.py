"""World Monitor backend package.

Exports the FastAPI application so both ``uvicorn app:app`` and
``uvicorn app.main:app`` work when run from the backend directory.
"""

from .main import app

__all__ = ["app"]
