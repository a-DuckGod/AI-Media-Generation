// ===== Settings (now supports per-provider slots) =====
const DEFAULT_SETTINGS = {
  // current/default choice
  provider: "openai", // "openai" | "openrouter" | "gemini" | "mistral"

  // legacy single-slot (kept for backward compat; kept in sync with current provider)
  apiKey: "",
  model: "gpt-4o-mini",

  // per-provider saved slots
  keys: {
    openai: "",
    gemini: "",
    mistral: "",
    openrouter: ""
  },
  models: {
    openai: "gpt-4o-mini",
    gemini: "gemini-1.5-pro-latest",
    mistral: "mistral-small-latest",
    openrouter: "openai/gpt-4o-mini"
  },

  // common behavior
  temperature: 0.2,
  targetLang: "en",
  sourceLang: "auto",
  brandSafe: true,
  tone: "neutral",
  glossary: "",
  replaceOnContextMenu: false
};

async function getSettings() {
  const { userSettings } = await chrome.storage.sync.get("userSettings");
  // merge + defaults for new fields
  const s = { ...DEFAULT_SETTINGS, ...(userSettings || {}) };
  s.keys = { ...DEFAULT_SETTINGS.keys, ...(s.keys || {}) };
  s.models = { ...DEFAULT_SETTINGS.models, ...(s.models || {}) };
  return s;
}
function setSettings(s) {
  return chrome.storage.sync.set({ userSettings: s });
}

// ===== Context menus =====
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai_translate_show",
    title: "Translate with AI",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "separator1",
    type: "separator",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ai_translate_replace",
    title: "Translate and Replace Selection",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const selectionText = info.selectionText?.trim();
  if (!selectionText) return;

  const settings = await getSettings();
  try {
    const translated = await translateText(selectionText, settings);

    if (info.menuItemId === "ai_translate_replace") {
      await safeSendToContent(tab.id, {
        type: "REPLACE_SELECTION",
        payload: { translated }
      });
    } else {
      await safeSendToContent(tab.id, {
        type: "SHOW_TOAST",
        payload: { original: selectionText, translated }
      });
      await safeSendToContent(tab.id, {
        type: "COPY_TO_CLIPBOARD",
        payload: { text: translated }
      });
    }
  } catch (e) {
    await safeSendToContent(tab.id, {
      type: "SHOW_TOAST",
      payload: { error: String(e?.message || e) }
    });
  }
});

// Popup/Options <-> BG
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "TRANSLATE_FROM_POPUP") {
      const base = await getSettings();
      // build merged view (overrides allowed)
      const provider = msg.payload.provider || base.provider;
      const merged = {
        ...base,
        provider,
        // use per-provider model/key unless popup override is set
        model: msg.payload.model || base.models[provider] || base.model,
        apiKey: msg.payload.apiKey || base.keys[provider] || base.apiKey,
        temperature: typeof msg.payload.temperature === "number" ? msg.payload.temperature : base.temperature,
        targetLang: msg.payload.targetLang || base.targetLang,
        sourceLang: msg.payload.sourceLang || base.sourceLang
      };
      try {
        const out = await translateText(msg.payload.text, merged);
        sendResponse({ ok: true, translated: out });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    } else if (msg?.type === "GET_SETTINGS") {
      sendResponse({ ok: true, settings: await getSettings() });
    } else if (msg?.type === "SAVE_SETTINGS") {
      // Accept full state from Options and persist
      const incoming = msg.payload || {};
      const s = { ...(await getSettings()), ...incoming };
      // ensure nested maps exist
      s.keys = { ...DEFAULT_SETTINGS.keys, ...(s.keys || {}) };
      s.models = { ...DEFAULT_SETTINGS.models, ...(s.models || {}) };
      // keep legacy mirrors in sync with current provider
      if (s.provider) {
        s.apiKey = s.keys[s.provider] || s.apiKey || "";
        s.model = s.models[s.provider] || s.model || "";
      }
      await setSettings(s);
      sendResponse({ ok: true });
    }
  })();
  return true;
});

// ===== Helpers =====
async function safeSendToContent(tabId, msg) {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tabId, msg);
      return true;
    } catch {
      return false;
    }
  }
}

// ===== Translation core (adds Mistral) =====
async function translateText(input, settings) {
  const provider = settings.provider;
  const apiKey = (settings.keys?.[provider]) || settings.apiKey;
  const model = (settings.models?.[provider]) || settings.model;
  const temperature = settings.temperature;

  if (!apiKey) throw new Error(`Missing ${provider} API key. Set it in Options.`);

  const system = buildSystemPrompt(settings);
  const user = buildUserPrompt(input);

  let raw = "";
  if (provider === "openai") {
    raw = await callOpenAI(system, user, { apiKey, model, temperature });
  } else if (provider === "openrouter") {
    raw = await callOpenRouter(system, user, { apiKey, model, temperature });
  } else if (provider === "gemini") {
    raw = await callGemini(system, user, { apiKey, model, temperature });
  } else if (provider === "mistral") {
    raw = await callMistral(system, user, { apiKey, model, temperature });
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return normalizeTranslation(raw);
}

function buildSystemPrompt({ brandSafe, tone, glossary, targetLang, sourceLang }) {
  return [
    "You are a world-class translator specialized in preserving brand names, product names, companies and proper nouns.",
    "- Never translate brand/company/product names or proper nouns.",
    "- Maintain original numbers, punctuation and emoji.",
    `- Target language: ${targetLang}. Source: ${sourceLang === "auto" ? "auto-detect" : sourceLang}.`,
    `- Tone: ${tone}.`,
    glossary?.trim() ? `- KEEP AS-IS: ${glossary}` : "",
    brandSafe ? "- Do not add/remove trademark symbols; keep ™/® as-is." : ""
  ].filter(Boolean).join("\n");
}
function buildUserPrompt(text) {
  return "Translate the following. Output ONLY the translation, no quotes, no extra text:\n\n" + text;
}
function normalizeTranslation(s) {
  if (!s) return "";
  let out = String(s).trim();
  if (out.startsWith("```")) out = out.replace(/^```[a-z0-9-]*\s*/i, "").replace(/```$/i, "").trim();
  out = out.replace(/^(translation|translated text|turkish|english|german|french|spanish)\s*:\s*/i, "").trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'")) ||
      (out.startsWith("“") && out.endsWith("”")) || (out.startsWith("‘") && out.endsWith("’")) ||
      (out.startsWith("`") && out.endsWith("`"))) out = out.slice(1, -1).trim();
  out = out.replace(/(^|\n)---BEGIN TEXT---(\n|$)/gi, "").replace(/(^|\n)---END TEXT---(\n|$)/gi, "").trim();
  return out;
}

// ---- Providers ----
async function callOpenAI(system, user, { apiKey, model, temperature }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] })
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}
async function callOpenRouter(system, user, { apiKey, model, temperature }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://example.com",
      "X-Title": "Smart AI Translator"
    },
    body: JSON.stringify({ model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] })
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}
async function callGemini(system, user, { apiKey, model, temperature }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature }
    })
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "").trim();
}
async function callMistral(system, user, { apiKey, model, temperature }) {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] })
  });
  if (!res.ok) throw new Error(`Mistral error ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}