const storageKey = "promptfolio.prompts.v1";
const promptForm = document.querySelector("#prompt-form");
const titleInput = document.querySelector("#prompt-title");
const contentInput = document.querySelector("#prompt-content");
const promptList = document.querySelector("#prompt-list");
const searchInput = document.querySelector("#search-prompts");
const deleteButton = document.querySelector("#delete-prompt");
const editorMode = document.querySelector("#editor-mode");
const saveLabel = document.querySelector("#save-label");
const saveMessage = document.querySelector("#save-message");
const librarySummary = document.querySelector("#library-summary");
const visibleCount = document.querySelector("#visible-count");
const toast = document.querySelector("#toast");

let prompts = loadPrompts();
let activePromptId = null;
let toastTimeout;

function loadPrompts() {
  try {
    const storedPrompts = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(storedPrompts)
      ? storedPrompts.filter(
          (prompt) =>
            prompt &&
            typeof prompt.id === "string" &&
            typeof prompt.title === "string" &&
            typeof prompt.content === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function persistPrompts() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prompts));
    return true;
  } catch {
    saveMessage.textContent =
      "Could not save. Check your browser storage settings.";
    return false;
  }
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Saved prompt";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function createPromptItem(prompt) {
  const item = document.createElement("li");
  item.className = "prompt-item";

  const button = document.createElement("button");
  button.className = "prompt-item-button";
  button.type = "button";
  button.setAttribute("aria-current", String(prompt.id === activePromptId));
  button.addEventListener("click", () => selectPrompt(prompt.id));

  const title = document.createElement("span");
  title.className = "prompt-item-title";
  title.textContent = prompt.title;

  const preview = document.createElement("span");
  preview.className = "prompt-item-preview";
  preview.textContent =
    prompt.content.replace(/\s+/g, " ").trim() || "No prompt text";

  const date = document.createElement("span");
  date.className = "prompt-item-date";
  date.textContent = formatDate(prompt.updatedAt || prompt.createdAt);

  button.append(title, preview, date);
  item.append(button);
  return item;
}

function renderPrompts() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filteredPrompts = prompts.filter((prompt) =>
    `${prompt.title} ${prompt.content}`.toLocaleLowerCase().includes(query),
  );

  promptList.replaceChildren(...filteredPrompts.map(createPromptItem));
  visibleCount.textContent = String(filteredPrompts.length);
  librarySummary.textContent = `${prompts.length} ${prompts.length === 1 ? "prompt" : "prompts"} saved`;

  if (filteredPrompts.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "list-empty";
    const heading = document.createElement("strong");
    heading.textContent = query ? "No matches" : "Your library is empty";
    const detail = document.createElement("span");
    detail.textContent = query
      ? "Try a different search."
      : "Save a prompt and it will appear here.";
    emptyState.append(heading, detail);
    promptList.append(emptyState);
  }
}

function resetEditor() {
  activePromptId = null;
  promptForm.reset();
  editorMode.textContent = "NEW PROMPT";
  saveLabel.textContent = "Save prompt";
  saveMessage.textContent = "Only you can see your prompts.";
  deleteButton.hidden = true;
  renderPrompts();
  titleInput.focus();
}

function selectPrompt(promptId) {
  const prompt = prompts.find((item) => item.id === promptId);
  if (!prompt) return;

  activePromptId = prompt.id;
  titleInput.value = prompt.title;
  contentInput.value = prompt.content;
  editorMode.textContent = "SAVED PROMPT";
  saveLabel.textContent = "Update prompt";
  saveMessage.textContent = `Last saved ${formatDate(prompt.updatedAt || prompt.createdAt)}.`;
  deleteButton.hidden = false;
  renderPrompts();
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimeout = window.setTimeout(
    () => toast.classList.remove("is-visible"),
    2200,
  );
}

promptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const timestamp = new Date().toISOString();
  if (activePromptId) {
    prompts = prompts.map((prompt) =>
      prompt.id === activePromptId
        ? { ...prompt, title, content, updatedAt: timestamp }
        : prompt,
    );
  } else {
    activePromptId =
      globalThis.crypto?.randomUUID?.() ||
      `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    prompts.unshift({
      id: activePromptId,
      title,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  if (!persistPrompts()) return;
  editorMode.textContent = "SAVED PROMPT";
  saveLabel.textContent = "Update prompt";
  saveMessage.textContent = "Saved on this device.";
  deleteButton.hidden = false;
  renderPrompts();
  showToast("Prompt saved");
});

document.querySelector("#new-prompt").addEventListener("click", resetEditor);
searchInput.addEventListener("input", renderPrompts);

deleteButton.addEventListener("click", () => {
  const prompt = prompts.find((item) => item.id === activePromptId);
  if (
    !prompt ||
    !window.confirm(`Delete “${prompt.title}”? This cannot be undone.`)
  )
    return;

  prompts = prompts.filter((item) => item.id !== activePromptId);
  if (!persistPrompts()) return;
  resetEditor();
  showToast("Prompt deleted");
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape" && document.activeElement === searchInput) {
    searchInput.value = "";
    renderPrompts();
    searchInput.blur();
  }
});

renderPrompts();
