(() => {
  let popup = null;
  let settings = null;

  function matchesDomain(host, domainList) {
    return domainList.some((d) => host === d || host.endsWith(`.${d}`));
  }

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
    return matchesDomain(location.hostname.toLowerCase(), settings.excludedDomains);
  }

  function getThemeClass() {
    if (!settings) return "snaps-light";
    const theme = settings.appearance.theme;
    if (theme === "light") return "snaps-light";
    if (theme === "dark") return "snaps-dark";
    // auto: follow system/browser preference
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "snaps-dark"
      : "snaps-light";
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
    btn.className = "snaps-btn";
    btn.title = label;

    const iconSize = settings.appearance.iconSize || 16;
    const displayMode = settings.appearance.displayMode || "favicon";

    if (displayMode === "label") {
      btn.textContent = label;
      btn.classList.add("snaps-btn-label");
    } else {
      const span = document.createElement("span");
      span.className = "snaps-btn-icon";
      span.textContent = icon;
      btn.appendChild(span);

      if (displayMode === "both") {
        const name = document.createElement("span");
        name.className = "snaps-btn-name";
        name.textContent = label;
        btn.appendChild(name);
      }
    }

    btn.style.setProperty("--snaps-icon-size", `${iconSize}px`);

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
    btn.className = "snaps-btn";
    btn.title = engine.name;

    const iconSize = settings.appearance.iconSize || 16;
    const displayMode = settings.appearance.displayMode || "favicon";
    let faviconReady = Promise.resolve();

    if (displayMode === "label") {
      btn.textContent = engine.name;
      btn.classList.add("snaps-btn-label");
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "snaps-btn-text";
      placeholder.textContent = engine.name.charAt(0).toUpperCase();
      btn.appendChild(placeholder);

      if (displayMode === "both") {
        const label = document.createElement("span");
        label.className = "snaps-btn-name";
        label.textContent = engine.name;
        btn.appendChild(label);
      }

      faviconReady = getFavicon(engine.url).then((dataUrl) => {
        if (!dataUrl || !btn.isConnected) return;
        return new Promise((resolve) => {
          const img = document.createElement("img");
          img.className = "snaps-favicon";
          img.alt = engine.name;
          img.onload = () => {
            if (btn.isConnected) {
              const holder = document.createElement("span");
              holder.className = "snaps-favicon-holder";
              holder.appendChild(img);
              placeholder.replaceWith(holder);
            }
            resolve();
          };
          img.onerror = resolve;
          img.src = dataUrl;
        });
      });
    }

    btn.style.setProperty("--snaps-icon-size", `${iconSize}px`);

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

    return { btn, faviconReady };
  }

  function showPopup(selectedText, selRect) {
    removePopup();

    popup = document.createElement("div");
    popup.id = "snaps-popup";
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
    const currentHost = location.hostname.toLowerCase();
    function isDomainIncluded(item) {
      const included = item.includedDomains;
      if (!included || included.length === 0) return true;
      return matchesDomain(currentHost, included);
    }

    const visibleEngines = settings.searchEngines.filter((e) => {
      if (e.type === "divider") return e.enabled !== false && isDomainIncluded(e);
      return e.enabled && isDomainIncluded(e);
    });
    const hasBuiltin = (actions.copy && actions.copy.enabled) ||
      (actions.openLink && actions.openLink.enabled && isUrl(selectedText));
    if (hasBuiltin && visibleEngines.length > 0) {
      const divider = document.createElement("span");
      divider.className = "snaps-divider";
      popup.appendChild(divider);
    }

    // Search engines (with dividers)
    visibleEngines.forEach((item) => {
      if (item.type === "divider") {
        const divider = document.createElement("span");
        divider.className = "snaps-divider";
        popup.appendChild(divider);
      } else {
        const { btn } = createEngineButton(item, selectedText);
        popup.appendChild(btn);
      }
    });

    document.body.appendChild(popup);
    positionPopup(popup, selRect);
    popup.style.animation = "snaps-fade-in 0.12s ease-out";
  }

  function positionPopup(popup, selRect) {
    const popupRect = popup.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const viewportW = window.innerWidth;

    // Center horizontally over selection, place above it
    let left = selRect.left + scrollX + (selRect.width - popupRect.width) / 2;
    let top = selRect.top + scrollY - popupRect.height - 8;

    // If popup would go above viewport, show below selection
    if (top - scrollY < 0) {
      top = selRect.bottom + scrollY + 8;
    }

    // Clamp to viewport edges
    if (left + popupRect.width > viewportW + scrollX) {
      left = viewportW + scrollX - popupRect.width - 8;
    }
    if (left < scrollX) {
      left = scrollX + 8;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  // Listen for text selection
  document.addEventListener("mouseup", async (e) => {
    // Ignore clicks on our popup
    if (e.target.closest && e.target.closest("#snaps-popup")) return;

    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : "";

    if (!selectedText) {
      removePopup();
      return;
    }

    await loadSettings();
    if (isDomainExcluded()) return;

    const range = selection.getRangeAt(0);
    const selRect = range.getBoundingClientRect();
    showPopup(selectedText, selRect);
  });

  // Remove popup on click outside or scroll
  document.addEventListener("mousedown", (e) => {
    if (popup && !popup.contains(e.target)) {
      removePopup();
      window.getSelection().removeAllRanges();
    }
  });

  document.addEventListener("keydown", removePopup);

  window.addEventListener("scroll", removePopup, { passive: true });
})();
