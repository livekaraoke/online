(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const db = window.LK?.db || window.db || (window.firebase?.firestore ? firebase.firestore() : null);
  const auth = window.LK?.auth || (window.firebase?.auth ? firebase.auth() : null);

  let currentUser = null;
  let monthCursor = new Date();
  monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  let selectedDate = localDateKey(new Date());
  let events = [];
  let reminders = [];
  let notes = [];
  const unsubs = [];
  const errors = new Map();

  function localDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
    const date = new Date(String(value) + "T12:00:00");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function itemDate(item) {
    return item.date || "";
  }

  function itemTime(item) {
    return item.time || "";
  }

  function itemSort(a, b) {
    const da = itemDate(a) || "9999-12-31";
    const dbv = itemDate(b) || "9999-12-31";
    if (da !== dbv) return da.localeCompare(dbv);
    return (itemTime(a) || "99:99").localeCompare(itemTime(b) || "99:99") || a.title.localeCompare(b.title);
  }

  function makeItems() {
    const out = [];

    if ($("showEvents")?.checked !== false) {
      events.forEach(event => {
        if (!event.date) return;
        out.push({
          kind: "event",
          id: event.id,
          date: event.date,
          time: event.startTime || "",
          title: event.name || event.type || "Untitled event",
          detail: [event.type, event.venue, event.status].filter(Boolean).join(" • "),
          href: "upcoming-events.html"
        });
      });
    }

    if ($("showReminders")?.checked !== false) {
      reminders.forEach(reminder => {
        if (!reminder.date) return;
        out.push({
          kind: "reminder",
          id: reminder.id,
          date: reminder.date,
          time: reminder.time || "",
          title: reminder.text || "Reminder",
          detail: [reminder.category, reminder.priority ? reminder.priority + " priority" : "", reminder.status].filter(Boolean).join(" • "),
          href: "reminders.html"
        });
      });
    }

    if ($("showNotes")?.checked !== false) {
      notes.forEach(note => {
        const date = note.scheduledDate || "";
        if (!date) return;
        out.push({
          kind: "note",
          id: note.id,
          date,
          time: note.scheduledTime || "",
          title: note.title || "Untitled note",
          detail: Array.isArray(note.categories) ? note.categories.join(" • ") : "",
          href: "notes.html?id=" + encodeURIComponent(note.id)
        });
      });
    }

    return out.sort(itemSort);
  }

  function monthText(date) {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  function selectedDateText(value) {
    const date = parseDateKey(value);
    if (!date) return value || "Selected date";
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function createMiniItem(item) {
    const span = document.createElement("span");
    span.className = "calendar-mini-item " + item.kind;
    span.textContent = (item.time ? item.time + " " : "") + item.title;
    return span;
  }

  function renderCalendar() {
    const grid = $("calendarGrid");
    if (!grid) return;

    const items = makeItems();
    const byDate = new Map();
    items.forEach(item => {
      if (!byDate.has(item.date)) byDate.set(item.date, []);
      byDate.get(item.date).push(item);
    });

    $("calendarMonthLabel").textContent = monthText(monthCursor);
    grid.replaceChildren();

    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - mondayOffset);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
    const today = localDateKey(new Date());

    for (let i = 0; i < cells; i++) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const key = localDateKey(date);
      const dayItems = byDate.get(key) || [];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      if (date.getMonth() !== month) button.classList.add("outside");
      if (key === today) button.classList.add("today");
      if (key === selectedDate) button.classList.add("selected");
      button.dataset.date = key;
      button.setAttribute("aria-label", selectedDateText(key) + (dayItems.length ? ", " + dayItems.length + " scheduled item" + (dayItems.length === 1 ? "" : "s") : ""));

      const head = document.createElement("span");
      head.className = "calendar-day-number";
      const number = document.createElement("span");
      number.textContent = String(date.getDate());
      head.append(number);
      if (dayItems.length) {
        const count = document.createElement("span");
        count.className = "calendar-day-count";
        count.textContent = String(dayItems.length);
        head.append(count);
      }
      button.append(head);

      if (dayItems.length) {
        const list = document.createElement("span");
        list.className = "calendar-day-items";
        dayItems.slice(0, 3).forEach(item => list.append(createMiniItem(item)));
        if (dayItems.length > 3) {
          const more = document.createElement("span");
          more.className = "calendar-more";
          more.textContent = "+" + (dayItems.length - 3) + " more";
          list.append(more);
        }
        button.append(list);
      }

      button.onclick = () => {
        selectedDate = key;
        if (date.getMonth() !== month || date.getFullYear() !== year) {
          monthCursor = new Date(date.getFullYear(), date.getMonth(), 1);
        }
        render();
      };
      grid.append(button);
    }

    const monthPrefix = String(year) + "-" + String(month + 1).padStart(2, "0") + "-";
    const count = items.filter(item => item.date.startsWith(monthPrefix)).length;
    const unscheduledNotes = notes.filter(note => !note.scheduledDate).length;
    const unscheduledReminders = reminders.filter(reminder => !reminder.date).length;
    const parts = [count + " scheduled item" + (count === 1 ? "" : "s") + " this month"];
    if (unscheduledReminders) parts.push(unscheduledReminders + " reminder" + (unscheduledReminders === 1 ? "" : "s") + " without a date");
    if (unscheduledNotes) parts.push(unscheduledNotes + " note" + (unscheduledNotes === 1 ? "" : "s") + " without a date");
    $("calendarStatus").textContent = errors.size ? Array.from(errors.values()).join(" ") : parts.join(" • ");
    $("calendarStatus").classList.toggle("error", errors.size > 0);
  }

  function renderAgenda() {
    const list = $("calendarAgenda");
    if (!list) return;

    const items = makeItems().filter(item => item.date === selectedDate);
    $("calendarSelectedTitle").textContent = selectedDateText(selectedDate);
    $("calendarSelectedSummary").textContent = items.length
      ? items.length + " scheduled item" + (items.length === 1 ? "" : "s")
      : "Nothing scheduled";

    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "calendar-empty";
      empty.textContent = "No gigs, reminders or notes are scheduled for this date.";
      list.append(empty);
      return;
    }

    items.forEach(item => {
      const link = document.createElement("a");
      link.className = "calendar-agenda-item";
      link.href = item.href;

      const time = document.createElement("span");
      time.className = "calendar-agenda-time";
      time.textContent = item.time || "Any time";

      const copy = document.createElement("span");
      copy.className = "calendar-agenda-copy";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const detail = document.createElement("small");
      detail.textContent = item.detail || (item.kind === "note" ? "Scheduled note" : item.kind);
      copy.append(title, detail);

      const kind = document.createElement("span");
      kind.className = "calendar-kind " + item.kind;
      kind.textContent = item.kind === "event" ? "Gig / Event" : item.kind;

      link.append(time, copy, kind);
      list.append(link);
    });
  }

  function render() {
    renderCalendar();
    renderAgenda();
  }

  function clearListeners() {
    while (unsubs.length) {
      try { unsubs.pop()(); } catch (_) {}
    }
  }

  function trackError(key, error) {
    console.error(key + " calendar listener failed", error);
    errors.set(key, key + " could not be loaded.");
    render();
  }

  function subscribe(user) {
    clearListeners();
    errors.clear();

    unsubs.push(db.collection("upcomingEvents").onSnapshot(snapshot => {
      errors.delete("Gigs & Events");
      events = snapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data() || {}));
      render();
    }, error => trackError("Gigs & Events", error)));

    unsubs.push(db.collection("reminders").where("createdBy", "==", user.uid).onSnapshot(snapshot => {
      errors.delete("Reminders");
      reminders = snapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data() || {}));
      render();
    }, error => trackError("Reminders", error)));

    unsubs.push(db.collection("notes").onSnapshot(snapshot => {
      errors.delete("Notes");
      notes = snapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data() || {}));
      render();
    }, error => trackError("Notes", error)));
  }

  function bind() {
    window.LK?.sidebar?.loadSidebar?.();

    $("calendarPrev").onclick = () => {
      monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
      render();
    };
    $("calendarNext").onclick = () => {
      monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
      render();
    };
    $("calendarToday").onclick = () => {
      const now = new Date();
      monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      selectedDate = localDateKey(now);
      render();
    };
    $("calendarNewNote").onclick = () => {
      location.href = "notes.html?date=" + encodeURIComponent(selectedDate);
    };
    ["showEvents", "showReminders", "showNotes"].forEach(id => $(id).addEventListener("change", render));

    auth?.onAuthStateChanged(user => {
      currentUser = user;
      if (!user) {
        clearListeners();
        location.replace("admin.html");
        return;
      }
      subscribe(user);
    });

    window.addEventListener("pagehide", clearListeners);
    render();
  }

  if (!db || !auth) {
    const status = $("calendarStatus");
    if (status) {
      status.textContent = "Calendar could not connect to LiveSuite data.";
      status.classList.add("error");
    }
    return;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
