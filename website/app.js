"use strict";

function updateLiveSky() {
  const hour = new Date().getHours();
  document.body.dataset.skyTime = hour >= 5 && hour < 8 ? "dawn" : hour >= 8 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "dusk" : "night";
}

updateLiveSky();
setInterval(updateLiveSky, 10 * 60 * 1000);

const storageKey = "skyline-dashboard-v1";
const defaults = {
  name: "Gopi",
  bio: "I love exploring new places, building useful tools, and connecting with like-minded people.",
  about: "I love exploring new places, building useful tools, and connecting with like-minded people. Always curious to learn and meet new people.",
  tagline: "Explorer \u2022 Builder \u2022 Learner",
  location: "Bangalore, India",
  photo: "",
  notifications: true,
  readNotifications: [],
  likes: [],
  tasks: [
    { id: "task-1", title: "Prepare for the team call", done: false },
    { id: "task-2", title: "Confirm lunch with friends", done: false },
    { id: "task-3", title: "Shortlist weekend getaways", done: false }
  ],
  plans: [
    { id: "plan-1", title: "Weekend trip to Nandi Hills", detail: "Saturday, Oct 10, 2026" },
    { id: "plan-2", title: "Family dinner", detail: "Sunday, Oct 11, 2026" }
  ]
};

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || typeof saved !== "object") return structuredClone(defaults);
    return {
      name: typeof saved.name === "string" && saved.name.trim() ? saved.name : defaults.name,
      bio: typeof saved.bio === "string" ? saved.bio : defaults.bio,
      about: typeof saved.about === "string" ? saved.about : defaults.about,
      tagline: typeof saved.tagline === "string" ? saved.tagline : defaults.tagline,
      location: typeof saved.location === "string" ? saved.location : defaults.location,
      photo: typeof saved.photo === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(saved.photo) ? saved.photo : "",
      notifications: typeof saved.notifications === "boolean" ? saved.notifications : true,
      readNotifications: Array.isArray(saved.readNotifications) ? saved.readNotifications.filter(Number.isInteger) : [],
      likes: Array.isArray(saved.likes) ? saved.likes.filter(value => typeof value === "string") : [],
      tasks: Array.isArray(saved.tasks) ? saved.tasks.filter(task => task && typeof task.id === "string" && typeof task.title === "string").map(task => ({ ...task, done: Boolean(task.done) })) : structuredClone(defaults.tasks),
      plans: Array.isArray(saved.plans) ? saved.plans.filter(plan => plan && typeof plan.id === "string" && typeof plan.title === "string").map(plan => ({ ...plan, detail: typeof plan.detail === "string" ? plan.detail : "Date to be decided" })) : structuredClone(defaults.plans)
    };
  } catch {
    return structuredClone(defaults);
  }
}

const state = readState();
const dialog = document.querySelector("#detail-dialog");
const dialogContent = document.querySelector("#dialog-content");
const searchInput = document.querySelector("#global-search");
const searchResults = document.querySelector("#search-results");
let toastTimer;
let currentView = "home";

const events = [
  { title: "Team call", time: "10:00 AM", duration: "30 minutes", location: "Online", description: "Catch up with the team, share progress, and agree on this week's priorities." },
  { title: "Lunch with friends", time: "1:00 PM", duration: "1 hour", location: "Bangalore", description: "A little time away from the desk and a good meal with your favorite people." },
  { title: "Plan weekend trip", time: "4:30 PM", duration: "45 minutes", location: "Travel space", description: "Pick a destination, check everyone's availability, and put together the weekend itinerary." }
];

