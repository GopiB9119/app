"use strict";

const screenPage = document.body.dataset.page;
const socialStorageKey = "skyline-social-v1";
const screenSymbols = `
<symbol id="house" viewBox="0 0 24 24"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></symbol>
<symbol id="search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.34-4.34"/></symbol>
<symbol id="bell" viewBox="0 0 24 24"><path d="M10.268 21a2 2 0 0 0 3.464 0M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></symbol>
<symbol id="user" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
<symbol id="users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></symbol>
<symbol id="heart" viewBox="0 0 24 24"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></symbol>
<symbol id="layers" viewBox="0 0 24 24"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83zM2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></symbol>
<symbol id="bot" viewBox="0 0 24 24"><path d="M12 8V4H8M2 14h2M20 14h2M15 13v2M9 13v2"/><rect width="16" height="12" x="4" y="8" rx="2"/></symbol>
<symbol id="calendar" viewBox="0 0 24 24"><path d="M8 2v3M16 2v3M3 9h18"/><rect x="3" y="3" width="18" height="18" rx="2"/></symbol>
<symbol id="clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></symbol>
<symbol id="plane" viewBox="0 0 24 24"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></symbol>
<symbol id="newspaper" viewBox="0 0 24 24"><path d="M15 18h-5M18 14h-8M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/></symbol>
<symbol id="map-pin" viewBox="0 0 24 24"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></symbol>
<symbol id="settings" viewBox="0 0 24 24"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></symbol>
<symbol id="chevron-right" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
<symbol id="arrow-right" viewBox="0 0 24 24"><path d="M5 12h14m-7-7 7 7-7 7"/></symbol>
<symbol id="arrow-up" viewBox="0 0 24 24"><path d="m5 12 7-7 7 7M12 19V5"/></symbol>
<symbol id="x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
<symbol id="plus" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></symbol>
<symbol id="check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
<symbol id="ellipsis" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></symbol>
<symbol id="mic" viewBox="0 0 24 24"><path d="M12 19v3M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></symbol>
<symbol id="paperclip" viewBox="0 0 24 24"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></symbol>
<symbol id="lightbulb" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/></symbol>
<symbol id="hand-heart" viewBox="0 0 24 24"><path d="M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16m11.45-2.61 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95M2 15l6 6m-1-1 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91"/></symbol>
<symbol id="globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></symbol>
<symbol id="message-circle" viewBox="0 0 24 24"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/></symbol>
<symbol id="share" viewBox="0 0 24 24"><path d="M12 2v13m4-9-4-4-4 4M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></symbol>
<symbol id="camera" viewBox="0 0 24 24"><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></symbol>
<symbol id="pencil" viewBox="0 0 24 24"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/></symbol>
<symbol id="trophy" viewBox="0 0 24 24"><path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2m7-7.34V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/></symbol>
<symbol id="bookmark" viewBox="0 0 24 24"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></symbol>
<symbol id="image" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></symbol>
<symbol id="circle-plus" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></symbol>`;

document.body.insertAdjacentHTML("afterbegin", `<svg class="icon-definitions" xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true">${screenSymbols}</svg>`);
const shellIcon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
const screenNotificationMarkup = `<div class="menu-wrap"><button class="round-button notification-button screen-bell" data-popover="notifications" aria-label="Notifications" title="Notifications" aria-expanded="false" aria-controls="notifications">${shellIcon("bell")}<span class="notification-dot" aria-hidden="true"></span></button><section id="notifications" class="popover notifications" aria-label="Notifications" hidden></section></div>`;
const screenPageLabel = { profile: { title: "Profile", icon: "user" }, settings: { title: "Settings", icon: "settings" } }[screenPage];
document.querySelector("#screen-header").innerHTML = `<div class="screen-header-left"><a class="round-button screen-home" href="index.html" aria-label="Home dashboard" title="Home">${shellIcon("house")}</a>${screenPageLabel ? `<a class="screen-page-pill" href="${screenPage}.html">${shellIcon(screenPageLabel.icon)}${screenPageLabel.title}</a>` : ""}</div><div class="header-actions">${!screenPageLabel ? `<div class="search-wrap"><label class="search-field" for="global-search">${shellIcon("search")}<input id="global-search" type="search" aria-label="Search your dashboard" placeholder="Search" autocomplete="off" aria-expanded="false" aria-controls="search-results"></label><section class="popover search-results" id="search-results" aria-label="Search results" hidden></section></div>` : ""}${screenNotificationMarkup}<div class="menu-wrap"><button class="avatar-button" data-popover="profile-menu" aria-label="Gopi's account" aria-expanded="false" aria-controls="profile-menu" title="Your account"><img class="avatar" src="image/avatar.png" width="58" height="58" alt="Gopi"><span class="online-indicator" aria-label="Online"></span></button><section id="profile-menu" class="popover profile-menu" aria-label="Your account" hidden><div class="account-preview"><strong data-profile-name>Gopi</strong><span data-profile-location>Bangalore, India</span></div><button data-action="profile">${shellIcon("user")}View profile</button><button data-action="settings">${shellIcon("settings")}Account settings</button></section></div></div>`;
document.body.insertAdjacentHTML("beforeend", `<dialog id="detail-dialog" aria-labelledby="dialog-title"><div class="dialog-header"><div><p class="dialog-eyebrow" id="dialog-eyebrow"></p><h2 id="dialog-title"></h2></div><button class="round-button dialog-close" data-action="close" aria-label="Close dialog" title="Close">${shellIcon("x")}</button></div><div id="dialog-content"></div></dialog><div class="toast" role="status" aria-live="polite" hidden></div>`);

