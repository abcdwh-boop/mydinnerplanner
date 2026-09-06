/* ══ 저녁 식탁 ══ 로컬 저장 웹앱 */

const KEY = "dinner-v2";
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const SLOTS = [["soup", "국"], ["main", "메인"], ["side", "곁들임"]];
const KINDS = [["soup", "국"], ["main", "메인"], ["side", "곁들임"]];
const UNITS = ["개", "g", "봉", "모", "통", "팩", "대", "판", "병", "마리", "토막", "포기", "상자", "컵", "큰술"];
const CATS = Object.keys(SHELF);

const FRESH = {
  v: 2, weekStart: null, plan: null, fridge: [], checked: {}, extra: [],
  trash: [], loved: [], excluded: [], custom: [], edits: {}, prices: {},
  lastBackup: null, archive: [], settings: { sideDay: "수", outDay: "금", people: 3 },
};

let S = loadState();
let V = { screen: "home", open: null, picker: null, form: null, sub: "list", openRec: null, openWeek: null };
let prevScreen = "home";

function loadState() {
  const base = JSON.parse(JSON.stringify(FRESH));   // 배열·객체까지 새로 만든다
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const got = JSON.parse(raw) || {};
    const s = Object.assign(base, got);
    // 중첩 객체는 항목 단위로 합쳐야 나중에 설정을 추가해도 undefined가 안 생긴다
    s.settings = Object.assign({}, FRESH.settings, got.settings || {});
    ["fridge", "extra", "trash", "loved", "excluded", "custom", "archive"]
      .forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
    ["checked", "edits", "prices"].forEach((k) => { if (!s[k] || typeof s[k] !== "object") s[k] = {}; });
    return s;
  } catch (e) { return base; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ── 날짜 ── */
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const today = () => iso(new Date());
function mondayOf(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); }
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const lab = (s) => { const d = new Date(s + "T00:00:00"); return (d.getMonth() + 1) + "." + d.getDate(); };
const gap = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const leftOf = (f) => (SHELF[f.c] || 7) - gap(f.bought, today());
const todayIdx = () => (new Date().getDay() + 6) % 7;

/* ── 메뉴 조회 (기본 + 내가 만든 것 + 수정분) ── */
const FALLBACK = { id: "?", name: "비어 있음", min: 0, ing: [], s: [] };
function rawAll() { return SOUPS.concat(MAINS, SIDES, S.custom); }
function getR(id) {
  const base = rawAll().find((r) => r.id === id);
  if (!base) return FALLBACK;
  return S.edits[id] ? Object.assign({}, base, S.edits[id]) : base;
}
function pool(kind) {
  const base = kind === "soup" ? SOUPS : kind === "main" ? MAINS : SIDES;
  return base.concat(S.custom.filter((c) => c.kind === kind)).map((r) => getR(r.id));
}
const kindOf = (id) => (SOUPS.some((r) => r.id === id) ? "soup" : MAINS.some((r) => r.id === id) ? "main"
  : SIDES.some((r) => r.id === id) ? "side" : (S.custom.find((c) => c.id === id) || {}).kind || "main");

/* ── 돈 ── */
const priceOf = (n) => (S.prices[n] !== undefined ? S.prices[n] : (BASE_PRICES[n] || 0));
const inBudget = (c) => NO_BUDGET.indexOf(c) === -1;
function qtyFor(i) { return i.u === "g" ? Math.round((i.q * S.settings.people / 3) / 50) * 50 : i.q; }
function costOf(r) {
  return (r.ing || []).reduce((a, i) => a + (inBudget(i.c) ? priceOf(i.n) * qtyFor(i) : 0), 0);
}
const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";

/* ── 별점 ── */
function ratingOf(id) {
  const xs = [];
  S.archive.forEach((w) => DAYS.forEach((d) => {
    const p = w.days[d];
    if (p && p.rating && (p.main === id || p.side === id || (p.soup && p.soup.id === id))) xs.push(p.rating);
  }));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/* ── 주간 식단 생성 ── */
function generate() {
  archiveCurrent();
  const wk = mondayOf(new Date());
  const { sideDay, outDay } = S.settings;
  const expiring = S.fridge.filter((f) => leftOf(f) <= 2).map((f) => f.n);
  const recent = new Set(S.archive.slice(-2).flatMap((w) => DAYS.map((d) => w.days[d]).filter(Boolean)
    .flatMap((p) => [p.main, p.side, p.soup && p.soup.id])).filter(Boolean));

  const score = (r) => {
    const rt = ratingOf(r.id);
    return Math.random() * 0.9
      + 2 * (r.ing || []).filter((i) => expiring.indexOf(i.n) > -1).length
      + (S.loved.indexOf(r.id) > -1 ? 1.5 : 0)
      + (rt === null ? 0 : (rt - 3) * 1.2)
      - (recent.has(r.id) ? 2.5 : 0)
      - (S.excluded.indexOf(r.id) > -1 ? 999 : 0);
  };
  const used = new Set();
  const pick = (list) => {
    const c = list.filter((r) => !used.has(r.id) && S.excluded.indexOf(r.id) === -1);
    const src = c.length ? c : list;
    if (!src.length) return null;
    return src.slice().sort((a, b) => score(b) - score(a))[0];
  };

  const type = {};
  DAYS.forEach((d) => { type[d] = d === sideDay ? "반찬" : d === outDay ? "외식" : "집밥"; });

  /* 국은 요일이 아니라 "국을 먹는 날의 개수"로 나눈다.
     외식이 어느 요일이든, 한 냄비가 2~3일을 고르게 덮고 남는 한 끼가 생기지 않는다. */
  const soupOf = {};
  const SP = pool("soup");
  const soupDays = DAYS.filter((d) => type[d] !== "외식");
  if (soupDays.length) {
    const pots = Math.max(1, Math.ceil(soupDays.length / 3));
    const sizes = [];
    for (let i = 0; i < pots; i++) {
      sizes.push(Math.floor(soupDays.length / pots) + (i < soupDays.length % pots ? 1 : 0));
    }
    let at = 0;
    sizes.forEach((size) => {
      const run = soupDays.slice(at, at + size); at += size;
      const cookDay = run[0];
      const weekend = DAYS.indexOf(cookDay) >= 5;
      // 주말에 끓이는 냄비는 든든한 국, 평일에 끓이는 냄비는 25분 안쪽
      const list = weekend ? SP.filter((x) => x.hearty) : SP.filter((x) => x.min <= 25);
      const s2 = pick(list.length ? list : SP);
      if (!s2) return;
      used.add(s2.id);
      run.forEach((d, k) => { soupOf[d] = { id: s2.id, age: k + 1 }; });
    });
  }

  const plan = {}; const prot = {}; let fish = false;
  DAYS.forEach((d, i) => {
    const weekend = i >= 5;
    if (type[d] !== "집밥") { plan[d] = { type: type[d], soup: soupOf[d] || null, main: null, side: null }; return; }
    let list = pool("main").filter((m) => (weekend ? m.min <= 60 : m.min <= 30 && !m.w));
    list = list.filter((m) => (prot[m.p] || 0) < 2);
    if (!fish && i >= 3 && list.some((m) => m.p === "생선")) list = list.filter((m) => m.p === "생선");
    const main = pick(list.length ? list : pool("main"));
    if (main) { used.add(main.id); prot[main.p] = (prot[main.p] || 0) + 1; if (main.p === "생선") fish = true; }
    const side = pick(pool("side")); if (side) used.add(side.id);
    plan[d] = { type: "집밥", soup: soupOf[d] || null, main: main ? main.id : null, side: side ? side.id : null };
  });

  S.weekStart = wk; S.plan = plan; S.checked = {};
  save(); V.screen = "week"; V.open = null; render();
  toast("이번 주 식탁이 정해졌어요");
}

function archiveCurrent() {
  if (!S.plan || !S.weekStart) return;
  if (S.archive.some((w) => w.weekStart === S.weekStart)) return;
  const days = {};
  DAYS.forEach((d) => { const p = S.plan[d]; days[d] = p ? Object.assign({}, p, { rating: 0 }) : null; });
  S.archive.unshift({ weekStart: S.weekStart, days: days, cost: weekCost() });
  S.archive = S.archive.slice(0, 30);
}

/* ── 장보기 ── */
function shoppingList() {
  const acc = {};
  if (S.plan) DAYS.forEach((d) => {
    const p = S.plan[d]; if (!p) return;
    [p.soup && p.soup.age === 1 ? p.soup.id : null, p.main, p.side].filter(Boolean).forEach((id) => {
      const r = getR(id); if (!r.ing) return;
      r.ing.forEach((i) => {
        const q = qtyFor(i);
        if (!acc[i.n]) acc[i.n] = { n: i.n, q: q, u: i.u, c: i.c, from: [r.name] };
        else if (i.u === "g") { acc[i.n].q += q; acc[i.n].from.push(r.name); }
        else { acc[i.n].q = Math.max(acc[i.n].q, q); acc[i.n].from.push(r.name); }
      });
    });
  });
  S.extra.forEach((e) => { acc[e.n] = { n: e.n, q: e.q, u: e.u, c: e.c, from: ["직접 추가"], extra: true }; });
  return Object.keys(acc).map((k) => {
    const i = acc[k];
    i.have = S.fridge.some((f) => f.n === i.n && leftOf(f) > 0);
    i.won = inBudget(i.c) ? priceOf(i.n) * i.q : 0;
    return i;
  });
}
function weekCost() { return shoppingList().filter((i) => !i.have).reduce((a, i) => a + i.won, 0); }
function dayCost(d) {
  const p = S.plan && S.plan[d]; if (!p) return 0;
  let c = 0;
  if (p.main) c += costOf(getR(p.main));
  if (p.side) c += costOf(getR(p.side));
  if (p.soup) {
    let uses = 0;
    DAYS.forEach((x) => { const q = S.plan[x]; if (q && q.soup && q.soup.id === p.soup.id) uses++; });
    c += costOf(getR(p.soup.id)) / Math.max(uses, 1);
  }
  return c;
}

/* ── 조각 ── */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function toast(m) {
  const t = document.getElementById("toast");
  t.textContent = m; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2200);
}
const stars = (n, act) => [1, 2, 3, 4, 5].map((k) =>
  `<button class="star${k <= n ? " on" : ""}" data-a="${act}:${k}">★</button>`).join("");

