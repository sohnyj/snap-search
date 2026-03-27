let settings = null;

// DOM elements
const engineList = document.getElementById("engine-list");
const newEngineName = document.getElementById("new-engine-name");
const newEngineUrl = document.getElementById("new-engine-url");
const addEngineBtn = document.getElementById("add-engine-btn");
const addDividerBtn = document.getElementById("add-divider-btn");
const displayMode = document.getElementById("display-mode");
const iconSize = document.getElementById("icon-size");
const builtinCopy = document.getElementById("builtin-copy");
const builtinOpenLink = document.getElementById("builtin-openlink");
const themeSelect = document.getElementById("theme-select");
const openBackground = document.getElementById("open-background");
const excludedList = document.getElementById("excluded-list");
const newDomain = document.getElementById("new-domain");
const addDomainBtn = document.getElementById("add-domain-btn");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const resetBtn = document.getElementById("reset-btn");
const statusMsg = document.getElementById("status-msg");

async function loadSettings() {
  const result = await browser.storage.local.get("settings");
  settings = result.settings || structuredClone(DEFAULT_SETTINGS);
  render();
}

async function saveSettings() {
  await browser.storage.local.set({ settings });
  showStatus("Settings saved");
}

function showStatus(msg) {
  statusMsg.textContent = msg;
  statusMsg.hidden = false;
  setTimeout(() => { statusMsg.hidden = true; }, 2000);
}

// --- Render ---

function render() {
  renderBuiltinActions();
  renderEngines();
  renderAppearance();
  renderExcludedDomains();
}

function renderBuiltinActions() {
  const actions = settings.builtinActions || {};
  builtinCopy.checked = actions.copy ? actions.copy.enabled : true;
  builtinOpenLink.checked = actions.openLink ? actions.openLink.enabled : true;
}

function renderEngines() {
  engineList.innerHTML = "";

  settings.searchEngines.forEach((item, index) => {
    const row = document.createElement("div");
    row.draggable = true;
    row.dataset.index = index;

    row.addEventListener("dragstart", onDragStart);
    row.addEventListener("dragover", onDragOver);
    row.addEventListener("drop", onDrop);
    row.addEventListener("dragend", onDragEnd);

    if (item.type === "divider") {
      row.className = "engine-row divider-row";

      const dragHandle = document.createElement("span");
      dragHandle.className = "drag-handle";
      dragHandle.textContent = "☰";

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = item.enabled !== false;
      toggle.addEventListener("change", () => {
        item.enabled = toggle.checked;
        saveSettings();
      });

      const label = document.createElement("span");
      label.className = "divider-label";
      label.textContent = "── Divider ──";

      const actions = document.createElement("span");
      actions.className = "engine-actions";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-small btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        settings.searchEngines.splice(index, 1);
        saveSettings();
        renderEngines();
      });
      actions.appendChild(deleteBtn);

      row.appendChild(dragHandle);
      row.appendChild(toggle);
      row.appendChild(label);
      row.appendChild(actions);
      engineList.appendChild(row);
      return;
    }

    row.className = "engine-row";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = item.enabled;
    toggle.addEventListener("change", () => {
      item.enabled = toggle.checked;
      saveSettings();
    });

    const name = document.createElement("span");
    name.className = "engine-name";
    name.textContent = item.name;

    const url = document.createElement("span");
    url.className = "engine-url";
    url.textContent = item.url;

    const actions = document.createElement("span");
    actions.className = "engine-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-small";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => editEngine(index));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-small btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      settings.searchEngines.splice(index, 1);
      saveSettings();
      renderEngines();
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "☰";

    row.appendChild(dragHandle);
    row.appendChild(toggle);
    row.appendChild(name);
    row.appendChild(url);
    row.appendChild(actions);
    engineList.appendChild(row);
  });
}

function editEngine(index) {
  const engine = settings.searchEngines[index];
  const newName = prompt("Name:", engine.name);
  if (newName === null) return;
  const newUrl = prompt("URL (use %s for query):", engine.url);
  if (newUrl === null) return;

  engine.name = newName.trim() || engine.name;
  engine.url = newUrl.trim() || engine.url;
  saveSettings();
  renderEngines();
}

// Drag and drop reordering
let dragIndex = null;