function loadSocialStore() {
  const fresh = { messages: {}, chat: [], posts: [], comments: {}, hidden: [], bookmarks: [], following: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(socialStorageKey));
    if (!saved || typeof saved !== "object") return fresh;
    for (const key of ["chat", "posts", "hidden", "bookmarks", "following"]) {
      if (Array.isArray(saved[key])) fresh[key] = saved[key];
    }
    for (const key of ["messages", "comments"]) {
      if (saved[key] && typeof saved[key] === "object" && !Array.isArray(saved[key])) fresh[key] = saved[key];
    }
    fresh.posts = fresh.posts.filter(post => post && typeof post.id === "string" && typeof post.text === "string");
    return fresh;
  } catch {
    return fresh;
  }
}

const socialStore = loadSocialStore();
const spaceOptions = [
  { name: "Family", icon: "house", tone: "pink", members: 8 },
  { name: "Couple", icon: "heart", tone: "pink", members: 2 },
  { name: "Group", icon: "users", tone: "green", members: 12 },
  { name: "Solo", icon: "user", tone: "blue", members: 1 }
];
const allowedSpaces = ["Family", "Couple", "Group", "Solo", "Friends", "Travel", "Work"];
const requestedSpace = new URLSearchParams(location.search).get("space");
let selectedSpace = allowedSpaces.includes(requestedSpace) ? requestedSpace : "Family";
let pendingAttachment = null;
let speechRecognition = null;
let socialStorePersisted = true;
let mentionMatches = [];
let activeMentionIndex = 0;
const agentTools = {
  tasks: { label: "Tasks", icon: "check", action: "tasks" },
  bookings: { label: "Bookings", icon: "plane", action: "bookings" },
  events: { label: "Events", icon: "calendar", action: "events" },
  plans: { label: "Plans", icon: "map-pin", action: "plans" },
  calendar: { label: "Calendar", icon: "calendar", action: "calendar" },
  scheduling: { label: "Scheduling", icon: "clock", action: "scheduling" },
  shopping: { label: "Shopping", icon: "check", href: "booking.html#shopping" },
  browser: { label: "Browser tools", icon: "globe" }
};

function saveSocialStore() {
  try {
    localStorage.setItem(socialStorageKey, JSON.stringify(socialStore));
    socialStorePersisted = true;
    return true;
  } catch {
    socialStorePersisted = false;
    toast("Kept for this visit only. Browser storage is full or unavailable.");
    return false;
  }
}

function safeImageUrl(value) {
  return typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(value) ? value : "";
}

async function readScreenImage(file, portrait = false) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  canvas.width = portrait ? 384 : Math.round(bitmap.width * scale);
  canvas.height = portrait ? 384 : Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (portrait) {
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 384, 384);
  } else {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  bitmap.close();
  return canvas.toDataURL("image/jpeg", .8);
}

function renderSpaceNavigation() {
  const options = [...spaceOptions];
  if (!options.some(option => option.name === selectedSpace)) options.push({ name: selectedSpace, icon: selectedSpace === "Travel" ? "plane" : "users" });
  document.querySelector("#space-navigation").innerHTML = options.map(option => `<button data-screen-action="select-space" data-id="${option.name}" aria-pressed="${option.name === selectedSpace}" class="space-nav-item ${option.name === selectedSpace ? "is-selected" : ""}">${icon(option.icon)}<span>${option.name}</span></button>`).join("");
  const input = document.querySelector("#message-input");
  input.placeholder = `Message ${selectedSpace}...`;
  input.setAttribute("aria-label", `Message ${selectedSpace}`);
  document.querySelector(".spaces-main").setAttribute("aria-label", `${selectedSpace} space`);
  document.querySelector("#space-chat-title").textContent = selectedSpace;
  document.querySelector("#screen-conversation").setAttribute("aria-label", `${selectedSpace} conversation`);
  const subtitles = {
    Family: "What would you like to do with your family today?",
    Couple: "What would you like to plan together today?",
    Group: "What would you like to do with your group today?",
    Solo: "What would you like to focus on today?",
    Friends: "What would you like to do with friends today?",
    Travel: "Where would you like to go next?",
    Work: "What would you like to get done today?"
  };
  document.querySelector(".spaces-subtitle").textContent = subtitles[selectedSpace];
}

function agentToolMarkup(ids) {
  return ids.filter(id => Object.hasOwn(agentTools, id)).map(id => {
    const tool = agentTools[id];
    const label = `${icon(tool.icon)}${tool.label}`;
    if (tool.href) return `<a href="${tool.href}">${label}</a>`;
    if (tool.action) return `<button type="button" data-action="${tool.action}">${label}</button>`;
    return `<button type="button" data-screen-action="agent-browser-info" title="Browser automation is not connected">${label}</button>`;
  }).join("");
}

function hasAgentMention(text) {
  return /(^|[\s(])@agent(?=$|[\s.,!?;:)\]])/i.test(text);
}

function messageTextMarkup(text) {
  return escapeHtml(text).replace(/(^|[\s(])(@[\p{L}\p{N}_-]+)(?=$|[\s.,!?;:)\]])/gu, '$1<span class="message-mention">$2</span>');
}

function spaceMentionTargets() {
  const space = spaces.find(item => item.name === selectedSpace);
  const names = [state.name, space?.author, ...messageHistory().filter(message => message.role !== "assistant").map(message => message.author)];
  const targets = [{ handle: "agent", name: "Agent", detail: "Local tasks, bookings, events, and plans", icon: "bot" }];
  for (const name of names) {
    if (typeof name !== "string" || !name.trim()) continue;
    let handle = name.replace(/[^\p{L}\p{N}_-]/gu, "");
    if (!handle) continue;
    if (handle.toLowerCase() === "agent") handle += "_user";
    if (targets.some(target => target.handle.toLowerCase() === handle.toLowerCase())) continue;
    targets.push({ handle, name, detail: name === state.name ? "You" : `${selectedSpace} participant (local preview)`, icon: "user" });
  }
  return targets;
}

