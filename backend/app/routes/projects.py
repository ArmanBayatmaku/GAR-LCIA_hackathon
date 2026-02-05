from __future__ import annotations

import json
import io
import mimetypes
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse
from docx import Document as DocxDocument

from ..core.config import settings
from ..core.security import get_current_user_id
from ..core.supabase import get_admin_client
from ..schemas import DocumentOut, ProjectCreate, ProjectOut, ProjectUpdate
from ..services.report_job import generate_report_for_project

router = APIRouter(prefix='/projects', tags=['projects'])


def _attach_report_url(row: dict) -> dict:
    """Add report_url if a report_path exists (bucket is assumed public for hackathon)."""
    try:
        if row.get('report_bucket') and row.get('report_path'):
            sb = get_admin_client()
            row['report_url'] = sb.storage.from_(row['report_bucket']).get_public_url(row['report_path'])
    except Exception:
        pass
    return row


def _project_or_404(project_id: str, user_id: str) -> dict:
    sb = get_admin_client()
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Project not found')
    return data[0]


@router.post('', response_model=ProjectOut)
def create_project(
    payload: ProjectCreate,
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    status_value = payload.status or 'working'
    insert = {
        'owner_id': user_id,
        'title': payload.title,
        'description': payload.description,
        'status': status_value,
        'intake': payload.intake or {},
    }
    res = sb.table('projects').insert(insert).execute()
    data = res.data if hasattr(res, 'data') else res.get('data')
    if not data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Failed to create project')
    project = data[0]

    # Fire-and-forget report generation. This will update status and attach report_path when done.
    background.add_task(generate_report_for_project, project['id'], user_id)

    return _attach_report_url(project)


@router.post('/with-documents', response_model=ProjectOut)
def create_project_with_documents(
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    status_value: Optional[str] = Form(None),
    intake_json: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
):
    """Create a project and upload documents in one call.

    Frontends usually find this easier than: create project -> upload docs.

    - `intake_json` should be a JSON string (e.g. '{"current_seat":"London"}').
    """
    intake: Dict[str, Any] = {}
    if intake_json:
        try:
            intake = json.loads(intake_json)
            if not isinstance(intake, dict):
                raise ValueError('intake_json must be an object')
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'Invalid intake_json: {e}') from e

    sb = get_admin_client()
    insert = {
        'owner_id': user_id,
        'title': title,
        'description': description,
        'status': status_value or 'working',
        'intake': intake,
    }
    res = sb.table('projects').insert(insert).execute()
    data = res.data if hasattr(res, 'data') else res.get('data')
    if not data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Failed to create project')
    project = data[0]

    # Upload files if provided
    if files:
        for f in files:
            content = f.file.read()
            if not content:
                continue
            mime = f.content_type or mimetypes.guess_type(f.filename or '')[0] or 'application/octet-stream'
            safe_name = (f.filename or 'file').replace('/', '_').replace('\\', '_')
            object_name = f"{user_id}/{project['id']}/{uuid.uuid4()}-{safe_name}"

            try:
                sb.storage.from_(settings.storage_bucket).upload(
                    path=object_name,
                    file=content,
                    file_options={"content-type": mime, "x-upsert": "false"},
                )
            except Exception as e:
                # If upload fails, we keep the project (hackathon simplicity). You can change this to rollback.
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Upload failed for {safe_name}: {e}") from e

            doc_row = {
                'project_id': project['id'],
                'owner_id': user_id,
                'filename': safe_name,
                'storage_bucket': settings.storage_bucket,
                'storage_path': object_name,
                'mime_type': mime,
                'byte_size': len(content),
            }
            sb.table('documents').insert(doc_row).execute()

    # Generate report after docs are uploaded
    background.add_task(generate_report_for_project, project['id'], user_id)

    return _attach_report_url(project)