const articles = [
  { id: "travel", category: "Travel", title: "Best weekend getaways near Bangalore in 2026", source: "Travel Today", time: "2 hours ago", image: "image/news-travel.jpg", paragraphs: ["A change of scenery does not have to mean a long holiday. The hills, coffee plantations, and quiet trails around Bangalore make room for a slower weekend.", "Nandi Hills is an easy pick for an early start and expansive views. For a longer escape, explore the coffee estates around Chikmagalur or spend a relaxed couple of days in Coorg.", "Choose your destination together, check the weather before leaving, and leave a little space in the itinerary for the unexpected. The best part of a weekend away is often the company."] },
  { id: "lifestyle", category: "Lifestyle", title: "5 simple ways to stay productive this month", source: "Mindful Living", time: "5 hours ago", image: "image/news-lifestyle.jpg", paragraphs: ["A productive day starts with a little clarity, not a longer to-do list. Try these five small habits to make the month feel more manageable.", "1. Choose three priorities each morning. 2. Give focused work a place on your calendar. 3. Keep notifications quiet while you concentrate.", "4. Take real breaks away from your screen. 5. Finish the day with a short review of what went well and what can wait until tomorrow.", "Consistency matters more than doing everything. Make your routine work for you, and leave room for rest."] },
  { id: "community", category: "Community", title: "Local community events you shouldn't miss", source: "City Updates", time: "1 day ago", image: "image/news-community.jpg", paragraphs: ["Sometimes a new connection is just a short walk away. This weekend is a good opportunity to spend time with the people around you.", "Join a morning walk by the lake, organize a neighborhood book exchange, or bring a friend to a local clean-up. Small gatherings are a lovely way to get to know familiar faces.", "Visit your Community space to find people with shared interests and make a plan together. Confirm the time and location with the organizer before heading out."] },
  { id: "tech-science", category: "Tech & Science", title: "Everyday AI tools are becoming more useful", source: "Future Desk", time: "3 hours ago", image: "image/space-work.jpg", paragraphs: ["Digital assistants are becoming more practical when they focus on small, repeatable jobs such as organizing schedules, summarizing notes, and keeping shared plans current.", "The most useful tools keep people in control. Clear permissions, visible changes, and easy ways to correct mistakes help automation feel dependable rather than mysterious.", "For families and small teams, the opportunity is simple: spend less time maintaining information and more time acting on it."] },
  { id: "business", category: "Business", title: "Small businesses are building stronger local networks", source: "Business Daily", time: "4 hours ago", image: "image/booking-sky.jpg", paragraphs: ["Independent businesses are collaborating more often through neighborhood events, shared delivery programs, and local recommendations.", "These partnerships help smaller teams reach new customers without losing the personal relationships that make local businesses distinctive.", "The strongest networks begin with clear goals, reliable communication, and a willingness to share what each participant does best."] },
  { id: "health", category: "Health", title: "Why a short daily walk can reset your routine", source: "Healthy Living", time: "6 hours ago", image: "image/community-lake.jpg", paragraphs: ["A short walk can create a useful boundary between tasks, especially on days spent sitting or working from home.", "Consistency matters more than distance. Choosing a familiar route and a realistic time makes the habit easier to repeat.", "Walk at a comfortable pace, stay aware of local conditions, and speak with a qualified professional before changing activity levels if you have health concerns."] },
  { id: "arts-culture", category: "Arts & Culture", title: "Local creators bring new color to familiar places", source: "Culture Notes", time: "8 hours ago", image: "image/community-drive.jpg", paragraphs: ["Community art projects are turning everyday streets, gathering spaces, and small venues into places for shared stories.", "Workshops and open events give new creators a low-pressure way to participate while helping neighbors discover different perspectives.", "Check local listings for exhibitions, performances, and volunteer opportunities happening near you this month."] },
  { id: "sports", category: "Sports", title: "Weekend outdoor groups welcome new participants", source: "Active City", time: "10 hours ago", image: "image/community-mountains.jpg", paragraphs: ["Local running, cycling, and hiking groups are opening beginner-friendly sessions for people who want to be active with others.", "Organizers recommend checking the route, weather, equipment requirements, and expected pace before joining.", "Start with a group that matches your experience, carry water, and let someone know where you plan to be."] },
  { id: "entertainment", category: "Entertainment", title: "What families and friends are watching this weekend", source: "Screen Time", time: "12 hours ago", image: "image/space-friends.jpg", paragraphs: ["This weekend's popular picks favor warm stories, light mysteries, and easy viewing that works for a relaxed evening together.", "A shared watchlist can make choosing easier: let everyone add one option, then pick based on the time available and the group's mood.", "Leave room for conversation and snacks. The best part of a movie night is often the time spent together."] }
];