/* ══ 화면 ══ */
function homeView() {
  const p = S.plan && S.plan[DAYS[todayIdx()]];
  const stale = S.plan && S.weekStart !== mondayOf(new Date());
  let hero = "";
  if (!S.plan) {
    hero = `<div class="hero"><p>이번 주 저녁 일곱 끼를 한 번에 정해 드릴게요.<br>국은 세 번만 끓이고, 평일 메뉴는 30분을 넘기지 않습니다.</p>
      <button class="btn" data-a="gen">이번 주 식탁 짜기</button></div>`;
  } else if (stale) {
    hero = `<div class="hero"><p>지난주 식탁을 보고 있어요.<br>새로 짜면 지난주 식단은 [지난 메뉴]에 저장됩니다.</p>
      <button class="btn" data-a="gen">이번 주 식탁 짜기</button></div>`;
  } else {
    const soup = p && p.soup ? getR(p.soup.id) : null;
    const main = p && p.main ? getR(p.main) : null;
    hero = `<div class="hero left">
      <div class="k">오늘 · ${DAYS[todayIdx()]}요일</div>
      ${p && p.type === "외식" ? "<h2>바깥에서 먹는 날</h2>" :
        p && p.type === "반찬" ? "<h2>반찬 사 오는 날</h2>" :
        `<h2>${esc(main ? main.name : "메뉴 없음")}</h2>`}
      <div class="sub">${soup ? esc(soup.name) + (p.soup.age > 1 ? " " + p.soup.age + "일차" : "") : "국 없음"}
        ${p && p.side ? " · " + esc(getR(p.side).name) : ""}</div>
      <div class="sub mt">이번 주 예상 지출 ${won(weekCost())}</div>
    </div>`;
  }
  const exp = S.fridge.filter((f) => leftOf(f) <= 2 && leftOf(f) >= 0);
  const over = S.fridge.filter((f) => leftOf(f) < 0);
  const items = [
    ["week", "calendar_month", "이번 주 식단", S.plan ? "7일치 메뉴" : "아직 없어요"],
    ["shop", "shopping_bag", "장보기", S.plan ? shoppingList().filter((i) => !i.have).length + "가지" : "식단 먼저"],
    ["fridge", "kitchen", "냉장고", S.fridge.length ? S.fridge.length + "가지" : "비어 있음"],
    ["menu", "menu_book", "메뉴 관리", pool("soup").length + pool("main").length + pool("side").length + "개"],
    ["past", "history", "지난 메뉴", S.archive.length ? S.archive.length + "주" : "기록 없음"],
  ];
  return hero + `<nav class="grid-menu">` + items.map(([k, icon, t, s]) =>
    `<button class="grid-item" data-a="go:${k}">
      <span class="gi-icon material-symbols-rounded">${icon}</span>
      <span class="gi-label">${t}</span>
      <span class="gi-sub">${esc(s)}</span>
    </button>`).join("") + `</nav>`;
}

