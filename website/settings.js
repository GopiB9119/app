"use strict";

const settingsStorageKey = "skyline-settings-v1";
const settingsDefaults = {
  email: "gopi@example.com",
  phone: "+91 98765 43210",
  birthDate: "2000-05-15",
  region: "Asia/Kolkata",
  locale: "en-US",
  density: "comfortable",
  opacity: 88,
  reducedMotion: false
};
const settingsRegions = {
  "Asia/Kolkata": "India (IST)",
  "Asia/Singapore": "Singapore (SGT)",
  "Europe/London": "United Kingdom",
  "America/New_York": "United States (Eastern)"
};
const settingsLocales = { "en-US": "English (United States)", "en-IN": "English (India)", "en-GB": "English (United Kingdom)" };
const settingsViews = {
  account: ["Account Settings", "Manage your profile information and account details."],
  notifications: ["Notifications", "Choose when you hear from Skyline."],
  agents: ["Agents", "Your assistant and the information available to it."],
  privacy: ["Privacy & Security", "Manage the information saved on this device."],
  language: ["Language & Region", "Your language, date formats, and regional preferences."],
  appearance: ["Appearance", "Adjust the appearance of your settings workspace."],
  services: ["Connected Services", "Manage your linked accounts and services."],
  devices: ["Devices", "Your current device and connected sessions."]
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsStorageKey));
    if (!saved || typeof saved !== "object") return { ...settingsDefaults };
    return {
      email: typeof saved.email === "string" ? saved.email : settingsDefaults.email,
      phone: typeof saved.phone === "string" ? saved.phone : settingsDefaults.phone,
      birthDate: typeof saved.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(saved.birthDate) && Number.isFinite(Date.parse(`${saved.birthDate}T12:00:00`)) ? saved.birthDate : settingsDefaults.birthDate,
      region: Object.hasOwn(settingsRegions, saved.region) ? saved.region : settingsDefaults.region,
      locale: Object.hasOwn(settingsLocales, saved.locale) ? saved.locale : settingsDefaults.locale,
      density: saved.density === "compact" ? "compact" : "comfortable",
      opacity: Number.isFinite(saved.opacity) ? Math.max(65, Math.min(100, saved.opacity)) : settingsDefaults.opacity,
      reducedMotion: saved.reducedMotion === true
    };
  } catch {
    return { ...settingsDefaults };
  }
}

const settingsState = loadSettings();
const settingsContent = document.querySelector("#settings-content");
const accountTemplate = document.querySelector("#settings-account-content").cloneNode(true);

function saveSettings() {
  try {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settingsState));
    return true;
  } catch {
    toast("Changes are kept for this visit. Browser storage is unavailable.");
    return false;
  }
}

function applySettingsAppearance() {
  document.body.style.setProperty("--settings-opacity", settingsState.opacity / 100);
  document.body.classList.toggle("settings-compact", settingsState.density === "compact");
  document.body.classList.toggle("settings-reduced-motion", settingsState.reducedMotion);
}

