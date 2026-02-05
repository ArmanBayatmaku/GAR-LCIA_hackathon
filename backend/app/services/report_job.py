from __future__ import annotations

import mimetypes
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

from ..core.config import settings
from ..core.supabase import get_admin_client
from .report_extractor import extract_fields_from_documents
from .report_generator import build_seat_report_docx
from .seat_decider import make_seat_change_decision
from .text_extract import extract_pdf_text, join_pages


def _get_project(sb, project_id: str, user_id: str) -> Dict[str, Any]:
    res = (
        sb.table('projects')
        .select('*')
        .eq('id', project_id)
        .eq('owner_id', user_id)
        .limit(1)
        .execute()
    )
    data = res.data if hasattr(res, 'data') else res.get('data')
    if not data:
        raise RuntimeError('Project not found')
    return data[0]


def _list_documents(sb, project_id: str, user_id: str) -> List[Dict[str, Any]]:
    res = (
        sb.table('documents')
        .select('*')
        .eq('project_id', project_id)
        .eq('owner_id', user_id)
        .order('created_at', desc=False)
        .execute()
    )
    data = res.data if hasattr(res, 'data') else res.get('data')
    return data or []


def _download_doc_text(sb, doc_row: Dict[str, Any]) -> Tuple[str, str]:
    """Download a document and return (filename, text_with_page_tags).

    Currently supports PDFs. Non-PDFs return empty text.
    """
    filename = doc_row.get('filename') or 'document'
    bucket = doc_row.get('storage_bucket')
    path = doc_row.get('storage_path')
    if not bucket or not path:
        return filename, ''

    mime = (doc_row.get('mime_type') or mimetypes.guess_type(filename)[0] or '').lower()

    try:
        data = sb.storage.from_(bucket).download(path)
    except Exception:
        return filename, ''

    if not data:
        return filename, ''

    # supabase-py may return bytes or a file-like; handle bytes only
    if hasattr(data, 'read'):
        data = data.read()

    if 'pdf' in mime or filename.lower().endswith('.pdf'):
        pages = extract_pdf_text(data)
        return filename, join_pages(pages)

    return filename, ''


def _merge_into_intake(project: Dict[str, Any], extracted: Dict[str, Any]) -> Dict[str, Any]:
    intake = project.get('intake') or {}
    if not isinstance(intake, dict):
        intake = {}

    mapping = {
        'current_seat': 'current_seat',
        'proposed_seats': 'proposed_seats',
        'institution_rules': 'institution_rules',
        'governing_law': 'governing_law',
        'urgency': 'urgency',
        'parties_assets_where': 'parties_assets_where',
        'arbitration_agreement_text': 'arbitration_agreement_text',
    }

    changed = False
    for intake_key, extracted_key in mapping.items():
        if not intake.get(intake_key) and extracted.get(extracted_key):
            intake[intake_key] = extracted[extracted_key]
            changed = True

    # Optional: store parties/dispute as well for later UX
    if extracted.get('parties') and not intake.get('parties'):
        intake['parties'] = extracted.get('parties')
        changed = True
    if extracted.get('nature_of_dispute') and not intake.get('nature_of_dispute'):
        intake['nature_of_dispute'] = extracted.get('nature_of_dispute')
        changed = True

    return intake if changed else project.get('intake') or {}