function activeSpaceMention() {
  const input = document.querySelector("#message-input");
  if (input.selectionStart !== input.selectionEnd) return null;
  const end = input.selectionStart;
  const match = input.value.slice(0, end).match(/(^|[\s(])@([\p{L}\p{N}_-]*)$/u);
  if (!match) return null;
  const rest = input.value.slice(end).match(/^[\p{L}\p{N}_-]*/u)[0];
  return { start: end - match[2].length - 1, end: end + rest.length, query: match[2].toLowerCase() };
}

function closeSpaceMentions() {
  const list = document.querySelector("#space-mentions");
  if (!list) return;
  list.hidden = true;
  const input = document.querySelector("#message-input");
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  mentionMatches = [];
}

function updateSpaceMentions() {
  const mention = activeSpaceMention();
  if (!mention) return closeSpaceMentions();
  mentionMatches = spaceMentionTargets().filter(target => target.handle.toLowerCase().startsWith(mention.query) || target.name.toLowerCase().startsWith(mention.query));
  if (!mentionMatches.length) return closeSpaceMentions();
  activeMentionIndex = 0;
  const list = document.querySelector("#space-mentions");
  list.innerHTML = mentionMatches.map((target, index) => `<button type="button" role="option" id="space-mention-${index}" data-mention-index="${index}" aria-selected="${index === 0}" tabindex="-1">${icon(target.icon)}<span><strong>@${escapeHtml(target.handle)}</strong><small>${escapeHtml(target.detail)}</small></span></button>`).join("");
  list.hidden = false;
  const input = document.querySelector("#message-input");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-activedescendant", "space-mention-0");
}

function insertSpaceMention(handle = "") {
  const input = document.querySelector("#message-input");
  const mention = activeSpaceMention();
  const start = mention ? mention.start : input.selectionStart;
  const end = mention ? mention.end : input.selectionEnd;
  const prefix = start && !/[\s(]$/.test(input.value.slice(0, start)) ? " " : "";
  const suffix = handle && !/^\s/.test(input.value.slice(end)) ? " " : "";
  const replacement = `${prefix}@${handle}${suffix}`;
  if (input.value.length - (end - start) + replacement.length > input.maxLength) {
    toast("Shorten your message before adding a mention.");
    return;
  }
  input.setRangeText(replacement, start, end, "end");
  input.focus({ preventScroll: true });
  updateScreenComposer();
  if (handle) closeSpaceMentions();
  else updateSpaceMentions();
}

function initializeSpaceMentions() {
  const input = document.querySelector("#message-input");
  const list = document.querySelector("#space-mentions");
  input.addEventListener("input", updateSpaceMentions);
  input.addEventListener("click", updateSpaceMentions);
  input.addEventListener("keyup", event => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateSpaceMentions();
  });
  input.addEventListener("blur", closeSpaceMentions);
  input.addEventListener("keydown", event => {
    if (event.isComposing || list.hidden) return;
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      closeSpaceMentions();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      activeMentionIndex = (activeMentionIndex + (event.key === "ArrowDown" ? 1 : mentionMatches.length - 1)) % mentionMatches.length;
      [...list.children].forEach((option, index) => option.setAttribute("aria-selected", String(index === activeMentionIndex)));
      input.setAttribute("aria-activedescendant", `space-mention-${activeMentionIndex}`);
      list.children[activeMentionIndex].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      insertSpaceMention(mentionMatches[activeMentionIndex].handle);
    }
  });
  list.addEventListener("pointerdown", event => {
    if (event.target.closest("[data-mention-index]")) event.preventDefault();
  });
  list.addEventListener("click", event => {
    const option = event.target.closest("[data-mention-index]");
    if (option) insertSpaceMention(mentionMatches[Number(option.dataset.mentionIndex)].handle);
  });
  document.querySelector("#space-agent-tools .agent-tool-links").innerHTML = agentToolMarkup(Object.keys(agentTools));
}

function messageHistory() {
  const records = screenPage === "agent" ? socialStore.chat : socialStore.messages[selectedSpace];
  return Array.isArray(records) ? records.filter(record => record && typeof record.text === "string") : [];
}

function updateSpaceAgentTools(messages = messageHistory()) {
  document.querySelector("#space-agent-tools").hidden = !hasAgentMention(document.querySelector("#message-input").value) && !messages.some(message => message.role === "assistant");
}

function renderScreenConversation() {
  const history = document.querySelector("#screen-conversation");
  const messages = messageHistory();
  history.hidden = messages.length === 0;
  if (screenPage === "spaces") {
    document.querySelector(".spaces-title").hidden = messages.length > 0;
    document.querySelector(".spaces-subtitle").hidden = messages.length > 0;
    document.querySelector("#space-chat-header").hidden = messages.length === 0;
    updateSpaceAgentTools(messages);
  }
  history.innerHTML = messages.map(message => `<article class="screen-message ${message.role === "assistant" ? "assistant-message" : "own-message"}"><span class="message-author">${message.role === "assistant" ? (screenPage === "spaces" ? "Agent (local)" : "Local assistant") : escapeHtml(state.name)}</span>${message.text ? `<p>${messageTextMarkup(message.text)}</p>` : ""}${safeImageUrl(message.image) ? `<img class="message-image" src="${message.image}" alt="Attached image">` : ""}${message.file ? `<span class="message-file">${icon("paperclip")}${escapeHtml(message.file)}</span>` : ""}${message.role === "assistant" && Array.isArray(message.tools) ? `<div class="agent-tool-links" role="group" aria-label="Agent tools">${agentToolMarkup(message.tools)}</div>` : ""}</article>`).join("") + (messages.length ? `<p class="conversation-footnote">${socialStorePersisted ? "Saved on this device" : "Kept for this visit only"}</p>` : "");
  if (messages.length) history.scrollTop = history.scrollHeight;
}

