const STORAGE_KEY = "prompt-library-prompts";
const IMPORT_BACKUP_KEY = "prompt-library-import-backup";
const EXPORT_FORMAT = "prompt-library-export";
const EXPORT_VERSION = 1;
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
const exportButton = document.querySelector("#export-prompts");
const importButton = document.querySelector("#import-prompts");
const importFileInput = document.querySelector("#import-file");
const importDialog = document.querySelector("#import-dialog");
const importMode = document.querySelector("#import-mode");
const importSummary = document.querySelector("#import-summary");
const importConflicts = document.querySelector("#import-conflicts");
const conflictList = document.querySelector("#conflict-list");
const replaceWarning = document.querySelector("#replace-warning");
const applyImportButton = document.querySelector("#apply-import");
const noteStatusTimers = new WeakMap();

let prompts = [];
let migratedPromptMetadata = false;
let pendingImportPrompts = null;

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
  formMessage.classList.toggle("is-success", Boolean(message) && (message.startsWith("Exported ") || message.startsWith("Imported ")));
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

function validatePrompt(prompt, index) {
  const label = `Prompt ${index + 1}`;
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) {
    throw new Error(`${label} must be an object.`);
  }
  if (typeof prompt.id !== "string" || !prompt.id.trim()) {
    throw new Error(`${label} is missing a valid ID.`);
  }
  if (typeof prompt.title !== "string" || !prompt.title.trim()) {
    throw new Error(`${label} must have a title.`);
  }
  if (typeof prompt.content !== "string" || !prompt.content.trim()) {
    throw new Error(`${label} must have prompt content.`);
  }
  if (prompt.note !== undefined && typeof prompt.note !== "string") {
    throw new Error(`${label} note must be text.`);
  }
  if (prompt.rating !== undefined && (!Number.isInteger(prompt.rating) || prompt.rating < 1 || prompt.rating > 5)) {
    throw new Error(`${label} rating must be an integer from 1 to 5.`);
  }

  const metadata = prompt.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(`${label} is missing metadata.`);
  }
  if (typeof metadata.model !== "string" || !metadata.model.trim() || metadata.model.length > 100) {
    throw new Error(`${label} metadata model must be 1 to 100 characters.`);
  }
  if (!isIsoTimestamp(metadata.createdAt) || !isIsoTimestamp(metadata.updatedAt)) {
    throw new Error(`${label} metadata timestamps must be valid ISO 8601 values.`);
  }
  if (Date.parse(metadata.updatedAt) < Date.parse(metadata.createdAt)) {
    throw new Error(`${label} metadata updatedAt cannot precede createdAt.`);
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
    throw new Error(`${label} metadata token estimate is invalid.`);
  }

  return {
    ...prompt,
    note: typeof prompt.note === "string" ? prompt.note : "",
    metadata: {
      ...metadata,
      tokenEstimate: { ...estimate }
    }
  };
}

function validatePromptList(promptList) {
  if (!Array.isArray(promptList)) {
    throw new Error("The prompts value must be an array.");
  }

  const ids = new Set();
  return promptList.map((prompt, index) => {
    const validatedPrompt = validatePrompt(prompt, index);
    if (ids.has(validatedPrompt.id)) {
      throw new Error(`Duplicate prompt ID found: ${validatedPrompt.id}`);
    }
    ids.add(validatedPrompt.id);
    return validatedPrompt;
  });
}

