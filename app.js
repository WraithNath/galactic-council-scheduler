// Galactic Council Scheduler: find a weekend everyone can play Twilight Imperium.

const FIREBASE_VERSION = "10.12.2";

const FACTIONS = [
  "The Arborec", "The Barony of Letnev", "The Clan of Saar", "The Embers of Muaat",
  "The Emirates of Hacan", "The Federation of Sol", "The Ghosts of Creuss",
  "The L1Z1X Mindnet", "The Mentak Coalition", "The Naalu Collective",
  "The Nekro Virus", "Sardakk N'orr", "The Universities of Jol-Nar", "The Winnu",
  "The Xxcha Kingdom", "The Yin Brotherhood", "The Yssaril Tribes",
  "The Argent Flight", "The Empyrean", "The Mahact Gene-Sorcerers",
  "The Naaz-Rokha Alliance", "The Nomad", "The Titans of Ul", "The Vuil'raith Cabal",
  "The Council Keleres",
];

const SIGIL_COLORS = [
  "#5fd39a", "#e5616b", "#59c8e0", "#f0b34a", "#b48cf2", "#f28cc4",
  "#8cd3f2", "#d4a84b", "#9ad35f", "#f2a05f", "#7f9cf2", "#e0e0e0",
];

const STATES = ["unset", "yes", "maybe", "no"];
const GLYPH = { unset: "·", yes: "✓", maybe: "?", no: "✕" };
const STATE_LABEL = { unset: "not answered", yes: "available", maybe: "maybe", no: "unavailable" };

// ---------- Storage adapters ----------

function makeId(len = 10) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

class LocalStore {
  constructor() {
    this.listeners = new Set();
    window.addEventListener("storage", (e) => {
      if (e.key && e.key.startsWith("ti-sched:")) this.emit();
    });
  }
  key(id) { return "ti-sched:" + id; }
  read(id) {
    try { return JSON.parse(localStorage.getItem(this.key(id))); } catch { return null; }
  }
  write(id, data) {
    localStorage.setItem(this.key(id), JSON.stringify(data));
    this.emit();
  }
  emit() { this.listeners.forEach((fn) => fn()); }
  watch(fn) { this.listeners.add(fn); fn(); return () => this.listeners.delete(fn); }

  async createGame(game) {
    const id = makeId();
    this.write(id, { game, players: {} });
    return id;
  }
  subscribeGame(id, cb) { return this.watch(() => cb(this.read(id)?.game ?? null)); }
  subscribePlayers(id, cb) {
    return this.watch(() => cb(Object.values(this.read(id)?.players ?? {})));
  }
  async updateGame(id, patch) {
    const d = this.read(id); if (!d) return;
    Object.assign(d.game, patch); this.write(id, d);
  }
  async savePlayer(id, player) {
    const d = this.read(id); if (!d) return;
    d.players[player.id] = player; this.write(id, d);
  }
  async deletePlayer(id, pid) {
    const d = this.read(id); if (!d) return;
    delete d.players[pid]; this.write(id, d);
  }
}

class FirebaseStore {
  async init(config) {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const { initializeApp } = await import(`${base}/firebase-app.js`);
    this.fs = await import(`${base}/firebase-firestore.js`);
    this.db = this.fs.getFirestore(initializeApp(config));
  }
  gameRef(id) { return this.fs.doc(this.db, "games", id); }
  playersCol(id) { return this.fs.collection(this.db, "games", id, "players"); }

  async createGame(game) {
    const id = makeId();
    await this.fs.setDoc(this.gameRef(id), game);
    return id;
  }
  subscribeGame(id, cb) {
    return this.fs.onSnapshot(this.gameRef(id), (s) => cb(s.exists() ? s.data() : null),
      (err) => { console.error(err); toast("Could not reach the database."); });
  }
  subscribePlayers(id, cb) {
    return this.fs.onSnapshot(this.playersCol(id), (s) => cb(s.docs.map((d) => d.data())),
      (err) => console.error(err));
  }
  updateGame(id, patch) { return this.fs.updateDoc(this.gameRef(id), patch); }
  savePlayer(id, player) { return this.fs.setDoc(this.fs.doc(this.playersCol(id), player.id), player); }
  deletePlayer(id, pid) { return this.fs.deleteDoc(this.fs.doc(this.playersCol(id), pid)); }
}

