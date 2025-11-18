const sendBG = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
async function getActiveTabId(){ const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); return tab?.id; }

const MODEL_PRESETS = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o mini (fast, cheap)" },
    { value: "gpt-4.1", label: "GPT-4.1 (legacy)" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5-turbo (legacy)" },
    { value: "gpt-5", label: "ChatGPT 5 (if available)" },
    { value: "__custom__", label: "Custom model id…" }
  ],
  openrouter: [
    { value: "openai/gpt-4o-mini", label: "OpenAI GPT-4o mini" },
    { value: "openai/gpt-4o", label: "OpenAI GPT-4o" },
    { value: "google/gemini-2.0-flash-001", label: "Google Gemini 2.0 Flash" },
    { value: "google/gemini-1.5-pro-latest", label: "Google Gemini 1.5 Pro" },
    { value: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B Instruct" },
    { value: "__custom__", label: "Custom model id…" }
  ],
  gemini: [
    { value: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash" },
    { value: "__custom__", label: "Custom model id…" }
  ],
  mistral: [
    { value: "mistral-small-latest", label: "Mistral Small (latest)" },
    { value: "mistral-medium-latest", label: "Mistral Medium (latest)" },
    { value: "mistral-large-latest", label: "Mistral Large (latest)" },
    { value: "__custom__", label: "Custom model id…" }
  ]
};

document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("input");
  const output = document.getElementById("output");
  const useSelectionBtn = document.getElementById("useSelection");
  const translateBtn = document.getElementById("translateBtn");
  const copyBtn = document.getElementById("copyBtn");
  const replaceBtn = document.getElementById("replaceInPage");
  const sourceLang = document.getElementById("sourceLang");
  const targetLang = document.getElementById("targetLang");
  const providerEl = document.getElementById("provider");
  const modelEl = document.getElementById("model");
  const tempEl = document.getElementById("temperature");
  const showToastBtn = document.getElementById("showToast");

  document.getElementById("optionsLink").addEventListener("click", e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const settingsRes = await sendBG({ type: "GET_SETTINGS" });
  if (settingsRes?.ok) {
    const s = settingsRes.settings;
    targetLang.value = s.targetLang || "en";
    sourceLang.value = s.sourceLang || "auto";
  }

  function renderModelOptions(provider, selected) {
    modelEl.innerHTML = "";
    if (!provider) { // no override
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "(Use default)";
      modelEl.appendChild(opt); modelEl.value = "";
      return;
    }
    const presets = MODEL_PRESETS[provider] || [];
    const base = document.createElement("option");
    base.value = ""; base.textContent = "(Use default)";
    modelEl.appendChild(base);
    for (const m of presets) {
      const opt = document.createElement("option");
      opt.value = m.value; opt.textContent = m.label;
      modelEl.appendChild(opt);
    }
    modelEl.value = selected || "";
  }

  renderModelOptions("", "");
  providerEl.addEventListener("change", () => renderModelOptions(providerEl.value, ""));

  modelEl.addEventListener("change", () => {
    if (modelEl.value === "__custom__") {
      const v = prompt("Enter the exact model id:");
      if (v) {
        const opt = document.createElement("option");
        opt.value = v; opt.textContent = v;
        modelEl.appendChild(opt);
        modelEl.value = v;
      } else {
        modelEl.value = "";
      }
    }
  });

  useSelectionBtn.onclick = async () => {
    const tabId = await getActiveTabId();
    if (!tabId) return;
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() || ""
    });
    input.value = result || "";
  };

  translateBtn.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;

    output.value = "Translating…";
    const payload = {
      text,
      targetLang: targetLang.value,
      sourceLang: sourceLang.value
    };
    if (providerEl.value) payload.provider = providerEl.value;
    if (modelEl.value) payload.model = modelEl.value;
    const t = tempEl.value.trim();
    if (t !== "" && !Number.isNaN(Number(t))) payload.temperature = Number(t);

    const res = await sendBG({ type: "TRANSLATE_FROM_POPUP", payload });
    output.value = res?.ok ? res.translated : ("Error: " + (res?.error || "Unknown error"));
  };

  copyBtn.onclick = async () => {
    if (!output.value) return;
    const tabId = await getActiveTabId();
    if (!tabId) return;
    await chrome.tabs.sendMessage(tabId, { type: "COPY_TO_CLIPBOARD", payload: { text: output.value } });
    copyBtn.textContent = "Copied!"; setTimeout(() => (copyBtn.textContent = "Copy"), 900);
  };

  replaceBtn.onclick = async () => {
    const tabId = await getActiveTabId();
    if (!tabId || !output.value) return;
    await chrome.tabs.sendMessage(tabId, { type: "REPLACE_SELECTION", payload: { translated: output.value } });
    replaceBtn.textContent = "Replaced!"; setTimeout(() => (replaceBtn.textContent = "Replace Selection in Page"), 900);
  };

  showToastBtn.onclick = async () => {
    await chrome.runtime.sendMessage({ type: "SHOW_TOAST", payload: { text: "Hello, world!" } });
    showToastBtn.textContent = "Toast shown!"; setTimeout(() => (showToastBtn.textContent = "Show Toast"), 900);
  };
});
const safeOn = (el, type, fn) => { if (el) el.addEventListener(type, fn); };

safeOn(useSelectionBtn, "click", async () => { /* existing code */ });
safeOn(translateBtn,   "click", async () => { /* existing code */ });
safeOn(copyBtn,        "click", async () => { /* existing code */ });
safeOn(replaceBtn,     "click", async () => { /* existing code */ });