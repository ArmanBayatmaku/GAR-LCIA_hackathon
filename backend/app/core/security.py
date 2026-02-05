from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from .supabase import get_admin_client


def get_access_token(request: Request) -> str:
    auth = request.headers.get('authorization') or request.headers.get('Authorization')
    if not auth:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing Authorization header')
    parts = auth.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Authorization header')
    return parts[1].strip()


def get_current_user_id(token: str = Depends(get_access_token)) -> str:
    admin = get_admin_client()
    try:
        res = admin.auth.get_user(token)
        user = getattr(res, 'user', None) or (res.get('user') if isinstance(res, dict) else None)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token')
        user_id = user.id if hasattr(user, 'id') else user.get('id')
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token')
        return str(user_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token') from e
