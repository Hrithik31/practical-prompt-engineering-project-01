const STORAGE_KEY = "prompt-library-prompts";
const form = document.querySelector("#prompt-form");
const titleInput = document.querySelector("#prompt-title");
const modelInput = document.querySelector("#model-name");
const contentInput = document.querySelector("#prompt-content");
const promptList = document.querySelector("#prompt-list");
const promptCount = document.querySelector("#prompt-count");
const formMessage = document.querySelector("#form-message");
const promptCardTemplate = document.querySelector("#prompt-card-template");
const emptyStateTemplate = document.querySelector("#empty-state-template");
const ratingTemplate = document.querySelector("#rating-template");
const noteTemplate = document.querySelector("#note-template");
const noteStatusTimers = new WeakMap();

let prompts = [];
let migratedPromptMetadata = false;

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function estimateTokens(text, isCode) {
  if (typeof text !== "string") {
    throw new TypeError("Text must be a string.");
  }
  if (typeof isCode !== "boolean") {
    throw new TypeError("isCode must be a boolean.");
  }

  const trimmedText = text.trim();
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  const multiplier = isCode ? 1.3 : 1;
  const min = wordCount * 0.75 * multiplier;
  const max = text.length * 0.25 * multiplier;
  const confidence = max < 1000 ? "high" : max <= 5000 ? "medium" : "low";

  return { min, max, confidence };
}

function trackModel(modelName, content) {
  if (typeof modelName !== "string" || !modelName.trim()) {
    throw new TypeError("Model name must be a non-empty string.");
  }
  if (modelName.length > 100) {
    throw new RangeError("Model name must be 100 characters or fewer.");
  }
  if (typeof content !== "string") {
    throw new TypeError("Prompt content must be a string.");
  }

  const timestamp = new Date().toISOString();
  return {
    model: modelName,
    createdAt: timestamp,
    updatedAt: timestamp,
    tokenEstimate: estimateTokens(content, false)
  };
}

function updateTimestamps(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new TypeError("Metadata must be an object.");
  }
  if (typeof metadata.model !== "string" || !metadata.model.trim() || metadata.model.length > 100) {
    throw new TypeError("Metadata model must be a non-empty string of 100 characters or fewer.");
  }
  if (!isIsoTimestamp(metadata.createdAt)) {
    throw new TypeError("Metadata createdAt must be a valid ISO 8601 timestamp.");
  }
  if (!isIsoTimestamp(metadata.updatedAt)) {
    throw new TypeError("Metadata updatedAt must be a valid ISO 8601 timestamp.");
  }
  if (Date.parse(metadata.updatedAt) < Date.parse(metadata.createdAt)) {
    throw new RangeError("Metadata updatedAt must be greater than or equal to createdAt.");
  }

  const estimate = metadata.tokenEstimate;
  if (
    !estimate ||
    typeof estimate !== "object" ||
    !Number.isFinite(estimate.min) ||
    !Number.isFinite(estimate.max) ||
    estimate.min < 0 ||
    estimate.max < estimate.min ||
    !["high", "medium", "low"].includes(estimate.confidence)
  ) {
    throw new TypeError("Metadata tokenEstimate must contain valid min, max, and confidence values.");
  }

  const updatedAt = new Date().toISOString();
  return {
    model: metadata.model,
    createdAt: metadata.createdAt,
    updatedAt: Date.parse(updatedAt) >= Date.parse(metadata.createdAt)
      ? updatedAt
      : metadata.createdAt,
    tokenEstimate: {
      min: estimate.min,
      max: estimate.max,
      confidence: estimate.confidence
    }
  };
}

function updateMetadataDisplay(section, metadata) {
  section.querySelector(".metadata-model").textContent = metadata.model;
  section.querySelector(".metadata-timestamps").textContent =
    `Created ${new Date(metadata.createdAt).toLocaleString()} · Updated ${new Date(metadata.updatedAt).toLocaleString()}`;

  const tokenEstimate = section.querySelector(".metadata-tokens");
  const confidence = metadata.tokenEstimate.confidence;
  tokenEstimate.className = `metadata-tokens confidence-${confidence}`;
  tokenEstimate.textContent =
    `${Math.round(metadata.tokenEstimate.min)}–${Math.round(metadata.tokenEstimate.max)} tokens · ${confidence} confidence`;
}