function weekView() {
  if (!S.plan) return `<div class="hero"><p>아직 이번 주 식탁이 없습니다.</p><button class="btn" data-a="gen">이번 주 식탁 짜기</button></div>`;
  const ti = todayIdx(), fresh = S.weekStart === mondayOf(new Date());
  let h = `<div class="bar"><span>${lab(S.weekStart)} ~ ${lab(addDays(S.weekStart, 6))}</span>
    <span class="tot">메뉴 원가 합계 ${won(DAYS.reduce((a, d) => a + dayCost(d), 0))}</span></div>`;
  h += `<div class="week-list">`;
  h += DAYS.map((d, i) => {
    const p = S.plan[d]; if (!p) return "";
    const soup = p.soup ? getR(p.soup.id) : null, main = p.main ? getR(p.main) : null, side = p.side ? getR(p.side) : null;
    const mins = (p.soup && p.soup.age === 1 ? soup.min : 0) + (main ? main.min : 0) + (side ? side.min : 0);
    const open = V.open === d;
    let body;
    if (p.type === "외식") body = `<div class="mn dim">바깥에서 먹는 날</div>`;
    else if (p.type === "반찬") body = `<div class="mn">반찬 사 오는 날</div><div class="sb">${soup ? esc(soup.name) + (p.soup.age > 1 ? " " + p.soup.age + "일차" : "") + " · " : ""}밥과 국만</div>`;
    else body = `<div class="mn">${esc(main ? main.name : "메뉴를 골라 주세요")}</div>
      <div class="sb">${soup ? esc(soup.name) + (p.soup.age > 1 ? " " + p.soup.age + "일차" : "") : ""}${soup && side ? " · " : ""}${side ? esc(side.name) : ""}</div>`;
    return `<div class="day-row" data-day="${d}">
      <div class="day-label${i === ti && fresh ? ' today' : ''}">
        <b>${d}</b><i>${lab(addDays(S.weekStart, i))}</i>
      </div>
      <div class="day-content ${p.type}${i === ti && fresh ? ' today' : ''}" data-day="${d}">
        <span class="drag-handle" aria-label="드래그하여 메뉴 이동">⠿</span>
        <button class="dhead" data-a="day:${d}">
          <span class="dbody">${body}</span>
          <span class="dmeta">${mins ? mins + "분<br>" : ""}${dayCost(d) ? won(dayCost(d)) : ""}</span>
        </button>
        ${open ? dayDetail(d, p) : ""}
      </div>
    </div>`;
  }).join("");
  h += `</div>`;
  h += `<div class="acts"><button class="btn ghost" data-a="gen">전체 다시 짜기</button>
        <button class="btn ghost" data-a="finish">이번 주 기록에 저장</button></div>`;
  return h;
}

function dayDetail(d, p) {
  const cards = [];
  if (p.soup && p.soup.age === 1) cards.push(getR(p.soup.id));
  if (p.main) cards.push(getR(p.main));
  let h = `<div class="detail">`;
  if (p.soup && p.soup.age > 1) h += `<p class="note">${esc(getR(p.soup.id).name)}은 이미 냉장고에 있어요. 데우기만 하면 됩니다.</p>`;
  if (p.type === "반찬") h += `<p class="note">주문해볼 만한 것: ${BUY_SIDES.slice(0, 5).join(", ")}</p>`;
  cards.filter((r) => r.s && r.s.length).forEach((r) => {
    h += `<div class="rec"><b>${esc(r.name)}</b> <span class="dim">${won(costOf(r))}</span>
      <ol>${r.s.map((x) => "<li>" + esc(x) + "</li>").join("")}</ol>
      <div class="ings">${r.ing.map((i) => esc(i.n) + " " + qtyFor(i) + i.u).join("  ·  ")}</div>
      ${r.tip ? `<div class="tip">${esc(r.tip)}</div>` : ""}</div>`;
  });
  h += `<div class="slots">` + SLOTS.map(([k, l]) => {
    const id = k === "soup" ? (p.soup && p.soup.id) : p[k];
    const r = id ? getR(id) : null;
    return `<div class="slot"><span class="sl">${l}</span><span class="sn${r ? "" : " dim"}">${r ? esc(r.name) : "비어 있음"}</span>
      <button class="mini" data-a="pick:${d}:${k}">${r ? "바꾸기" : "고르기"}</button>
      ${r ? `<button class="mini" data-a="clear:${d}:${k}">빼기</button>` : ""}</div>`;
  }).join("") + `</div>`;
  h += `<div class="acts">` +
    (p.type === "집밥" ? `<button class="mini" data-a="type:${d}:반찬">오늘은 반찬 사기</button><button class="mini" data-a="type:${d}:외식">오늘은 외식</button>`
      : `<button class="mini" data-a="type:${d}:집밥">집에서 먹기</button>`) + `</div></div>`;
  return h;
}

function shopView() {
  if (!S.plan) return `<div class="hero"><p>식단을 먼저 짜면 살 것이 자동으로 정리됩니다.</p><button class="btn" data-a="go:week">이번 주 식단으로</button></div>`;
  const list = shoppingList();
  const buy = list.filter((i) => !i.have);
  let h = `<p class="lead">이번 주 메뉴에서 자동으로 뽑은 목록입니다. 메뉴를 바꾸면 여기도 바뀝니다.
    냉장고에 있는 건 회색으로 빠져 있어요.</p>
    <div class="bar"><span>살 것 ${buy.length}가지</span><span class="tot">${won(weekCost())}</span></div>`;
  GROUP_ORDER.forEach((g) => {
    const items = list.filter((i) => GROUP[i.c] === g);
    if (!items.length) return;
    h += `<h3 class="gh">${g}${g === "양념·상비" ? ' <span class="dim">예산 제외</span>' : ""}</h3><div class="card">`;
    items.forEach((i) => {
      const tc = S.trash.filter((t) => t.n === i.n && gap(t.d, today()) < 35).length;
      h += `<div class="li${i.have ? " have" : ""}" ${i.have ? "" : `data-a="chk:${esc(i.n)}"`}>
        <span class="cb${S.checked[i.n] || i.have ? " on" : ""}"></span>
        <span class="ln">${esc(i.n)}${tc >= 2 ? `<i class="warn">최근 ${tc}번 버림 · 적게</i>` : ""}
          <i class="dim">${esc(i.from.slice(0, 2).join(", "))}</i></span>
        <span class="lq">${i.have ? "집에 있음" : i.q + i.u + (i.won ? "<br><i class='dim'>" + won(i.won) + "</i>" : "")}</span>
        ${i.extra ? `<button class="x" data-a="delextra:${esc(i.n)}">×</button>` : ""}</div>`;
    });
    h += `</div>`;
  });
  h += `<h3 class="gh">직접 추가</h3><div class="card pad">
    <div class="frow"><input data-f="ex.n" placeholder="재료 이름 (예: 우유)">
      <input data-f="ex.q" value="1" class="w50"><select data-f="ex.u" class="w70">${UNITS.map((u) => `<option${u === "개" ? " selected" : ""}>${u}</option>`).join("")}</select>
      <select data-f="ex.c" class="w80">${CATS.map((c) => `<option${c === "채소" ? " selected" : ""}>${c}</option>`).join("")}</select></div>
    <button class="btn small" data-a="addextra">목록에 넣기</button></div>
    <div class="acts"><button class="btn" data-a="buy">체크한 것 냉장고에 넣기</button></div>`;
  return h;
}

