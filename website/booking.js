"use strict";

const bookingStorageKey = "skyline-bookings-v2";
const bookingTypes = {
  hotels: { label: "Hotels", singular: "Hotel", icon: "bed-double", action: "Book Hotel", image: "image/booking-hotel.jpg" },
  flights: { label: "Flights", singular: "Flight", icon: "plane", action: "Book Flight", image: "image/booking-flight.jpg" },
  trains: { label: "Trains", singular: "Train", icon: "train-front", action: "Book Train", image: "image/booking-train.jpg" },
  bus: { label: "Bus", singular: "Bus", icon: "bus-front", action: "Book Bus" },
  cars: { label: "Rental Cars", singular: "Car", icon: "car-front", action: "Rent a Car" },
  others: { label: "Others", singular: "Other", icon: "ellipsis", action: "Other Booking" }
};
const initialBookings = [
  { id: "goa-trip", type: "hotels", title: "Goa Trip", provider: "Hotel Sea View Resort", date: "2026-10-15", endDate: "2026-10-18", time: "", status: "Confirmed", reference: "GOA-1015", guests: 2, notes: "Sea-view room. Check in from 2:00 PM; check out by 11:00 AM." },
  { id: "delhi-flight", type: "flights", title: "Bangalore to Delhi", provider: "IndiGo 6E 214", date: "2026-10-20", endDate: "", time: "10:30", status: "Confirmed", reference: "6E 214", guests: 1, notes: "Bangalore (BLR) to Delhi (DEL). Confirm check-in and baggage details with the airline." },
  { id: "jaipur-train", type: "trains", title: "Delhi to Jaipur", provider: "Rajasthan Express 12956", date: "2026-10-25", endDate: "", time: "06:45", status: "Pending", reference: "12956", guests: 1, notes: "Confirmation is pending. Check your final ticket status with the rail operator before departure." }
];
const initialExpenses = [
  { id: "expense-flight", title: "Flight tickets", amount: 8450 },
  { id: "expense-hotel", title: "Hotel advance", amount: 6000 }
];
const initialShopping = [
  { id: "shopping-sunscreen", title: "Sunscreen", done: true },
  { id: "shopping-adapter", title: "Travel adapter", done: false },
  { id: "shopping-medicine", title: "Travel medicine kit", done: false }
];

function isBookingDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
}

function loadBookingStore() {
  const emptyStore = { bookings: structuredClone(initialBookings), expenses: structuredClone(initialExpenses), shopping: structuredClone(initialShopping) };
  try {
    const saved = JSON.parse(localStorage.getItem(bookingStorageKey));
    if (!saved || !Array.isArray(saved.bookings)) return emptyStore;
    return {
      bookings: saved.bookings.filter(record => record && Object.hasOwn(bookingTypes, record.type) && typeof record.id === "string" && typeof record.title === "string" && typeof record.provider === "string" && isBookingDate(record.date)).map(record => ({
        ...record,
        endDate: isBookingDate(record.endDate) ? record.endDate : "",
        time: typeof record.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(record.time) ? record.time : "",
        status: record.status === "Confirmed" ? "Confirmed" : "Pending",
        reference: typeof record.reference === "string" ? record.reference : "",
        guests: Number.isInteger(record.guests) && record.guests > 0 ? record.guests : 1,
        notes: typeof record.notes === "string" ? record.notes : ""
      })),
      expenses: Array.isArray(saved.expenses) ? saved.expenses.filter(item => item && typeof item.id === "string" && typeof item.title === "string" && Number.isFinite(item.amount) && item.amount > 0) : [],
      shopping: Array.isArray(saved.shopping) ? saved.shopping.filter(item => item && typeof item.id === "string" && typeof item.title === "string").map(item => ({ ...item, done: Boolean(item.done) })) : []
    };
  } catch {
    return emptyStore;
  }
}