const spaces = [
  { name: "Family", members: 8, icon: "heart", tone: "pink", message: "Sunday dinner at 7? Bring your favorite dish. Looking forward to having everyone together!", author: "Priya" },
  { name: "Friends", members: 12, icon: "users", tone: "green", message: "Who's in for lunch this week? Let's try somewhere new.", author: "Rohit" },
  { name: "Travel", members: 6, icon: "plane", tone: "blue", message: "Nandi Hills this weekend? An early start, a good breakfast, and a view worth waking up for.", author: "Ananya" },
  { name: "Work", members: 4, icon: "layers", tone: "purple", message: "Our next team catch-up is at 10:00 AM. Add anything you'd like to discuss to the agenda.", author: "Karan" }
];

const communityPosts = [
  { id: "ananya", author: "Ananya", time: "2 hours ago", text: "Looking for people who enjoy morning walks around the lake.", likes: 24 },
  { id: "rohit", author: "Rohit", time: "5 hours ago", text: "New to the area. Would love to meet friendly people nearby.", likes: 36 },
  { id: "meera", author: "Meera", time: "1 day ago", text: "Anyone up for a weekend drive and some good food?", likes: 52 }
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
}

function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    toast("Changes are kept for this visit. Browser storage is unavailable.");
    return false;
  }
}

function updateDashboard() {
  const taskCount = document.querySelector("#task-count");
  const planCount = document.querySelector("#plan-count");
  if (taskCount) taskCount.textContent = state.tasks.filter(task => !task.done).length;
  if (planCount) planCount.textContent = state.plans.length;
  document.querySelectorAll("[data-profile-name]").forEach(element => { element.textContent = state.name; });
  for (const field of ["bio", "about", "tagline", "location"]) {
    document.querySelectorAll(`[data-profile-${field}]`).forEach(element => { element.textContent = state[field]; });
  }
  document.querySelector(".avatar-button").setAttribute("aria-label", `${state.name}'s account`);
  document.querySelectorAll("img.avatar, img[data-profile-photo]").forEach(image => {
    image.src = state.photo || image.dataset.profilePhoto || "image/avatar.png";
    image.alt = state.name;
  });
}

function toast(message) {
  const notification = document.querySelector(".toast");
  clearTimeout(toastTimer);
  notification.textContent = message;
  notification.hidden = false;
  toastTimer = setTimeout(() => { notification.hidden = true; }, 3500);
}

function closePopovers(except = "") {
  document.querySelectorAll(".popover").forEach(popover => {
    if (popover.id !== except) popover.hidden = true;
  });
  document.querySelectorAll("[data-popover][aria-expanded], #global-search[aria-expanded]").forEach(trigger => {
    if (trigger.getAttribute("aria-controls") !== except) trigger.setAttribute("aria-expanded", "false");
  });
}