function updateScreenComposer() {
  const ready = Boolean(document.querySelector("#message-input").value.trim() || pendingAttachment);
  const send = document.querySelector(".composer-send");
  send.disabled = !ready;
  if (screenPage === "spaces") {
    send.hidden = !ready;
    document.querySelector(".composer-mic").hidden = ready;
    updateSpaceAgentTools();
  }
  const attachment = document.querySelector("#composer-attachment");
  attachment.hidden = !pendingAttachment;
  attachment.innerHTML = pendingAttachment ? `<span>${icon("paperclip")}${escapeHtml(pendingAttachment.name)}</span><button class="icon-button" type="button" data-screen-action="remove-attachment" aria-label="Remove attachment" title="Remove attachment">${icon("x")}</button>` : "";
}

function localAgentResponse(message) {
  const request = message.replace(/(^|[\s(])@agent(?=$|[\s.,!?;:)\]])/gi, "$1").trim();
  const create = request.match(/^(?:please\s+)?(?:add|create)\s+(?:a\s+)?(?:new\s+)?(task|plan)\s*:\s*(.*)$/is);
  if (create) {
    const title = create[2].trim();
    const tool = create[1].toLowerCase() === "task" ? "tasks" : "plans";
    if (!title || title.length > 120) return { text: "Use a title between 1 and 120 characters, for example: add task: Buy groceries.", tools: [tool] };
    if (tool === "tasks") state.tasks.push({ id: `task-${crypto.randomUUID()}`, title, done: false });
    else state.plans.push({ id: `plan-${crypto.randomUUID()}`, title, detail: "Date to be decided" });
    const saved = saveState();
    updateDashboard();
    return { text: `${tool === "tasks" ? "Task" : "Plan"} ${saved ? "saved on this device" : "added for this visit only; browser storage is unavailable"}: ${title}`, tools: [tool] };
  }
  if (/\b(browser|web|internet|browse)\b/i.test(request)) return { text: "Live browser tools are not connected in this local preview. I cannot browse websites, make purchases, or complete reservations. I can help with local tasks and plans, and open your saved dashboard tools.", tools: ["browser", "tasks", "bookings", "events", "plans"] };
  if (/\b(bookings?|book|flights?|hotels?|trains?|reservations?)\b/i.test(request)) return { text: "Open Bookings to view the reservation records in this dashboard. This local Agent cannot search live availability, make payments, or confirm a reservation with a provider.", tools: ["bookings"] };
  if (/\b(tasks?|to.do|priorities)\b/i.test(request)) {
    const remaining = state.tasks.filter(task => !task.done);
    return { text: (remaining.length ? `You have ${remaining.length} tasks left:\n${remaining.map(task => `- ${task.title}`).join("\n")}` : "Your tasks are all done. Enjoy a little breathing room.") + "\n\nTo add one, say: add task: Buy groceries. Open Tasks to review or complete it.", tools: ["tasks"] };
  }
  if (/\b(events?|calendar|schedule|scheduling|meetings?|today)\b/i.test(request)) return { text: `Here's the demo schedule in this dashboard:\n${events.map(event => `${event.time} - ${event.title} (${event.location})`).join("\n")}\n\nOpen Events or Calendar for details. You can add an event to your local plans; no live calendar is connected.`, tools: ["events", "calendar", "scheduling", "plans"] };
  if (/weekend|idea|suggest/i.test(request)) return { text: "A few ideas for the weekend:\n- An early visit to Nandi Hills and breakfast with friends.\n- A lakeside walk with your family.\n- A relaxed afternoon exploring a local cafe.\n\nTo save an idea, say: add plan: Family walk.", tools: ["plans"] };
  if (/\bplans?\b/i.test(request)) return { text: (state.plans.length ? `Your saved plans:\n${state.plans.map(plan => `- ${plan.title}: ${plan.detail}`).join("\n")}` : "Your calendar has room for something new.") + "\n\nTo add one, say: add plan: Family dinner.", tools: ["plans"] };
  if (/\b(shopping|packing)\b/i.test(request)) return { text: "Open Shopping to view the shopping and packing list saved in this dashboard.", tools: ["shopping"] };
  return { text: "I'm your local Agent. Ask about tasks, events, or plans, or say \"add task: Buy groceries\" to save a task. You can also open Bookings, Calendar, Scheduling, and Shopping below.\n\nThis preview stays on this device. Live AI, browser automation, real bookings, and notifications to other people are not connected.", tools: Object.keys(agentTools) };
}

function sendScreenMessage(text) {
  const message = text.trim();
  if (!message && !pendingAttachment) return;
  const record = { id: crypto.randomUUID(), role: "user", text: message, image: pendingAttachment?.image || "", file: pendingAttachment?.name || "" };
  if (screenPage === "agent") {
    socialStore.chat.push(record, { id: crypto.randomUUID(), role: "assistant", ...(message ? localAgentResponse(message) : { text: "Your attachment is kept locally. I can't read its contents, but you can type a question about your tasks or plans." }) });
  } else {
    if (!Array.isArray(socialStore.messages[selectedSpace])) socialStore.messages[selectedSpace] = [];
    socialStore.messages[selectedSpace].push(record);
    if (hasAgentMention(message)) socialStore.messages[selectedSpace].push({ id: crypto.randomUUID(), role: "assistant", ...localAgentResponse(message) });
  }
  pendingAttachment = null;
  document.querySelector("#message-input").value = "";
  closeSpaceMentions();
  saveSocialStore();
  renderScreenConversation();
  updateScreenComposer();
  document.querySelector("#message-input").focus({ preventScroll: true });
}

function showVoiceOptions() {
  const supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  openDialog("Voice input", `<p class="muted-copy">${supported ? "Your browser will request microphone permission and may use its speech service to transcribe audio." : "Speech recognition is not available in this browser. You can still type your message."}</p>${supported ? `<div class="screen-dialog-actions"><button class="primary-button" data-screen-action="start-voice">${icon("mic")}Start listening</button></div>` : ""}`, "Microphone");
}

function startVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return;
  speechRecognition?.abort();
  speechRecognition = new Recognition();
  speechRecognition.lang = "en-IN";
  speechRecognition.interimResults = false;
  speechRecognition.onresult = event => {
    document.querySelector("#message-input").value = event.results[0][0].transcript;
    updateScreenComposer();
  };
  speechRecognition.onerror = () => toast("Voice input is unavailable. You can type your message instead.");
  speechRecognition.onend = () => document.querySelector(".composer-mic")?.classList.remove("is-listening");
  dialog.close();
  try {
    speechRecognition.start();
    document.querySelector(".composer-mic").classList.add("is-listening");
  } catch {
    toast("The microphone could not be started.");
  }
}

function initializeConversationScreen() {
  if (screenPage === "spaces") {
    renderSpaceNavigation();
    initializeSpaceMentions();
  }
  renderScreenConversation();
  updateScreenComposer();
  document.querySelector("#message-input").addEventListener("input", updateScreenComposer);
  document.querySelector("#screen-message-form").addEventListener("submit", event => {
    event.preventDefault();
    sendScreenMessage(document.querySelector("#message-input").value);
  });
  document.querySelector("#message-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file smaller than 5 MB.");
      pendingAttachment = { name: file.name, image: file.type.startsWith("image/") ? await readScreenImage(file) : "" };
      updateScreenComposer();
    } catch (error) {
      toast(error.message);
    }
    event.target.value = "";
  });
}

function handleConversationAction(action, id) {
  if (action === "select-space" && allowedSpaces.includes(id)) {
    selectedSpace = id;
    closeSpaceMentions();
    pendingAttachment = null;
    document.querySelector("#message-input").value = "";
    history.replaceState(null, "", `spaces.html?space=${encodeURIComponent(id)}`);
    renderSpaceNavigation();
    renderScreenConversation();
    updateScreenComposer();
  } else if (action === "mention") {
    insertSpaceMention();
  } else if (action === "agent-browser-info") {
    openDialog("Browser tools", `<p class="muted-copy">Live browser automation is not connected. This local preview cannot browse websites, enter credentials, make payments, or confirm real bookings.</p><div class="screen-dialog-actions agent-tool-links">${agentToolMarkup(["tasks", "bookings", "events", "plans"])}</div><p class="screen-form-note screen-dialog-actions">Tasks and plans are stored in this browser. Booking records are not provider confirmations.</p>`, "Not connected");
  } else if (action === "attach") {
    document.querySelector("#message-file").click();
  } else if (action === "remove-attachment") {
    pendingAttachment = null;
    updateScreenComposer();
  } else if (action === "voice") {
    showVoiceOptions();
  } else if (action === "start-voice") {
    startVoiceInput();
  } else if (action === "suggestions") {
    sendScreenMessage("Give me some weekend suggestions");
  } else if (action === "agent-more") {
    openDialog("Your agent", `<div class="screen-action-list"><button data-action="tasks">${icon("check")}My tasks</button><button data-action="bookings">${icon("plane")}My bookings</button><button data-screen-action="clear-chat">${icon("x")}Clear local conversation</button></div>`, "A little help with your day");
  } else if (action === "clear-chat") {
    openDialog("Clear conversation?", `<p class="muted-copy">This removes the Agent conversation saved on this device.</p><div class="screen-dialog-actions"><button class="primary-button" data-screen-action="confirm-clear-chat">Clear conversation</button><button class="screen-secondary-button" data-action="close">Keep conversation</button></div>`);
  } else if (action === "confirm-clear-chat") {
    socialStore.chat = [];
    saveSocialStore();
    renderScreenConversation();
    dialog.close();
  }
}

const communitySeedPosts = [
  { id: "ananya", author: "Ananya", avatar: "image/ananya.jpg", time: "2 hours ago", text: "Looking for people who enjoy morning walks around the lake.", image: "image/community-lake.jpg", alt: "A sunny walking path beside the lake", likes: 24, replies: 6, comments: [{ author: "Priya", text: "I'd love to join. Is 7 AM a good time?" }, { author: "Rohit", text: "Count me in for a weekend walk." }] },
  { id: "rohit", author: "Rohit", avatar: "image/rohit.jpg", time: "5 hours ago", text: "New to the area. Would love to meet friendly people nearby.", image: "image/community-friends.jpg", alt: "Friends watching the sun rise over the hills", likes: 36, replies: 8, comments: [{ author: "Ananya", text: "Welcome to the neighborhood!" }, { author: "Meera", text: "We should all meet for coffee soon." }] },
  { id: "meera", author: "Meera", avatar: "image/meera.jpg", time: "1 day ago", text: "Anyone up for a weekend drive and some good food?", image: "image/community-drive.jpg", alt: "A scenic road winding along a green coastline", likes: 52, replies: 12, comments: [{ author: "Karan", text: "That sounds like a lovely Saturday." }, { author: "Rohit", text: "I know a great breakfast spot on the way." }] },
  { id: "karan", author: "Karan", avatar: "image/karan.jpg", time: "2 days ago", text: "Found this beautiful spot yesterday. Such a peaceful place!", image: "image/community-mountains.jpg", alt: "A peaceful lake surrounded by green mountain peaks", likes: 41, replies: 9, comments: [{ author: "Meera", text: "What a view! Where is this?" }, { author: "Ananya", text: "Adding this to my weekend ideas." }] }
];
let selectedCommunityTab = "nearby";
let pendingPostImage = "";

function allCommunityPosts() {
  return [...socialStore.posts.map(post => ({ ...post, author: state.name, avatar: safeImageUrl(state.photo) || "image/avatar.png", time: "Saved locally", image: safeImageUrl(post.image), alt: "Community post attachment", likes: 0, replies: 0, comments: [], own: true })), ...communitySeedPosts];
}

function savedPostComments(id) {
  const comments = socialStore.comments[id];
  return Array.isArray(comments) ? comments.filter(comment => comment && typeof comment.text === "string") : [];
}

