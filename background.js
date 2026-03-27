// Open options page when extension button is clicked
browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

// Handle messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "open-tab":
      browser.tabs.create({ url: message.url, active: !message.background });
      break;

    case "fetch-favicon":
      return getCachedFavicon(message.domain).then((dataUrl) => ({ dataUrl })).catch(() => ({ dataUrl: null }));

    case "get-settings":
      return getSettings().then((settings) => ({ settings }));
  }
});

const FAVICON_MAX_BYTES = 200 * 1024; // 200KB per favicon
const FAVICON_CACHE_LIMIT = 50;       // max cached favicons

// Get favicon from persistent cache or fetch and cache it
async function getCachedFavicon(domain) {
  const cacheKey = `favicon_${domain}`;
  const cached = await browser.storage.local.get(cacheKey);
  if (cached[cacheKey]) return cached[cacheKey];

  const dataUrl = await fetchFavicon(domain);
  if (dataUrl) {
    await evictFaviconCacheIfNeeded();
    const result = await browser.storage.local.get("favicon_keys");
    const keys = result.favicon_keys || [];
    if (!keys.includes(cacheKey)) keys.push(cacheKey);
    await browser.storage.local.set({ [cacheKey]: dataUrl, favicon_keys: keys });
  }
  return dataUrl;
}

async function evictFaviconCacheIfNeeded() {
  const result = await browser.storage.local.get("favicon_keys");
  const keys = result.favicon_keys || [];
  if (keys.length >= FAVICON_CACHE_LIMIT) {
    const oldest = keys.shift();
    await browser.storage.local.remove(oldest);
    await browser.storage.local.set({ favicon_keys: keys });
  }
}

// Fetch favicon with high resolution, respects Firefox proxy settings
async function fetchFavicon(domain) {
  // Try parsing HTML: PWA manifest first, then standard icon links
  try {
    const html = await fetch(`https://${domain}/`, { redirect: "follow" }).then((r) => r.text());

    // 1. PWA manifest
    const pwaUrl = await extractPwaIconUrl(html, domain);
    if (pwaUrl) {
      const response = await fetch(pwaUrl, { redirect: "follow" });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size >= 100 && blob.size <= FAVICON_MAX_BYTES) return await blobToDataUrl(blob);
      }
    }

    // 2. Standard icon link tags (no apple-touch-icon)
    const iconUrl = extractIconUrl(html, domain);
    if (iconUrl) {
      const response = await fetch(iconUrl, { redirect: "follow" });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size >= 100 && blob.size <= FAVICON_MAX_BYTES) return await blobToDataUrl(blob);
      }
    }
  } catch {
    // Ignore
  }

  // 3. Fallback: favicon.ico
  try {
    const response = await fetch(`https://${domain}/favicon.ico`, { redirect: "follow" });
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.startsWith("image/") || contentType.includes("icon")) {
        const blob = await response.blob();
        if (blob.size >= 100 && blob.size <= FAVICON_MAX_BYTES) return await blobToDataUrl(blob);
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

// Resolve a URL relative to a domain root
function resolveUrl(href, domain) {
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://${domain}${href}`;
  if (href.startsWith("http")) return href;
  return `https://${domain}/${href}`;
}

// Extract the best icon URL from a PWA manifest
async function extractPwaIconUrl(html, domain) {
  const manifestMatch = html.match(/< *link[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/< *link[^>]*href=["']([^"']+)["'][^>]*rel=["']manifest["']/i);
  if (!manifestMatch) return null;

  const manifestUrl = resolveUrl(manifestMatch[1], domain);
  try {
    const res = await fetch(manifestUrl, { redirect: "follow" });
    if (!res.ok) return null;
    const manifest = await res.json();
    const icons = manifest.icons;
    if (!Array.isArray(icons) || icons.length === 0) return null;

    // Prefer purpose "any" or unset, pick largest size
    const candidates = icons.filter((ic) => !ic.purpose || ic.purpose.split(" ").includes("any"));
    const pool = candidates.length > 0 ? candidates : icons;

    let bestUrl = null;
    let bestSize = 0;
    for (const ic of pool) {
      if (!ic.src) continue;
      const sizeStr = (ic.sizes || "").split(" ")[0];
      const size = parseInt(sizeStr) || 0;
      if (size > bestSize) {
        bestSize = size;
        bestUrl = resolveUrl(ic.src, domain);
      }
    }
    return bestUrl;
  } catch {
    return null;
  }
}

function extractIconUrl(html, domain) {
  const patterns = [
    /< *link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/gi,
    /< *link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/gi
  ];

  let bestUrl = null;
  let bestSize = 0;

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const href = match[1];
      const sizeMatch = match[0].match(/sizes=["'](\d+)x\d+["']/);
      const size = sizeMatch ? parseInt(sizeMatch[1]) : 16;

      if (size > bestSize) {
        bestSize = size;
        bestUrl = href;
      }
    }
  }

  if (!bestUrl) return null;
  return resolveUrl(bestUrl, domain);
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function getSettings() {
  const result = await browser.storage.local.get("settings");
  return result.settings || DEFAULT_SETTINGS;
}
