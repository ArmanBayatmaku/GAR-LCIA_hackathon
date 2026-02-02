import { useState, useRef, useEffect } from "react";
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

export function MainPage({
  onLogout,
}: {
  onLogout: () => void;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState("newproject");
  const [isDraggingAdditional, setIsDraggingAdditional] =
    useState(false);
  const [additionalFiles, setAdditionalFiles] = useState<
    File[]
  >([]);
  const [editingProject, setEditingProject] = useState<{
    id: number;
    title: string;
    description: string;
    status: string;
  } | null>(null);
  const [chattingProject, setChattingProject] = useState<{
    id: number;
    title: string;
    description: string;
    status: string;
  } | null>(null);
  const [messages, setMessages] = useState<
    { role: "user" | "ai"; content: string }[]
  >([]);
  const [inputMessage, setInputMessage] = useState("");
  const [previewingProject, setPreviewingProject] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [additionalDetails, setAdditionalDetails] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const menuItems = [
    {
      icon: FilePlus,
      label: "New Project",
      href: "#",
      view: "newproject",
    },
    {
      icon: FolderOpen,
      label: "Past Projects",
      href: "#",
      view: "projects",
    },
    {
      icon: User,
      label: "Profile",
      href: "#",
      view: "profile",
    },
    {
      icon: Settings,
      label: "Settings",
      href: "#",
      view: "settings",
    },
  ];

  const projects = [
    {
      id: 1,
      title: "Arbitration test1 bla bla",
      description: "Arbitration test bottom text bla bla",
      status: "complete",
    },
    {
      id: 2,
      title: "Arbitration test1",
      description: "Arbitration test bottom text bla bla",
      status: "working",
    },
    {
      id: 3,
      title: "Arbitration test1",
      description: "Arbitration test bottom text bla bla",
      status: "complete",
    },
    {
      id: 4,
      title: "Arbitration test1",
      description: "Arbitration test bottom text bla bla",
      status: "intervention",
    },
    {
      id: 5,
      title: "Arbitration test1",
      description: "Arbitration test bottom text bla bla",
      status: "working",
    },
    {
      id: 6,
      title: "Arbitration test1",
      description: "Arbitration test bottom text bla bla",
      status: "complete",
    },
  ];

  const handleDownload = (
    projectId: number,
    projectTitle: string,
  ) => {
    console.log(
      `Downloading PDF for project ${projectId}: ${projectTitle}`,
    );
    // In a real app, this would trigger a PDF download
  };

  const handleEdit = (projectId: number) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setEditingProject(project);
    }
  };

  const handleChat = (projectId: number) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setChattingProject(project);
      // Initialize with a welcome message from AI
      setMessages([
        {
          role: "ai",
          content: `Hello! I'm here to help you with "${project.title}". How can I assist you today?`,
        },
      ]);
    }
  };

  const handleSendMessage = () => {
    if (inputMessage.trim() === "") return;

    // Add user message
    const newMessages = [
      ...messages,
      { role: "user" as const, content: inputMessage },
    ];
    setMessages(newMessages);
    setInputMessage("");

    // Reset textarea height
    setTimeout(() => {
      const textarea = document.querySelector("textarea");
      if (textarea) {
        textarea.style.height = "40px";
      }
    }, 0);

    // Simulate AI response after a short delay
    setTimeout(() => {
      setMessages([
        ...newMessages,
        {
          role: "ai" as const,
          content:
            "This is a simulated AI response. In a real application, this would connect to an actual LLM API.",
        },
      ]);
    }, 1000);
  };

  const handleDelete = (projectId: number) => {
    console.log(`Deleting project ${projectId}`);
  };

  // Auto-grow textarea handler
  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = "auto";
      const lineHeight = 24; // approximate line height
      const minRows = 5;
      const maxRows = 10;
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(
        Math.max(scrollHeight, lineHeight * minRows),
        lineHeight * maxRows
      );
      textarea.style.height = `${newHeight}px`;
    }
  }, [additionalDetails]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAdditional(true);
  };

  const handleDragLeave = () => {
    setIsDraggingAdditional(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAdditional(false);
    const files = Array.from(e.dataTransfer.files);
    setAdditionalFiles((prev) => [...prev, ...files]);
  };

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      setAdditionalFiles((prev) => [...prev, ...fileArray]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setAdditionalFiles((prev) => prev.filter((_, i) => i !== index));
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
              onClick={() => setActiveView(item.view)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index, duration: 0.3 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors w-full ${
                activeView === item.view
                  ? "bg-red-600/30 border border-red-600/50"
                  : ""
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
              <h2 className="text-xl">
                Chat: {chattingProject.title}
              </h2>
            </div>
          </header>

          {/* Chat Messages Area */}
          <main className="flex-1 overflow-auto p-6 bg-gray-50">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${
                    message.role === "user"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  {message.role === "user" ? (
                    <div className="max-w-[70%] rounded-lg px-4 py-3 bg-red-600 text-white">
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  ) : (
                    <div className="max-w-[70%]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {message.content}
                      </p>
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
                  // Auto-resize logic
                  e.target.style.height = "auto";
                  const lineHeight = 24; // approximate line height
                  const maxHeight = lineHeight * 5; // 5 rows max
                  const scrollHeight = e.target.scrollHeight;
                  e.target.style.height = Math.min(scrollHeight, maxHeight) + "px";
                }}
                onKeyPress={(e) => {
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
                onClick={() => {
                  // Generate report logic
                  alert("Generate Report functionality - to be implemented");
                }}
                className="bg-gray-800 hover:bg-gray-900 text-white px-6 shrink-0"
              >
                <FileText className="size-4 mr-2" />
                Generate Report
              </Button>
              <Button
                onClick={handleSendMessage}
                className="bg-red-600 hover:bg-red-700 text-white px-6 shrink-0"
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
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {activeView === "projects" ? (
              editingProject ? (
                // Edit Project View
                <div className="space-y-6">
                  {/* Close Button Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl">
                      Editing: {editingProject.title}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingProject(null)}
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
                    <h3 className="mb-4">Upload your documents</h3>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                        isDraggingAdditional
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <Upload className="size-12 mx-auto mb-4 text-gray-400" />
                      <h3 className="mb-2 text-gray-700">
                        Drag and drop files here
                      </h3>
                      <p className="text-sm text-gray-500 mb-4">
                        or click to select from device
                      </p>
                      <input
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                        id="documents-upload-edit"
                      />
                      <label htmlFor="documents-upload-edit">
                        <Button
                          variant="outline"
                          className="cursor-pointer"
                          asChild
                        >
                          <span>Select Files</span>
                        </Button>
                      </label>
                    </div>

                    {/* Uploaded Files */}
                    {additionalFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {additionalFiles.map((file, index) => (
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
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {file.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {(file.size / 1024).toFixed(2)} KB
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveFile(index)}
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
                    <form className="space-y-5">
                      {/* Title Field */}
                      <div>
                        <Label htmlFor="edit-project-title">
                          Title <span className="text-red-600">*</span>
                        </Label>
                        <Input
                          id="edit-project-title"
                          type="text"
                          placeholder="Enter project title"
                          defaultValue={editingProject.title}
                          className="mt-1.5"
                          required
                        />
                      </div>

                      {/* Current Seat Field */}
                      <div>
                        <Label htmlFor="edit-current-seat">
                          Current Seat
                        </Label>
                        <Input
                          id="edit-current-seat"
                          type="text"
                          placeholder="Enter current seat"
                          className="mt-1.5"
                        />
                      </div>

                      {/* Proposed Seat(s) Field */}
                      <div>
                        <Label htmlFor="edit-proposed-seats">
                          Proposed Seat(s)
                        </Label>
                        <Input
                          id="edit-proposed-seats"
                          type="text"
                          placeholder="Enter proposed seat(s)"
                          className="mt-1.5"
                        />
                      </div>
                    </form>
                  </motion.div>

                  {/* Save Button */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                    >
                      Save Changes
                    </Button>
                  </motion.div>
                </div>
              ) : (
                <div className="space-y-4">
                  {projects.map((project, index) => (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: index * 0.1,
                        duration: 0.4,
                      }}
                      className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 flex items-center gap-4 cursor-pointer"
                      onClick={() =>
                        setPreviewingProject({
                          id: project.id,
                          title: project.title,
                        })
                      }
                    >
                      {/* Project Info */}
                      <div className="flex-1">
                        <h3 className="mb-1">
                          {project.title}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {project.description}
                        </p>
                      </div>

                      {/* Status Indicator */}
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

                      {/* Edit and Delete Buttons */}
                      <div className="flex gap-2 border-l pl-4 border-gray-200">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(project.id);
                          }}
                          variant="ghost"
                          size="icon"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          title="Edit"
                        >
                          <Edit className="size-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(project.id);
                          }}
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChat(project.id);
                          }}
                          variant="ghost"
                          size="icon"
                          className="text-[rgb(81,179,92)] hover:text-gray-700 hover:bg-gray-50"
                          title="Chat"
                        >
                          <MessageCircle className="size-4" />
                        </Button>
                      </div>

                      {/* Download Button */}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(
                            project.id,
                            project.title,
                          );
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
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                      isDraggingAdditional
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <Upload className="size-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="mb-2 text-gray-700">
                      Drag and drop files here
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      or click to select from device
                    </p>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      id="documents-upload"
                    />
                    <label htmlFor="documents-upload">
                      <Button
                        variant="outline"
                        className="cursor-pointer"
                        asChild
                      >
                        <span>Select Files</span>
                      </Button>
                    </label>
                  </div>

                  {/* Uploaded Files */}
                  {additionalFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {additionalFiles.map((file, index) => (
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
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(file.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemoveFile(index)}
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
                  <form className="space-y-5">
                    {/* Title Field */}
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
                      />
                    </div>

                    {/* Current Seat Field */}
                    <div>
                      <Label htmlFor="current-seat">
                        Current Seat
                      </Label>
                      <Input
                        id="current-seat"
                        type="text"
                        placeholder="Enter current seat"
                        className="mt-1.5"
                      />
                    </div>

                    {/* Proposed Seat(s) Field */}
                    <div>
                      <Label htmlFor="proposed-seats">
                        Proposed Seat(s)
                      </Label>
                      <Input
                        id="proposed-seats"
                        type="text"
                        placeholder="Enter proposed seat(s)"
                        className="mt-1.5"
                      />
                    </div>

                    {/* Additional Details For AI Field */}
                    <div>
                      <Label htmlFor="additional-details">
                        Additional Details For AI
                      </Label>
                      <textarea
                        ref={textareaRef}
                        id="additional-details"
                        value={additionalDetails}
                        onChange={(e) => setAdditionalDetails(e.target.value)}
                        placeholder="Enter additional details for AI processing..."
                        className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none overflow-y-auto"
                        style={{ minHeight: "120px" }}
                      />
                    </div>

                  </form>
                </motion.div>

                {/* Submit Button */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                  >
                    Create Project
                  </Button>
                </motion.div>
              </div>
            ) : activeView === "profile" ? (
              <div className="space-y-6">
                {/* Change Password */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="bg-white rounded-lg shadow p-6"
                >
                  <h3 className="mb-4">Change Password</h3>
                  <form className="space-y-5">
                    <div>
                      <Label htmlFor="current-password">
                        Current Password
                      </Label>
                      <Input
                        id="current-password"
                        type="password"
                        placeholder="••••••••"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-password">
                        New Password
                      </Label>
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="••••••••"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="confirm-password">
                        Confirm New Password
                      </Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="••••••••"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="pt-4">
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                      >
                        Change Password
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </div>
            ) : activeView === "settings" ? (
              <div className="space-y-6">
                {/* Settings */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="bg-white rounded-lg shadow p-6"
                >
                  <h3 className="mb-4">Settings</h3>
                  <form className="space-y-5">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="email-notifications" />
                      <Label
                        htmlFor="email-notifications"
                        className="cursor-pointer"
                      >
                        Enable email notifications
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="delete-data" />
                      <Label
                        htmlFor="delete-data"
                        className="cursor-pointer"
                      >
                        Delete my data after 24 hours
                      </Label>
                    </div>
                    <div className="pt-4">
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
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
            onClick={() => setPreviewingProject(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold">
                  Preview: {previewingProject.title}
                </h3>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      // Create a mock download
                      const link = document.createElement("a");
                      link.href = "#";
                      link.download = `${previewingProject.title}.pdf`;
                      alert(
                        `Downloading: ${previewingProject.title}.pdf`
                      );
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Download className="size-4 mr-2" />
                    Download PDF
                  </Button>
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

              {/* PDF Viewer */}
              <div className="flex-1 overflow-auto bg-gray-100 p-4">
                <div className="bg-white shadow-lg mx-auto max-w-4xl min-h-full p-8">
                  {/* Mock PDF Content */}
                  <div className="space-y-4">
                    <h1 className="text-2xl font-bold mb-4">
                      Arbitration Report
                    </h1>
                    <h2 className="text-xl font-semibold">
                      {previewingProject.title}
                    </h2>
                    <p className="text-gray-700 leading-relaxed">
                      This is a preview of the PDF document. In a real
                      implementation, this would display the actual PDF
                      content using an iframe or PDF viewer library.
                    </p>
                    <div className="border-t border-gray-300 pt-4 mt-4">
                      <h3 className="font-semibold mb-2">
                        Document Summary
                      </h3>
                      <p className="text-gray-700">
                        Lorem ipsum dolor sit amet, consectetur
                        adipiscing elit. Sed do eiusmod tempor
                        incididunt ut labore et dolore magna aliqua.
                        Ut enim ad minim veniam, quis nostrud
                        exercitation ullamco laboris nisi ut aliquip
                        ex ea commodo consequat.
                      </p>
                    </div>
                    <div className="border-t border-gray-300 pt-4 mt-4">
                      <h3 className="font-semibold mb-2">
                        Key Findings
                      </h3>
                      <ul className="list-disc list-inside space-y-2 text-gray-700">
                        <li>Finding 1: Important detail here</li>
                        <li>Finding 2: Additional information</li>
                        <li>Finding 3: More details</li>
                        <li>Finding 4: Conclusion summary</li>
                      </ul>
                    </div>
                    <div className="border-t border-gray-300 pt-4 mt-4">
                      <h3 className="font-semibold mb-2">
                        Recommendations
                      </h3>
                      <p className="text-gray-700">
                        Based on the analysis, we recommend the
                        following actions be taken to resolve this
                        arbitration case effectively.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}