function communityPostMarkup(post) {
  const liked = state.likes.includes(post.id);
  const bookmarked = socialStore.bookmarks.includes(post.id);
  return `<article class="community-post ${post.image ? "" : "without-image"}" id="post-${escapeHtml(post.id)}"><div class="community-post-left"><button class="community-avatar-button" data-screen-action="post-open" data-id="${escapeHtml(post.id)}" aria-label="Open ${escapeHtml(post.author)}'s post"><img class="community-avatar" src="${post.avatar}" width="60" height="60" alt="${escapeHtml(post.author)}"></button><button class="community-author" data-screen-action="post-open" data-id="${escapeHtml(post.id)}"><strong>${escapeHtml(post.author)}</strong><time>${post.time}</time></button><button class="community-post-text" data-screen-action="post-open" data-id="${escapeHtml(post.id)}">${escapeHtml(post.text)}</button><div class="post-reactions"><button class="heart-icon" data-screen-action="post-like" data-id="${escapeHtml(post.id)}" aria-pressed="${liked}" aria-label="${liked ? "Unlike" : "Like"} ${escapeHtml(post.author)}'s post">${icon("heart")}<span>${post.likes + Number(liked)}</span></button><button data-screen-action="post-comments" data-id="${escapeHtml(post.id)}" aria-label="Comments on ${escapeHtml(post.author)}'s post">${icon("message-circle")}<span>${post.replies + savedPostComments(post.id).length}</span></button><button data-screen-action="post-share" data-id="${escapeHtml(post.id)}">${icon("share")}<span>Share</span></button></div></div>${post.image ? `<button class="community-post-image-button" data-screen-action="post-open" data-id="${escapeHtml(post.id)}" aria-label="Open ${escapeHtml(post.author)}'s post"><img class="community-post-image" src="${post.image}" width="244" height="128" alt="${post.alt}"></button>` : ""}<div class="menu-wrap post-options"><button data-popover="post-menu-${escapeHtml(post.id)}" aria-label="Options for ${escapeHtml(post.author)}'s post" title="Post options" aria-expanded="false" aria-controls="post-menu-${escapeHtml(post.id)}">${icon("ellipsis")}</button><div class="popover" id="post-menu-${escapeHtml(post.id)}" hidden><button data-screen-action="post-save" data-id="${escapeHtml(post.id)}">${icon("bookmark")}${bookmarked ? "Unsave post" : "Save post"}</button><button data-screen-action="post-hide" data-id="${escapeHtml(post.id)}">${icon("x")}${post.own ? "Remove local post" : "Hide post"}</button></div></div></article>`;
}

function renderCommunityScreen() {
  const feed = document.querySelector("#community-feed");
  document.querySelectorAll(".community-tabs > button").forEach(button => {
    const selected = button.dataset.id === selectedCommunityTab;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-changed", selected && selectedCommunityTab !== "nearby");
  });
  feed.className = selectedCommunityTab === "people" ? "people-grid" : "community-feed";
  if (selectedCommunityTab === "people") {
    feed.innerHTML = communitySeedPosts.map(person => `<article class="person-card"><img src="${person.avatar}" width="76" height="76" alt="${person.author}"><h2>${person.author}</h2><p>Bangalore, India</p><button class="screen-secondary-button" data-screen-action="follow" data-id="${person.id}" aria-pressed="${socialStore.following.includes(person.id)}">${icon(socialStore.following.includes(person.id) ? "check" : "plus")}${socialStore.following.includes(person.id) ? "Following" : "Follow"}</button></article>`).join("");
    return;
  }
  const posts = allCommunityPosts().filter(post => !socialStore.hidden.includes(post.id) && (selectedCommunityTab !== "help" || post.category === "help"));
  feed.innerHTML = posts.length ? posts.map(communityPostMarkup).join("") : `<div class="community-empty"><p>${selectedCommunityTab === "help" ? "No open requests right now." : "You're all caught up."}</p><button class="primary-button" data-screen-action="create-post">${icon("plus")}${selectedCommunityTab === "help" ? "Ask for help" : "Create post"}</button>${socialStore.hidden.length ? '<div class="screen-dialog-actions"><button class="screen-secondary-button" data-screen-action="restore-posts">Restore hidden posts</button></div>' : ""}</div>`;
}

function showCreatePost() {
  pendingPostImage = "";
  openDialog("Create a post", `<form class="screen-form" id="community-post-form"><label class="field-label">Share with<select class="form-input" name="category"><option value="nearby">Nearby community</option><option value="help" ${selectedCommunityTab === "help" ? "selected" : ""}>Ask for help</option></select></label><label class="field-label">What's on your mind?<textarea class="form-input" name="text" maxlength="1000" required placeholder="Share a moment, an idea, or a plan..."></textarea></label><label class="screen-file-label">${icon("image")}<input id="post-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Add a post image"></label><img id="post-photo-preview" class="post-preview-image" alt="Selected post image" hidden><p class="screen-form-note">Saved on this device. This preview does not publish to a live community.</p><button class="primary-button" type="submit">${icon("plus")}Save post</button></form>`, "Your community");
  document.querySelector("#post-photo").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      pendingPostImage = await readScreenImage(file);
      const preview = document.querySelector("#post-photo-preview");
      if (preview) { preview.src = pendingPostImage; preview.hidden = false; }
    } catch (error) {
      pendingPostImage = "";
      event.target.value = "";
      toast(error.message);
    }
  });
}

function communityCommentAvatar(author) {
  if (author === state.name) return safeImageUrl(state.photo) || "image/avatar.png";
  return communitySeedPosts.find(post => post.author === author)?.avatar || "";
}