function fridgeView() {
  const over = S.fridge.filter((f) => leftOf(f) < 0);
  let h = "";
  if (over.length) h += `<p class="alert">보관 기간이 지난 재료가 ${over.length}가지 있어요. 정리하면 다음 장보기에 반영됩니다.</p>`;
  if (!S.fridge.length) h += `<p class="lead">아직 비어 있어요. 장보기에서 체크하면 여기로 들어옵니다. 아래에서 직접 넣을 수도 있어요.</p>`;
  h += S.fridge.slice().sort((a, b) => leftOf(a) - leftOf(b)).map((f) => {
    const L = leftOf(f), cls = L < 0 ? "bad" : L <= 2 ? "soon" : "ok";
    return `<div class="li fr ${cls}"><span class="ln"><b>${esc(f.n)}</b>
      <i class="dim">${esc(f.q || "")} · ${lab(f.bought)} 구입 · ${L < 0 ? -L + "일 지남" : L === 0 ? "오늘까지" : L + "일 남음"}</i></span>
      <button class="mini" data-a="used:${f.id}">다 씀</button><button class="mini" data-a="trash:${f.id}">버림</button></div>`;
  }).join("");
  h += `<h3 class="gh">직접 넣기</h3><div class="card pad">
    <div class="frow"><input data-f="fr.n" placeholder="재료 이름">
      <input data-f="fr.q" placeholder="수량" class="w70">
      <select data-f="fr.c" class="w80">${CATS.map((c) => `<option${c === "채소" ? " selected" : ""}>${c}</option>`).join("")}</select></div>
    <button class="btn small" data-a="fridgeadd">냉장고에 넣기</button></div>`;
  if (S.trash.length) {
    const rec = S.trash.filter((t) => gap(t.d, today()) < 35);
    const cnt = {}; rec.forEach((t) => cnt[t.n] = (cnt[t.n] || 0) + 1);
    const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3);
    h += `<p class="lead mt">최근 다섯 주 동안 ${rec.length}가지를 버렸어요.${top.length ? " 자주 버리는 것: " + top.map((n) => n + " " + cnt[n] + "번").join(", ") : ""}</p>`;
  }
  return h;
}

function menuView() {
  if (V.form) return formView();
  let h = `<div class="tabs"><button class="tb${V.sub === "list" ? " on" : ""}" data-a="sub:list">메뉴</button>
    <button class="tb${V.sub === "price" ? " on" : ""}" data-a="sub:price">재료 가격</button>
    <button class="tb${V.sub === "data" ? " on" : ""}" data-a="sub:data">백업</button></div>`;
  if (V.sub === "data") return h + dataView();
  if (V.sub === "price") {
    const names = {};
    rawAll().forEach((r) => (getR(r.id).ing || []).forEach((i) => names[i.n] = i));
    S.extra.forEach((e) => names[e.n] = e);
    h += `<p class="lead">g 단위 재료는 1g당, 나머지는 1단위당 가격입니다. 고치면 메뉴 원가와 예산에 바로 반영돼요.</p><div class="card">`;
    Object.keys(names).sort().forEach((n) => {
      const i = names[n];
      h += `<div class="li"><span class="ln">${esc(n)} <i class="dim">${i.u === "g" ? "1g" : "1" + i.u}${inBudget(i.c) ? "" : " · 예산 제외"}</i></span>
        <span class="lq"><input class="pin" type="number" data-price="${esc(n)}" value="${priceOf(n)}">원</span></div>`;
    });
    h += `</div>`;
    return h;
  }
  h += `<div class="acts"><button class="btn" data-a="new:main">새 메뉴 만들기</button></div>`;
  KINDS.forEach(([k, l]) => {
    h += `<h3 class="gh">${l}</h3><div class="card">`;
    pool(k).forEach((r) => {
      const ex = S.excluded.indexOf(r.id) > -1, lo = S.loved.indexOf(r.id) > -1;
      const op = V.openRec === r.id, mine = r.id[0] === "c", ed = !!S.edits[r.id];
      const rt = ratingOf(r.id);
      h += `<div class="mi${ex ? " off" : ""}"><div class="mrow">
        <button class="mname" data-a="rec:${r.id}">${esc(r.name)}
          ${mine ? '<i class="tag">내 메뉴</i>' : ed ? '<i class="tag">수정함</i>' : ""}
          ${rt ? `<i class="tag star">★${rt.toFixed(1)}</i>` : ""}</button>
        <span class="dim">${r.min}분 · ${won(costOf(r))}</span>
        <button class="hb${lo ? " on" : ""}" data-a="love:${r.id}">♥</button>
        <button class="mini" data-a="excl:${r.id}">${ex ? "되돌리기" : "빼기"}</button></div>`;
      if (op) h += `<div class="mdet"><div class="ings">${r.ing.length ? r.ing.map((i) => esc(i.n) + " " + i.q + i.u).join("  ·  ") : "등록된 재료가 없습니다"}</div>
        ${r.s && r.s.length ? "<ol>" + r.s.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>" : ""}
        ${r.tip ? `<div class="tip">${esc(r.tip)}</div>` : ""}
        <div class="acts"><button class="mini" data-a="edit:${r.id}">수정</button>
        ${mine ? `<button class="mini" data-a="delrec:${r.id}">삭제</button>` : ed ? `<button class="mini" data-a="reset:${r.id}">원래대로</button>` : ""}</div></div>`;
      h += `</div>`;
    });
    h += `</div>`;
  });
  h += `<h3 class="gh">주간 설정</h3><div class="card pad">`;
  [["sideDay", "반찬 사는 날"], ["outDay", "외식하는 날"]].forEach(([k, l]) => {
    h += `<div class="fl">${l}</div><div class="pills">` + DAYS.concat("없음").map((d) =>
      `<button class="pill${S.settings[k] === d ? " on" : ""}" data-a="cfg:${k}:${d}">${d}</button>`).join("") + `</div>`;
  });
  h += `<div class="fl">식구 수</div><div class="pills">` + [2, 3, 4, 5].map((n) =>
    `<button class="pill${S.settings.people === n ? " on" : ""}" data-a="cfg:people:${n}">${n}명</button>`).join("") + `</div></div>`;
  return h;
}

