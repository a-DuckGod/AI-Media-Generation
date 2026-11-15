// OPTIONS PAGE LOGIC (pure JS)

// Model presets per provider (incl. Mistral)
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

const $ = (id) => document.getElementById(id);
const sendBG = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

let state = null; // full settings object from background

function renderModelOptions(provider, selected) {
  const el = $("model");
  el.innerHTML = "";
  const base = document.createElement("option");
  base.value = selected || "";
  base.textContent = selected ? `${selected} (saved)` : "(Choose a model)";
  el.appendChild(base);

  for (const m of (MODEL_PRESETS[provider] || [])) {
    const opt = document.createElement("option");
    opt.value = m.value; opt.textContent = m.label;
    el.appendChild(opt);
  }
  if (selected) el.value = selected;
}

function fillForm() {
  const s = state;
  $("provider").value = s.provider;
  $("temperature").value = typeof s.temperature === "number" ? s.temperature : 0.2;
  $("sourceLang").value = s.sourceLang || "auto";
  $("targetLang").value = s.targetLang || "en";
  $("tone").value = s.tone || "neutral";
  $("brandSafe").checked = !!s.brandSafe;
  $("glossary").value = s.glossary || "";
  $("apiKey").value = s.keys?.[s.provider] || "";
  renderModelOptions(s.provider, s.models?.[s.provider] || "");
}

function readCommon() {
  state.temperature = Number($("temperature").value || 0.2);
  state.sourceLang = $("sourceLang").value || "auto";
  state.targetLang = $("targetLang").value || "en";
  state.tone = $("tone").value || "neutral";
  state.brandSafe = $("brandSafe").checked;
  state.glossary = $("glossary").value.trim();
}

function readSlot() {
  const p = state.provider;
  state.keys[p] = $("apiKey").value.trim();
  state.models[p] = $("model").value || state.models[p] || "";
  // mirror for legacy fields
  state.apiKey = state.keys[p];
  state.model = state.models[p];
}

document.addEventListener("DOMContentLoaded", async () => {
  const r = await sendBG({ type: "GET_SETTINGS" });
  state = r?.settings || {};
  state.keys = { openai:"", gemini:"", mistral:"", openrouter:"", ...(state.keys||{}) };
  state.models = {
    openai:"gpt-4o-mini",
    gemini:"gemini-1.5-pro-latest",
    mistral:"mistral-small-latest",
    openrouter:"openai/gpt-4o-mini",
    ...(state.models||{})
  };
  state.provider = state.provider || "openai";
  fillForm();

  $("provider").addEventListener("change", () => {
    readSlot();                 // save current slot before switching
    state.provider = $("provider").value;
    $("apiKey").value = state.keys[state.provider] || "";
    renderModelOptions(state.provider, state.models[state.provider] || "");
  });

  $("model").addEventListener("change", () => {
    if ($("model").value === "__custom__") {
      const v = prompt("Enter the exact model id:");
      if (v) {
        const opt = document.createElement("option");
        opt.value = v; opt.textContent = v;
        $("model").appendChild(opt);
        $("model").value = v;
      } else {
        $("model").value = state.models[state.provider] || "";
      }
    }
  });

  $("save").addEventListener("click", async () => {
    readCommon(); readSlot();
    const res = await sendBG({ type: "SAVE_SETTINGS", payload: state });
    $("status").textContent = res?.ok ? "Saved ✓" : "Failed";
    setTimeout(() => ($("status").textContent = ""), 1200);
  });
});