function calculateStatistics(promptList) {
  const ratedPrompts = promptList.filter((prompt) => getPromptRating(prompt) > 0);
  const modelCounts = new Map();
  promptList.forEach((prompt) => {
    const model = prompt.metadata.model;
    modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
  });

  const mostUsedModel = [...modelCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  const averageRating = ratedPrompts.length
    ? Number((ratedPrompts.reduce((total, prompt) => total + prompt.rating, 0) / ratedPrompts.length).toFixed(2))
    : null;

  return {
    totalPrompts: promptList.length,
    averageRating,
    mostUsedModel: mostUsedModel ? mostUsedModel[0] : null
  };
}

function readPromptsForExport() {
  const rawPrompts = localStorage.getItem(STORAGE_KEY);
  if (rawPrompts === null) {
    return [];
  }
  const parsedPrompts = JSON.parse(rawPrompts);
  if (!Array.isArray(parsedPrompts)) {
    throw new Error("Saved prompt data is not a list.");
  }

  const normalizedPrompts = loadPrompts();
  return validatePromptList(normalizedPrompts);
}

function exportPrompts() {
  try {
    const promptsToExport = readPromptsForExport();
    const exportData = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      statistics: calculateStatistics(promptsToExport),
      prompts: promptsToExport
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    const timestamp = exportData.exportedAt.replace(/[:.]/g, "-");
    downloadLink.href = downloadUrl;
    downloadLink.download = `prompt-library-${timestamp}.json`;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    setMessage(`Exported ${promptsToExport.length} prompt${promptsToExport.length === 1 ? "" : "s"}.`);
  } catch (error) {
    setMessage(`Export failed: ${error.message || "browser storage could not be read."}`);
  }
}

function validateImportDocument(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The file must contain a JSON object.");
  }
  if (data.format !== EXPORT_FORMAT) {
    throw new Error("This is not a Prompt Library export file.");
  }
  if (data.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${String(data.version)}.`);
  }
  if (!isIsoTimestamp(data.exportedAt)) {
    throw new Error("The export timestamp is missing or invalid.");
  }
  const statistics = data.statistics;
  if (
    !statistics ||
    typeof statistics !== "object" ||
    !Number.isInteger(statistics.totalPrompts) ||
    statistics.totalPrompts < 0 ||
    !(statistics.averageRating === null || (
      typeof statistics.averageRating === "number" &&
      Number.isFinite(statistics.averageRating) &&
      statistics.averageRating >= 1 &&
      statistics.averageRating <= 5
    )) ||
    !(statistics.mostUsedModel === null || typeof statistics.mostUsedModel === "string")
  ) {
    throw new Error("The export statistics are invalid.");
  }
  const validatedPrompts = validatePromptList(data.prompts);
  const expectedStatistics = calculateStatistics(validatedPrompts);
  if (
    statistics.totalPrompts !== expectedStatistics.totalPrompts ||
    statistics.averageRating !== expectedStatistics.averageRating ||
    statistics.mostUsedModel !== expectedStatistics.mostUsedModel
  ) {
    throw new Error("The export statistics do not match the prompt data.");
  }
  return validatedPrompts;
}

function renderImportConflicts(incomingPrompts) {
  const existingIds = new Set(prompts.map((prompt) => prompt.id));
  const conflicts = incomingPrompts.filter((prompt) => existingIds.has(prompt.id));
  conflictList.replaceChildren();
  conflicts.forEach((prompt) => {
    const row = document.createElement("div");
    row.className = "conflict-row";
    const label = document.createElement("label");
    const choice = document.createElement("select");
    choice.dataset.promptId = prompt.id;
    const keepOption = document.createElement("option");
    keepOption.value = "keep";
    keepOption.textContent = "Keep saved version";
    const importOption = document.createElement("option");
    importOption.value = "import";
    importOption.textContent = "Use imported version";
    choice.append(keepOption, importOption);
    label.textContent = prompt.title;
    label.append(choice);
    row.append(label);
    conflictList.append(row);
  });
  importConflicts.hidden = conflicts.length === 0;
  return conflicts.length;
}

function updateImportMode() {
  const replacing = importMode.value === "replace";
  importConflicts.hidden = replacing || conflictList.childElementCount === 0;
  replaceWarning.hidden = !replacing;
  applyImportButton.textContent = replacing ? "Replace prompts" : "Merge prompts";
}

function openImportDialog(incomingPrompts) {
  pendingImportPrompts = incomingPrompts;
  const conflictCount = renderImportConflicts(incomingPrompts);
  importMode.value = "merge";
  importSummary.textContent = `${incomingPrompts.length} prompt${incomingPrompts.length === 1 ? "" : "s"} found; ${conflictCount} matching ID${conflictCount === 1 ? "" : "s"} in this library.`;
  updateImportMode();
  importDialog.showModal();
}

function applyImport() {
  if (!pendingImportPrompts) {
    setMessage("Import failed: no validated file is ready to import.");
    importDialog.close();
    return;
  }

  let previousRaw = null;
  const previousPrompts = prompts;
  let backupCreated = false;
  let promptWriteStarted = false;
  try {
    previousRaw = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(IMPORT_BACKUP_KEY, JSON.stringify({
      backedUpAt: new Date().toISOString(),
      storageKey: STORAGE_KEY,
      rawValue: previousRaw
    }));
    backupCreated = true;

    let nextPrompts;
    if (importMode.value === "replace") {
      nextPrompts = pendingImportPrompts;
    } else {
      const importedById = new Map(pendingImportPrompts.map((prompt) => [prompt.id, prompt]));
      const choices = new Map(
        [...conflictList.querySelectorAll("select")]
          .map((choice) => [choice.dataset.promptId, choice.value])
      );
      nextPrompts = prompts.map((prompt) => {
        if (!importedById.has(prompt.id) || choices.get(prompt.id) !== "import") {
          return prompt;
        }
        return importedById.get(prompt.id);
      });
      const existingIds = new Set(prompts.map((prompt) => prompt.id));
      nextPrompts.push(...pendingImportPrompts.filter((prompt) => !existingIds.has(prompt.id)));
    }

    nextPrompts = validatePromptList(nextPrompts);
    promptWriteStarted = true;
    savePrompts(nextPrompts);
    prompts = nextPrompts;
    renderPrompts();
    setMessage(`Imported ${pendingImportPrompts.length} prompt${pendingImportPrompts.length === 1 ? "" : "s"} successfully. A pre-import backup is available in browser storage.`);
    pendingImportPrompts = null;
    importDialog.close();
  } catch (error) {
    let rollbackMessage = "";
    if (promptWriteStarted) {
      try {
        if (previousRaw === null) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, previousRaw);
        }
        prompts = previousPrompts;
        renderPrompts();
      } catch (rollbackError) {
        rollbackMessage = ` Rollback also failed: ${rollbackError.message || "browser storage is unavailable"}.`;
      }
    }
    const backupMessage = backupCreated
      ? " The pre-import backup was retained in browser storage."
      : " The backup could not be created, so no import was applied.";
    setMessage(`Import failed: ${error.message || "unexpected storage error"}.${backupMessage}${rollbackMessage}`);
  }
}

exportButton.addEventListener("click", exportPrompts);
importButton.addEventListener("click", () => importFileInput.click());
importMode.addEventListener("change", updateImportMode);
document.querySelector("#cancel-import").addEventListener("click", () => importDialog.close());
applyImportButton.addEventListener("click", applyImport);
importDialog.addEventListener("close", () => {
  pendingImportPrompts = null;
});

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files[0];
  importFileInput.value = "";
  if (!file) {
    return;
  }

  try {
    const data = JSON.parse(await file.text());
    openImportDialog(validateImportDocument(data));
  } catch (error) {
    setMessage(`Import file rejected: ${error.message || "could not read the file."}`);
  }
});

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
  if (!note) {
    showNoteStatus(noteStatus, "Please enter a note before saving.");
    return;
  }

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