function dataView() {
  const n = [["내 메뉴", S.custom.length + "개"], ["고친 메뉴", Object.keys(S.edits).length + "개"],
    ["고친 가격", Object.keys(S.prices).length + "개"], ["주간 기록", S.archive.length + "주"],
    ["냉장고", S.fridge.length + "가지"]];
  return `<p class="lead">데이터는 이 기기의 브라우저 안에만 있습니다. 저장소를 지우거나 기기를 바꾸면 사라져요.
    가끔 파일로 내려받아 두시면 그대로 되살릴 수 있습니다.</p>

  <h3 class="gh">내보내기</h3>
  <div class="card pad">
    <div class="stat">${n.map(([k, v]) => `<span><i>${k}</i>${v}</span>`).join("")}</div>
    <div class="acts"><button class="btn" data-a="expfile">파일로 내려받기</button>
      <button class="btn ghost" data-a="expcopy">클립보드에 복사</button></div>
    <p class="hint">${S.lastBackup ? "마지막 백업 " + S.lastBackup + " (" + gap(S.lastBackup, today()) + "일 전)" : "아직 백업한 적이 없습니다."}</p>
  </div>

  <h3 class="gh">가져오기</h3>
  <div class="card pad">
    <input type="file" id="impfile" accept=".json,application/json,text/plain">
    <p class="hint">또는 백업 내용을 여기에 붙여넣으세요.</p>
    <textarea data-f="imp.t" rows="4" placeholder="백업 파일 내용, 또는 메뉴 목록">${esc(TMP.imp.t)}</textarea>
    <div class="acts"><button class="btn ghost" data-a="impmenu">메뉴만 합치기</button>
      <button class="btn ghost" data-a="impall">전체 복원</button></div>
    <p class="hint"><b>메뉴만 합치기</b>는 지금 데이터를 그대로 두고 메뉴와 가격만 더합니다. 이름이 같은 메뉴는 건너뜁니다.<br>
      <b>전체 복원</b>은 지금 것을 모두 지우고 백업 시점으로 되돌립니다.</p>
  </div>

  <h3 class="gh">초기화</h3>
  <div class="card pad">
    <button class="btn ghost" data-a="wipe">${V.wipe ? "한 번 더 누르면 정말 지워집니다" : "모든 데이터 지우기"}</button>
    <p class="hint">되돌릴 수 없습니다. 지우기 전에 먼저 내보내기를 해 두세요.</p>
  </div>`;
}

/* ── 백업 입출력 ── */
function exportText() { return JSON.stringify({ app: "dinner-table", v: 2, at: today(), data: S }, null, 1); }
function stamp() { S.lastBackup = today(); save(); }

function download(name, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    return true;
  } catch (e) { return false; }
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    return Promise.resolve(true);
  } catch (e) { return Promise.resolve(false); }
}

/* 백업 파일, 예전 형식, 그리고 메뉴만 담긴 배열까지 모두 받아들인다 */
function parseImport(raw) {
  const d = JSON.parse(raw);
  if (Array.isArray(d)) return { recipes: d };
  if (d.app === "dinner-table" && d.data) return { state: d.data };
  if (d.recipes) return { recipes: d.recipes };
  if (d.custom || d.archive || d.settings || d.prices) return { state: d };
  throw new Error("형식을 알 수 없습니다");
}
function normalize(obj) {
  const base = JSON.parse(JSON.stringify(FRESH));
  const s = Object.assign(base, obj);
  s.settings = Object.assign({}, FRESH.settings, obj.settings || {});
  ["fridge", "extra", "trash", "loved", "excluded", "custom", "archive"]
    .forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
  ["checked", "edits", "prices"].forEach((k) => { if (!s[k] || typeof s[k] !== "object") s[k] = {}; });
  return s;
}
function mergeRecipes(list) {
  let added = 0, skipped = 0;
  (list || []).forEach((r) => {
    const name = (r.name || "").trim(); if (!name) return;
    const kind = ["soup", "main", "side"].indexOf(r.kind) > -1 ? r.kind : "main";
    if (pool(kind).some((x) => x.name === name)) { skipped++; return; }
    const min = Number(r.min) || 20;
    S.custom.push({
      id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      kind: kind, name: name, min: min, p: r.p || "기타", w: min > 30, hearty: min >= 30,
      ing: (r.ing || []).filter((i) => i && i.n).map((i) => ({
        n: String(i.n).trim(), q: Number(i.q) || 1,
        u: UNITS.indexOf(i.u) > -1 ? i.u : "개",
        c: CATS.indexOf(i.c) > -1 ? i.c : "채소",
      })),
      s: Array.isArray(r.s) ? r.s : String(r.s || "").split("\n").filter(Boolean),
    });
    added++;
  });
  return { added: added, skipped: skipped };
}

function formView() {
  const f = V.form;
  return `<h3 class="gh">${f.id ? "메뉴 수정" : "새 메뉴"}</h3><div class="card pad">
    <div class="pills">${KINDS.map(([k, l]) => `<button class="pill${f.kind === k ? " on" : ""}" data-a="fkind:${k}">${l}</button>`).join("")}</div>
    <input data-f="form.name" value="${esc(f.name)}" placeholder="메뉴 이름">
    <div class="frow mt"><span class="fl">조리 시간</span><input data-f="form.min" value="${f.min}" class="w70">분</div>
    <p class="hint">30분이 넘으면 평일에는 배정하지 않고 주말에만 올립니다.</p>
    <div class="fl mt">필요한 재료</div>
    ${f.ing.map((g, ix) => `<div class="frow">
      <input data-f="form.ing.${ix}.n" value="${esc(g.n)}" placeholder="재료">
      <input data-f="form.ing.${ix}.q" value="${g.q}" class="w50">
      <select data-f="form.ing.${ix}.u" class="w70">${UNITS.map((u) => `<option${u === g.u ? " selected" : ""}>${u}</option>`).join("")}</select>
      <select data-f="form.ing.${ix}.c" class="w80">${CATS.map((c) => `<option${c === g.c ? " selected" : ""}>${c}</option>`).join("")}</select>
      <button class="x" data-a="fdel:${ix}">×</button></div>`).join("")}
    <button class="btn small ghost" data-a="fadd">재료 한 줄 더</button>
    <p class="hint">분류는 냉장고에서 며칠 남았는지 계산하는 기준입니다. 정육 3일, 잎채소 4일, 채소 10일.</p>
    <div class="fl mt">만드는 순서 (한 줄에 하나)</div>
    <textarea data-f="form.s" rows="4">${esc(f.s)}</textarea>
    <div class="acts"><button class="btn" data-a="fsave">저장</button><button class="btn ghost" data-a="fcancel">취소</button></div>
  </div>`;
}

function pastView() {
  if (!S.archive.length) return `<p class="lead">아직 기록이 없습니다. 이번 주 식단 화면에서 [이번 주 기록에 저장]을 누르거나, 다음 주 식단을 새로 짜면 이번 주가 자동으로 여기 저장됩니다.</p>`;
  return S.archive.map((w, wi) => {
    const op = V.openWeek === wi;
    const rated = DAYS.map((d) => w.days[d]).filter((p) => p && p.rating);
    const avg = rated.length ? (rated.reduce((a, p) => a + p.rating, 0) / rated.length).toFixed(1) : null;
    let h = `<div class="wk"><button class="whead" data-a="wk:${wi}">
      <span><b>${lab(w.weekStart)} ~ ${lab(addDays(w.weekStart, 6))}</b>
      <i class="dim">${avg ? "평균 ★" + avg : "별점 없음"}${w.cost ? " · " + won(w.cost) : ""}</i></span><span class="ar">${op ? "⌄" : "›"}</span></button>`;
    if (op) {
      h += `<div class="wbody">`;
      DAYS.forEach((d) => {
        const p = w.days[d]; if (!p) return;
        const names = p.type === "외식" ? "외식" : p.type === "반찬" ? "반찬 구입" :
          [p.soup && getR(p.soup.id).name, p.main && getR(p.main).name, p.side && getR(p.side).name].filter(Boolean).join(" · ");
        h += `<div class="wd"><span class="wdd">${d}</span><span class="wdn">${esc(names)}</span>
          <span class="strs">${stars(p.rating || 0, `rate:${wi}:${d}`)}</span></div>`;
      });
      h += `<div class="acts"><button class="mini" data-a="reuse:${wi}">이 주 식단 다시 쓰기</button>
        <button class="mini" data-a="delwk:${wi}">기록 삭제</button></div></div>`;
    }
    return h + `</div>`;
  }).join("");
}