const bookingStore = loadBookingStore();
let activeBookingCategory = "all";
const bookingMain = document.querySelector("#booking-main");
const bookingViewMarkup = bookingMain.innerHTML;
const bookingDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const bookingShortDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const bookingTimeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
const bookingCurrencyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function bookingDateLabel(record) {
  const start = new Date(`${record.date}T12:00:00`);
  if (record.endDate) return `${bookingShortDateFormat.format(start)} &ndash; ${bookingDateFormat.format(new Date(`${record.endDate}T12:00:00`))}`;
  const time = record.time ? ` <span class="date-separator">&middot;</span> ${bookingTimeFormat.format(new Date(`${record.date}T${record.time}:00`))}` : "";
  return bookingDateFormat.format(start) + time;
}

function bookingThumbnail(record) {
  const category = bookingTypes[record.type];
  return category.image
    ? `<img class="booking-photo" src="${category.image}" width="136" height="70" alt="${category.singular} reservation">`
    : `<span class="booking-photo booking-photo-placeholder">${icon(category.icon)}</span>`;
}

function bookingStatus(record) {
  const tone = record.status === "Pending" ? "pending" : record.type === "flights" ? "confirmed-flight" : "confirmed";
  return `<span class="booking-status ${tone}">${record.status}</span>`;
}

function bookingRow(record) {
  return `<button class="booking-item" data-booking-action="details" data-id="${escapeHtml(record.id)}">${bookingThumbnail(record)}<span class="booking-copy"><strong>${escapeHtml(record.title)}</strong><span class="booking-provider">${escapeHtml(record.provider)}</span><span class="booking-date">${icon("calendar")}<span>${bookingDateLabel(record)}</span></span></span>${bookingStatus(record)}${icon("chevron-right").replace('class="icon"', 'class="icon booking-chevron"')}</button>`;
}

