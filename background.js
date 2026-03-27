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
      return getCachedFavicon(message.domain).then((dataUrl) => ({ dataUrl }));

    case "get-settings":
      return getSettings().then((settings) => ({ settings }));
  }
});

// Get favicon from persistent cache or fetch and cache it
async function getCachedFavicon(domain) {
  const cacheKey = `favicon_${domain}`;
  const cached = await browser.storage.local.get(cacheKey);
  if (cached[cacheKey]) return cached[cacheKey];

  const dataUrl = await fetchFavicon(domain);
  if (dataUrl) {
    await browser.storage.local.set({ [cacheKey]: dataUrl });
  }
  return dataUrl;
}

// Fetch favicon with high resolution, respects Firefox proxy settings
async function fetchFavicon(domain) {
  const urls = [
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/apple-touch-icon-precomposed.png`,
    `https://${domain}/favicon-32x32.png`,
    `https://${domain}/favicon.ico`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/") && !contentType.includes("icon")) continue;

      const blob = await response.blob();
      if (blob.size < 100) continue;

      return await blobToDataUrl(blob);
    } catch {
      // Try next URL
    }
  }

  // Fallback: try parsing HTML for high-res icon link
  try {
    const html = await fetch(`https://${domain}/`, { redirect: "follow" }).then((r) => r.text());
    const iconUrl = extractIconUrl(html, domain);
    if (iconUrl) {
      const response = await fetch(iconUrl, { redirect: "follow" });
      if (response.ok) {
        const blob = await response.blob();
        return await blobToDataUrl(blob);
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

function extractIconUrl(html, domain) {
  const patterns = [
    /< *link[^>]*rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/gi,
    /< *link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:apple-touch-icon|icon|shortcut icon)["']/gi
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

  if (bestUrl.startsWith("//")) return `https:${bestUrl}`;
  if (bestUrl.startsWith("/")) return `https://${domain}${bestUrl}`;
  if (bestUrl.startsWith("http")) return bestUrl;
  return `https://${domain}/${bestUrl}`;
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