// ---------- Dates ----------

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function saturdayOnOrAfter(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, (6 - x.getDay() + 7) % 7);
}

function weekendsFor(game) {
  const todayISO = toISO(new Date());
  const first = saturdayOnOrAfter(fromISO(game.start));
  const out = [];
  for (let i = 0; i < game.weeks; i++) {
    const sat = addDays(first, i * 7);
    const sun = addDays(sat, 1);
    if (toISO(sun) < todayISO) continue;
    out.push({ sat: toISO(sat), sun: toISO(sun) });
  }
  return out;
}

const fmt = (iso, opts) => fromISO(iso).toLocaleDateString(undefined, opts);
const shortDay = (iso) => fmt(iso, { weekday: "short" });
const longDate = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
const medDate = (iso) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });

// ---------- Helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.role = "status"; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function sigilColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SIGIL_COLORS[h % SIGIL_COLORS.length];
}

const listNames = (ps) => {
  const names = ps.map((p) => p.name);
  return names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names.at(-1);
};

// ---------- Summary ----------

function summarise(weekends, players) {
  const days = weekends.flatMap((w) => [w.sat, w.sun]);
  const stats = days.map((iso) => {
    const by = { yes: [], maybe: [], no: [], unset: [] };
    players.forEach((p) => by[p.days?.[iso] ?? "unset"].push(p));
    return { iso, ...by, allIn: players.length > 0 && by.yes.length === players.length };
  });
  const byISO = Object.fromEntries(stats.map((s) => [s.iso, s]));
  const allIn = stats.filter((s) => s.allIn);
  const fullWeekends = weekends.filter((w) => byISO[w.sat].allIn && byISO[w.sun].allIn);
  // Possible = nobody has said no, and at least one is a maybe / unanswered.
  const possible = stats.filter((s) => !s.allIn && s.no.length === 0 && s.yes.length > 0);
  const closest = [...stats].sort((a, b) =>
    b.yes.length - a.yes.length || b.maybe.length - a.maybe.length ||
    a.no.length - b.no.length || a.iso.localeCompare(b.iso));
  return { stats, byISO, allIn, fullWeekends, possible, closest };
}

// ---------- App ----------

const app = $("#app");
let store;
let unsub = [];
let state = { id: null, game: null, players: [], editing: null };

async function boot() {
  const cfg = window.FIREBASE_CONFIG;
  if (cfg) {
    try {
      store = new FirebaseStore();
      await store.init(cfg);
    } catch (err) {
      console.error(err);
      store = new LocalStore();
      showBanner("Could not connect to Firebase, so this is running in local-only mode. Check config.js.");
    }
  } else {
    store = new LocalStore();
    showBanner("Local-only mode: games are saved in this browser only. Add your Firebase config to config.js so other players can join. See README.md.");
  }
  window.addEventListener("hashchange", route);
  route();
}

function showBanner(msg) {
  const b = $("#mode-banner");
  b.textContent = msg; b.hidden = false;
}

function route() {
  unsub.forEach((fn) => fn && fn()); unsub = [];
  const id = location.hash.replace(/^#\/?/, "").trim();
  if (!id) return renderLanding();
  state = { id, game: undefined, players: [], editing: null };
  app.innerHTML = `<section class="panel"><p class="muted">Contacting Mecatol Rex…</p></section>`;
  unsub.push(store.subscribeGame(id, (g) => { state.game = g; render(); }));
  unsub.push(store.subscribePlayers(id, (ps) => {
    state.players = ps.sort((a, b) => (a.joined ?? 0) - (b.joined ?? 0));
    render();
  }));
}

function renderLanding() {
  app.innerHTML = "";
  app.appendChild($("#tpl-landing").content.cloneNode(true));
  const form = $("#create-form");
  form.start.value = toISO(saturdayOnOrAfter(new Date()));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const id = await store.createGame({
        title: form.title.value.trim(),
        start: toISO(saturdayOnOrAfter(fromISO(form.start.value))),
        weeks: Math.min(26, Math.max(1, Number(form.weeks.value) || 12)),
        created: Date.now(),
      });
      location.hash = id;
    } catch (err) {
      console.error(err); toast("Could not create the game."); btn.disabled = false;
    }
  });
}