function setMessage(message) {
  formMessage.textContent = message;
}

function loadPrompts() {
  migratedPromptMetadata = false;
  const savedPrompts = localStorage.getItem(STORAGE_KEY);
  if (!savedPrompts) {
    return [];
  }

  const parsedPrompts = JSON.parse(savedPrompts);
  if (!Array.isArray(parsedPrompts)) {
    throw new Error("Saved prompt data is not a list.");
  }
  return parsedPrompts.map((prompt) => {
    const normalizedPrompt = {
      ...prompt,
      note: typeof prompt.note === "string" ? prompt.note : ""
    };
    if (!normalizedPrompt.metadata) {
      migratedPromptMetadata = true;
      normalizedPrompt.metadata = trackModel(
        typeof normalizedPrompt.model === "string" ? normalizedPrompt.model : "Unspecified",
        normalizedPrompt.content
      );
    } else {
      updateTimestamps(normalizedPrompt.metadata);
    }
    return normalizedPrompt;
  });
}

function savePrompts(nextPrompts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPrompts));
}

function getPromptRating(prompt) {
  return Number.isInteger(prompt.rating) && prompt.rating >= 1 && prompt.rating <= 5
    ? prompt.rating
    : 0;
}

function getCurrentPromptRating(id) {
  const prompt = prompts.find((item) => item.id === id);
  return prompt ? getPromptRating(prompt) : 0;
}

function updateRatingStars(ratingControl, rating) {
  ratingControl.querySelectorAll(".rating-star").forEach((star, index) => {
    star.classList.toggle("is-filled", index < rating);
  });
}

function createRatingControl(prompt) {
  const ratingControl = ratingTemplate.content.firstElementChild.cloneNode(true);
  const rating = getPromptRating(prompt);
  const inputs = ratingControl.querySelectorAll('input[type="radio"]');
  const ratingMessage = ratingControl.querySelector(".rating-message");
  const clearRatingButton = ratingControl.querySelector(".clear-rating-button");
  const ratingStars = ratingControl.querySelector(".rating-stars");

  inputs.forEach((input) => {
    const value = Number(input.value);
    input.name = `rating-${prompt.id}`;
    input.checked = value === rating;
    input.setAttribute("aria-label", `Rate ${prompt.title} ${value} out of 5 stars`);
    input.addEventListener("change", () => ratePrompt(prompt.id, value, ratingControl));
  });

  ratingMessage.textContent = rating
    ? `Rated ${rating} out of 5`
    : "Not rated";
  clearRatingButton.hidden = rating === 0;
  clearRatingButton.setAttribute("aria-label", `Clear rating for ${prompt.title}`);
  clearRatingButton.addEventListener("click", () => ratePrompt(prompt.id, 0, ratingControl));
  updateRatingStars(ratingControl, rating);

  ratingStars.addEventListener("pointerover", (event) => {
    const option = event.target.closest(".rating-option");
    if (option) {
      updateRatingStars(ratingControl, Number(option.querySelector("input").value));
    }
  });
  ratingStars.addEventListener("pointerleave", () => {
    updateRatingStars(ratingControl, getCurrentPromptRating(prompt.id));
  });
  ratingStars.addEventListener("focusin", (event) => {
    if (event.target.matches('input[type="radio"]')) {
      updateRatingStars(ratingControl, Number(event.target.value));
    }
  });
  ratingStars.addEventListener("focusout", () => {
    updateRatingStars(ratingControl, getCurrentPromptRating(prompt.id));
  });

  return ratingControl;
}

