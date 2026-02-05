import { getAccessToken } from "./auth";

export type AuthResponse = {
  user_id: string;
  email?: string | null;
  session: {
    access_token: string;
    refresh_token?: string | null;
  };
};

export type ProjectOut = {
  id: string;
  owner_id: string;
  title: string;
  description?: string | null;
  status: string;
  intake: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type DocumentOut = {
  id: string;
  project_id: string;
  filename: string;
  mime_type?: string | null;
  byte_size?: number | null;
  created_at: string;
  download_url?: string | null;
};

export type ChatMessageOut = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

export class ApiError extends Error {
  status: number;
  body?: any;

  constructor(message: string, status: number, body?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function parseErrorBody(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) return await res.json();
    return await res.text();
  } catch {
    return undefined;
  }
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});

  // Don't override content-type for FormData
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await parseErrorBody(res);
    const detail = typeof body === "object" && body && "detail" in body ? (body as any).detail : body;
    throw new ApiError(
      typeof detail === "string" ? detail : `Request failed (${res.status})`,
      res.status,
      body
    );
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

export const api = {
  // auth
  signup: (email: string, password: string): Promise<AuthResponse> =>
    apiFetch("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),

  login: (email: string, password: string): Promise<AuthResponse> =>
    apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  me: (): Promise<{ user_id: string }> => apiFetch("/auth/me"),

  // projects
  listProjects: (): Promise<ProjectOut[]> => apiFetch("/projects"),

  getProject: (id: string): Promise<ProjectOut> => apiFetch(`/projects/${id}`),

  createProject: (payload: { title: string; description?: string | null; status?: string | null; intake?: Record<string, any> }): Promise<ProjectOut> =>
    apiFetch("/projects", { method: "POST", body: JSON.stringify(payload) }),

  createProjectWithDocuments: async (payload: { title: string; description?: string | null; status?: string | null; intake?: Record<string, any> }, files: File[]): Promise<ProjectOut> => {
    const form = new FormData();
    form.append("title", payload.title);
    if (payload.description) form.append("description", payload.description);
    if (payload.status) form.append("status_value", payload.status);
    if (payload.intake) form.append("intake_json", JSON.stringify(payload.intake));
    for (const f of files) form.append("files", f);
    return apiFetch("/projects/with-documents", { method: "POST", body: form });
  },

  updateProject: (id: string, payload: { title?: string | null; description?: string | null; status?: string | null; intake?: Record<string, any> | null }): Promise<ProjectOut> =>
    apiFetch(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteProject: (id: string): Promise<{ ok: boolean }> => apiFetch(`/projects/${id}`, { method: "DELETE" }),

  // documents
  listDocuments: (projectId: string): Promise<DocumentOut[]> => apiFetch(`/projects/${projectId}/documents`),

  uploadDocuments: async (projectId: string, files: File[]): Promise<DocumentOut[]> => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return apiFetch(`/projects/${projectId}/documents/upload`, { method: "POST", body: form });
  },

  deleteDocument: (projectId: string, documentId: string): Promise<{ ok: boolean }> =>
    apiFetch(`/projects/${projectId}/documents/${documentId}`, { method: "DELETE" }),

  // chat
  listMessages: (projectId: string): Promise<ChatMessageOut[]> => apiFetch(`/projects/${projectId}/chat/messages`),

  sendMessage: (projectId: string, message: string): Promise<{ user_message: ChatMessageOut; assistant_message: ChatMessageOut }> =>
    apiFetch(`/projects/${projectId}/chat/send`, { method: "POST", body: JSON.stringify({ message }) }),

  // reports
  regenerateReport: (projectId: string): Promise<{ ok: boolean }> =>
    apiFetch(`/projects/${projectId}/report/regenerate`, { method: "POST" }),

  // report download + preview
  getReportUrl: (projectId: string): Promise<{ download_url: string }> => apiFetch(`/projects/${projectId}/report`),

  // returns plain text (backend responds with text/plain)
  getReportText: (projectId: string): Promise<string> => apiFetch(`/projects/${projectId}/report/text`),
};
