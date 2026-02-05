import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu,
  X,
  FilePlus,
  User,
  Settings,
  FolderOpen,
  LogOut,
  Download,
  Edit,
  Trash2,
  Upload,
  AlertCircle,
  FileText,
  MessageCircle,
  Send,
  ArrowLeft,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { api, ApiError, DocumentOut, ProjectOut } from "../lib/api";
import { isGuestMode } from "../lib/auth";

type UiMessage = { role: "user" | "ai"; content: string; id?: string; created_at?: string };

function computeMissingFromIntake(intake: Record<string, any> | undefined): string[] {
  const i = intake || {};
  const missing: string[] = [];
  if (!String(i.current_seat || "").trim()) missing.push("current_seat");
  const ps = i.proposed_seats;
  if (!Array.isArray(ps) || ps.filter((x: any) => String(x).trim()).length === 0) missing.push("proposed_seats");
  if (!String(i.arbitration_agreement_text || "").trim()) missing.push("arbitration_agreement_text");
  if (!String(i.institution_rules || "").trim()) missing.push("institution_rules");
  if (!String(i.governing_law || "").trim()) missing.push("governing_law");
  return missing;
}

function parseProposedSeats(raw: string): string[] {
  // comma/semicolon/newline separated
  return raw
    .split(/[,;\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function MainPage({ onLogout }: { onLogout: () => void }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState("newproject");

  const guest = isGuestMode();

  // ---- projects ----
  const [projects, setProjects] = useState<ProjectOut[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const projectsFetchInFlight = useRef(false);

  const [editingProject, setEditingProject] = useState<ProjectOut | null>(null);
  const [chattingProject, setChattingProject] = useState<ProjectOut | null>(null);
  const [previewingProject, setPreviewingProject] = useState<{ id: string; title: string } | null>(null);

  // ---- report preview (for completed projects) ----
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPreviewError, setReportPreviewError] = useState<string | null>(null);
  const [reportPreviewText, setReportPreviewText] = useState<string>("");
  const [reportPreviewUrl, setReportPreviewUrl] = useState<string | null>(null);

  // ---- create form ----
  const [createTitle, setCreateTitle] = useState("");
  const [createCurrentSeat, setCreateCurrentSeat] = useState("");
  const [createProposedSeats, setCreateProposedSeats] = useState("");
  const [createAdditionalDetails, setCreateAdditionalDetails] = useState("");
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [isDraggingCreate, setIsDraggingCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ---- edit form ----
  const [editTitle, setEditTitle] = useState("");
  const [editCurrentSeat, setEditCurrentSeat] = useState("");
  const [editProposedSeats, setEditProposedSeats] = useState("");
  const [editAdditionalDetails, setEditAdditionalDetails] = useState("");
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [isDraggingEdit, setIsDraggingEdit] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [existingDocs, setExistingDocs] = useState<DocumentOut[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // ---- chat ----
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const menuItems = [
    { icon: FilePlus, label: "New Project", href: "#", view: "newproject" },
    { icon: FolderOpen, label: "Past Projects", href: "#", view: "projects" },
    { icon: User, label: "Profile", href: "#", view: "profile" },
    { icon: Settings, label: "Settings", href: "#", view: "settings" },
  ];

  async function loadProjects(opts?: { silent?: boolean }) {
    if (guest) {
      setProjects([]);
      return;
    }
    // Prevent overlapping polls (avoids race conditions + flicker)
    if (projectsFetchInFlight.current) return;
    projectsFetchInFlight.current = true;

    if (!opts?.silent) setProjectsLoading(true);
    setProjectsError(null);
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : "Failed to load projects";
      setProjectsError(msg);
    } finally {
      if (!opts?.silent) setProjectsLoading(false);
      projectsFetchInFlight.current = false;
    }
  }

  useEffect(() => {
    if (activeView === "projects" && !chattingProject) {
      loadProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  // ---- live progress updates (no manual refresh) ----
  // When there is any "working" project, poll the backend and update the list in-place.
  // This keeps the UI in sync as background report generation changes project.status.
  useEffect(() => {
    if (guest) return;
    if (activeView !== "projects") return;

    const hasWorking = projects.some((p) => p.status === "working") || chattingProject?.status === "working";
    if (!hasWorking) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        await loadProjects({ silent: true });
        // keep the chat header/status in sync if user is inside a project's chat
        if (chattingProject) {
          const updated = (await api.getProject(chattingProject.id)) as ProjectOut;
          if (!cancelled) setChattingProject(updated);
        }
      } catch {
        // polling is best-effort; ignore transient errors
      }
    };

    // call once immediately so users see progress without waiting
    tick();
    const interval = window.setInterval(tick, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, guest, projects, chattingProject?.id, chattingProject?.status]);

  // Auto-grow textarea (create form)
  useEffect(() => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    const lineHeight = 24;
    const minRows = 5;
    const maxRows = 10;
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, lineHeight * minRows), lineHeight * maxRows);
    textarea.style.height = `${newHeight}px`;
  }, [createAdditionalDetails]);

  function addFiles(files: File[], setter: (updater: (prev: File[]) => File[]) => void) {
    setter((prev) => [...prev, ...files]);
  }

  function removeFile(index: number, setter: (updater: (prev: File[]) => File[]) => void) {
    setter((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- create handlers ----
  const handleCreate = async () => {
    if (guest) {
      setCreateError("Login is required to create and save projects.");
      return;
    }

    const title = createTitle.trim();
    if (!title) {
      setCreateError("Title is required.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    const intake = {
      current_seat: createCurrentSeat.trim() || null,
      proposed_seats: parseProposedSeats(createProposedSeats),
      additional_details: createAdditionalDetails.trim() || null,
    };

    try {
      if (createFiles.length > 0) {
        await api.createProjectWithDocuments({ title, status: "working", intake }, createFiles);
      } else {
        await api.createProject({ title, status: "working", intake });
      }

      // reset form
      setCreateTitle("");
      setCreateCurrentSeat("");
      setCreateProposedSeats("");
      setCreateAdditionalDetails("");
      setCreateFiles([]);

      setActiveView("projects");
      await loadProjects();
    } catch (err: any) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create project");
    } finally {
      setCreateLoading(false);
    }
  };

  // ---- edit handlers ----
  const startEdit = async (project: ProjectOut) => {
    setEditingProject(project);
    setEditTitle(project.title ?? "");
    setEditCurrentSeat((project.intake?.current_seat as string) ?? "");
    const ps = project.intake?.proposed_seats;
    setEditProposedSeats(Array.isArray(ps) ? ps.join(", ") : (ps ?? ""));
    setEditAdditionalDetails((project.intake?.additional_details as string) ?? "");
    setEditFiles([]);
    setEditError(null);

    // load docs
    setDocsLoading(true);
    setDocsError(null);
    try {
      const docs = await api.listDocuments(project.id);
      setExistingDocs(docs);
    } catch (err: any) {
      setDocsError(err instanceof ApiError ? err.message : "Failed to load documents");
      setExistingDocs([]);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingProject) return;
    if (guest) {
      setEditError("Login is required to edit projects.");
      return;
    }

    const title = editTitle.trim();
    if (!title) {
      setEditError("Title is required.");
      return;
    }

    setEditLoading(true);
    setEditError(null);

    const intake = {
      ...(editingProject.intake || {}),
      current_seat: editCurrentSeat.trim() || null,
      proposed_seats: parseProposedSeats(editProposedSeats),
      additional_details: editAdditionalDetails.trim() || null,
    };

    try {
      const updated = await api.updateProject(editingProject.id, { title, intake });
      if (editFiles.length > 0) {
        await api.uploadDocuments(editingProject.id, editFiles);
      }

      // refresh docs + projects
      const docs = await api.listDocuments(editingProject.id);
      setExistingDocs(docs);
      setEditFiles([]);

      await loadProjects();
      setEditingProject(updated);
    } catch (err: any) {
      setEditError(err instanceof ApiError ? err.message : "Failed to save changes");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (guest) {
      setProjectsError("Login is required to delete projects.");
      return;
    }
    try {
      await api.deleteProject(projectId);
      await loadProjects();
    } catch (err: any) {
      setProjectsError(err instanceof ApiError ? err.message : "Failed to delete project");
    }
  };

  const handleDeleteDoc = async (projectId: string, documentId: string) => {
    if (guest) {
      setDocsError("Login is required.");
      return;
    }
    try {
      await api.deleteDocument(projectId, documentId);
      const docs = await api.listDocuments(projectId);
      setExistingDocs(docs);
    } catch (err: any) {
      setDocsError(err instanceof ApiError ? err.message : "Failed to delete document");
    }
  };

  // ---- chat handlers ----
  const startChat = async (project: ProjectOut) => {
    setChattingProject(project);
    setChatError(null);
    setMessages([]);

    if (guest) {
      setMessages([
        {
          role: "ai",
          content: "Guest mode: login is required to use the project chat (and to save messages).",
        },
      ]);
      return;
    }

    setChatLoading(true);
    try {
      const hist = await api.listMessages(project.id);
      if (!hist.length) {
        setMessages([
          {
            role: "ai",
            content:
              project.status === "intervention"
                ? "This project is marked Intervention Required. Ask what is missing (or provide the missing details) and I can regenerate the report."
                : `You're chatting about "${project.title}". Ask a question or paste context.`,
          },
        ]);
      } else {
        setMessages(
          hist.map((m) => ({
            id: m.id,
            created_at: m.created_at,
            role: m.role === "assistant" ? "ai" : "user",
            content: m.content,
          }))
        );
      }
    } catch (err: any) {
      setChatError(err instanceof ApiError ? err.message : "Failed to load chat");
    } finally {
      setChatLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (guest) {
      setChatError("Login is required to chat.");
      return;
    }
    if (!chattingProject) return;
    const msg = inputMessage.trim();
    if (!msg) return;

    setInputMessage("");
    setChatError(null);

    // optimistic UI
    setMessages((prev) => [...prev, { role: "user", content: msg }]);

    try {
      const res = await api.sendMessage(chattingProject.id, msg);
      setMessages((prev) => {
        // Remove the optimistic user message? We'll keep it; just append assistant.
        return [...prev, { role: "ai", content: res.assistant_message.content, id: res.assistant_message.id, created_at: res.assistant_message.created_at }];
      });

      // Refresh project state since the backend may have updated intake / started report generation.
      try {
        const p = await api.getProject(chattingProject.id);
        setChattingProject(p);
        setProjects((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      } catch {
        // ignore
      }
    } catch (err: any) {
      setChatError(err instanceof ApiError ? err.message : "Failed to send message");
    }
  };

  const pollProjectUntilNotWorking = async (projectId: string) => {
    // Lightweight polling so the UI updates without requiring a manual refresh.
    for (let i = 0; i < 25; i++) {
      try {
        const p = await api.getProject(projectId);
        setChattingProject((cur) => (cur && cur.id === p.id ? p : cur));
        setProjects((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        if (p.status !== "working") return;
      } catch {
        // ignore and continue
      }
      await new Promise((r) => setTimeout(r, 900));
    }
  };

  const handleGenerateReport = async () => {
    if (guest) {
      setChatError("Login is required to generate a report.");
      return;
    }
    if (!chattingProject) return;
    setReportLoading(true);
    setChatError(null);
    try {
      await api.regenerateReport(chattingProject.id);
      setMessages((prev) => [...prev, { role: "ai", content: "Report regeneration started for this project." }]);
      // status will flip to 'working' quickly; poll until it changes.
      await pollProjectUntilNotWorking(chattingProject.id);
    } catch (err: any) {
      setChatError(err instanceof ApiError ? err.message : "Failed to regenerate report");
    } finally {
      setReportLoading(false);
    }
  };

  const handleDownload = async (projectId: string, projectTitle: string) => {
    if (guest) {
      alert("Login is required to download reports.");
      return;
    }
    try {
      const { download_url } = await api.getReportUrl(projectId);
      // Use an anchor click so it works in most browsers.
      const a = document.createElement("a");
      a.href = download_url;
      a.target = "_blank";
      a.rel = "noreferrer";
      // Best-effort filename hint. Browsers may ignore for cross-origin.
      a.download = `${projectTitle || "report"}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : "Failed to download report";
      alert(msg);
    }
  };

  const openPreview = async (project: ProjectOut) => {
    if (project.status !== "complete") return;
    setPreviewingProject({ id: project.id, title: project.title });
    setReportPreviewLoading(true);
    setReportPreviewError(null);
    setReportPreviewText("");
    setReportPreviewUrl(null);
    try {
      const { download_url } = await api.getReportUrl(project.id);
      setReportPreviewUrl(download_url);
      const text = await api.getReportText(project.id);
      setReportPreviewText(text || "");
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : "Failed to load report preview";
      setReportPreviewError(msg);
    } finally {
      setReportPreviewLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: isSidebarOpen ? 256 : 72 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="bg-gradient-to-b from-gray-900 to-black text-white flex flex-col overflow-hidden border-r-2 border-red-600"
      >
        <div className="p-6 flex items-center justify-between border-b border-gray-700 min-h-[81px]">
          {isSidebarOpen ? (
            <>
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-white whitespace-nowrap"
              >
                Dashboard
              </motion.h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(false)}
                className="text-white hover:bg-white/10 shrink-0"
              >
                <X className="size-5" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(true)}
              className="text-white hover:bg-white/10 mx-auto"
            >
              <Menu className="size-5" />
            </Button>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item, index) => (
            <motion.button
              key={item.label}
              onClick={() => {
                setActiveView(item.view);
                if (item.view !== "projects") {
                  setEditingProject(null);
                  setChattingProject(null);
                }
              }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index, duration: 0.3 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors w-full ${
                activeView === item.view ? "bg-red-600/30 border border-red-600/50" : ""
              } ${isSidebarOpen ? "justify-start" : "justify-center"}`}
              title={!isSidebarOpen ? item.label : undefined}
            >
              <item.icon className="size-5 shrink-0" />
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </motion.button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors w-full ${
              isSidebarOpen ? "justify-start" : "justify-center"
            }`}
            onClick={onLogout}
            title={!isSidebarOpen ? "Logout" : undefined}
          >
            <LogOut className="size-5 shrink-0" />
            {isSidebarOpen && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="whitespace-nowrap"
              >
                Logout
              </motion.span>
            )}
          </motion.button>
        </div>
      </motion.aside>

      {/* Main Content */}
      {chattingProject && activeView === "projects" ? (
        // Chat Page
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat Header */}
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setChattingProject(null);
                  setMessages([]);
                  setInputMessage("");
                }}
                className="hover:bg-gray-100"
              >
                <ArrowLeft className="size-5" />
              </Button>
              <h2 className="text-xl">Chat: {chattingProject.title}</h2>
            </div>
          </header>

          {/* Chat Messages Area */}
          <main className="flex-1 overflow-auto p-6 bg-gray-50">
            <div className="max-w-4xl mx-auto space-y-4">
              {chattingProject.status === "intervention" && (
                <div className="flex items-start gap-3 text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded p-3">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">Intervention Required</div>
                    <div className="mt-1">
                      Missing: {computeMissingFromIntake(chattingProject.intake).join(", ") || "(unknown)"}. Ask in chat or provide the missing details.
                    </div>
                  </div>
                </div>
              )}

              {chatLoading && messages.length === 0 && <div className="text-sm text-gray-500">Loading chat…</div>}
              {chatError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{chatError}</div>}

              {messages.map((message, index) => (
                <motion.div
                  key={message.id ?? index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "user" ? (
                    <div className="max-w-[70%] rounded-lg px-4 py-3 bg-red-600 text-white">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ) : (
                    <div className="max-w-[70%]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{message.content}</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </main>

          {/* Chat Input Area */}
          <div className="bg-white border-t border-gray-200 p-6">
            <div className="max-w-4xl mx-auto flex gap-3 items-end">
              <textarea
                value={inputMessage}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  e.target.style.height = "auto";
                  const lineHeight = 24;
                  const maxHeight = lineHeight * 5;
                  const scrollHeight = e.target.scrollHeight;
                  e.target.style.height = Math.min(scrollHeight, maxHeight) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type your message..."
                rows={1}
                className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent overflow-y-auto"
                style={{ minHeight: "40px", maxHeight: "120px" }}
              />
              <Button
                onClick={handleGenerateReport}
                className="bg-gray-800 hover:bg-gray-900 text-white px-6 shrink-0"
                disabled={guest || reportLoading}
              >
                <FileText className="size-4 mr-2" />
                {reportLoading ? "Generating…" : "Generate Report"}
              </Button>
              <Button
                onClick={handleSendMessage}
                className="bg-red-600 hover:bg-red-700 text-white px-6 shrink-0"
                disabled={guest}
              >
                <Send className="size-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
            <h2>
              {activeView === "newproject" && "New Project"}
              {activeView === "projects" && "Past Projects"}
              {activeView === "profile" && "Profile"}
              {activeView === "settings" && "Settings"}
            </h2>
            {guest && (
              <span className="ml-auto text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded px-3 py-1">
                Guest mode: backend features are disabled.
              </span>
            )}
          </header>

          {/* Content Area */}
          <main className="flex-1 overflow-auto p-8">
            <div className="max-w-6xl mx-auto">
              {activeView === "projects" ? (
                editingProject ? (
                  // Edit Project View
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl">Editing: {editingProject.title}</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingProject(null);
                          setExistingDocs([]);
                          setEditFiles([]);
                        }}
                        className="text-white bg-red-600 border border-red-600 hover:bg-gray-200 hover:border-red-600"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>

                    {/* Upload Documents Area */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="bg-white rounded-lg shadow p-6"
                    >
                      <h3 className="mb-4">Documents</h3>

                      {docsError && (
                        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {docsError}
                        </div>
                      )}

                      {docsLoading ? (
                        <div className="text-sm text-gray-500">Loading documents…</div>
                      ) : existingDocs.length ? (
                        <div className="space-y-2 mb-6">
                          {existingDocs.map((d) => (
                            <div key={d.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                              <div className="size-10 bg-red-100 rounded flex items-center justify-center shrink-0">
                                <FileText className="size-5 text-red-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{d.filename}</p>
                                <p className="text-xs text-gray-500">{d.byte_size ? `${(d.byte_size / 1024).toFixed(1)} KB` : ""}</p>
                              </div>
                              {d.download_url && (
                                <Button asChild variant="outline" size="sm">
                                  <a href={d.download_url} target="_blank" rel="noreferrer">
                                    Download
                                  </a>
                                </Button>
                              )}
                              <Button
                                onClick={() => handleDeleteDoc(editingProject.id, d.id)}
                                variant="ghost"
                                size="icon"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Delete"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 mb-6">No documents uploaded.</div>
                      )}

                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingEdit(true);
                        }}
                        onDragLeave={() => setIsDraggingEdit(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingEdit(false);
                          addFiles(Array.from(e.dataTransfer.files), setEditFiles);
                        }}
                        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                          isDraggingEdit ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        <Upload className="size-12 mx-auto mb-4 text-gray-400" />
                        <h3 className="mb-2 text-gray-700">Drag and drop files here</h3>
                        <p className="text-sm text-gray-500 mb-4">or click to select from device</p>
                        <input
                          type="file"
                          multiple
                          onChange={(e) => {
                            if (e.target.files) addFiles(Array.from(e.target.files), setEditFiles);
                          }}
                          className="hidden"
                          id="documents-upload-edit"
                        />
                        <label htmlFor="documents-upload-edit">
                          <Button variant="outline" className="cursor-pointer" asChild>
                            <span>Select Files</span>
                          </Button>
                        </label>
                      </div>

                      {editFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {editFiles.map((file, index) => (
                            <motion.div
                              key={`${file.name}-${index}`}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.3 }}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors"
                            >
                              <div className="size-10 bg-red-100 rounded flex items-center justify-center shrink-0">
                                <FileText className="size-5 text-red-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                              </div>
                              <button
                                onClick={() => removeFile(index, setEditFiles)}
                                className="relative size-6 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white transition-colors shrink-0"
                              >
                                <X className="size-4" />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </motion.div>

                    {/* Form Fields */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.1 }}
                      className="bg-white rounded-lg shadow p-6"
                    >
                      {editError && (
                        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {editError}
                        </div>
                      )}

                      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                        <div>
                          <Label htmlFor="edit-project-title">
                            Title <span className="text-red-600">*</span>
                          </Label>
                          <Input
                            id="edit-project-title"
                            type="text"
                            placeholder="Enter project title"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="mt-1.5"
                            required
                          />
                        </div>

                        <div>
                          <Label htmlFor="edit-current-seat">Current Seat</Label>
                          <Input
                            id="edit-current-seat"
                            type="text"
                            placeholder="Enter current seat"
                            value={editCurrentSeat}
                            onChange={(e) => setEditCurrentSeat(e.target.value)}
                            className="mt-1.5"
                          />
                        </div>

                        <div>
                          <Label htmlFor="edit-proposed-seats">Proposed Seat(s)</Label>
                          <Input
                            id="edit-proposed-seats"
                            type="text"
                            placeholder="e.g. Paris, Geneva"
                            value={editProposedSeats}
                            onChange={(e) => setEditProposedSeats(e.target.value)}
                            className="mt-1.5"
                          />
                          <p className="mt-1 text-xs text-gray-500">Comma-separated.</p>
                        </div>

                        <div>
                          <Label htmlFor="edit-additional-details">Additional Details For AI</Label>
                          <textarea
                            id="edit-additional-details"
                            value={editAdditionalDetails}
                            onChange={(e) => setEditAdditionalDetails(e.target.value)}
                            placeholder="Enter additional details..."
                            className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none overflow-y-auto"
                            style={{ minHeight: "120px" }}
                          />
                        </div>
                      </form>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                    >
                      <Button
                        type="button"
                        size="lg"
                        onClick={handleSaveEdit}
                        disabled={editLoading || guest}
                        className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                      >
                        {editLoading ? "Saving..." : "Save Changes"}
                      </Button>
                    </motion.div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {projectsError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{projectsError}</div>
                    )}
                    {projectsLoading ? (
                      <div className="text-sm text-gray-500">Loading projects…</div>
                    ) : projects.length === 0 ? (
                      <div className="text-sm text-gray-600">No projects yet.</div>
                    ) : (
                      <>
                        {projects.map((project, index) => (
                          <motion.div
                            key={project.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1, duration: 0.4 }}
                            className={`bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 flex items-center gap-4 ${
                              project.status === "complete" ? "cursor-pointer" : "cursor-default"
                            }`}
                            title={project.status === "complete" ? "Preview" : "Preview available when complete"}
                            onClick={() => {
                              if (project.status !== "complete") return;
                              openPreview(project);
                            }}
                          >
                            <div className="flex-1">
                              <h3 className="mb-1">{project.title}</h3>
                              <p className="text-sm text-gray-600">{project.description || ""}</p>
                            </div>

                            <div className="flex items-center">
                              {project.status === "complete" && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                                  <div className="size-2 rounded-full bg-green-500"></div>
                                  Complete
                                </div>
                              )}
                              {project.status === "working" && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 text-orange-700 text-sm font-medium">
                                  <div className="size-2 rounded-full bg-orange-500"></div>
                                  Working on it
                                </div>
                              )}
                              {project.status === "intervention" && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                                  <AlertCircle className="size-4" />
                                  Intervention required
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2 border-l pl-4 border-gray-200">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(project);
                                }}
                                variant="ghost"
                                size="icon"
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                title="Edit"
                                disabled={guest}
                              >
                                <Edit className="size-4" />
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteProject(project.id);
                                }}
                                variant="ghost"
                                size="icon"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Delete"
                                disabled={guest}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startChat(project);
                                }}
                                variant="ghost"
                                size="icon"
                                className="text-[rgb(81,179,92)] hover:text-gray-700 hover:bg-gray-50"
                                title="Chat"
                                disabled={guest}
                              >
                                <MessageCircle className="size-4" />
                              </Button>
                            </div>

                            {/* Download Button */}
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(project.id, project.title);
                              }}
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              disabled={project.status !== "complete"}
                            >
                              <Download className="size-4" />
                              Download PDF
                            </Button>
                          </motion.div>
                        ))}
                      </>
                    )}
                  </div>
                )
              ) : activeView === "newproject" ? (
                <div className="space-y-6">
                  {/* Upload Documents Area */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="bg-white rounded-lg shadow p-6"
                  >
                    <h3 className="mb-4">Upload your documents</h3>
                    {createError && (
                      <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
                    )}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingCreate(true);
                      }}
                      onDragLeave={() => setIsDraggingCreate(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingCreate(false);
                        addFiles(Array.from(e.dataTransfer.files), setCreateFiles);
                      }}
                      className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                        isDraggingCreate ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <Upload className="size-12 mx-auto mb-4 text-gray-400" />
                      <h3 className="mb-2 text-gray-700">Drag and drop files here</h3>
                      <p className="text-sm text-gray-500 mb-4">or click to select from device</p>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) addFiles(Array.from(e.target.files), setCreateFiles);
                        }}
                        className="hidden"
                        id="documents-upload"
                      />
                      <label htmlFor="documents-upload">
                        <Button variant="outline" className="cursor-pointer" asChild>
                          <span>Select Files</span>
                        </Button>
                      </label>
                    </div>

                    {createFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {createFiles.map((file, index) => (
                          <motion.div
                            key={`${file.name}-${index}`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors"
                          >
                            <div className="size-10 bg-red-100 rounded flex items-center justify-center shrink-0">
                              <FileText className="size-5 text-red-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                              <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                            <button
                              onClick={() => removeFile(index, setCreateFiles)}
                              className="relative size-6 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white transition-colors shrink-0"
                            >
                              <X className="size-4" />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>

                  {/* Form Fields */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="bg-white rounded-lg shadow p-6"
                  >
                    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                      <div>
                        <Label htmlFor="project-title">
                          Title <span className="text-red-600">*</span>
                        </Label>
                        <Input
                          id="project-title"
                          type="text"
                          placeholder="Enter project title"
                          className="mt-1.5"
                          required
                          value={createTitle}
                          onChange={(e) => setCreateTitle(e.target.value)}
                        />
                      </div>

                      <div>
                        <Label htmlFor="current-seat">Current Seat</Label>
                        <Input
                          id="current-seat"
                          type="text"
                          placeholder="Enter current seat"
                          className="mt-1.5"
                          value={createCurrentSeat}
                          onChange={(e) => setCreateCurrentSeat(e.target.value)}
                        />
                      </div>

                      <div>
                        <Label htmlFor="proposed-seats">Proposed Seat(s)</Label>
                        <Input
                          id="proposed-seats"
                          type="text"
                          placeholder="e.g. Paris, Geneva"
                          className="mt-1.5"
                          value={createProposedSeats}
                          onChange={(e) => setCreateProposedSeats(e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-500">Comma-separated.</p>
                      </div>

                      <div>
                        <Label htmlFor="additional-details">Additional Details For AI</Label>
                        <textarea
                          ref={textareaRef}
                          id="additional-details"
                          value={createAdditionalDetails}
                          onChange={(e) => setCreateAdditionalDetails(e.target.value)}
                          placeholder="Enter additional details for AI processing..."
                          className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none overflow-y-auto"
                          style={{ minHeight: "120px" }}
                        />
                      </div>
                    </form>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
                    <Button
                      type="button"
                      size="lg"
                      onClick={handleCreate}
                      disabled={createLoading || guest}
                      className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                    >
                      {createLoading ? "Creating..." : "Create Project"}
                    </Button>
                  </motion.div>
                </div>
              ) : activeView === "profile" ? (
                <div className="space-y-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="bg-white rounded-lg shadow p-6"
                  >
                    <h3 className="mb-4">Change Password</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Not wired. For Supabase auth, changing password is easiest via Supabase email reset flow.
                    </p>
                    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                      <div>
                        <Label htmlFor="current-password">Current Password</Label>
                        <Input id="current-password" type="password" placeholder="••••••••" className="mt-1.5" />
                      </div>
                      <div>
                        <Label htmlFor="new-password">New Password</Label>
                        <Input id="new-password" type="password" placeholder="••••••••" className="mt-1.5" />
                      </div>
                      <div>
                        <Label htmlFor="confirm-password">Confirm New Password</Label>
                        <Input id="confirm-password" type="password" placeholder="••••••••" className="mt-1.5" />
                      </div>
                      <div className="pt-4">
                        <Button
                          type="submit"
                          size="lg"
                          className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                          disabled
                        >
                          Change Password
                        </Button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              ) : activeView === "settings" ? (
                <div className="space-y-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="bg-white rounded-lg shadow p-6"
                  >
                    <h3 className="mb-4">Settings</h3>
                    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="email-notifications" />
                        <Label htmlFor="email-notifications" className="cursor-pointer">
                          Enable email notifications
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="delete-data" />
                        <Label htmlFor="delete-data" className="cursor-pointer">
                          Delete my data after 24 hours
                        </Label>
                      </div>
                      <div className="pt-4">
                        <Button
                          type="submit"
                          size="lg"
                          className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                          disabled
                        >
                          Save Settings
                        </Button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              ) : null}
            </div>
          </main>
        </div>
      )}

      {/* PDF Preview Modal */}
      <AnimatePresence>
        {previewingProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setPreviewingProject(null);
              setReportPreviewText("");
              setReportPreviewError(null);
              setReportPreviewUrl(null);
              setReportPreviewLoading(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold">Preview: {previewingProject.title}</h3>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      handleDownload(previewingProject.id, previewingProject.title);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Download className="size-4 mr-2" />
                    Download PDF
                  </Button>
                  {reportPreviewUrl && (
                    <Button
                      onClick={() => window.open(reportPreviewUrl, "_blank", "noreferrer")}
                      variant="outline"
                      className="bg-white"
                      title="Open report in a new tab"
                    >
                      Open
                    </Button>
                  )}
                  <Button
                    onClick={() => setPreviewingProject(null)}
                    variant="ghost"
                    size="icon"
                    className="text-gray-600 hover:text-gray-900"
                  >
                    <X className="size-5" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-gray-100 p-4">
                <div className="bg-white shadow-lg mx-auto max-w-4xl min-h-full p-8">
                  <h1 className="text-2xl font-bold mb-4">Arbitration Report</h1>
                  <h2 className="text-xl font-semibold mb-4">{previewingProject.title}</h2>

                  {reportPreviewLoading ? (
                    <p className="text-sm text-gray-600">Loading report preview…</p>
                  ) : reportPreviewError ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {reportPreviewError}
                    </div>
                  ) : reportPreviewText ? (
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                      {reportPreviewText}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-600">
                      No preview text is available. Use “Download PDF” to open the generated report.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