/* ══ 뒤로가기 ══
   화면·시트·폼이 열리고 닫히는 것을 히스토리 한 칸으로 취급한다.
   그래야 기기의 뒤로가기가 앱을 끄는 대신 이전 화면으로 돌아간다. */
function routeSig() {
  return [V.screen, V.sub, V.picker ? V.picker.day + V.picker.slot : "", V.form ? "form" : ""].join("|");
}
function routeSnap() {
  return { screen: V.screen, sub: V.sub, picker: V.picker, form: !!V.form,
    open: V.open, openRec: V.openRec, openWeek: V.openWeek };
}
let lastSig = null;
function syncHistory() {
  const cur = routeSig();
  if (lastSig === null) { history.replaceState({ r: routeSnap() }, ""); lastSig = cur; return; }
  if (cur !== lastSig) { history.pushState({ r: routeSnap() }, ""); lastSig = cur; }
}
window.addEventListener("popstate", function (e) {
  const r = e.state && e.state.r;
  if (!r) { V.screen = "home"; V.picker = null; V.form = null; }
  else {
    V.screen = r.screen || "home"; V.sub = r.sub || "list";
    V.picker = r.picker || null;
    if (!r.form) V.form = null;          // 폼에서 뒤로 = 취소
    V.open = r.open; V.openRec = r.openRec; V.openWeek = r.openWeek;
  }
  lastSig = routeSig();                   // 되돌아온 위치를 기준으로 삼아 다시 밀어넣지 않는다
  cleanupDrag();
  render();
});

/* ══ 렌더 ══ */
const TITLES = { home: "저녁 식탁", week: "이번 주 식단", shop: "장보기", fridge: "냉장고 관리", menu: "메뉴 관리", past: "지난 메뉴" };
function render() {
  cleanupDrag();          // 화면을 다시 그리기 전에 떠 있는 클론을 없앤다
  syncHistory();
  const app = document.getElementById("app");
  document.getElementById("title").textContent = TITLES[V.screen];
  document.getElementById("back").style.visibility = V.screen === "home" ? "hidden" : "visible";
  app.innerHTML = { home: homeView, week: weekView, shop: shopView, fridge: fridgeView, menu: menuView, past: pastView }[V.screen]();
  document.getElementById("sheet").innerHTML = V.picker ? pickerHTML() : "";
  document.getElementById("sheet").className = V.picker ? "on" : "";
  // 화면이 바뀔 때만 스크롤 초기화
  if (prevScreen !== V.screen) {
    window.scrollTo(0, 0);
    prevScreen = V.screen;
  }
  // 주간 식단 화면이면 드래그 앤 드롭 초기화
  if (V.screen === 'week') initDrag();
}
function pickerHTML() {
  const { day, slot } = V.picker;
  return `<div class="sbox"><div class="shead"><b>${day}요일 ${SLOTS.find((s) => s[0] === slot)[1]}</b>
    <button class="mini" data-a="closepick">닫기</button></div>` +
    pool(slot).filter((r) => S.excluded.indexOf(r.id) === -1).map((r) =>
      `<button class="pk" data-a="putslot:${day}:${slot}:${r.id}"><span class="pn">${esc(r.name)}</span>
        <span class="dim">${r.min}분 · ${won(costOf(r))}</span>
        <span class="pi">${r.ing.map((i) => esc(i.n)).join(" · ")}</span></button>`).join("") + `</div>`;
}