function onDragStart(e) {
  dragIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function onDrop(e) {
  e.preventDefault();
  const dropIndex = parseInt(e.currentTarget.dataset.index);
  if (dragIndex === null || dragIndex === dropIndex) return;

  const [moved] = settings.searchEngines.splice(dragIndex, 1);
  settings.searchEngines.splice(dropIndex, 0, moved);
  dragIndex = null;
  saveSettings();
  renderEngines();
}

function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  dragIndex = null;
}

function renderAppearance() {
  displayMode.value = settings.appearance.displayMode;
  iconSize.value = settings.appearance.iconSize;
  themeSelect.value = settings.appearance.theme;
  openBackground.checked = settings.openInBackground || false;
}

function renderExcludedDomains() {
  excludedList.innerHTML = "";

  settings.excludedDomains.forEach((domain, index) => {
    const row = document.createElement("div");
    row.className = "domain-row";

    const label = document.createElement("span");
    label.textContent = domain;

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-small btn-danger";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      settings.excludedDomains.splice(index, 1);
      saveSettings();
      renderExcludedDomains();
    });

    row.appendChild(label);
    row.appendChild(removeBtn);
    excludedList.appendChild(row);
  });
}

// --- Event listeners ---

addEngineBtn.addEventListener("click", () => {
  const name = newEngineName.value.trim();
  const url = newEngineUrl.value.trim();
  if (!name || !url) {
    showStatus("Please enter both name and URL");
    return;
  }
  if (!url.includes("%s")) {
    showStatus("URL must contain %s as query placeholder");
    return;
  }

  settings.searchEngines.push({
    id: `custom-${Date.now()}`,
    name,
    url,
    type: "custom",
    enabled: true
  });

  newEngineName.value = "";
  newEngineUrl.value = "";
  saveSettings();
  renderEngines();
});

addDividerBtn.addEventListener("click", () => {
  settings.searchEngines.push({
    id: `divider-${Date.now()}`,
    type: "divider"
  });
  saveSettings();
  renderEngines();
});

displayMode.addEventListener("change", () => {
  settings.appearance.displayMode = displayMode.value;
  saveSettings();
});

iconSize.addEventListener("change", () => {
  settings.appearance.iconSize = parseInt(iconSize.value);
  saveSettings();
});

builtinCopy.addEventListener("change", () => {
  if (!settings.builtinActions) settings.builtinActions = {};
  if (!settings.builtinActions.copy) settings.builtinActions.copy = {};
  settings.builtinActions.copy.enabled = builtinCopy.checked;
  saveSettings();
});

builtinOpenLink.addEventListener("change", () => {
  if (!settings.builtinActions) settings.builtinActions = {};
  if (!settings.builtinActions.openLink) settings.builtinActions.openLink = {};
  settings.builtinActions.openLink.enabled = builtinOpenLink.checked;
  saveSettings();
});

themeSelect.addEventListener("change", () => {
  settings.appearance.theme = themeSelect.value;
  saveSettings();
});

openBackground.addEventListener("change", () => {
  settings.openInBackground = openBackground.checked;
  saveSettings();
});

addDomainBtn.addEventListener("click", () => {
  const input = newDomain.value.trim();
  if (!input) return;

  const domains = input.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  let added = 0;
  for (const domain of domains) {
    if (!settings.excludedDomains.includes(domain)) {
      settings.excludedDomains.push(domain);
      added++;
    }
  }

  if (added === 0) {
    showStatus("Domain(s) already excluded");
    return;
  }

  newDomain.value = "";
  saveSettings();
  renderExcludedDomains();
});

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quick-search-popup-settings.json";
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!imported.searchEngines || !imported.appearance) {
        showStatus("Invalid settings file");
        return;
      }
      settings = imported;
      await saveSettings();
      render();
      showStatus("Settings imported");
    } catch {
      showStatus("Failed to parse settings file");
    }
  };
  reader.readAsText(file);
  importFile.value = "";
});

resetBtn.addEventListener("click", async () => {
  if (!confirm("Reset all settings to default?")) return;
  settings = structuredClone(DEFAULT_SETTINGS);
  await saveSettings();
  render();
  showStatus("Settings reset to default");
});

// Init
loadSettings();
