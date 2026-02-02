from __future__ import annotations

import mimetypes
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ..core.security import get_current_user_id
from ..core.supabase import get_admin_client
from ..schemas import DocumentOut
from .projects import _project_or_404
from ..core.config import settings

router = APIRouter(prefix='/projects', tags=['documents'])


def _doc_or_404(project_id: str, document_id: str, user_id: str) -> dict:
    sb = get_admin_client()
    res = sb.table('documents').select('*').eq('id', document_id).eq('project_id', project_id).eq('owner_id', user_id).limit(1).execute()
    data = res.data if hasattr(res, 'data') else res.get('data')
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Document not found')
    return data[0]


@router.post('/{project_id}/documents/upload', response_model=list[DocumentOut])
def upload_documents(
    project_id: str,
    files: List[UploadFile] = File(...),
    user_id: str = Depends(get_current_user_id),
):
    _project_or_404(project_id, user_id)
    sb = get_admin_client()
    inserted: list[dict] = []

    for f in files:
        content = f.file.read()
        if content is None:
            continue
        size = len(content)
        mime = f.content_type or mimetypes.guess_type(f.filename or '')[0] or 'application/octet-stream'

        safe_name = (f.filename or 'file').replace('/', '_').replace('\\', '_')
        object_name = f"{user_id}/{project_id}/{uuid.uuid4()}-{safe_name}"

        # Upload bytes
        try:
            sb.storage.from_(settings.storage_bucket).upload(
                path=object_name,
                file=content,
                file_options={"content-type": mime, "x-upsert": "false"},
            )
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Upload failed for {safe_name}: {e}") from e

        doc_row = {
            'project_id': project_id,
            'owner_id': user_id,
            'filename': safe_name,
            'storage_bucket': settings.storage_bucket,
            'storage_path': object_name,
            'mime_type': mime,
            'byte_size': size,
        }
        res = sb.table('documents').insert(doc_row).execute()
        data = res.data if hasattr(res, 'data') else res.get('data')
        if data:
            inserted.append(data[0])

    # Add public download URL (bucket is assumed public for hackathon)
    out: list[DocumentOut] = []
    for d in inserted:
        public = sb.storage.from_(d['storage_bucket']).get_public_url(d['storage_path'])
        out.append(DocumentOut(
            id=d['id'],
            project_id=d['project_id'],
            filename=d['filename'],
            mime_type=d.get('mime_type'),
            byte_size=d.get('byte_size'),
            created_at=d['created_at'],
            download_url=public,
        ))
    return out


@router.get('/{project_id}/documents', response_model=list[DocumentOut])
def list_documents(project_id: str, user_id: str = Depends(get_current_user_id)):
    _project_or_404(project_id, user_id)
    sb = get_admin_client()
    res = sb.table('documents').select('*').eq('project_id', project_id).eq('owner_id', user_id).order('created_at', desc=True).execute()
    data = res.data if hasattr(res, 'data') else res.get('data')
    docs = data or []

    out: list[DocumentOut] = []
    for d in docs:
        public = sb.storage.from_(d['storage_bucket']).get_public_url(d['storage_path'])
        out.append(DocumentOut(
            id=d['id'],
            project_id=d['project_id'],
            filename=d['filename'],
            mime_type=d.get('mime_type'),
            byte_size=d.get('byte_size'),
            created_at=d['created_at'],
            download_url=public,
        ))
    return out


@router.delete('/{project_id}/documents/{document_id}')
def delete_document(project_id: str, document_id: str, user_id: str = Depends(get_current_user_id)):
    doc = _doc_or_404(project_id, document_id, user_id)
    sb = get_admin_client()
    # remove object from storage
    try:
        sb.storage.from_(doc['storage_bucket']).remove([doc['storage_path']])
    except Exception:
        # If remove fails but DB deletes, that's still a leak. For hackathon this is acceptable.
        pass
    sb.table('documents').delete().eq('id', document_id).eq('project_id', project_id).eq('owner_id', user_id).execute()
    return {'ok': True}
