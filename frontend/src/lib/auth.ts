export type AuthSession = {
  accessToken: string;
  refreshToken?: string | null;
};

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const GUEST_MODE_KEY = "guest_mode";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  if (session.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  localStorage.removeItem(GUEST_MODE_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(GUEST_MODE_KEY);
}

export function enableGuestMode(): void {
  clearSession();
  localStorage.setItem(GUEST_MODE_KEY, "1");
}

export function isGuestMode(): boolean {
  return localStorage.getItem(GUEST_MODE_KEY) === "1";
}

export function isAuthenticated(): boolean {
  return !!getAccessToken() && !isGuestMode();
}