/* ══ 입력 ══ */
const TMP = { ex: { n: "", q: "1", u: "개", c: "채소" }, fr: { n: "", q: "", c: "채소" }, imp: { t: "" } };
document.addEventListener("input", (e) => {
  const f = e.target.dataset.f; if (!f) return;
  const parts = f.split(".");
  if (parts[0] === "form") {
    if (parts[1] === "ing") V.form.ing[+parts[2]][parts[3]] = e.target.value;
    else V.form[parts[1]] = e.target.value;
  } else TMP[parts[0]][parts[1]] = e.target.value;
});
document.addEventListener("change", (e) => {
  const p = e.target.dataset.price;
  if (p) { S.prices[p] = Number(e.target.value) || 0; save(); }
  const f = e.target.dataset.f;
  if (f && e.target.tagName === "SELECT") {
    const parts = f.split(".");
    if (parts[0] === "form") { if (parts[1] === "ing") V.form.ing[+parts[2]][parts[3]] = e.target.value; }
    else TMP[parts[0]][parts[1]] = e.target.value;
  }
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const [a, x, y, z] = b.dataset.a.split(":");

  if (a === "go") { V.screen = x; V.open = null; V.form = null; }
  else if (a === "back") { V.screen = "home"; V.form = null; }
  else if (a === "gen") generate();
  else if (a === "day") V.open = V.open === x ? null : x;
  else if (a === "pick") V.picker = { day: x, slot: y };
  else if (a === "closepick") V.picker = null;
  else if (a === "putslot") {
    V.picker = null;
    if (S.plan && S.plan[x]) {
      const p = Object.assign({}, S.plan[x]);
      if (y === "soup") p.soup = { id: z, age: 1 }; else p[y] = z;
      if (y === "main" && p.type !== "집밥") p.type = "집밥";
      S.plan[x] = p; save();
    } else toast("먼저 이번 주 식단을 짜 주세요");
  }
  else if (a === "cfg") { S.settings[x] = x === "people" ? Number(y) : y; save(); }
  else if (a === "clear") { const p = Object.assign({}, S.plan[x]); if (y === "soup") p.soup = null; else p[y] = null; S.plan[x] = p; save(); }
  else if (a === "type") { S.plan[x] = Object.assign({}, S.plan[x], { type: y }); save(); }
  else if (a === "chk") { S.checked[x] = !S.checked[x]; save(); }
  else if (a === "addextra") {
    if (!TMP.ex.n.trim()) return toast("재료 이름을 적어 주세요");
    S.extra.push({ n: TMP.ex.n.trim(), q: Number(TMP.ex.q) || 1, u: TMP.ex.u, c: TMP.ex.c });
    TMP.ex.n = ""; save();
  }
  else if (a === "delextra") { S.extra = S.extra.filter((i) => i.n !== x); save(); }
  else if (a === "buy") {
    const list = shoppingList().filter((i) => S.checked[i.n] && !i.have);
    if (!list.length) return toast("체크한 것이 없어요");
    S.fridge = S.fridge.filter((f) => !list.some((i) => i.n === f.n))
      .concat(list.map((i) => ({ id: Math.random().toString(36).slice(2), n: i.n, c: i.c, q: i.q + i.u, bought: today() })));
    S.checked = {}; save(); V.screen = "fridge"; toast(list.length + "가지를 냉장고에 넣었어요");
  }
  else if (a === "used") { S.fridge = S.fridge.filter((f) => f.id !== x); save(); }
  else if (a === "trash") {
    const f = S.fridge.find((i) => i.id === x);
    if (f) S.trash.push({ n: f.n, d: today() });
    S.fridge = S.fridge.filter((i) => i.id !== x); save();
  }
  else if (a === "fridgeadd") {
    if (!TMP.fr.n.trim()) return toast("재료 이름을 적어 주세요");
    S.fridge.push({ id: Math.random().toString(36).slice(2), n: TMP.fr.n.trim(), c: TMP.fr.c, q: TMP.fr.q, bought: today() });
    TMP.fr.n = ""; TMP.fr.q = ""; save();
  }
  else if (a === "sub") { V.sub = x; V.openRec = null; V.wipe = false; }
  else if (a === "gobk") { V.screen = "menu"; V.sub = "data"; }
  else if (a === "expfile") {
    const ok = download("저녁식탁-백업-" + today() + ".json", exportText());
    if (ok) { stamp(); toast("백업 파일을 내려받았어요"); }
    else toast("내려받기에 실패했어요. 복사를 써 주세요");
  }
  else if (a === "expcopy") {
    const text = exportText();
    copyText(text).then((ok) => { if (ok) { stamp(); render(); toast("클립보드에 복사했어요"); } else toast("복사에 실패했어요"); });
  }
  else if (a === "impall" || a === "impmenu") {
    const raw = (TMP.imp.t || "").trim();
    if (!raw) return toast("가져올 내용이 없어요");
    let got;
    try { got = parseImport(raw); }
    catch (err) { return toast("읽을 수 없는 형식이에요"); }
    if (a === "impall") {
      if (!got.state) return toast("전체 복원은 백업 파일로만 됩니다");
      S = normalize(got.state); TMP.imp.t = ""; save();
      V.screen = "home"; V.sub = "list"; toast("백업 시점으로 되돌렸어요");
    } else {
      const list = got.recipes || (got.state && got.state.custom) || [];
      const r = mergeRecipes(list);
      if (got.state && got.state.prices) S.prices = Object.assign({}, S.prices, got.state.prices);
      TMP.imp.t = ""; save();
      toast(r.added + "개 추가" + (r.skipped ? ", " + r.skipped + "개는 이름이 같아 건너뜀" : ""));
    }
  }
  else if (a === "wipe") {
    if (!V.wipe) { V.wipe = true; toast("한 번 더 누르면 모두 지워집니다"); }
    else { S = JSON.parse(JSON.stringify(FRESH)); save(); V.wipe = false; V.screen = "home"; toast("모두 지웠어요"); }
  }
  else if (a === "rec") V.openRec = V.openRec === x ? null : x;
  else if (a === "love") { S.loved = S.loved.indexOf(x) > -1 ? S.loved.filter((i) => i !== x) : S.loved.concat(x); save(); }
  else if (a === "excl") { S.excluded = S.excluded.indexOf(x) > -1 ? S.excluded.filter((i) => i !== x) : S.excluded.concat(x); save(); }
  else if (a === "new") V.form = { kind: "main", name: "", min: 20, ing: [{ n: "", q: 1, u: "개", c: "채소" }], s: "" };
  else if (a === "edit") {
    const r = getR(x);
    V.form = { id: x, kind: kindOf(x), name: r.name, min: r.min, ing: (r.ing || []).map((i) => Object.assign({}, i)), s: (r.s || []).join("\n") };
  }
  else if (a === "fkind") V.form.kind = x;
  else if (a === "fadd") V.form.ing.push({ n: "", q: 1, u: "개", c: "채소" });
  else if (a === "fdel") V.form.ing.splice(+x, 1);
  else if (a === "fcancel") V.form = null;
  else if (a === "fsave") {
    const f = V.form, name = (f.name || "").trim();
    if (!name) return toast("메뉴 이름을 적어 주세요");
    const min = Number(f.min) || 10;
    const body = {
      name: name, min: min, w: min > 30, hearty: min >= 30,
      ing: f.ing.filter((g) => (g.n || "").trim()).map((g) => ({ n: g.n.trim(), q: Number(g.q) || 1, u: g.u, c: g.c })),
      s: (f.s || "").split("\n").map((x) => x.trim()).filter(Boolean),
    };
    if (f.id) {
      if (f.id[0] === "c") S.custom = S.custom.map((c) => c.id === f.id ? Object.assign({}, c, body, { kind: f.kind }) : c);
      else S.edits[f.id] = body;
      toast("고쳤어요");
    } else {
      S.custom.push(Object.assign({ id: "c" + Date.now().toString(36), kind: f.kind, p: "기타" }, body));
      toast(name + ", 메뉴에 넣었어요");
    }
    V.form = null; save();
  }
  else if (a === "reset") { delete S.edits[x]; save(); toast("원래대로 되돌렸어요"); }
  else if (a === "delrec") {
    S.custom = S.custom.filter((c) => c.id !== x);
    if (S.plan) DAYS.forEach((d) => { const p = S.plan[d]; if (!p) return;
      if (p.soup && p.soup.id === x) p.soup = null; if (p.main === x) p.main = null; if (p.side === x) p.side = null; });
    save(); toast("메뉴를 지웠어요");
  }
  else if (a === "finish") { archiveCurrent(); save(); V.screen = "past"; V.openWeek = 0; toast("기록에 저장했어요"); }
  else if (a === "wk") V.openWeek = V.openWeek === +x ? null : +x;
  else if (a === "rate") { S.archive[+x].days[y].rating = +z; save(); }
  else if (a === "delwk") { S.archive.splice(+x, 1); V.openWeek = null; save(); }
  else if (a === "reuse") {
    const w = S.archive[+x]; const plan = {};
    DAYS.forEach((d) => { const p = w.days[d]; plan[d] = p ? { type: p.type, soup: p.soup, main: p.main, side: p.side } : null; });
    archiveCurrent(); S.weekStart = mondayOf(new Date()); S.plan = plan; S.checked = {};
    save(); V.screen = "week"; toast("이 주 식단을 가져왔어요");
  }
  render();
});

document.addEventListener("change", (e) => {
  if (e.target.id !== "impfile" || !e.target.files || !e.target.files[0]) return;
  const fr = new FileReader();
  fr.onload = () => { TMP.imp.t = String(fr.result); render(); toast("파일을 읽었어요. 아래 버튼을 눌러 주세요"); };
  fr.onerror = () => toast("파일을 읽지 못했어요");
  fr.readAsText(e.target.files[0]);
});

document.getElementById("back").addEventListener("click", () => {
  if (history.state && history.state.r) history.back();
  else { V.screen = "home"; V.form = null; render(); }
});
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ══ 드래그 앤 드롭 — 요일 메뉴 교환 (재생목록 스타일) ══ */
/* 드래그 상태는 모듈 스코프에 둔다.
   initDrag()는 렌더마다 새로 불리는데, 상태가 그 안에 갇혀 있으면
   이전 렌더에서 만든 클론에 다시 손댈 수가 없어 화면에 남는다. */