function openDialog(title, content, eyebrow = "Your day, connected") {
  closePopovers();
  dialog.classList.remove("community-post-dialog", "without-post-image");
  document.querySelector("#dialog-title").textContent = title;
  document.querySelector("#dialog-eyebrow").textContent = eyebrow;
  dialogContent.innerHTML = content;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

function showPlanner(view = "tasks") {
  if (view === "bookings") {
    if (document.body.dataset.page === "booking") {
      dialog.close();
      document.dispatchEvent(new CustomEvent("bookings:reset"));
    } else {
      window.location.assign("booking.html");
    }
    return;
  }
  const titles = { tasks: "Tasks", plans: "Plans", events: "Events", calendar: "Calendar", scheduling: "Scheduling" };
  if (!Object.hasOwn(titles, view)) {
    toast("This planning section is unavailable.");
    return;
  }
  currentView = view;
  let content = "";
  if (view === "tasks") {
    content += `<div class="task-list">${state.tasks.map(task => `<label class="detail-row"><input type="checkbox" data-task="${escapeHtml(task.id)}" ${task.done ? "checked" : ""}><span class="detail-row-copy"><strong>${escapeHtml(task.title)}</strong><p>Today</p></span></label>`).join("") || '<p class="empty-state">A little room to breathe. No tasks yet.</p>'}</div><form class="add-form" id="task-form"><input class="form-input" name="title" placeholder="Add a task..." aria-label="New task" maxlength="120" required><button class="primary-button" type="submit">${icon("plus")} Add</button></form>`;
  } else if (view === "plans") {
    content += state.plans.map(plan => `<div class="detail-row">${icon("calendar")}<div class="detail-row-copy"><strong>${escapeHtml(plan.title)}</strong><p>${escapeHtml(plan.detail)}</p></div><button class="icon-button" data-action="remove-plan" data-id="${escapeHtml(plan.id)}" aria-label="Remove ${escapeHtml(plan.title)}" title="Remove plan">${icon("x")}</button></div>`).join("") || '<p class="empty-state">Your next adventure starts with a plan.</p>';
    content += `<form class="add-form" id="plan-form"><input class="form-input" name="title" placeholder="Make a new plan..." aria-label="New plan" maxlength="120" required><button class="primary-button" type="submit">${icon("plus")} Add</button></form>`;
  } else {
    content += events.map((event, index) => `<button class="detail-row" style="width:100%;text-align:left" data-action="event" data-id="${index}">${icon("clock")}<span class="detail-row-copy"><strong>${event.title}</strong><p>${event.time} &middot; ${event.duration} &middot; ${event.location}</p></span>${icon("chevron-right")}</button>`).join("");
  }
  openDialog(titles[view], content, "Wednesday, October 7, 2026");
}

function showEvent(index) {
  const event = events[index];
  if (!event) return;
  openDialog(event.title, `<div class="detail-row">${icon("calendar")}<div class="detail-row-copy"><strong>Wednesday, October 7</strong><p>${event.time} &middot; ${event.duration}</p></div></div><div class="detail-row">${icon("map-pin")}<div class="detail-row-copy"><strong>${event.location}</strong></div></div><p class="muted-copy" style="margin:20px 0">${event.description}</p><button class="primary-button" data-action="save-event" data-id="${index}">${icon("plus")} Add to my plans</button>`, "Next up");
}

function showSpaces() {
  window.location.assign("spaces.html");
}

function likeButton(id, count) {
  const liked = state.likes.includes(id);
  return `<button class="like-button" data-action="like" data-id="${id}" data-count="${count}" aria-pressed="${liked}" aria-label="${liked ? "Unlike" : "Like"} post">${icon("heart")}<span>${count + Number(liked)}</span></button>`;
}

function showSpace(name) {
  window.location.assign(`spaces.html?space=${encodeURIComponent(name || "Family")}`);
}

function showCommunity() {
  window.location.assign("community.html");
}

function showNews(category = "all") {
  const filtered = category === "all" ? articles : articles.filter(article => article.id === category);
  openDialog("News", `<div class="detail-tabs" role="tablist" aria-label="News categories">${["all", "travel", "lifestyle", "community"].map(item => `<button role="tab" aria-selected="${category === item}" data-action="news-category" data-id="${item}">${item[0].toUpperCase() + item.slice(1)}</button>`).join("")}</div>${filtered.map(article => `<button class="article-list-item" data-action="article" data-id="${article.id}"><img src="${article.image}" alt=""><span><small>${article.category}</small><strong>${escapeHtml(article.title)}</strong><small>${article.source} &middot; ${article.time}</small></span>${icon("chevron-right")}</button>`).join("")}`, "A little inspiration for your day");
}

function showArticle(id) {
  const article = articles.find(item => item.id === id);
  if (!article) return;
  openDialog(article.title, `<div class="article-heading"><img src="${article.image}" alt=""><div><strong>${article.source}</strong><p class="muted-copy">${article.category} &middot; ${article.time}</p></div></div><div class="article-body">${article.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div><button class="primary-button" data-action="${id === "community" ? "community" : "plans"}">${icon(id === "community" ? "users" : "calendar")}${id === "community" ? "Visit community" : "Make a plan"}</button>`, article.category);
}

function showProfile() {
  window.location.assign("profile.html");
}

function showSettings() {
  window.location.assign("settings.html");
}

function showAgent() {
  window.location.assign("agent.html");
}

function agentReply(message) {
  const history = document.querySelector("#chat-history");
  const userMessage = document.createElement("p");
  userMessage.className = "chat-message is-user";
  userMessage.textContent = message;
  history.append(userMessage);
  let response;
  if (/task|to.do|priorit/i.test(message)) {
    const tasks = state.tasks.filter(task => !task.done);
    response = tasks.length ? `You have ${tasks.length} tasks left today:\n${tasks.map(task => `- ${task.title}`).join("\n")}` : "All your tasks are done. You've made some room in your day.";
  } else if (/calendar|schedule|meeting|today/i.test(message)) {
    response = `Here's your schedule:\n${events.map(event => `${event.time} - ${event.title}`).join("\n")}`;
  } else if (/trip|weekend|plan|suggest/i.test(message)) {
    response = "How about an early morning at Nandi Hills, followed by breakfast with friends? You could also keep it closer to home with a lakeside walk and a relaxed family lunch. Open Plan to add your favorite idea.";
  } else if (/book|flight|goa/i.test(message)) {
    response = "Your Bangalore to Goa flight is confirmed for October 15 at 10:30 AM with IndiGo. Your trip is October 15-18. Have a lovely time!";
  } else {
    response = "I can help with the tasks, calendar, and plans saved in this dashboard. Try asking about today's tasks, your schedule, or a weekend idea. I work locally and don't connect to an AI service.";
  }
  const reply = document.createElement("p");
  reply.className = "chat-message";
  reply.textContent = response;
  history.append(reply);
  history.scrollTop = history.scrollHeight;
}

function showActivity() {
  openDialog("Recent activity", `<button class="detail-row" style="width:100%;text-align:left" data-action="bookings">${icon("plane")}<span class="detail-row-copy"><strong>Booked a flight to Goa</strong><p>2 days ago</p></span>${icon("chevron-right")}</button><button class="detail-row" style="width:100%;text-align:left" data-action="space" data-id="Travel">${icon("users")}<span class="detail-row-copy"><strong>Joined Travel space</strong><p>4 days ago</p></span>${icon("chevron-right")}</button><button class="detail-row" style="width:100%;text-align:left" data-action="space" data-id="Family">${icon("heart")}<span class="detail-row-copy"><strong>Liked a post in Family</strong><p>5 days ago</p></span>${icon("chevron-right")}</button>`, "Little moments, all in one place");
}

function renderNotifications() {
  const target = document.querySelector("#notifications");
  const notifications = [
    { title: "Your flight to Goa is confirmed", time: "2 days ago", icon: "plane", action: "bookings" },
    { title: "Welcome to the Travel space", time: "4 days ago", icon: "users", action: "spaces" },
    { title: "Your weekend plans are waiting", time: "5 days ago", icon: "calendar", action: "plans" }
  ];
  const unread = notifications.some((item, index) => !state.readNotifications.includes(index));
  const notificationButton = document.querySelector(".notification-button");
  notificationButton?.querySelector(".notification-dot")?.toggleAttribute("hidden", !unread || !state.notifications);
  notificationButton?.setAttribute("aria-label", unread && state.notifications ? "Notifications, unread updates" : "Notifications");
  target.innerHTML = `<div class="popover-top"><h2>Notifications</h2><button data-action="mark-read" ${!unread ? "disabled" : ""}>${unread ? "Mark all read" : "All caught up"}</button></div>${state.notifications ? notifications.map((notification, index) => `<button class="notification-row ${state.readNotifications.includes(index) ? "is-read" : ""}" data-action="notification" data-id="${index}" data-target="${notification.action}">${icon(notification.icon)}<span class="result-copy"><strong>${notification.title}</strong><small>${notification.time}</small></span></button>`).join("") : '<p class="empty-state">Notifications are paused.</p>'}`;
}

function searchDashboard() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  closePopovers("search-results");
  const entries = [
    ...["Spaces", "Community", "Agent", "Plan"].map(label => ({ label, type: "Screen", action: label.toLowerCase(), icon: { Spaces: "layers", Community: "users", Agent: "bot", Plan: "calendar" }[label] })),
    ...spaces.map(space => ({ label: space.name, type: "Space", action: "space", id: space.name, icon: space.icon })),
    ...articles.map(article => ({ label: article.title, type: article.category, action: "article", id: article.id, icon: "newspaper" })),
    ...state.tasks.map(task => ({ label: task.title, type: "Task", action: "tasks", icon: "check" })),
    ...state.plans.map(plan => ({ label: plan.title, type: "Plan", action: "plans", icon: "calendar" })),
    { label: "Bangalore to Goa", type: "Booking", action: "bookings", icon: "plane" },
    ...events.map((event, index) => ({ label: event.title, type: event.time, action: "event", id: String(index), icon: "clock" }))
  ];
  const matches = (query ? entries.filter(entry => `${entry.label} ${entry.type}`.toLocaleLowerCase().includes(query)) : entries.slice(0, 4)).slice(0, 8);
  searchResults.innerHTML = `<p class="popover-heading">${query ? "Search results" : "Quick destinations"}</p>${matches.length ? matches.map(entry => `<button class="search-result" data-action="${entry.action}" data-id="${escapeHtml(entry.id || "")}">${icon(entry.icon)}<span class="result-copy"><strong>${escapeHtml(entry.label)}</strong><small>${entry.type}</small></span></button>`).join("") : `<p class="empty-state">No results for &ldquo;${escapeHtml(searchInput.value.trim())}&rdquo;.</p>`}`;
  searchResults.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
}