def generate_report_for_project(project_id: str, user_id: str) -> None:
    """Generate a DOCX report and attach it to the project.

    This now performs a lightweight extraction from uploaded documents first.
    If it fails or documents are missing/unreadable, placeholders remain.
    """

    sb = get_admin_client()

    # Mark as working while generating
    try:
        sb.table('projects').update({'status': 'working', 'report_error': None}).eq('id', project_id).eq('owner_id', user_id).execute()
    except Exception:
        pass

    try:
        project = _get_project(sb, project_id, user_id)
        docs = _list_documents(sb, project_id, user_id)

        # No docs: still generate skeleton.
        if not docs:
            report = build_seat_report_docx(project, docs)
            object_name = f"{user_id}/{project_id}/reports/{uuid.uuid4()}-{report.filename.replace(' ', '_')}"
            sb.storage.from_(settings.storage_bucket).upload(
                path=object_name,
                file=report.content,
                file_options={"content-type": report.mime_type, "x-upsert": "true"},
            )
            ts = datetime.now(timezone.utc).isoformat()
            sb.table('projects').update({
                'status': 'intervention',
                'report_bucket': settings.storage_bucket,
                'report_path': object_name,
                'report_mime_type': report.mime_type,
                'report_byte_size': len(report.content),
                'report_generated_at': ts,
                'report_error': None,
            }).eq('id', project_id).eq('owner_id', user_id).execute()
            return

        # 1) Extract text from uploaded docs (PDFs)
        docs_text: List[Tuple[str, str]] = []
        for d in docs:
            name, txt = _download_doc_text(sb, d)
            if txt.strip():
                docs_text.append((name, txt))

        # If we couldn't extract any text, the PDFs may be scanned/image-only or the storage paths are wrong.
        if not docs_text:
            try:
                sb.table('projects').update({'report_error': 'No extractable text found in uploaded documents. If PDFs are scanned images, OCR is needed.'}).eq('id', project_id).eq('owner_id', user_id).execute()
            except Exception:
                pass
        # 2) LLM-assisted extraction (falls back to regex heuristics)
        extracted: Dict[str, Any] = {}
        if docs_text:
            extracted = extract_fields_from_documents(docs_text=docs_text)

        # 3) Merge extracted fields into project intake (so UI shows it too)
        try:
            new_intake = _merge_into_intake(project, extracted)
            if new_intake != (project.get('intake') or {}):
                sb.table('projects').update({'intake': new_intake}).eq('id', project_id).eq('owner_id', user_id).execute()
                project['intake'] = new_intake
        except Exception:
            pass

        # 4) Generate a grounded decision for Section 3 (Conclusion)
        try:
            decision = make_seat_change_decision(docs_text=docs_text, intake=(project.get("intake") or {}), extracted=extracted)
            if isinstance(decision, dict):
                extracted.update(decision)
                # Persist the decision so chat can explain "Intervention Required" more concretely.
                try:
                    cur_intake = project.get('intake') or {}
                    if not isinstance(cur_intake, dict):
                        cur_intake = {}
                    cur_intake['_last_decision'] = decision
                    # If the model explicitly asked for more info, store it in a predictable place.
                    if decision.get('should_change_seat') == 'intervention_required':
                        cur_intake['_intervention'] = {
                            'missing_info': decision.get('missing_info') or [],
                            'note': 'Decision requires more grounded inputs/sources before concluding.'
                        }
                    sb.table('projects').update({'intake': cur_intake}).eq('id', project_id).eq('owner_id', user_id).execute()
                    project['intake'] = cur_intake
                except Exception:
                    pass
        except Exception as _e:
            # If decision fails, keep placeholders but store the error for visibility.
            try:
                sb.table("projects").update({"report_error": f"Decision generation failed: {_e}"}).eq("id", project_id).eq("owner_id", user_id).execute()
            except Exception:
                pass

        # 5) Build report, passing extracted fields for the template sections
        report = build_seat_report_docx(project, docs, extracted=extracted)

        object_name = f"{user_id}/{project_id}/reports/{uuid.uuid4()}-{report.filename.replace(' ', '_')}"
        sb.storage.from_(settings.storage_bucket).upload(
            path=object_name,
            file=report.content,
            file_options={"content-type": report.mime_type, "x-upsert": "true"},
        )

        # Mark intervention if we still don't have the basics
        intake = project.get('intake') or {}
        required = ['current_seat', 'proposed_seats', 'arbitration_agreement_text']
        missing_basics = any((not intake.get(k) and not extracted.get(k)) for k in required)
        decision_flag = extracted.get('should_change_seat')
        needs_intervention = missing_basics or (decision_flag == 'intervention_required')

        ts = datetime.now(timezone.utc).isoformat()
        sb.table('projects').update({
            'status': 'intervention' if needs_intervention else 'complete',
            'report_bucket': settings.storage_bucket,
            'report_path': object_name,
            'report_mime_type': report.mime_type,
            'report_byte_size': len(report.content),
            'report_generated_at': ts,
            'report_error': None,
        }).eq('id', project_id).eq('owner_id', user_id).execute()

    except Exception as e:
        # Don't crash the server; store the error for UI visibility.
        sb.table('projects').update({'status': 'intervention', 'report_error': str(e)}).eq('id', project_id).eq('owner_id', user_id).execute()
