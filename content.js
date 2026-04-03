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

  const CURRENCY_MAP = { '$': 'USD', '€': 'EUR', '£': 'GBP', '₩': 'KRW', '元': 'CNY', '円': 'JPY', '¥': 'JPY', '달러': 'USD', '유로': 'EUR', '위안': 'CNY', '엔': 'JPY' };
  const CURRENCY_PATTERNS = (() => {
    const codes = 'USD|EUR|GBP|JPY|KRW|CNY|RMB|CAD|AUD|CHF|HKD|SGD|THB|INR|BRL|MXN|SEK|NOK|DKK|PLN|CZK|HUF|IDR|ILS|ISK|MYR|NZD|PHP|RON|TRY|ZAR';
    const syms = '\\$|€|£|¥|₩|元|円';
    const words = '달러|유로|위안|엔';
    const cur = `${codes}|${syms}|${words}`;
    const amt = '[\\d,]+(?:\\.\\d+)?';
    return [
      new RegExp(`(?<cur>${cur})\\s?(?<amt>${amt})`, 'i'),
      new RegExp(`(?<amt>${amt})\\s?(?<cur>${cur})`, 'i'),
    ];
  })();

  function parseCurrency(text) {
    for (const p of CURRENCY_PATTERNS) {
      const m = text.match(p);
      if (m) {
        const raw = m.groups.cur;
        const code = CURRENCY_MAP[raw] || raw.toUpperCase();
        const amount = parseFloat(m.groups.amt.replace(/,/g, ''));
        if (code && !isNaN(amount) && amount > 0) return { code, amount };
      }
    }
    return null;
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
      btn.style.setProperty("--snaps-icon-size", `${iconSize}px`);
    }

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

      btn.style.setProperty("--snaps-icon-size", `${iconSize}px`);
    }

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

    const iconSize = settings.appearance.iconSize || 16;
    const displayMode = settings.appearance.displayMode || "favicon";
    popup.dataset.mode = displayMode;
    if (displayMode !== "label") {
      popup.style.setProperty("--snaps-icon-size", `${iconSize}px`);
    }

    const actions = settings.builtinActions || {};

    // Builtin: Copy
    if (actions.copy && actions.copy.enabled) {
      popup.appendChild(createBuiltinButton("copy", "📋", "Copy", selectedText));
    }

    // Builtin: Open Link (only if selected text is a URL)
    if (actions.openLink && actions.openLink.enabled && isUrl(selectedText)) {
      popup.appendChild(createBuiltinButton("openLink", "🔗", "Open Link", selectedText));
    }

    // Builtin: Currency
    const parsed = parseCurrency(selectedText);
    const currencyTarget = actions.currency?.targetCurrency || "KRW";
    if (actions.currency?.enabled && parsed && parsed.code !== currencyTarget) {
      const currencyBtn = createBuiltinButton("currency", "💱", "Convert", selectedText);
      currencyBtn.addEventListener("click", () => {
        currencyBtn.disabled = true;
        browser.runtime.sendMessage({
          type: "convert-currency",
          from: parsed.code, to: currencyTarget, amount: parsed.amount
        }).then((resp) => {
          if (resp && resp.result !== null) {
            showConversionResult(currencyBtn, `${Math.round(resp.result).toLocaleString()} ${currencyTarget}`);
          } else {
            showConversionResult(currencyBtn, "Conversion failed");
          }
        }).catch(() => {
          showConversionResult(currencyBtn, "Conversion failed");
        });
      });
      popup.appendChild(currencyBtn);
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
      (actions.openLink && actions.openLink.enabled && isUrl(selectedText)) ||
      (actions.currency?.enabled && parsed && parsed.code !== currencyTarget);
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

  function showConversionResult(btn, text) {
    if (!btn || !btn.isConnected) return;
    let result = btn.nextElementSibling;
    if (!result || !result.classList.contains("snaps-conversion-result")) {
      result = document.createElement("span");
      result.className = "snaps-conversion-result";
      result.style.cursor = "pointer";
      result.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(result.textContent.replace(/\s*[A-Z]{3}$/, '')).catch(() => {});
        removePopup();
      });
      result.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.after(result);
    }
    result.textContent = text;
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
    let selRect = range.getBoundingClientRect();

    // Fallback: some sites (e.g. GitHub code viewer) manage selection via JS,
    // causing getBoundingClientRect() to return a zero-size rect.
    if (!selRect.width && !selRect.height) {
      selRect = { left: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 };
    }

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