function handleAction(action, id, trigger) {
  if (["tasks", "bookings", "plans", "events", "calendar", "scheduling"].includes(action)) return showPlanner(action);
  switch (action) {
    case "home": dialog.close(); closePopovers(); break;
    case "close": dialog.close(); break;
    case "plan": showPlanner("bookings"); break;
    case "spaces": showSpaces(); break;
    case "space": showSpace(id); break;
    case "community": showCommunity(); break;
    case "agent": showAgent(); break;
    case "activity": showActivity(); break;
    case "news": showNews(); break;
    case "news-category": showNews(id); break;
    case "article": showArticle(id); break;
    case "event": showEvent(Number(id)); break;
    case "profile": showProfile(); break;
    case "settings": showSettings(); break;
    case "explore":
      openDialog("All screens", `<div class="space-list">${[{ name: "Spaces", icon: "layers", detail: "Your people, together" }, { name: "Community", icon: "users", detail: "Connect with neighbors" }, { name: "Agent", icon: "bot", detail: "A little help with your day" }, { name: "Plan", icon: "calendar", detail: "Make room for what matters" }].map(item => `<button class="space-item" data-action="${item.name.toLowerCase()}">${icon(item.icon)}<span><strong>${item.name}</strong><small>${item.detail}</small></span></button>`).join("")}</div>`);
      break;
    case "save-event": {
      const event = events[Number(id)];
      if (!event) break;
      if (state.plans.some(plan => plan.id === `event-${id}`)) return toast("Already added to your plans.");
      state.plans.push({ id: `event-${id}`, title: event.title, detail: `Oct 7, 2026 at ${event.time}` });
      const saved = saveState();
      updateDashboard();
      if (saved) toast("Added to your plans.");
      break;
    }
    case "remove-plan":
      state.plans = state.plans.filter(plan => plan.id !== id);
      saveState();
      updateDashboard();
      showPlanner("plans");
      break;
    case "like": {
      const liked = state.likes.includes(id);
      state.likes = liked ? state.likes.filter(item => item !== id) : [...state.likes, id];
      saveState();
      trigger.setAttribute("aria-pressed", String(!liked));
      trigger.setAttribute("aria-label", liked ? "Like post" : "Unlike post");
      trigger.querySelector("span").textContent = Number(trigger.dataset.count) + Number(!liked);
      break;
    }
    case "suggestion": agentReply(id); break;
    case "mark-read": state.readNotifications = [0, 1, 2]; saveState(); renderNotifications(); break;
    case "notification":
      if (!state.readNotifications.includes(Number(id))) state.readNotifications.push(Number(id));
      saveState();
      handleAction(trigger.dataset.target);
      break;
  }
}