function renderBookings() {
  const filtered = bookingStore.bookings.filter(record => activeBookingCategory === "all" || record.type === activeBookingCategory).sort((first, second) => first.date.localeCompare(second.date));
  document.querySelector("#upcoming-heading").textContent = activeBookingCategory === "all" ? "Upcoming Bookings" : `${bookingTypes[activeBookingCategory].singular} Bookings`;
  document.querySelectorAll(".booking-categories > button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.type === activeBookingCategory)));
  document.querySelector("#booking-list").innerHTML = filtered.length
    ? filtered.slice(0, 3).map(bookingRow).join("")
    : `<div class="booking-empty">${icon(activeBookingCategory === "all" ? "calendar" : bookingTypes[activeBookingCategory].icon)}<p>No ${activeBookingCategory === "all" ? "" : bookingTypes[activeBookingCategory].singular.toLowerCase() + " "}bookings yet. Ask your Agent to add one.</p></div>`;
}

function resetBookingFilters() {
  activeBookingCategory = "all";
  renderBookings();
}

function planHeading(title, description, iconName, tone) {
  return `<header class="booking-heading plan-view-heading"><span class="booking-heading-icon plan-view-heading-icon ${tone}">${icon(iconName)}</span><div><h1>${title}</h1><p>${description}</p><span class="agent-managed">Agent managed</span></div></header>`;
}

function summaryCard(iconName, tone, value, label) {
  return `<div class="plan-summary-card"><span class="category-icon ${tone}">${icon(iconName)}</span><span class="plan-summary-copy"><strong>${value}</strong><span>${label}</span></span></div>`;
}

function planRow(iconName, tone, title, detail, status, statusClass = "") {
  return `<article class="plan-data-row"><span class="plan-row-icon ${tone}">${icon(iconName)}</span><span class="plan-row-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></span><span class="plan-row-status ${statusClass}">${escapeHtml(status)}</span></article>`;
}

function renderTasksView() {
  const remaining = state.tasks.filter(task => !task.done);
  const done = state.tasks.length - remaining.length;
  const rows = state.tasks.map((task, index) => planRow(task.done ? "check" : "clipboard-check", task.done ? "calendar-category" : "task-category", task.title, index === 0 ? "Today · High priority" : index === 1 ? "Today · Personal" : "This week · Planning", task.done ? "Done" : index === 0 ? "In progress" : "To do", task.done ? "is-done" : index === 0 ? "is-next" : "")).join("");
  return `${planHeading("Tasks", "Everything your Agent has organized for you.", "clipboard-check", "tasks-tone")}<div class="plan-summary-grid">${summaryCard("clipboard-check", "task-category", remaining.length, "To do")}${summaryCard("clock", "schedule-category", "1", "In progress")}${summaryCard("check", "calendar-category", done, "Completed")}</div><section class="booking-section" aria-labelledby="tasks-view-heading"><div class="booking-section-header"><h2 id="tasks-view-heading">Your Tasks</h2><span class="agent-managed">Updated today</span></div><div class="plan-data-list">${rows}</div></section>`;
}

function renderEventsView() {
  const rows = events.map((event, index) => planRow(index === 0 ? "user" : index === 1 ? "calendar-days" : "map-pin", index === 0 ? "task-category" : index === 1 ? "event-category" : "calendar-category", event.title, `${event.time} · ${event.location}`, index === 0 ? "Next" : event.duration, index === 0 ? "is-next" : "")).join("");
  return `${planHeading("Events", "Upcoming moments, meetings, and gatherings.", "calendar-days", "events-tone")}<div class="plan-summary-grid">${summaryCard("calendar-days", "event-category", "3", "Today")}${summaryCard("user", "task-category", "2", "With people")}${summaryCard("clock", "schedule-category", "4h", "Planned time")}</div><section class="booking-section" aria-labelledby="events-view-heading"><div class="booking-section-header"><h2 id="events-view-heading">Upcoming Events</h2><span class="agent-managed">Oct 8, 2026</span></div><div class="plan-data-list">${rows}</div></section>`;
}

function renderShoppingView() {
  const packed = bookingStore.shopping.filter(item => item.done).length;
  const rows = bookingStore.shopping.map(item => planRow(item.done ? "check" : "shopping-cart", item.done ? "calendar-category" : "shopping-category", item.title, item.done ? "Ready for the trip" : "Added by your Agent", item.done ? "Packed" : "To buy", item.done ? "is-done" : "")).join("");
  return `${planHeading("Shopping", "Your Agent-prepared shopping and packing list.", "shopping-cart", "shopping-tone")}<div class="plan-summary-grid">${summaryCard("shopping-cart", "shopping-category", bookingStore.shopping.length, "Total items")}${summaryCard("check", "calendar-category", packed, "Packed")}${summaryCard("clock", "schedule-category", bookingStore.shopping.length - packed, "To buy")}</div><section class="booking-section" aria-labelledby="shopping-view-heading"><div class="booking-section-header"><h2 id="shopping-view-heading">Shopping List</h2><span class="agent-managed">For your Goa trip</span></div><div class="plan-data-list">${rows}</div></section>`;
}

function renderCalendarView() {
  const calendarItems = [
    { day: "08", month: "Oct", title: "Team call", detail: "10:00 AM · Online", status: "Today" },
    { day: "10", month: "Oct", title: "Weekend trip to Nandi Hills", detail: "6:00 AM · Travel space", status: "Saturday" },
    { day: "11", month: "Oct", title: "Family dinner", detail: "7:00 PM · Home", status: "Sunday" }
  ];
  const rows = calendarItems.map((item, index) => `<article class="plan-data-row"><span class="calendar-date"><strong>${item.day}</strong><span>${item.month}</span></span><span class="plan-row-copy"><strong>${item.title}</strong><span>${item.detail}</span></span><span class="plan-row-status ${index === 0 ? "is-next" : ""}">${item.status}</span></article>`).join("");
  return `${planHeading("Calendar", "A clear view of what is coming next.", "calendar", "calendar-tone")}<div class="plan-summary-grid">${summaryCard("calendar", "calendar-category", "3", "Upcoming")}${summaryCard("clock", "schedule-category", "1", "Today")}${summaryCard("user", "task-category", "2", "Shared plans")}</div><section class="booking-section" aria-labelledby="calendar-view-heading"><div class="booking-section-header"><h2 id="calendar-view-heading">October 2026</h2><span class="agent-managed">Agenda</span></div><div class="plan-data-list">${rows}</div></section>`;
}

function renderSchedulingView() {
  const slots = [
    { title: "Morning focus time", detail: "9:00 AM – 10:00 AM · Available", status: "Open", tone: "calendar-category" },
    { title: "Team call", detail: "10:00 AM – 10:30 AM · Online", status: "Booked", tone: "task-category" },
    { title: "Lunch with friends", detail: "1:00 PM – 2:00 PM · Bangalore", status: "Booked", tone: "event-category" },
    { title: "Afternoon focus time", detail: "3:00 PM – 4:30 PM · Available", status: "Open", tone: "schedule-category" }
  ];
  const rows = slots.map(slot => planRow("clock", slot.tone, slot.title, slot.detail, slot.status, slot.status === "Open" ? "is-done" : "is-next")).join("");
  return `${planHeading("Scheduling", "Your availability and reserved time in one place.", "clock", "scheduling-tone")}<div class="plan-summary-grid">${summaryCard("clock", "schedule-category", "2", "Open slots")}${summaryCard("calendar-days", "event-category", "2", "Booked")}${summaryCard("check", "calendar-category", "6h", "Available")}</div><section class="booking-section" aria-labelledby="scheduling-view-heading"><div class="booking-section-header"><h2 id="scheduling-view-heading">Today’s Schedule</h2><span class="agent-managed">Agent optimized</span></div><div class="plan-data-list">${rows}</div></section>`;
}

function showPlanView(view, updateHash = true) {
  const renderers = { tasks: renderTasksView, events: renderEventsView, shopping: renderShoppingView, calendar: renderCalendarView, scheduling: renderSchedulingView };
  if (view === "booking") {
    bookingMain.innerHTML = bookingViewMarkup;
    renderBookings();
  } else {
    bookingMain.innerHTML = (renderers[view] || renderTasksView)();
  }
  document.querySelectorAll("[data-plan-view]").forEach(button => {
    const current = button.dataset.planView === view;
    button.classList.toggle("is-current", current);
    button.toggleAttribute("aria-current", current);
  });
  bookingMain.focus({ preventScroll: true });
  if (updateHash) history.replaceState(null, "", `#${view}`);
}

function showBookingDetails(id) {
  const record = bookingStore.bookings.find(item => item.id === id);
  if (!record) return;
  openDialog(record.title, `<p class="agent-data-note">${icon("bot")}Added and maintained by your Agent</p><div class="booking-detail-hero">${bookingThumbnail(record)}<div><h3>${escapeHtml(record.provider)}</h3>${bookingStatus(record)}</div></div><dl class="booking-facts"><div><dt>Date</dt><dd>${bookingDateLabel(record)}</dd></div><div><dt>Travelers / guests</dt><dd>${record.guests}</dd></div><div><dt>Reference</dt><dd>${escapeHtml(record.reference || "Not added")}</dd></div></dl>${record.notes ? `<p class="muted-copy">${escapeHtml(record.notes)}</p>` : ""}<div class="booking-dialog-actions"><button class="primary-button" data-booking-action="download" data-id="${escapeHtml(record.id)}">${icon("download")}Download details</button></div>`, `${bookingTypes[record.type].singular} booking`);
}

function renderAllBookings(query = "") {
  const needle = query.trim().toLowerCase();
  const records = bookingStore.bookings.filter(record => `${record.title} ${record.provider} ${record.status} ${bookingTypes[record.type].label}`.toLowerCase().includes(needle)).sort((first, second) => first.date.localeCompare(second.date));
  document.querySelector("#all-bookings-list").innerHTML = records.length ? records.map(bookingRow).join("") : '<p class="empty-state">No bookings found.</p>';
}

function showAllBookings() {
  openDialog("All bookings", `<p class="agent-data-note">${icon("bot")}Your Agent adds and updates these bookings for you</p><input id="booking-search" class="form-input" type="search" aria-label="Search bookings" placeholder="Search bookings..." autocomplete="off"><div id="all-bookings-list" class="booking-dialog-list" aria-live="polite"></div><div class="booking-dialog-actions"><button class="booking-secondary-button" data-booking-action="export">${icon("download")}Export bookings</button></div>`, `${bookingStore.bookings.length} Agent-managed bookings`);
  renderAllBookings();
}

function downloadBookingFile(filename, content, mimeType) {
  const file = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showExpensesAndShopping() {
  const expenseRows = bookingStore.expenses.map(item => `<div class="detail-row">${icon("wallet")}<span class="detail-row-copy"><strong>${escapeHtml(item.title)}</strong><p>${bookingCurrencyFormat.format(item.amount)}</p></span></div>`).join("");
  const shoppingRows = bookingStore.shopping.map(item => `<div class="detail-row">${icon(item.done ? "check" : "shopping-cart")}<span class="detail-row-copy"><strong>${escapeHtml(item.title)}</strong></span><span class="shopping-state">${item.done ? "Packed" : "To buy"}</span></div>`).join("");
  const total = bookingCurrencyFormat.format(bookingStore.expenses.reduce((sum, item) => sum + item.amount, 0));
  openDialog("Expenses & Shopping", `<p class="agent-data-note">${icon("bot")}Your Agent keeps this information up to date</p><div class="booking-combined-grid"><section class="booking-combined-panel"><h3>Expenses</h3><div class="booking-side-list">${expenseRows || '<p class="empty-state">No expenses recorded yet.</p>'}</div><div class="booking-total"><span>Total</span><strong>${total}</strong></div></section><section class="booking-combined-panel"><h3>Shopping</h3><div class="booking-side-list">${shoppingRows || '<p class="empty-state">Your shopping list is empty.</p>'}</div></section></div>`, "Plan spending and essentials together");
}

document.addEventListener("bookings:reset", resetBookingFilters);

document.addEventListener("click", event => {
  const planViewTrigger = event.target.closest("[data-plan-view]");
  if (planViewTrigger) {
    event.preventDefault();
    showPlanView(planViewTrigger.dataset.planView);
    return;
  }
  const trigger = event.target.closest("[data-booking-action]");
  if (!trigger) return;
  event.preventDefault();
  const { bookingAction, type, id } = trigger.dataset;
  switch (bookingAction) {
    case "reset": resetBookingFilters(); break;
    case "filter":
      activeBookingCategory = activeBookingCategory === type ? "all" : type;
      renderBookings();
      break;
    case "details": showBookingDetails(id); break;
    case "view-all": showAllBookings(); break;
    case "expenses-shopping": showExpensesAndShopping(); break;
    case "export": downloadBookingFile("skyline-bookings.json", JSON.stringify(bookingStore.bookings, null, 2), "application/json"); break;
    case "download": {
      const record = bookingStore.bookings.find(item => item.id === id);
      if (!record) break;
      const summary = ["SKYLINE | BOOKING DETAILS", "", record.title, record.provider, `Date: ${record.date}${record.endDate ? ` to ${record.endDate}` : ""}`, `Time: ${record.time || "Not specified"}`, `Travelers / guests: ${record.guests}`, `Status: ${record.status}`, `Reference: ${record.reference || "Not added"}`, "", record.notes, "", "Saved record only. Not a travel ticket or provider confirmation."].join("\n");
      downloadBookingFile("skyline-booking.txt", summary, "text/plain;charset=utf-8");
      break;
    }
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "booking-search") renderAllBookings(event.target.value);
});

const planViews = ["tasks", "booking", "events", "shopping", "calendar", "scheduling"];
function syncPlanViewFromHash() {
  const view = location.hash.slice(1);
  if (planViews.includes(view)) showPlanView(view, false);
}
showPlanView(planViews.includes(location.hash.slice(1)) ? location.hash.slice(1) : "booking", false);
window.addEventListener("hashchange", syncPlanViewFromHash);
window.addEventListener("pageshow", syncPlanViewFromHash);