function createPromptCard(prompt) {
  const card = promptCardTemplate.content.firstElementChild.cloneNode(true);
  const title = card.querySelector(".card-title");
  title.textContent = prompt.title;

  const deleteButton = card.querySelector(".delete-button");
  deleteButton.setAttribute("aria-label", `Delete ${prompt.title}`);
  deleteButton.title = `Delete ${prompt.title}`;
  deleteButton.addEventListener("click", () => deletePrompt(prompt.id));

  const preview = card.querySelector(".card-preview");
  const words = prompt.content.trim().split(/\s+/);
  preview.textContent = words.length > 18
    ? `${words.slice(0, 18).join(" ")}...`
    : prompt.content;

  const metadata = card.querySelector(".prompt-metadata");
  updateMetadataDisplay(metadata, prompt.metadata);

  const notes = noteTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector(".note-slot").replaceChildren(notes);
  const noteLabel = notes.querySelector(".note-label");
  const noteDisplay = notes.querySelector(".note-display");
  const noteInput = notes.querySelector(".note-input");
  const noteStatus = notes.querySelector(".note-status");
  const saveNoteButton = notes.querySelector(".note-save-button");
  const editNoteButton = notes.querySelector(".note-edit-button");
  const deleteNoteButton = notes.querySelector(".note-delete-button");

  noteInput.value = typeof prompt.note === "string" ? prompt.note : "";
  noteDisplay.textContent = noteInput.value;
  noteInput.setAttribute("aria-label", `Note for ${prompt.title}`);
  noteLabel.htmlFor = `note-${prompt.id}`;
  noteInput.id = `note-${prompt.id}`;
  setNoteState(notes, noteInput.value ? "saved" : "new");
  saveNoteButton.setAttribute("aria-label", `Save note for ${prompt.title}`);
  saveNoteButton.addEventListener("click", () => saveNote(
    prompt.id, notes, noteDisplay, noteInput, noteStatus
  ));

  editNoteButton.setAttribute("aria-label", `Edit note for ${prompt.title}`);
  editNoteButton.addEventListener("click", () => {
    setNoteState(notes, "editing");
    noteInput.focus();
  });
  deleteNoteButton.setAttribute("aria-label", `Delete note for ${prompt.title}`);
  deleteNoteButton.addEventListener("click", () => deleteNote(
    prompt.id, notes, noteDisplay, noteInput, noteStatus
  ));

  const ratingControl = createRatingControl(prompt);
  card.querySelector(".rating-slot").replaceChildren(ratingControl);
  return card;
}