// var로 선언한다. 이 블록은 파일 아래쪽에 있는데 render()는 그보다 먼저 도는데,
// let이면 초기화 전 접근으로 첫 로딩에서 바로 죽는다.
var dragSrc = null, dragSrcDay = null, dragClone = null, dropTarget = null, isDragging = false;
window.addEventListener("blur", function () { cleanupDrag(); });
document.addEventListener("visibilitychange", function () { if (document.hidden) cleanupDrag(); });

function cleanupDrag() {
  if (dragClone) { dragClone.remove(); dragClone = null; }
  // 렌더로 사라진 노드까지 훑어 남은 흔적을 지운다
  document.querySelectorAll(".dragging").forEach((el) => el.remove());
  document.querySelectorAll(".drag-origin").forEach((el) => el.classList.remove("drag-origin"));
  document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
  dragSrc = null; dragSrcDay = null; dropTarget = null; isDragging = false;
}

function initDrag() {
  const contents = document.querySelectorAll('.day-content[data-day]');
  if (!contents.length) return;

  let startY = 0;
  let offsetY = 0;
  const DRAG_THRESHOLD = 8;

  function getY(e) {
    return e.touches ? e.touches[0].clientY : e.clientY;
  }

  function onStart(e) {
    // 드래그 핸들에서만 시작
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const card = e.target.closest('.day-content[data-day]');
    if (!card) return;

    e.preventDefault();
    dragSrc = card;
    dragSrcDay = card.dataset.day;
    startY = getY(e);
    isDragging = false;
    const rect = card.getBoundingClientRect();
    offsetY = getY(e) - rect.top;

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  }

  function onMove(e) {
    if (!dragSrc) return;
    const dy = Math.abs(getY(e) - startY);
    if (!isDragging && dy < DRAG_THRESHOLD) return;

    if (!isDragging) {
      isDragging = true;
      // 클론 생성 — 드래그 중인 메뉴 카드
      dragClone = dragSrc.cloneNode(true);
      dragClone.classList.add('dragging');
      dragClone.style.width = dragSrc.offsetWidth + 'px';
      document.body.appendChild(dragClone);
      dragSrc.classList.add('drag-origin');
    }

    e.preventDefault();
    const containerRect = dragSrc.parentNode.parentNode.getBoundingClientRect();
    dragClone.style.top = (getY(e) - offsetY) + 'px';
    dragClone.style.left = dragSrc.getBoundingClientRect().left + 'px';

    // 드롭 대상 하이라이트
    const allCards = [...document.querySelectorAll('.day-content[data-day]')];
    const mouseY = getY(e);
    let found = null;
    for (const c of allCards) {
      if (c === dragSrc) { c.classList.remove('drop-target'); continue; }
      const r = c.getBoundingClientRect();
      if (mouseY >= r.top && mouseY <= r.bottom) {
        found = c;
        c.classList.add('drop-target');
      } else {
        c.classList.remove('drop-target');
      }
    }
    dropTarget = found;
  }

  function onEnd(e) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);

    if (!isDragging || !dragSrc) {
      dragSrc = null;
      isDragging = false;
      return;
    }

    // 클린업
    dragSrc.classList.remove('drag-origin');
    if (dragClone) dragClone.remove();
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

    // 드롭 대상이 있으면 두 요일의 plan을 swap
    if (dropTarget && dropTarget.dataset.day !== dragSrcDay) {
      const targetDay = dropTarget.dataset.day;
      const oldPlan = JSON.parse(JSON.stringify(S.plan));
      S.plan[dragSrcDay] = oldPlan[targetDay];
      S.plan[targetDay] = oldPlan[dragSrcDay];
      save();
      V.open = null;
      render();
      toast(dragSrcDay + '↔' + targetDay + ' 메뉴를 바꿨어요');
    } else {
      render();
    }

    dragSrc = null;
    dragClone = null;
    dropTarget = null;
    isDragging = false;
  }

  // 터치 이벤트
  function onTouchStart(e) {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const card = e.target.closest('.day-content[data-day]');
    if (!card) return;

    e.preventDefault();   // 길게 누르기 메뉴와 당겨서 새로고침을 막는다
    dragSrc = card;
    dragSrcDay = card.dataset.day;
    startY = getY(e);
    isDragging = false;
    const rect = card.getBoundingClientRect();
    offsetY = getY(e) - rect.top;
  }

  function onTouchMove(e) {
    if (!dragSrc) return;
    const dy = Math.abs(getY(e) - startY);
    if (!isDragging && dy < DRAG_THRESHOLD) return;

    if (!isDragging) {
      isDragging = true;
      dragClone = dragSrc.cloneNode(true);
      dragClone.classList.add('dragging');
      dragClone.style.width = dragSrc.offsetWidth + 'px';
      document.body.appendChild(dragClone);
      dragSrc.classList.add('drag-origin');
    }

    e.preventDefault();
    dragClone.style.top = (getY(e) - offsetY) + 'px';
    dragClone.style.left = dragSrc.getBoundingClientRect().left + 'px';

    // 터치 좌표로 대상 찾기 (elementFromPoint 사용)
    const allCards = [...document.querySelectorAll('.day-content[data-day]')];
    const touchY = getY(e);
    let found = null;
    for (const c of allCards) {
      if (c === dragSrc) { c.classList.remove('drop-target'); continue; }
      const r = c.getBoundingClientRect();
      if (touchY >= r.top && touchY <= r.bottom) {
        found = c;
        c.classList.add('drop-target');
      } else {
        c.classList.remove('drop-target');
      }
    }
    dropTarget = found;
  }

  function onTouchEnd(e) {
    if (!isDragging || !dragSrc) {
      dragSrc = null;
      isDragging = false;
      return;
    }

    dragSrc.classList.remove('drag-origin');
    if (dragClone) dragClone.remove();
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

    if (dropTarget && dropTarget.dataset.day !== dragSrcDay) {
      const targetDay = dropTarget.dataset.day;
      const oldPlan = JSON.parse(JSON.stringify(S.plan));
      S.plan[dragSrcDay] = oldPlan[targetDay];
      S.plan[targetDay] = oldPlan[dragSrcDay];
      save();
      V.open = null;
      render();
      toast(dragSrcDay + '↔' + targetDay + ' 메뉴를 바꿨어요');
    } else {
      render();
    }

    dragSrc = null;
    dragClone = null;
    dropTarget = null;
    isDragging = false;
  }

  contents.forEach(card => {
    card.addEventListener('mousedown', onStart);
    card.addEventListener('touchstart', onTouchStart, { passive: false });
    card.addEventListener('touchmove', onTouchMove, { passive: false });
    card.addEventListener('touchend', onTouchEnd);
    card.addEventListener('touchcancel', cleanupDrag);
    card.addEventListener('contextmenu', (e) => { if (e.target.closest('.drag-handle')) e.preventDefault(); });
  });
}