function showPostDetails(id) {
  const post = allCommunityPosts().find(item => item.id === id);
  if (!post) return;
  const liked = state.likes.includes(id);
  const bookmarked = socialStore.bookmarks.includes(id);
  const comments = [...post.comments, ...savedPostComments(id)];
  const commentCount = post.replies + savedPostComments(id).length;
  openDialog(`${post.author}'s post`, `<div class="post-detail-layout">${post.image ? `<div class="post-detail-media" style="--post-detail-image: url('${post.image.replaceAll("'", "%27")}')"><img src="${post.image}" alt="${escapeHtml(post.alt)}"></div>` : ""}<section class="post-detail-panel"><header class="post-detail-author"><img src="${post.avatar}" width="52" height="52" alt="${escapeHtml(post.author)}"><div><strong>${escapeHtml(post.author)}</strong><time>${escapeHtml(post.time)}</time></div><button class="screen-icon-button" data-screen-action="post-save" data-id="${escapeHtml(id)}" aria-label="${bookmarked ? "Remove saved post" : "Save post"}" title="${bookmarked ? "Unsave post" : "Save post"}">${icon("bookmark")}</button></header><p class="post-detail-copy">${escapeHtml(post.text)}</p><div class="post-detail-actions"><button class="heart-icon" data-screen-action="post-like" data-id="${escapeHtml(id)}" aria-pressed="${liked}" aria-label="${liked ? "Unlike" : "Like"} ${escapeHtml(post.author)}'s post">${icon("heart")}<span>${post.likes + Number(liked)}</span><small>Likes</small></button><button aria-label="${commentCount} comments">${icon("message-circle")}<span>${commentCount}</span><small>Comments</small></button><button data-screen-action="post-share" data-id="${escapeHtml(id)}">${icon("share")}<small>Share</small></button></div><div class="post-detail-comments" aria-label="Comments">${comments.map(comment => { const avatar = communityCommentAvatar(comment.author); return `<article class="post-detail-comment">${avatar ? `<img src="${avatar}" width="38" height="38" alt="">` : `<span class="post-detail-comment-avatar" aria-hidden="true">${escapeHtml(comment.author.charAt(0).toUpperCase())}</span>`}<div><strong>${escapeHtml(comment.author)}</strong><p>${escapeHtml(comment.text)}</p></div></article>`; }).join("") || '<p class="post-detail-empty">No comments yet. Be the first to say something.</p>'}</div><form class="post-detail-composer" id="community-comment-form" data-id="${escapeHtml(id)}"><img src="${safeImageUrl(state.photo) || "image/avatar.png"}" width="38" height="38" alt=""><input class="form-input" name="text" maxlength="500" required placeholder="Write a comment..." aria-label="Write a comment"><button class="primary-button" type="submit" aria-label="Post comment" title="Post comment">${icon("arrow-up")}</button></form></section></div>`, "Community");
  dialog.classList.add("community-post-dialog");
  dialog.classList.toggle("without-post-image", !post.image);
}

function handleCommunityAction(action, id, trigger) {
  if (action === "community-tab" && ["nearby", "people", "help"].includes(id)) {
    selectedCommunityTab = id;
    renderCommunityScreen();
  } else if (action === "create-post") {
    showCreatePost();
  } else if (action === "post-like") {
    const liked = state.likes.includes(id);
    state.likes = liked ? state.likes.filter(value => value !== id) : [...state.likes, id];
    saveState();
    const post = allCommunityPosts().find(item => item.id === id);
    if (!post) return;
    document.querySelectorAll('[data-screen-action="post-like"]').forEach(button => {
      if (button.dataset.id !== id) return;
      button.setAttribute("aria-pressed", String(!liked));
      button.setAttribute("aria-label", `${liked ? "Like" : "Unlike"} ${post.author}'s post`);
      button.querySelector("span").textContent = post.likes + Number(!liked);
    });
  } else if (action === "post-comments" || action === "post-open") {
    showPostDetails(id);
  } else if (action === "post-share") {
    const post = allCommunityPosts().find(item => item.id === id);
    if (!post) return;
    const link = new URL(`community.html#post-${encodeURIComponent(id)}`, location.href).href;
    openDialog("Share post", `<p class="community-preview-copy">${escapeHtml(post.text)}</p><label class="field-label screen-dialog-actions">Post link<input id="share-post-link" class="form-input" value="${escapeHtml(link)}" readonly></label><div class="screen-dialog-actions"><button class="primary-button" data-screen-action="copy-post-link">${icon("share")}Copy link</button></div><p class="screen-form-note screen-dialog-actions">Local file links work on this device.</p>`, post.author);
  } else if (action === "copy-post-link") {
    const input = document.querySelector("#share-post-link");
    input.select();
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(input.value).then(() => { trigger.textContent = "Copied"; }).catch(() => toast("The link is selected. Use your browser's Copy command."));
    else toast("The link is selected. Use your browser's Copy command.");
  } else if (action === "post-save") {
    const saved = socialStore.bookmarks.includes(id);
    socialStore.bookmarks = saved ? socialStore.bookmarks.filter(value => value !== id) : [...socialStore.bookmarks, id];
    saveSocialStore();
    renderCommunityScreen();
    toast(saved ? "Post removed from saved posts." : "Post saved on this device.");
  } else if (action === "post-hide") {
    const own = socialStore.posts.some(post => post.id === id);
    if (own) {
      openDialog("Remove this post?", `<p class="muted-copy">This removes the post saved on this device.</p><div class="screen-dialog-actions"><button class="primary-button" data-screen-action="confirm-remove-post" data-id="${escapeHtml(id)}">Remove post</button><button class="screen-secondary-button" data-action="close">Keep post</button></div>`);
    } else {
      socialStore.hidden.push(id);
      saveSocialStore();
      renderCommunityScreen();
      toast("Post hidden from your feed.");
    }
  } else if (action === "confirm-remove-post") {
    socialStore.posts = socialStore.posts.filter(post => post.id !== id);
    saveSocialStore();
    renderCommunityScreen();
    dialog.close();
  } else if (action === "restore-posts") {
    socialStore.hidden = [];
    saveSocialStore();
    renderCommunityScreen();
  } else if (action === "follow") {
    socialStore.following = socialStore.following.includes(id) ? socialStore.following.filter(value => value !== id) : [...socialStore.following, id];
    saveSocialStore();
    renderCommunityScreen();
  }
}

