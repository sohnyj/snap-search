let settings = null;

function isDangerousUrl(url) {
  const s = url.trim().toLowerCase();
  return /^(javascript|data):/i.test(s);
}

function parseDomainList(input) {
  return input.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

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
const builtinCurrency = document.getElementById("builtin-currency");
const targetCurrency = document.getElementById("target-currency");
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
  builtinCurrency.checked = actions.currency ? actions.currency.enabled : true;
  targetCurrency.value = actions.currency?.targetCurrency || "KRW";
}

function renderEngines() {
  const fragment = document.createDocumentFragment();

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

      const domains = document.createElement("span");
      domains.className = "engine-domains";
      const included = item.includedDomains || [];
      domains.textContent = included.length > 0 ? included.join(", ") : "";

      const actions = document.createElement("span");
      actions.className = "engine-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        if (row.dataset.editing === "true") return;
        row.dataset.editing = "true";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "engine-domains edit-input";
        input.value = (item.includedDomains || []).join(", ");
        input.placeholder = "Domains (empty = all)";
        domains.replaceWith(input);

        editBtn.textContent = "Save";

        function save() {
          if (row.dataset.editing !== "true") return;
          row.dataset.editing = "";
          item.includedDomains = parseDomainList(input.value);
          saveSettings();
          renderEngines();
        }

        editBtn.onclick = save;
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") renderEngines();
        });
        input.focus();
      });

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

      row.appendChild(dragHandle);
      row.appendChild(toggle);
      row.appendChild(label);
      row.appendChild(domains);
      row.appendChild(actions);
      fragment.appendChild(row);
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

    const domains = document.createElement("span");
    domains.className = "engine-domains";
    const included = item.includedDomains || [];
    domains.textContent = included.length > 0 ? included.join(", ") : "";

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
    row.appendChild(domains);
    row.appendChild(actions);
    fragment.appendChild(row);
  });

  engineList.replaceChildren(fragment);
}

function editEngine(index) {
  const engine = settings.searchEngines[index];
  const row = engineList.children[index];
  if (!row || row.dataset.editing === "true") return;
  row.dataset.editing = "true";

  const nameSpan = row.querySelector(".engine-name");
  const urlSpan = row.querySelector(".engine-url");
  const domainsSpan = row.querySelector(".engine-domains");

  function makeInput(span, value, placeholder) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = span.className + " edit-input";
    input.value = value;
    input.placeholder = placeholder;
    span.replaceWith(input);
    return input;
  }

  const nameInput = makeInput(nameSpan, engine.name, "Name");
  const urlInput = makeInput(urlSpan, engine.url, "URL with %s");
  const domainsInput = makeInput(domainsSpan, (engine.includedDomains || []).join(", "), "Domains (empty = all)");

  const editBtn = row.querySelector(".btn-small:not(.btn-danger)");
  editBtn.textContent = "Save";

  function save() {
    if (row.dataset.editing !== "true") return;
    row.dataset.editing = "";

    const newName = nameInput.value.trim() || engine.name;
    const newUrl = urlInput.value.trim() || engine.url;
    if (isDangerousUrl(newUrl)) {
      showStatus("javascript: and data: URLs are not allowed");
      renderEngines();
      return;
    }
    engine.name = newName;
    engine.url = newUrl;
    engine.includedDomains = parseDomainList(domainsInput.value);
    saveSettings();
    renderEngines();
  }

  editBtn.onclick = save;
  [nameInput, urlInput, domainsInput].forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
      if (e.key === "Escape") renderEngines();
    });
  });

  nameInput.focus();
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
  if (isDangerousUrl(url)) {
    showStatus("javascript: and data: URLs are not allowed");
    return;
  }

  settings.searchEngines.push({
    id: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    name,
    url,
    type: "custom",
    enabled: true,
    includedDomains: []
  });

  newEngineName.value = "";
  newEngineUrl.value = "";
  saveSettings();
  renderEngines();
});

addDividerBtn.addEventListener("click", () => {
  settings.searchEngines.push({
    id: `divider-${Date.now()}`,
    type: "divider",
    enabled: true,
    includedDomains: []
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

builtinCurrency.addEventListener("change", () => {
  if (!settings.builtinActions) settings.builtinActions = {};
  if (!settings.builtinActions.currency) settings.builtinActions.currency = { targetCurrency: "KRW" };
  settings.builtinActions.currency.enabled = builtinCurrency.checked;
  saveSettings();
});

targetCurrency.addEventListener("change", () => {
  if (!settings.builtinActions) settings.builtinActions = {};
  if (!settings.builtinActions.currency) settings.builtinActions.currency = { enabled: true };
  settings.builtinActions.currency.targetCurrency = targetCurrency.value;
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

  const domains = parseDomainList(input);
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
  a.download = "snap-search-settings.json";
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
      imported.searchEngines.forEach((e) => {
        if (e.url && isDangerousUrl(e.url)) e.url = "";
      });
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
