from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..core.supabase import get_anon_client
from ..core.security import get_access_token, get_current_user_id
from ..schemas import SignupRequest, LoginRequest, AuthResponse, AuthSession

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/signup', response_model=AuthResponse)
def signup(payload: SignupRequest):
    supabase = get_anon_client()
    try:
        res = supabase.auth.sign_up({"email": payload.email, "password": payload.password})
        # supabase-py may return object with session/user
        user = getattr(res, 'user', None) or (res.get('user') if isinstance(res, dict) else None)
        session = getattr(res, 'session', None) or (res.get('session') if isinstance(res, dict) else None)
        if not user or not session:
            # Some Supabase projects require email confirmation; session can be None.
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Signup succeeded but no session returned (email confirmation may be enabled).')
        access_token = session.access_token if hasattr(session, 'access_token') else session.get('access_token')
        refresh_token = session.refresh_token if hasattr(session, 'refresh_token') else session.get('refresh_token')
        user_id = user.id if hasattr(user, 'id') else user.get('id')
        email = user.email if hasattr(user, 'email') else user.get('email')
        return AuthResponse(user_id=str(user_id), email=email, session=AuthSession(access_token=access_token, refresh_token=refresh_token))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.post('/login', response_model=AuthResponse)
def login(payload: LoginRequest):
    supabase = get_anon_client()
    try:
        res = supabase.auth.sign_in_with_password({"email": payload.email, "password": payload.password})
        user = getattr(res, 'user', None) or (res.get('user') if isinstance(res, dict) else None)
        session = getattr(res, 'session', None) or (res.get('session') if isinstance(res, dict) else None)
        if not user or not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')
        access_token = session.access_token if hasattr(session, 'access_token') else session.get('access_token')
        refresh_token = session.refresh_token if hasattr(session, 'refresh_token') else session.get('refresh_token')
        user_id = user.id if hasattr(user, 'id') else user.get('id')
        email = user.email if hasattr(user, 'email') else user.get('email')
        return AuthResponse(user_id=str(user_id), email=email, session=AuthSession(access_token=access_token, refresh_token=refresh_token))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get('/me')
def me(user_id: str = Depends(get_current_user_id), token: str = Depends(get_access_token)):
    # user_id derived from token already
    return {"user_id": user_id}