function render() {
  if (state.game === undefined) return;
  if (state.game === null) {
    app.innerHTML = `
      <section class="panel landing">
        <h2>Council not found</h2>
        <p class="muted">No game exists at this link. It may have been created in another browser while in local-only mode.</p>
        <a class="btn" href="#">Convene a new council</a>
      </section>`;
    return;
  }
  // Keep the join form's typed values across live re-renders.
  const form = $("#join-form");
  const draft = form ? { name: form.name.value, faction: form.faction.value } : null;
  const focusedId = document.activeElement?.dataset?.focusKey;

  const weekends = weekendsFor(state.game);
  const sum = summarise(weekends, state.players);
  app.innerHTML = headerHTML(weekends) + verdictHTML(sum) + joinHTML() + matrixHTML(weekends, sum);

  if (draft && !state.editingJustSet) {
    const f = $("#join-form");
    f.name.value = draft.name; f.faction.value = draft.faction;
  }
  state.editingJustSet = false;
  if (focusedId) document.querySelector(`[data-focus-key="${focusedId}"]`)?.focus();
  bind();
}

function headerHTML(weekends) {
  const g = state.game;
  const range = weekends.length
    ? `${medDate(weekends[0].sat)} to ${medDate(weekends.at(-1).sun)}`
    : "No upcoming weekends";
  return `
    <section class="panel game-head">
      <div>
        <h2>${esc(g.title)}</h2>
        <div class="meta">${weekends.length} weekend${weekends.length === 1 ? "" : "s"} · ${range} · ${state.players.length} player${state.players.length === 1 ? "" : "s"}</div>
      </div>
      <div class="actions">
        <button class="btn" id="share-btn" type="button">Copy invite link</button>
        <button class="btn ghost" id="extend-btn" type="button">+4 weekends</button>
        <a class="btn ghost" href="#">New game</a>
      </div>
    </section>`;
}

