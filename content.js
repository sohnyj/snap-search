(() => {
  let popup = null;
  let settings = null;

  // Load settings
  async function loadSettings() {
    try {
      const response = await browser.runtime.sendMessage({ type: "get-settings" });
      settings = response.settings;
    } catch {
      settings = DEFAULT_SETTINGS;
    }
  }

  function isDomainExcluded() {
    if (!settings || !settings.excludedDomains) return false;
    const host = location.hostname;
    return settings.excludedDomains.some(
      (d) => host === d || host.endsWith(`.${d}`)
    );
  }

  function getThemeClass() {
    if (!settings) return "qsp-light";
    const theme = settings.appearance.theme;
    if (theme === "light") return "qsp-light";
    if (theme === "dark") return "qsp-dark";
    // auto: follow system/browser preference
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "qsp-dark"
      : "qsp-light";
  }

  function removePopup() {
    if (popup) {
      popup.remove();
      popup = null;
    }
  }

  function isUrl(text) {
    try {
      const trimmed = text.trim();
      if (/^https?:\/\//i.test(trimmed)) {
        new URL(trimmed);
        return true;
      }
      if (/^[\w-]+(\.[\w-]+)+\/?/.test(trimmed)) {
        new URL(`https://${trimmed}`);
        return true;
      }
    } catch {
      // Not a URL
    }
    return false;
  }

  async function getFavicon(engineUrl) {
    if (!engineUrl) return null;
    let domain;
    try {
      domain = new URL(engineUrl.replace("%s", "test")).hostname;
    } catch {
      return null;
    }

    try {
      const response = await browser.runtime.sendMessage({
        type: "fetch-favicon",
        domain
      });
      if (response && response.dataUrl) {
        return response.dataUrl;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  function createBuiltinButton(id, icon, label, selectedText) {
    const btn = document.createElement("button");
    btn.className = "qsp-btn";
    btn.title = label;

    const iconSize = settings.appearance.iconSize || 16;
    const displayMode = settings.appearance.displayMode || "favicon";

    if (displayMode === "label") {
      btn.textContent = label;
      btn.classList.add("qsp-btn-label");
    } else {
      const span = document.createElement("span");
      span.className = "qsp-btn-icon";
      span.textContent = icon;
      btn.appendChild(span);

      if (displayMode === "both") {
        const name = document.createElement("span");
        name.className = "qsp-btn-name";
        name.textContent = label;
        btn.appendChild(name);
      }
    }

    btn.style.setProperty("--qsp-icon-size", `${iconSize}px`);

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (id === "copy") {
        navigator.clipboard.writeText(selectedText).catch(() => {});
        removePopup();
        return;
      }

      if (id === "openLink") {
        const trimmed = selectedText.trim();
        const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        browser.runtime.sendMessage({ type: "open-tab", url, background: settings.openInBackground });
        removePopup();
      }
    });

    return btn;
  }

  function createEngineButton(engine, selectedText) {
    const btn = document.createElement("button");
    btn.className = "qsp-btn";
    btn.title = engine.name;

    const iconSize = settings.appearance.iconSize || 16;
    const displayMode = settings.appearance.displayMode || "favicon";

    if (displayMode === "label") {
      btn.textContent = engine.name;
      btn.classList.add("qsp-btn-label");
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "qsp-btn-text";
      placeholder.textContent = engine.name.charAt(0).toUpperCase();
      btn.appendChild(placeholder);

      if (displayMode === "both") {
        const label = document.createElement("span");
        label.className = "qsp-btn-name";
        label.textContent = engine.name;
        btn.appendChild(label);
      }

      getFavicon(engine.url).then((dataUrl) => {
        if (dataUrl && btn.isConnected) {
          const holder = document.createElement("span");
          holder.className = "qsp-favicon-holder";
          const img = document.createElement("img");
          img.src = dataUrl;
          img.className = "qsp-favicon";
          img.alt = engine.name;
          holder.appendChild(img);
          placeholder.replaceWith(holder);
        }
      });
    }

    btn.style.setProperty("--qsp-icon-size", `${iconSize}px`);

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = engine.url.replace(/%s/g, encodeURIComponent(selectedText));
      browser.runtime.sendMessage({ type: "open-tab", url, background: settings.openInBackground });
      removePopup();
    });

    return btn;
  }

  function showPopup(selectedText, x, y) {
    removePopup();

    popup = document.createElement("div");
    popup.id = "qsp-popup";
    popup.className = getThemeClass();

    const actions = settings.builtinActions || {};

    // Builtin: Copy
    if (actions.copy && actions.copy.enabled) {
      popup.appendChild(createBuiltinButton("copy", "📋", "Copy", selectedText));
    }

    // Builtin: Open Link (only if selected text is a URL)
    if (actions.openLink && actions.openLink.enabled && isUrl(selectedText)) {
      popup.appendChild(createBuiltinButton("openLink", "🔗", "Open Link", selectedText));
    }

    // Divider between builtins and search engines
    const enabledEngines = settings.searchEngines.filter((e) => e.enabled);
    const hasBuiltin = (actions.copy && actions.copy.enabled) ||
      (actions.openLink && actions.openLink.enabled && isUrl(selectedText));
    if (hasBuiltin && enabledEngines.length > 0) {
      const divider = document.createElement("span");
      divider.className = "qsp-divider";
      popup.appendChild(divider);
    }

    // Search engines
    enabledEngines.forEach((engine) => {
      popup.appendChild(createEngineButton(engine, selectedText));
    });

    document.body.appendChild(popup);

    // Position: ensure popup stays within viewport
    const rect = popup.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let left = x + scrollX;
    let top = y + scrollY - rect.height - 8;

    // If popup would go above viewport, show below cursor
    if (top - scrollY < 0) {
      top = y + scrollY + 8;
    }

    // If popup would go off right edge
    if (left + rect.width > viewportW + scrollX) {
      left = viewportW + scrollX - rect.width - 8;
    }

    // If popup would go off left edge
    if (left < scrollX) {
      left = scrollX + 8;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  // Listen for text selection
  document.addEventListener("mouseup", async (e) => {
    // Ignore clicks on our popup
    if (e.target.closest && e.target.closest("#qsp-popup")) return;

    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : "";

    if (!selectedText) {
      removePopup();
      return;
    }

    await loadSettings();
    if (isDomainExcluded()) return;

    showPopup(selectedText, e.clientX, e.clientY);
  });

  // Remove popup on click outside or scroll
  document.addEventListener("mousedown", (e) => {
    if (popup && !popup.contains(e.target)) {
      removePopup();
      window.getSelection().removeAllRanges();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });

  window.addEventListener("scroll", removePopup, { passive: true });
})();