function formatSettingsDate(date) {
  return new Intl.DateTimeFormat(settingsState.locale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function settingsSelectOptions(options, selected) {
  return Object.entries(options).map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function populateAccount() {
  const form = document.querySelector("#settings-account-form");
  if (!form) return;
  form.elements.name.value = state.name;
  form.elements.about.value = `${state.tagline}\n${state.bio}`;
  if (![...form.elements.location.options].some(option => option.value === state.location)) {
    form.elements.location.add(new Option(state.location, state.location));
  }
  form.elements.location.value = state.location;
  document.querySelector("#settings-neighbors").textContent = 126 + socialStore.following.length;
  document.querySelectorAll("[data-contact]").forEach(element => {
    const field = element.dataset.contact;
    element.textContent = field === "birthDate" ? formatSettingsDate(settingsState.birthDate) : field === "region" ? settingsRegions[settingsState.region] : settingsState[field];
  });
  updateDashboard();
}

function saveAccount(form) {
  const name = form.elements.name.value.trim();
  if (!name) {
    form.elements.name.setCustomValidity("Please enter your name.");
    form.elements.name.reportValidity();
    return false;
  }
  if (!form.reportValidity()) return false;
  const about = form.elements.about.value.trim();
  const lines = about.split("\n");
  const tagline = lines.length > 1 ? lines.shift().trim() : state.tagline;
  const bio = lines.join("\n").trim();
  const location = form.elements.location.value;
  const changed = name !== state.name || tagline !== state.tagline || bio !== state.bio || location !== state.location;
  if (!changed) return true;
  Object.assign(state, { name, tagline, bio, location });
  const saved = saveState();
  updateDashboard();
  if (saved) toast("Account changes saved.");
  return true;
}

function notificationView() {
  return `<div class="settings-sections"><section class="settings-card"><h2>Notification Preferences</h2><label class="settings-row"><span class="settings-row-copy"><strong>Allow notifications</strong><p>Booking updates, activity, and saved-plan reminders.</p></span><input class="settings-switch" type="checkbox" role="switch" data-setting="notifications" aria-label="Allow notifications" ${state.notifications ? "checked" : ""}></label><div class="settings-row"><span class="settings-row-copy"><strong>Notification center</strong><p>${state.readNotifications.length ? `${state.readNotifications.length} notifications marked as read` : "Your latest updates are ready"}</p></span><button class="screen-secondary-button" data-settings-action="read-notifications">${icon("check")}Mark all read</button></div></section><section class="settings-card"><h2>Upcoming Reminders</h2>${events.map(event => `<div class="settings-row">${icon("calendar")}<div class="settings-row-copy"><strong>${event.title}</strong><p>${event.time} &middot; ${event.location}</p></div></div>`).join("")}</section></div>`;
}

function agentSettingsView() {
  return `<div class="settings-sections"><section class="settings-card"><h2>Your Agent</h2><div class="settings-row">${icon("bot")}<div class="settings-row-copy"><strong>Personal planning assistant</strong><p>Local demo responses. No external AI service is connected.</p></div><span class="settings-badge">Local</span></div><button class="primary-button" data-action="agent">${icon("bot")}Open Agent</button></section><section class="settings-card"><h2>Saved Information</h2>${[{ title: "Tasks", detail: `${state.tasks.filter(task => !task.done).length} pending tasks`, action: "tasks", symbol: "check" }, { title: "Calendar", detail: `${events.length} scheduled events`, action: "calendar", symbol: "calendar" }, { title: "Plans", detail: `${state.plans.length} saved plans`, action: "plans", symbol: "map-pin" }].map(item => `<div class="settings-row">${icon(item.symbol)}<div class="settings-row-copy"><strong>${item.title}</strong><p>${item.detail}</p></div><button class="screen-secondary-button" data-action="${item.action}">View ${item.title.toLowerCase()}</button></div>`).join("")}</section><section class="settings-card"><h2>Conversation History</h2><div class="settings-row"><div class="settings-row-copy"><strong>Agent messages</strong><p>${socialStore.chat.length} messages saved on this device</p></div><button class="screen-secondary-button settings-danger-button" data-settings-action="clear-agent">${icon("x")}Clear history</button></div></section></div>`;
}

function privacySettingsView() {
  return `<div class="settings-sections"><section class="settings-card"><h2>Your Data</h2><div class="settings-row">${icon("shield-check")}<div class="settings-row-copy"><strong>Stored on this device</strong><p>Profile details, messages, and bookings use this browser's local storage.</p></div><span class="settings-badge">Local storage</span></div><div class="settings-row"><div class="settings-row-copy"><strong>Export a copy</strong><p>Download your saved profile, bookings, conversations, and preferences.</p></div><button class="screen-secondary-button" data-settings-action="export-data">${icon("download")}Export data</button></div></section><section class="settings-card"><h2>Saved Conversations</h2><div class="settings-row"><div class="settings-row-copy"><strong>Clear messages</strong><p>Remove Agent and Spaces conversations from this device. Posts, profile details, and bookings are kept.</p></div><button class="screen-secondary-button settings-danger-button" data-settings-action="clear-messages">${icon("x")}Clear messages</button></div></section><section class="settings-card"><h2>Account Security</h2><p class="settings-note">No authenticated account is connected. Passwords, two-step verification, and remote sessions are not available in this local version.</p></section></div>`;
}

function languageSettingsView() {
  return `<div class="settings-sections"><section class="settings-card"><h2>Language</h2><div class="settings-row">${icon("globe")}<div class="settings-row-copy"><strong>Display language</strong><p>English</p></div><span class="settings-badge is-muted">English only</span></div><label class="settings-row"><span class="settings-row-copy"><strong>Regional format</strong><p>Date formatting for your account details.</p></span><select class="settings-input" data-setting="locale" aria-label="Regional format">${settingsSelectOptions(settingsLocales, settingsState.locale)}</select></label><div class="settings-date-preview"><span>Date preview</span><strong>${formatSettingsDate("2026-10-08")}</strong></div></section><section class="settings-card"><h2>Region</h2><label class="settings-row"><span class="settings-row-copy"><strong>Time zone</strong><p>Your account's regional preference.</p></span><select class="settings-input" data-setting="region" aria-label="Time zone">${settingsSelectOptions(settingsRegions, settingsState.region)}</select></label></section></div>`;
}

function appearanceSettingsView() {
  return `<div class="settings-sections"><section class="settings-card"><h2>Settings Appearance</h2><div class="settings-row"><div class="settings-row-copy"><strong>Panel opacity</strong><p>Adjust the glass effect in Settings.</p></div><label class="settings-range"><input type="range" min="65" max="100" step="1" value="${settingsState.opacity}" data-setting="opacity" aria-label="Panel opacity"><output id="opacity-value">${settingsState.opacity}%</output></label></div><div class="settings-row"><div class="settings-row-copy"><strong>Control spacing</strong><p>Choose comfortable or compact settings rows.</p></div><div class="settings-segmented" role="group" aria-label="Control spacing"><button data-settings-action="density" data-value="comfortable" aria-pressed="${settingsState.density === "comfortable"}">Comfortable</button><button data-settings-action="density" data-value="compact" aria-pressed="${settingsState.density === "compact"}">Compact</button></div></div><label class="settings-row"><span class="settings-row-copy"><strong>Reduce motion</strong><p>Turn off animations and transitions in Settings.</p></span><input class="settings-switch" type="checkbox" role="switch" data-setting="reducedMotion" aria-label="Reduce motion" ${settingsState.reducedMotion ? "checked" : ""}></label></section><section class="settings-card"><h2>Default Appearance</h2><p class="settings-note">The other screens keep their existing design.</p><div class="settings-action-row"><button class="screen-secondary-button" data-settings-action="reset-appearance">Reset appearance</button></div></section></div>`;
}

function serviceSettingsView() {
  return `<section class="settings-card"><h2>Connected Accounts</h2>${[{ name: "Google Calendar", description: "Calendar and events", symbol: "calendar" }, { name: "Microsoft 365", description: "Work calendar and contacts", symbol: "mail" }, { name: "Travel services", description: "Airline and hotel reservations", symbol: "plane" }].map(service => `<div class="settings-row">${icon(service.symbol)}<div class="settings-row-copy"><strong>${service.name}</strong><p>${service.description}</p></div><span class="settings-badge is-muted">Not connected</span></div>`).join("")}<p class="settings-note">External service linking needs a configured backend and provider sign-in. No accounts are connected in this local version.</p></section>`;
}

function deviceSettingsView() {
  const browserName = /Edg\//.test(navigator.userAgent) ? "Microsoft Edge" : /Firefox\//.test(navigator.userAgent) ? "Firefox" : /Chrome\//.test(navigator.userAgent) ? "Chrome" : /Safari\//.test(navigator.userAgent) ? "Safari" : "Current browser";
  const platform = navigator.userAgentData?.platform || navigator.platform || "This device";
  return `<div class="settings-sections"><section class="settings-card"><h2>Current Device</h2><div class="settings-row">${icon("laptop")}<div class="settings-row-copy"><strong>${browserName}</strong><p>${escapeHtml(platform)} &middot; This browser</p></div><span class="settings-badge">Active now</span></div><p class="settings-note">Your saved data belongs to this browser on this device.</p></section><section class="settings-card"><h2>Other Devices</h2><p class="settings-note">No connected devices. Remote device management is available only with a signed-in service.</p></section></div>`;
}

function renderSettings(scrollToContent = false) {
  const requested = location.hash.slice(1) || "account";
  const tab = Object.hasOwn(settingsViews, requested) ? requested : "account";
  document.querySelector("#settings-title").textContent = settingsViews[tab][0];
  document.querySelector("#settings-subtitle").textContent = settingsViews[tab][1];
  document.querySelectorAll("[data-settings-tab]").forEach(link => {
    const active = link.dataset.settingsTab === tab;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (tab === "account") {
    settingsContent.replaceChildren(accountTemplate.cloneNode(true));
    populateAccount();
  } else {
    const views = { notifications: notificationView, agents: agentSettingsView, privacy: privacySettingsView, language: languageSettingsView, appearance: appearanceSettingsView, services: serviceSettingsView, devices: deviceSettingsView };
    settingsContent.innerHTML = views[tab]();
  }
  applySettingsAppearance();
  if (scrollToContent && matchMedia("(max-width: 700px)").matches) document.querySelector("#settings-main").scrollIntoView({ block: "start", behavior: "instant" });
}

function showContactEditor(field) {
  const labels = { email: "Email", phone: "Phone", birthDate: "Date of Birth", region: "Region" };
  if (!Object.hasOwn(labels, field)) return;
  const control = field === "region"
    ? `<select class="form-input" name="value">${settingsSelectOptions(settingsRegions, settingsState.region)}</select>`
    : `<input class="form-input" name="value" value="${escapeHtml(settingsState[field])}" type="${{ email: "email", phone: "tel", birthDate: "date" }[field]}" ${field === "birthDate" ? `max="${new Date().toLocaleDateString("en-CA")}"` : `maxlength="${field === "email" ? 150 : 30}"`} required>`;
  openDialog(`Edit ${labels[field].toLowerCase()}`, `<form class="screen-form" id="settings-contact-form" data-field="${field}"><label class="field-label">${labels[field]}${control}</label><button class="primary-button" type="submit">${icon("check")}Save changes</button></form>`, "Account details");
}

function confirmConversationClear(agentOnly) {
  openDialog(agentOnly ? "Clear Agent history?" : "Clear saved conversations?", `<p class="muted-copy">${agentOnly ? "This removes the Agent conversation saved in this browser. Your Spaces messages are kept." : "This removes Agent and Spaces messages saved in this browser. Your profile, community posts, and bookings are kept."}</p><div class="screen-dialog-actions"><button class="screen-secondary-button" data-action="close">Cancel</button><button class="primary-button" data-settings-action="confirm-clear" data-agent-only="${agentOnly}">${icon("x")}Clear conversations</button></div>`, "This device only");
}

function exportSettingsData() {
  const payload = { exportedAt: new Date().toISOString() };
  for (const key of [storageKey, settingsStorageKey, socialStorageKey, "skyline-bookings-v1"]) {
    try { payload[key] = JSON.parse(localStorage.getItem(key)); } catch { payload[key] = null; }
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "skyline-data.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener("click", event => {
  const trigger = event.target.closest("[data-settings-action]");
  if (!trigger) return;
  event.preventDefault();
  const action = trigger.dataset.settingsAction;
  if (action === "photo") document.querySelector("#settings-photo-file").click();
  else if (action === "edit-detail") showContactEditor(trigger.dataset.field);
  else if (action === "read-notifications") {
    state.readNotifications = [0, 1, 2];
    saveState();
    renderNotifications();
    renderSettings();
  } else if (action === "density") {
    settingsState.density = trigger.dataset.value === "compact" ? "compact" : "comfortable";
    saveSettings();
    renderSettings();
  } else if (action === "reset-appearance") {
    Object.assign(settingsState, { opacity: 88, density: "comfortable", reducedMotion: false });
    saveSettings();
    renderSettings();
  } else if (action === "clear-agent" || action === "clear-messages") {
    confirmConversationClear(action === "clear-agent");
  } else if (action === "confirm-clear") {
    socialStore.chat = [];
    if (trigger.dataset.agentOnly !== "true") socialStore.messages = {};
    dialog.close();
    const saved = saveSocialStore();
    renderSettings();
    if (saved) toast("Saved conversations cleared.");
  } else if (action === "export-data") {
    exportSettingsData();
  } else if (action === "sign-out") {
    openDialog("No active sign-in", `<p class="muted-copy">This local version isn't connected to an authenticated account. Your saved data stays on this device.</p><div class="screen-dialog-actions"><button class="screen-secondary-button" data-action="close">Close</button><a class="primary-button" href="index.html">${icon("house")}Return to Home</a></div>`, "Sign out");
  }
});

document.addEventListener("input", event => {
  if (event.target.form?.id === "settings-account-form") event.target.setCustomValidity("");
  if (event.target.dataset.setting === "opacity") {
    settingsState.opacity = Number(event.target.value);
    document.querySelector("#opacity-value").textContent = `${settingsState.opacity}%`;
    applySettingsAppearance();
  }
});

document.addEventListener("change", event => {
  if (event.target.form?.id === "settings-account-form") saveAccount(event.target.form);
  const key = event.target.dataset.setting;
  if (!key) return;
  if (key === "notifications") {
    state.notifications = event.target.checked;
    saveState();
    renderNotifications();
  } else if (key === "reducedMotion") settingsState.reducedMotion = event.target.checked;
  else if (key === "opacity") settingsState.opacity = Number(event.target.value);
  else if (key === "locale" && Object.hasOwn(settingsLocales, event.target.value)) settingsState.locale = event.target.value;
  else if (key === "region" && Object.hasOwn(settingsRegions, event.target.value)) settingsState.region = event.target.value;
  saveSettings();
  applySettingsAppearance();
  if (key === "locale") renderSettings();
});

document.addEventListener("submit", event => {
  const form = event.target;
  if (form.id === "settings-account-form") {
    event.preventDefault();
    saveAccount(form);
  } else if (form.id === "settings-contact-form") {
    event.preventDefault();
    const value = String(new FormData(form).get("value") || "").trim();
    if (!value) {
      form.elements.value.setCustomValidity("Please enter a value.");
      form.elements.value.reportValidity();
      form.elements.value.addEventListener("input", () => form.elements.value.setCustomValidity(""), { once: true });
      return;
    }
    const field = form.dataset.field;
    if (field === "region" && !Object.hasOwn(settingsRegions, value)) return;
    settingsState[field] = value;
    dialog.close();
    const saved = saveSettings();
    populateAccount();
    if (saved) toast("Account detail updated.");
  }
});

document.querySelector("#settings-photo-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    state.photo = await readScreenImage(file, true);
    const saved = saveState();
    updateDashboard();
    if (saved) toast("Account photo updated.");
  } catch (error) {
    toast(error.message);
  }
  event.target.value = "";
});

window.addEventListener("hashchange", () => {
  if (location.hash !== "#settings-main") renderSettings(true);
});
renderSettings();