function verdictHTML(sum) {
  const n = state.players.length;
  let cls, glyph, label, date, sub, extra = "";

  if (n === 0) {
    cls = "empty"; glyph = "?"; label = "Awaiting the Council";
    date = "No players yet"; sub = "Add the first player below to start finding a date.";
  } else if (sum.allIn.length) {
    const best = sum.fullWeekends.length ? sum.byISO[sum.fullWeekends[0].sat] : sum.allIn[0];
    cls = "found"; glyph = "✓"; label = "The Council convenes";
    date = longDate(best.iso);
    sub = `All ${n} player${n === 1 ? " is" : "s are"} available.`;
    if (sum.fullWeekends.length) {
      extra += `<div><h3>Full weekends free: room for a two-day game</h3><div class="chips">${
        sum.fullWeekends.map((w) => `<span class="chip gold">${medDate(w.sat)} and ${medDate(w.sun)}</span>`).join("")
      }</div></div>`;
    }
    const others = sum.allIn.filter((s) => s.iso !== best.iso);
    if (others.length) {
      extra += `<div><h3>Other dates everyone can make</h3><div class="chips">${
        others.map((s) => `<span class="chip yes">${medDate(s.iso)}</span>`).join("")
      }</div></div>`;
    }
  } else if (sum.possible.length) {
    const best = [...sum.possible].sort((a, b) => b.yes.length - a.yes.length || a.iso.localeCompare(b.iso))[0];
    const pending = [...best.maybe, ...best.unset];
    cls = "partial"; glyph = "?"; label = "Possible, waiting on answers";
    date = longDate(best.iso);
    sub = `${best.yes.length} of ${n} confirmed and nobody has said no. Waiting on ${esc(listNames(pending))}.`;
    if (sum.possible.length > 1) {
      extra = `<div><h3>Also still possible</h3><div class="chips">${
        sum.possible.filter((s) => s !== best).map((s) => `<span class="chip">${medDate(s.iso)}</span>`).join("")
      }</div></div>`;
    }
  } else {
    const c = sum.closest[0];
    cls = "none"; glyph = "✕"; label = "No date unites the Council yet";
    date = c ? `Closest: ${longDate(c.iso)}` : "No upcoming weekends";
    sub = c ? `${c.yes.length} of ${n} available. Missing ${esc(listNames([...c.no, ...c.maybe, ...c.unset]))}.` : "Extend the date range to add more weekends.";
    const next = sum.closest.slice(1).filter((s) => s.yes.length > 0).slice(0, 4);
    if (next.length) {
      extra = `<div><h3>Next closest</h3><div class="chips">${
        next.map((s) => `<span class="chip">${medDate(s.iso)}: ${s.yes.length}/${n}</span>`).join("")
      }</div></div>`;
    }
  }

  return `
    <section class="panel verdict ${cls}" aria-live="polite">
      <div class="verdict-main">
        <div class="verdict-glyph" aria-hidden="true">${glyph}</div>
        <div>
          <p class="verdict-label">${label}</p>
          <p class="verdict-date">${date}</p>
          <p class="verdict-sub">${sub}</p>
        </div>
      </div>
      ${extra}
    </section>`;
}

function joinHTML() {
  const editing = state.players.find((p) => p.id === state.editing);
  const opts = ['<option value="">No faction chosen</option>',
    ...FACTIONS.map((f) => `<option${editing?.faction === f ? " selected" : ""}>${esc(f)}</option>`)].join("");
  return `
    <section class="panel">
      <h2>${editing ? `Edit ${esc(editing.name)}` : "Take a seat at the table"}</h2>
      <form id="join-form" class="join-grid">
        <label>Player name
          <input name="name" required maxlength="30" autocomplete="off" placeholder="Your name" value="${esc(editing?.name ?? "")}">
        </label>
        <label>Preferred faction
          <select name="faction">${opts}</select>
        </label>
        <div class="actions">
          <button class="btn primary" type="submit">${editing ? "Save" : "Join the Council"}</button>
          ${editing ? '<button class="btn ghost" type="button" id="cancel-edit">Cancel</button>' : ""}
        </div>
      </form>
    </section>`;
}

