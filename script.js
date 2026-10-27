const STORAGE_KEY = "prompt-library-prompts";
const form = document.querySelector("#prompt-form");
const titleInput = document.querySelector("#prompt-title");
const contentInput = document.querySelector("#prompt-content");
const promptList = document.querySelector("#prompt-list");
const promptCount = document.querySelector("#prompt-count");
const formMessage = document.querySelector("#form-message");

let prompts = [];

function setMessage(message) {
  formMessage.textContent = message;
}

function loadPrompts() {
  const savedPrompts = localStorage.getItem(STORAGE_KEY);
  if (!savedPrompts) {
    return [];
  }

  const parsedPrompts = JSON.parse(savedPrompts);
  if (!Array.isArray(parsedPrompts)) {
    throw new Error("Saved prompt data is not a list.");
  }
  return parsedPrompts;
}

function savePrompts(nextPrompts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPrompts));
}

function createPromptCard(prompt) {
  const card = document.createElement("article");
  card.className = "prompt-card";

  const topline = document.createElement("div");
  topline.className = "card-topline";

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = prompt.title;

  const tag = document.createElement("span");
  tag.className = "card-tag";
  tag.textContent = "PROMPT";

  const preview = document.createElement("p");
  preview.className = "card-preview";
  const words = prompt.content.trim().split(/\s+/);
  preview.textContent = words.length > 18
    ? `${words.slice(0, 18).join(" ")}...`
    : prompt.content;

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete prompt";
  deleteButton.setAttribute("aria-label", `Delete ${prompt.title}`);
  deleteButton.addEventListener("click", () => deletePrompt(prompt.id));

  topline.append(title, tag);
  card.append(topline, preview, deleteButton);
  return card;
}

function renderPrompts() {
  promptList.replaceChildren();
  promptCount.textContent = String(prompts.length);

  if (prompts.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";

    const heading = document.createElement("span");
    heading.textContent = "Nothing saved yet";
    emptyState.append(heading, document.createTextNode("Your prompts will show up here."));
    promptList.append(emptyState);
    return;
  }

  prompts.forEach((prompt) => promptList.append(createPromptCard(prompt)));
}

function deletePrompt(id) {
  const remainingPrompts = prompts.filter((prompt) => prompt.id !== id);
  try {
    savePrompts(remainingPrompts);
    prompts = remainingPrompts;
    renderPrompts();
    setMessage("");
  } catch {
    setMessage("Could not delete the prompt. Please try again.");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  setMessage("");

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) {
    setMessage("Add both a title and prompt content.");
    return;
  }

  const nextPrompts = [
    { id: crypto.randomUUID(), title, content },
    ...prompts
  ];

  try {
    savePrompts(nextPrompts);
    prompts = nextPrompts;
    renderPrompts();
    form.reset();
    titleInput.focus();
  } catch {
    setMessage("Could not save the prompt. Check browser storage and try again.");
  }
});

try {
  prompts = loadPrompts();
  renderPrompts();
} catch {
  setMessage("Could not load saved prompts. Browser storage may be unavailable or corrupted.");
  renderPrompts();
}