function renderPrompts() {
  promptList.replaceChildren();
  promptCount.textContent = String(prompts.length);

  if (prompts.length === 0) {
    promptList.append(emptyStateTemplate.content.firstElementChild.cloneNode(true));
    return;
  }

  prompts
    .slice()
    .sort((left, right) => Date.parse(right.metadata.createdAt) - Date.parse(left.metadata.createdAt))
    .forEach((prompt) => promptList.append(createPromptCard(prompt)));
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

function setNoteState(notes, state) {
  const isSaved = state === "saved";
  const isNew = state === "new";
  notes.querySelector(".note-display").hidden = !isSaved;
  notes.querySelector(".note-input").hidden = isSaved;
  notes.querySelector(".note-save-button").hidden = isSaved;
  notes.querySelector(".note-edit-button").hidden = !isSaved;
  notes.querySelector(".note-delete-button").hidden = isNew;
}

function showNoteStatus(noteStatus, message, clearAfter = 0) {
  const existingTimer = noteStatusTimers.get(noteStatus);
  if (existingTimer) {
    clearTimeout(existingTimer);
    noteStatusTimers.delete(noteStatus);
  }

  noteStatus.textContent = message;
  if (clearAfter > 0) {
    const timer = setTimeout(() => {
      noteStatus.textContent = "";
      noteStatusTimers.delete(noteStatus);
    }, clearAfter);
    noteStatusTimers.set(noteStatus, timer);
  }
}

function saveNote(id, notes, noteDisplay, noteInput, noteStatus) {
  const prompt = prompts.find((item) => item.id === id);
  if (!prompt) {
    showNoteStatus(noteStatus, "Could not find that prompt. Refresh the page and try again.");
    return;
  }

  const note = noteInput.value.trim();
  let updatedPrompt;
  try {
    updatedPrompt = { ...prompt, note, metadata: updateTimestamps(prompt.metadata) };
  } catch {
    showNoteStatus(noteStatus, "Could not update prompt metadata. Refresh the page and try again.");
    return;
  }
  const nextPrompts = prompts.map((item) => item.id === id ? updatedPrompt : item);
  try {
    savePrompts(nextPrompts);
    prompts = nextPrompts;
    updateMetadataDisplay(
      notes.closest(".prompt-card").querySelector(".prompt-metadata"),
      updatedPrompt.metadata
    );
    noteDisplay.textContent = note;
    setNoteState(notes, "saved");
    showNoteStatus(noteStatus, "Note saved.", 3000);
    setMessage("");
  } catch {
    showNoteStatus(noteStatus, "Could not save the note. Check browser storage and try again.");
  }
}

function deleteNote(id, notes, noteDisplay, noteInput, noteStatus) {
  const prompt = prompts.find((item) => item.id === id);
  if (!prompt) {
    showNoteStatus(noteStatus, "Could not find that prompt. Refresh the page and try again.");
    return;
  }

  let updatedPrompt;
  try {
    updatedPrompt = { ...prompt, metadata: updateTimestamps(prompt.metadata) };
    delete updatedPrompt.note;
  } catch {
    showNoteStatus(noteStatus, "Could not update prompt metadata. Refresh the page and try again.");
    return;
  }
  const nextPrompts = prompts.map((item) => item.id === id ? updatedPrompt : item);
  try {
    savePrompts(nextPrompts);
    prompts = nextPrompts;
    updateMetadataDisplay(
      notes.closest(".prompt-card").querySelector(".prompt-metadata"),
      updatedPrompt.metadata
    );
    noteInput.value = "";
    noteDisplay.textContent = "";
    setNoteState(notes, "editing");
    showNoteStatus(noteStatus, "Note deleted.");
    setMessage("");
  } catch {
    showNoteStatus(noteStatus, "Could not delete the note. Check browser storage and try again.");
  }
}

function ratePrompt(id, rating, ratingControl) {
  const prompt = prompts.find((item) => item.id === id);
  if (!prompt) {
    setMessage("Could not find that prompt. Refresh the page and try again.");
    return;
  }

  try {
    const nextPrompts = prompts.map((item) => {
      if (item.id !== id) {
        return item;
      }
      const updatedPrompt = { ...item, metadata: updateTimestamps(item.metadata) };
      if (rating === 0) {
        delete updatedPrompt.rating;
      } else {
        updatedPrompt.rating = rating;
      }
      return updatedPrompt;
    });
    savePrompts(nextPrompts);
    prompts = nextPrompts;
    updateMetadataDisplay(
      ratingControl.closest(".prompt-card").querySelector(".prompt-metadata"),
      prompts.find((item) => item.id === id).metadata
    );
    if (rating === 0) {
      delete prompt.rating;
    } else {
      prompt.rating = rating;
    }
    ratingControl.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.checked = Number(input.value) === rating;
    });
    updateRatingStars(ratingControl, rating);
    ratingControl.querySelector(".rating-message").textContent = rating
      ? `Rated ${rating} out of 5`
      : "Not rated";
    ratingControl.querySelector(".clear-rating-button").hidden = rating === 0;
    setMessage("");
  } catch {
    ratingControl.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.checked = Number(input.value) === getPromptRating(prompt);
    });
    updateRatingStars(ratingControl, getPromptRating(prompt));
    setMessage("Could not save the rating. Check browser storage and try again.");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  setMessage("");

  const title = titleInput.value.trim();
  const modelName = modelInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !modelName || !content) {
    setMessage("Add a title, model name, and prompt content.");
    return;
  }

  try {
    const nextPrompts = [
      {
        id: crypto.randomUUID(),
        title,
        content,
        note: "",
        metadata: trackModel(modelName, content)
      },
      ...prompts
    ];
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
  if (migratedPromptMetadata) {
    try {
      savePrompts(prompts);
    } catch {
      setMessage("Prompts loaded, but metadata migration could not be saved to browser storage.");
    }
  }
} catch {
  setMessage("Could not load saved prompts. Browser storage may be unavailable or corrupted.");
  renderPrompts();
}
