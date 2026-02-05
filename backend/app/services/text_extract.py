from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import List, Optional

import pdfplumber


@dataclass
class PageText:
    page: int
    text: str


def extract_pdf_text(pdf_bytes: bytes, *, max_pages: Optional[int] = None) -> List[PageText]:
    """Extract text from a PDF and return page-indexed results.

    - Best-effort extraction only (no OCR).
    - If a PDF is scanned (image-only), you will likely get empty text.
    """
    out: List[PageText] = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        pages = pdf.pages
        if max_pages is not None:
            pages = pages[:max_pages]
        for i, page in enumerate(pages, start=1):
            try:
                txt = page.extract_text() or ''
            except Exception:
                txt = ''
            # normalize a bit
            txt = txt.replace('\u00a0', ' ').strip()
            out.append(PageText(page=i, text=txt))
    return out


def join_pages(pages: List[PageText]) -> str:
    """Join page texts with simple separators (keeps page numbers)."""
    parts = []
    for p in pages:
        if not p.text:
            continue
        parts.append(f"\n\n[PAGE {p.page}]\n{p.text}")
    return ''.join(parts).strip()