document.addEventListener("click", event => {
  const insideMenu = Boolean(event.target.closest(".search-wrap, .menu-wrap"));
  const popoverTrigger = event.target.closest("[data-popover]");
  if (popoverTrigger) {
    const popover = document.getElementById(popoverTrigger.dataset.popover);
    const opening = popover.hidden;
    closePopovers();
    if (popover.id === "notifications") renderNotifications();
    popover.hidden = !opening;
    popoverTrigger.setAttribute("aria-expanded", String(opening));
    return;
  }
  const trigger = event.target.closest("[data-action]");
  if (trigger) {
    event.preventDefault();
    handleAction(trigger.dataset.action, trigger.dataset.id, trigger);
  }
  if (!insideMenu) closePopovers();
});

document.addEventListener("change", event => {
  const taskId = event.target.dataset.task;
  if (!taskId) return;
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  task.done = event.target.checked;
  saveState();
  updateDashboard();
});

document.addEventListener("submit", event => {
  const form = event.target;
  if (!["task-form", "plan-form", "settings-form", "agent-form", "space-form"].includes(form.id)) return;
  event.preventDefault();
  const values = new FormData(form);
  if (form.id === "task-form" || form.id === "plan-form") {
    const title = String(values.get("title") || "").trim();
    if (!title) return;
    if (form.id === "task-form") state.tasks.push({ id: `task-${crypto.randomUUID()}`, title, done: false });
    else state.plans.push({ id: `plan-${crypto.randomUUID()}`, title, detail: "Date to be decided" });
    saveState();
    updateDashboard();
    showPlanner(currentView);
    dialogContent.querySelector("input[name=title]").focus();
  } else if (form.id === "settings-form") {
    const name = String(values.get("name") || "").trim();
    if (!name) return;
    state.name = name;
    state.bio = String(values.get("bio") || "").trim();
    state.notifications = values.get("notifications") === "on";
    const saved = saveState();
    updateDashboard();
    dialog.close();
    if (saved) toast("Your profile has been updated.");
  } else if (form.id === "agent-form") {
    const message = String(values.get("message") || "").trim();
    if (!message) return;
    agentReply(message);
    form.reset();
    form.querySelector("input").focus();
  } else if (form.id === "space-form") {
    const message = String(values.get("message") || "").trim();
    if (!message) return;
    const post = document.createElement("article");
    post.className = "post";
    post.innerHTML = `<div class="post-meta"><strong>${escapeHtml(state.name)}</strong><time>Just now &middot; local preview</time></div><p>${escapeHtml(message)}</p>`;
    document.querySelector("#space-messages").append(post);
    form.reset();
    form.querySelector("input").focus();
  }
});

