const STORAGE_KEY = "prompt-library-prompts";
const form = document.querySelector("#prompt-form");
const titleInput = document.querySelector("#prompt-title");
const contentInput = document.querySelector("#prompt-content");
const promptList = document.querySelector("#prompt-list");
const promptCount = document.querySelector("#prompt-count");
const formMessage = document.querySelector("#form-message");
const ratingTemplate = document.querySelector("#rating-template");

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

  const cardActions = document.createElement("div");
  cardActions.className = "card-actions";

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.setAttribute("aria-label", `Delete ${prompt.title}`);
  deleteButton.title = `Delete ${prompt.title}`;
  deleteButton.addEventListener("click", () => deletePrompt(prompt.id));

  const deleteIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  deleteIcon.setAttribute("viewBox", "0 0 24 24");
  deleteIcon.setAttribute("width", "17");
  deleteIcon.setAttribute("height", "17");
  deleteIcon.setAttribute("fill", "none");
  deleteIcon.setAttribute("stroke", "currentColor");
  deleteIcon.setAttribute("stroke-width", "1.8");
  deleteIcon.setAttribute("stroke-linecap", "round");
  deleteIcon.setAttribute("stroke-linejoin", "round");
  deleteIcon.setAttribute("aria-hidden", "true");
  deleteIcon.setAttribute("focusable", "false");

  const deleteIconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  deleteIconPath.setAttribute("d", "M3 6h18M8 6V4h8v2m-7 4v7m6-7v7M5 6l1 14h12l1-14");
  deleteIcon.append(deleteIconPath);
  deleteButton.append(deleteIcon);

  const preview = document.createElement("p");
  preview.className = "card-preview";
  const words = prompt.content.trim().split(/\s+/);
  preview.textContent = words.length > 18
    ? `${words.slice(0, 18).join(" ")}...`
    : prompt.content;

  const ratingControl = createRatingControl(prompt);

  cardActions.append(tag, deleteButton);
  topline.append(title, cardActions);
  card.append(topline, preview, ratingControl);
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

function ratePrompt(id, rating, ratingControl) {
  const prompt = prompts.find((item) => item.id === id);
  if (!prompt) {
    setMessage("Could not find that prompt. Refresh the page and try again.");
    return;
  }

  const nextPrompts = prompts.map((prompt) => {
    if (prompt.id !== id) {
      return prompt;
    }
    const updatedPrompt = { ...prompt };
    if (rating === 0) {
      delete updatedPrompt.rating;
    } else {
      updatedPrompt.rating = rating;
    }
    return updatedPrompt;
  });

  try {
    savePrompts(nextPrompts);
    prompts = nextPrompts;
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