function matrixHTML(weekends, sum) {
  const n = state.players.length;
  if (!weekends.length) {
    return `<section class="panel"><h2>Availability</h2><p class="empty-state">All weekends in this game have passed. Use “+4 weekends” to add more.</p></section>`;
  }
  const days = weekends.flatMap((w) => [w.sat, w.sun]);
  const head1 = weekends.map((w) =>
    `<th class="weekend" colspan="2">${fmt(w.sat, { day: "numeric", month: "short" })}</th>`).join("");
  const head2 = days.map((iso) =>
    `<th class="day${sum.byISO[iso].allIn ? " all-in" : ""}">${shortDay(iso)}<span class="num">${fromISO(iso).getDate()}</span></th>`).join("");

  const rows = state.players.map((p) => {
    const cells = days.map((iso) => {
      const s = p.days?.[iso] ?? "unset";
      return `<td><button class="cell ${s}" type="button" data-pid="${esc(p.id)}" data-day="${iso}"
        data-focus-key="${esc(p.id)}-${iso}"
        aria-label="${esc(p.name)}, ${longDate(iso)}: ${STATE_LABEL[s]}. Click to change.">${GLYPH[s]}</button></td>`;
    }).join("");
    return `
      <tr>
        <td class="player">
          <div class="player-cell">
            <span class="sigil" style="background:${sigilColor(p.faction || p.name)}" aria-hidden="true">${esc(p.name.slice(0, 1).toUpperCase())}</span>
            <span><span class="player-name">${esc(p.name)}</span><span class="player-faction">${esc(p.faction || "Faction undecided")}</span></span>
            <span class="row-tools">
              <button class="icon-btn" type="button" data-fill="${esc(p.id)}" title="Mark every day available" aria-label="Mark ${esc(p.name)} available every day">✓✓</button>
              <button class="icon-btn" type="button" data-edit="${esc(p.id)}" title="Edit player" aria-label="Edit ${esc(p.name)}">✎</button>
              <button class="icon-btn" type="button" data-del="${esc(p.id)}" title="Remove player" aria-label="Remove ${esc(p.name)}">✕</button>
            </span>
          </div>
        </td>${cells}
      </tr>`;
  }).join("");

  const totals = days.map((iso) => {
    const s = sum.byISO[iso];
    return `<td class="${s.allIn ? "all-in" : ""}">${s.yes.length}/${n}</td>`;
  }).join("");

  return `
    <section class="panel">
      <h2>Availability</h2>
      ${n === 0 ? '<p class="empty-state">No players yet. Join the Council above, then click the days you can play.</p>' : `
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr><th></th>${head1}</tr>
            <tr><th></th>${head2}</tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td class="label">Available</td>${totals}</tr></tfoot>
        </table>
      </div>
      <div class="legend">
        <span>Click a day to cycle:</span>
        <span><i class="swatch yes"></i>Available</span>
        <span><i class="swatch maybe"></i>Maybe</span>
        <span><i class="swatch no"></i>Unavailable</span>
        <span><i class="swatch unset"></i>Not answered</span>
      </div>`}
    </section>`;
}

function bind() {
  $("#share-btn")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); toast("Invite link copied."); }
    catch { prompt("Copy this link:", location.href); }
  });

  $("#extend-btn")?.addEventListener("click", () => {
    store.updateGame(state.id, { weeks: Math.min(52, state.game.weeks + 4) });
  });

  $("#join-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    if (!name) return;
    const existing = state.players.find((p) => p.id === state.editing);
    const player = existing
      ? { ...existing, name, faction: f.faction.value }
      : { id: makeId(8), name, faction: f.faction.value, days: {}, joined: Date.now() };
    f.reset();
    state.editing = null; state.editingJustSet = true;
    await store.savePlayer(state.id, player);
    if (!existing) toast(`${name} has joined the Council.`);
  });

  $("#cancel-edit")?.addEventListener("click", () => {
    state.editing = null; state.editingJustSet = true; render();
  });

  app.querySelectorAll(".cell").forEach((btn) => btn.addEventListener("click", () => {
    const p = state.players.find((x) => x.id === btn.dataset.pid);
    if (!p) return;
    const cur = p.days?.[btn.dataset.day] ?? "unset";
    const next = STATES[(STATES.indexOf(cur) + 1) % STATES.length];
    const days = { ...p.days };
    if (next === "unset") delete days[btn.dataset.day]; else days[btn.dataset.day] = next;
    store.savePlayer(state.id, { ...p, days });
  }));

  app.querySelectorAll("[data-fill]").forEach((btn) => btn.addEventListener("click", () => {
    const p = state.players.find((x) => x.id === btn.dataset.fill);
    if (!p) return;
    const days = { ...p.days };
    weekendsFor(state.game).forEach((w) => { days[w.sat] = "yes"; days[w.sun] = "yes"; });
    store.savePlayer(state.id, { ...p, days });
  }));

  app.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => {
    state.editing = btn.dataset.edit; state.editingJustSet = true; render();
    $("#join-form").name.focus();
  }));

  app.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => {
    const p = state.players.find((x) => x.id === btn.dataset.del);
    if (p && confirm(`Remove ${p.name} from the Council?`)) store.deletePlayer(state.id, p.id);
  }));
}

boot();
