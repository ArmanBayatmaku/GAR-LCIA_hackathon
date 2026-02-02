from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .routes import auth, projects, documents, chat

app = FastAPI(title='Arb Hackathon API', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

@app.get('/health')
def health():
    return {'status': 'ok'}

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(chat.router)