function initializeCommunityScreen() {
  renderCommunityScreen();
  if (location.hash.startsWith("#post-")) showPostDetails(decodeURIComponent(location.hash.slice(6)));
  document.addEventListener("submit", event => {
    const form = event.target;
    if (!["community-post-form", "community-comment-form"].includes(form.id)) return;
    event.preventDefault();
    const values = new FormData(form);
    const text = String(values.get("text") || "").trim();
    if (!text) {
      form.elements.text.setCustomValidity("Enter some text before saving.");
      form.elements.text.reportValidity();
      form.elements.text.addEventListener("input", () => form.elements.text.setCustomValidity(""), { once: true });
      return;
    }
    if (form.id === "community-post-form") {
      const category = values.get("category") === "help" ? "help" : "nearby";
      socialStore.posts.unshift({ id: crypto.randomUUID(), text, image: pendingPostImage, category });
      selectedCommunityTab = category;
      saveSocialStore();
      renderCommunityScreen();
      dialog.close();
    } else {
      const id = form.dataset.id;
      if (!Array.isArray(socialStore.comments[id])) socialStore.comments[id] = [];
      socialStore.comments[id].push({ author: state.name, text });
      saveSocialStore();
      renderCommunityScreen();
      showPostDetails(id);
      dialogContent.querySelector('input[name="text"]').focus();
    }
  });
}

function showProfileEditor(aboutOnly = false) {
  openDialog(aboutOnly ? "About me" : "Edit profile", `<form class="screen-form" id="screen-profile-form" data-about-only="${aboutOnly}">${aboutOnly ? `<label class="field-label">About you<textarea class="form-input" name="about" maxlength="1000" required>${escapeHtml(state.about)}</textarea></label>` : `<label class="field-label">Name<input class="form-input" name="name" value="${escapeHtml(state.name)}" maxlength="40" required></label><label class="field-label">Tagline<input class="form-input" name="tagline" value="${escapeHtml(state.tagline)}" maxlength="100"></label><label class="field-label">Location<input class="form-input" name="location" value="${escapeHtml(state.location)}" maxlength="80" required></label><label class="field-label">Bio<textarea class="form-input" name="bio" maxlength="300">${escapeHtml(state.bio)}</textarea></label>`}<button class="primary-button" type="submit">${icon("check")}Save changes</button></form>`, "Your corner of Skyline");
}

function handleProfileAction(action, id) {
  if (action === "edit-profile") showProfileEditor();
  else if (action === "edit-about") showProfileEditor(true);
  else if (action === "profile-photo") document.querySelector("#profile-photo-file").click();
  else if (action === "profile-spaces") {
    openDialog("My spaces", `<div class="space-list">${spaceOptions.map(space => `<button class="space-item" data-action="space" data-id="${space.name}"><span class="quick-icon ${space.tone}">${icon(space.icon)}</span><span><strong>${space.name}</strong><small>${space.members} ${space.members === 1 ? "member" : "members"}</small></span></button>`).join("")}</div>`, "A place for your people");
  } else if (action === "profile-connections") {
    openDialog(id === "followers" ? "Followers" : "Neighbors", `<div class="screen-connections">${communitySeedPosts.map(person => `<div class="detail-row"><img class="connection-avatar" src="${person.avatar}" width="44" height="44" alt="${person.author}"><div class="detail-row-copy"><strong>${person.author}</strong><p>Bangalore, India</p></div></div>`).join("")}</div><div class="screen-dialog-actions"><button class="primary-button" data-action="community">${icon("users")}Visit community</button></div>`, id === "followers" ? "1,294 followers" : `${126 + socialStore.following.length} neighbors following`);
  } else if (action === "completed-plans") {
    openDialog("Completed plans", ["Family dinner", "Weekend getaway", "Community morning walk"].map(title => `<div class="detail-row">${icon("check")}<div class="detail-row-copy"><strong>${title}</strong><p>Completed</p></div></div>`).join("") + `<div class="screen-dialog-actions"><button class="primary-button" data-action="plans">${icon("calendar")}My upcoming plans</button></div>`, "250 plans completed");
  }
}

function initializeProfileScreen() {
  document.querySelector("#neighbors-count").textContent = 126 + socialStore.following.length;
  document.querySelector("#profile-photo-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      state.photo = await readScreenImage(file, true);
      const saved = saveState();
      updateDashboard();
      if (saved) toast("Profile photo updated.");
    } catch (error) {
      toast(error.message);
    }
    event.target.value = "";
  });
  document.addEventListener("submit", event => {
    const form = event.target;
    if (form.id !== "screen-profile-form") return;
    event.preventDefault();
    const values = new FormData(form);
    const fields = form.dataset.aboutOnly === "true" ? ["about"] : ["name", "tagline", "location", "bio"];
    for (const field of fields) {
      const input = form.elements[field];
      if (input.required && !String(values.get(field) || "").trim()) {
        input.setCustomValidity("Enter a value with at least one non-space character.");
        input.reportValidity();
        input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
        return;
      }
    }
    for (const field of fields) state[field] = String(values.get(field) || "").trim();
    const saved = saveState();
    updateDashboard();
    dialog.close();
    if (saved) toast("Your profile has been updated.");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (screenPage === "spaces" || screenPage === "agent") initializeConversationScreen();
  if (screenPage === "community") initializeCommunityScreen();
  if (screenPage === "profile") initializeProfileScreen();
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-screen-action]");
    if (!trigger) return;
    event.preventDefault();
    const { screenAction, id } = trigger.dataset;
    if (screenPage === "spaces" || screenPage === "agent") handleConversationAction(screenAction, id);
    if (screenPage === "community") handleCommunityAction(screenAction, id, trigger);
    if (screenPage === "profile") handleProfileAction(screenAction, id);
  });
});

window.addEventListener("pagehide", () => speechRecognition?.abort());