searchInput?.addEventListener("input", searchDashboard);
searchInput?.addEventListener("focus", searchDashboard);
searchInput?.addEventListener("keydown", event => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (searchResults.hidden) searchDashboard();
    searchResults.querySelector("button")?.focus();
  } else if (event.key === "Enter") {
    event.preventDefault();
    searchResults.querySelector("button")?.click();
  }
});

searchResults?.addEventListener("keydown", event => {
  const buttons = [...searchResults.querySelectorAll("button")];
  const index = buttons.indexOf(document.activeElement);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    buttons[(index + 1) % buttons.length]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (index <= 0) searchInput.focus();
    else buttons[index - 1].focus();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (dialog.open) {
      event.preventDefault();
      dialog.close();
      closePopovers();
      return;
    }
    const openPopover = document.querySelector(".popover:not([hidden])");
    if (openPopover) {
      document.querySelector(`[aria-controls="${openPopover.id}"]`)?.focus();
      closePopovers();
    }
  }
  const tab = event.target.closest('[role="tab"]');
  if (tab && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    const target = tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    const action = target.dataset.action;
    const id = target.dataset.id;
    target.click();
    const selector = id ? `[data-action="${action}"][data-id="${id}"]` : `[role="tab"][data-action="${action}"]`;
    dialogContent.querySelector(selector)?.focus();
  }
});

dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});

dialog.addEventListener("close", () => { currentView = "home"; });
updateDashboard();