@router.get('', response_model=list[ProjectOut])
def list_projects(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    res = sb.table('projects').select('*').eq('owner_id', user_id).order('created_at', desc=True).execute()
    data = res.data if hasattr(res, 'data') else res.get('data')
    rows = data or []
    return [_attach_report_url(r) for r in rows]


@router.get('/{project_id}', response_model=ProjectOut)
def get_project(project_id: str, user_id: str = Depends(get_current_user_id)):
    return _attach_report_url(_project_or_404(project_id, user_id))


@router.patch('/{project_id}', response_model=ProjectOut)
def update_project(project_id: str, payload: ProjectUpdate, user_id: str = Depends(get_current_user_id)):
    _project_or_404(project_id, user_id)
    update: Dict[str, Any] = {}
    if payload.title is not None:
        update['title'] = payload.title
    if payload.description is not None:
        update['description'] = payload.description
    if payload.status is not None:
        update['status'] = payload.status
    if payload.intake is not None:
        update['intake'] = payload.intake

    if not update:
        return _project_or_404(project_id, user_id)

    sb = get_admin_client()
    res = sb.table('projects').update(update).eq('id', project_id).eq('owner_id', user_id).execute()
    data = res.data if hasattr(res, 'data') else res.get('data')
    if not data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Failed to update project')
    return _attach_report_url(data[0])


@router.get('/{project_id}/report')
def get_project_report(project_id: str, user_id: str = Depends(get_current_user_id)):
    """Return a public URL for the latest report (bucket assumed public for hackathon)."""
    project = _project_or_404(project_id, user_id)
    if not project.get('report_bucket') or not project.get('report_path'):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Report not generated')
    sb = get_admin_client()
    url = sb.storage.from_(project['report_bucket']).get_public_url(project['report_path'])
    return {'download_url': url}


def _docx_to_text(docx_bytes: bytes) -> str:
    """Extract a readable plain-text preview from a DOCX."""
    try:
        doc = DocxDocument(io.BytesIO(docx_bytes))
        lines: List[str] = []
        for p in doc.paragraphs:
            t = (p.text or '').strip()
            if t:
                lines.append(t)
        return "\n".join(lines)
    except Exception:
        return ""


@router.get('/{project_id}/report/text', response_class=PlainTextResponse)
def get_project_report_text(project_id: str, user_id: str = Depends(get_current_user_id)):
    """Return a plain-text preview of the latest generated report."""
    project = _project_or_404(project_id, user_id)
    if not project.get('report_bucket') or not project.get('report_path'):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Report not generated')

    sb = get_admin_client()
    try:
        docx_bytes = sb.storage.from_(project['report_bucket']).download(project['report_path'])
    except Exception:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='Failed to fetch report from storage')

    text = _docx_to_text(docx_bytes) if docx_bytes else ""
    if not text:
        # Still return 200 so the frontend can fall back to download.
        return ""
    return text


@router.post('/{project_id}/report/regenerate')
def regenerate_report(project_id: str, background: BackgroundTasks, user_id: str = Depends(get_current_user_id)):
    """Regenerate the report for a project (e.g., after uploading documents)."""
    _project_or_404(project_id, user_id)
    background.add_task(generate_report_for_project, project_id, user_id)
    return {'ok': True}


@router.delete('/{project_id}')
def delete_project(project_id: str, user_id: str = Depends(get_current_user_id)):
    _project_or_404(project_id, user_id)
    sb = get_admin_client()

    # Best-effort cleanup: remove stored files for this project.
    # If this fails, storage objects may leak. For a hackathon demo this is acceptable,
    # but you should fix it if you keep the project.
    try:
        docs_res = (
            sb.table('documents')
            .select('storage_bucket,storage_path')
            .eq('project_id', project_id)
            .eq('owner_id', user_id)
            .execute()
        )
        docs = docs_res.data if hasattr(docs_res, 'data') else docs_res.get('data')
        docs = docs or []
        # group removals per bucket (usually one bucket)
        by_bucket = {}
        for d in docs:
            by_bucket.setdefault(d['storage_bucket'], []).append(d['storage_path'])
        for bucket, paths in by_bucket.items():
            if paths:
                sb.storage.from_(bucket).remove(paths)
    except Exception:
        pass

    sb.table('projects').delete().eq('id', project_id).eq('owner_id', user_id).execute()
    return {'ok': True}
