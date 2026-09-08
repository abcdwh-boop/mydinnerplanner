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
  plans: {}, items: [], lastBackup: null, archive: [], settings: { sideDay: "수", outDay: "금", people: 3 },
};

let S = loadState();
let V = { week: null, screen: "home", open: null, picker: null, form: null, sub: "list", openRec: null,
  openWeek: null, q: { menu: "", item: "" }, filter: "전체", sort: "name",
  sug: null, focus: null, cond: false, itemForm: null, wipe: false };
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
    if (!Array.isArray(s.items)) s.items = [];
    if (!s.plans || typeof s.plans !== "object") s.plans = {};
    // 예전에는 식단을 하나만 들고 있었다. 그 하나를 해당 주 칸으로 옮긴다.
    if (s.plan && s.weekStart && !s.plans[s.weekStart]) s.plans[s.weekStart] = s.plan;
    if (!s.checked || Array.isArray(s.checked)) s.checked = {};
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

/* 식단을 짜는 시점에 따라 기본 대상 주가 달라야 한다.
   금·토·일에 짜면 남은 날이 얼마 없으니 다음 주를 기본으로 잡는다. */
function defaultWeek() {
  const cur = mondayOf(new Date());
  return todayIdx() >= 4 ? addDays(cur, 7) : cur;
}
/* 식단은 주마다 따로 보관한다. 다음 주를 미리 짜도 이번 주가 남는다. */
const thisWeek = () => mondayOf(new Date());
const planOf = (ws) => (S.plans && S.plans[ws]) || null;
/* 지금 [식단] 화면이 보고 있는 주 */
function targetWeek() {
  if (V.week) return V.week;
  if (planOf(thisWeek())) return thisWeek();   // 이번 주 것이 있으면 그것부터
  return defaultWeek();
}
const curPlan = () => planOf(targetWeek());
/* 장보기·수정은 지금 보고 있는 주를 대상으로 한다 */
function setPlan(ws, plan) { S.plans[ws] = plan; save(); }
function checkedOf(ws) { if (!S.checked[ws]) S.checked[ws] = {}; return S.checked[ws]; }
/* 오래된 주는 정리한다 (지난 메뉴 기록은 따로 남는다) */
function prunePlans() {
  Object.keys(S.plans).forEach((ws) => { if (gap(ws, today()) > 28) delete S.plans[ws]; });
}
function weekLabel(ws) {
  const d = gap(mondayOf(new Date()), ws) / 7;
  return d === 0 ? "이번 주" : d === 1 ? "다음 주" : d === -1 ? "지난주"
    : d > 0 ? d + "주 뒤" : -d + "주 전";
}
/* 오늘이 그 주의 몇 번째 날인지. 벗어나 있으면 -1. */
function planDayIdx() { return todayIdx(); }

function weekBar() {
  const ws = targetWeek();
  // 아이콘 글꼴이 안 뜨더라도 읽히도록 글자를 함께 넣는다
  return `<div class="weekbar">
    <button class="wnav" data-a="wshift:-7">
      <span class="material-symbols-rounded">chevron_left</span><i>지난주</i></button>
    <div class="wlab"><b>${lab(ws)} ~ ${lab(addDays(ws, 6))}</b><i>${weekLabel(ws)}</i></div>
    <button class="wnav" data-a="wshift:7">
      <i>다음주</i><span class="material-symbols-rounded">chevron_right</span></button>
  </div>`;
}

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

/* ── 재료 사전 ──
   메뉴 안에 흩어져 있던 재료를 한 곳으로 모은다.
   "삼치"와 "손질 삼치"가 따로 노는 걸 막는 근거가 된다. */
function ingIndex() {
  const map = {};
  const put = (n, u, c) => {
    n = String(n || "").trim(); if (!n) return;
    if (!map[n]) map[n] = { n: n, u: u || "개", c: c || "채소", uses: 0 };
  };
  rawAll().forEach((r) => (getR(r.id).ing || []).forEach((i) => { put(i.n, i.u, i.c); map[i.n].uses++; }));
  S.items.forEach((i) => put(i.n, i.u, i.c));
  S.extra.forEach((i) => put(i.n, i.u, i.c));
  S.fridge.forEach((f) => put(f.n, "개", f.c));
  Object.keys(S.prices).forEach((n) => put(n));
  return map;
}
const ingNames = () => Object.keys(ingIndex()).sort();
const isMine = (n) => S.items.some((i) => i.n === n);

/* 입력 중인 글자와 겹치는 재료를 찾는다. 양방향으로 봐서
   "삼치"를 쳐도 "손질 삼치"가 걸리게 한다. */
function suggest(q) {
  q = String(q || "").trim();
  if (!q) return [];
  const all = ingNames();
  if (all.indexOf(q) > -1 && all.filter((n) => n !== q && (n.indexOf(q) > -1)).length === 0) return [];
  return all.filter((n) => n !== q && (n.indexOf(q) > -1 || q.indexOf(n) > -1)).slice(0, 6);
}

/* 재료 이름 입력칸. 어디서 쓰든 같은 자동완성이 붙는다. */
function ingInput(path, value, ph) {
  const id = "ing-" + path.replace(/[.\[\]]/g, "-");
  const list = V.sug === path ? suggest(value) : [];
  return `<div class="ingwrap">
    <input id="${id}" data-ing="${path}" data-f="${path}" value="${esc(value || "")}"
      placeholder="${ph || "재료 이름"}" autocomplete="off">
    ${list.length ? `<div class="sug">
      <div class="sughead">이미 있는 재료예요. 눌러서 쓰시면 이름이 통일됩니다.</div>
      ${list.map((n) => `<button class="sugi" data-a="usesug:${encodeURIComponent(path)}:${encodeURIComponent(n)}">${esc(n)}</button>`).join("")}
    </div>` : ""}
  </div>`;
}

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
  const wk = targetWeek();
  archiveWeek(wk);              // 그 주에 이미 있던 식단만 기록으로 넘긴다
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
      run.forEach((d) => { soupOf[d] = { id: s2.id }; });
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

  S.plans[wk] = plan; S.weekStart = wk; S.plan = null;
  S.checked[wk] = {}; V.week = wk; prunePlans();
  save(); V.screen = "week"; V.open = null; render();
  toast("이번 주 식탁이 정해졌어요");
}

function archiveWeek(ws) {
  const plan = planOf(ws); if (!plan) return;
  if (S.archive.some((w) => w.weekStart === ws)) return;
  const days = {};
  DAYS.forEach((d) => { const p = plan[d]; days[d] = p ? Object.assign({}, p, { rating: 0 }) : null; });
  S.archive.unshift({ weekStart: ws, days: days, cost: weekCost(ws) });
  S.archive = S.archive.slice(0, 30);
}

/* ── 장보기 ── */
function shoppingList(ws) {
  const acc = {};
  const soupIds = [];
  const plan = planOf(ws || targetWeek());
  if (plan) DAYS.forEach((d) => {
    const p = plan[d];
    if (p && p.soup && soupIds.indexOf(p.soup.id) === -1) soupIds.push(p.soup.id);
  });
  if (plan) DAYS.forEach((d) => {
    const p = plan[d]; if (!p) return;
    // 국은 아래에서 따로 한 번씩만 더한다
    [p.main, p.side].filter(Boolean).forEach((id) => {
      const r = getR(id); if (!r.ing) return;
      r.ing.forEach((i) => {
        const q = qtyFor(i);
        if (!acc[i.n]) acc[i.n] = { n: i.n, q: q, u: i.u, c: i.c, from: [r.name] };
        else if (i.u === "g") { acc[i.n].q += q; acc[i.n].from.push(r.name); }
        else { acc[i.n].q = Math.max(acc[i.n].q, q); acc[i.n].from.push(r.name); }
      });
    });
  });
  soupIds.forEach((id) => {
    const r = getR(id); if (!r.ing) return;
    r.ing.forEach((i) => {
      const q = qtyFor(i);
      if (!acc[i.n]) acc[i.n] = { n: i.n, q: q, u: i.u, c: i.c, from: [r.name] };
      else if (i.u === "g") { acc[i.n].q += q; acc[i.n].from.push(r.name); }
      else { acc[i.n].q = Math.max(acc[i.n].q, q); acc[i.n].from.push(r.name); }
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
function weekCost(ws) { return shoppingList(ws).filter((i) => !i.have).reduce((a, i) => a + i.won, 0); }
function dayCost(d, ws) {
  const plan = planOf(ws || targetWeek());
  const p = plan && plan[d]; if (!p) return 0;
  let c = 0;
  if (p.main) c += costOf(getR(p.main));
  if (p.side) c += costOf(getR(p.side));
  if (p.soup) {
    let uses = 0;
    DAYS.forEach((x) => { const q = plan[x]; if (q && q.soup && q.soup.id === p.soup.id) uses++; });
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
  // 오늘 탭은 [식단] 화면에서 어느 주를 보고 있든 상관없이 이번 주만 본다
  const tw = thisWeek();
  const plan = planOf(tw);
  const di = todayIdx();
  const p = plan && plan[DAYS[di]];
  let h = "";

  if (!plan) {
    const nx = planOf(addDays(tw, 7));
    h += `<div class="hero">
      <p>이번 주 식단이 아직 없어요.${nx ? "<br>다음 주 식단은 준비돼 있습니다." : ""}</p>
      <button class="btn" data-a="goweek:${tw}">이번 주 식탁 짜러 가기</button>
      ${nx ? `<div class="acts"><button class="mini" data-a="goweek:${addDays(tw, 7)}">다음 주 식단 보기</button></div>` : ""}
    </div>`;
  } else {
    const soup = p && p.soup ? getR(p.soup.id) : null;
    const main = p && p.main ? getR(p.main) : null;
    const side = p && p.side ? getR(p.side) : null;
    const mins = (main ? main.min : 0) + (side ? side.min : 0);
    h += `<div class="hero left">
      <div class="k">오늘 · ${DAYS[di]}요일</div>
      ${!p ? "<h2>메뉴 없음</h2>"
        : p.type === "외식" ? "<h2>바깥에서 먹는 날</h2>"
        : p.type === "반찬" ? "<h2>반찬 사 오는 날</h2>"
        : `<h2>${esc(main ? main.name : "메뉴 없음")}</h2>`}
      <div class="sub">${soup ? esc(soup.name) : ""}${soup && side ? " · " : ""}${side ? esc(side.name) : ""}</div>
      ${mins ? `<div class="sub mt">조리 ${mins}분 · 재료값 ${won(dayCost(DAYS[di], tw))}</div>` : ""}
      <div class="acts"><button class="mini" data-a="goweek:${tw}">이번 주 전체 보기</button></div>
    </div>`;
  }

  const over = S.fridge.filter((f) => leftOf(f) < 0);
  const soon = S.fridge.filter((f) => leftOf(f) <= 2 && leftOf(f) >= 0);
  if (over.length || soon.length) {
    h += `<button class="notice ${over.length ? "bad" : "soon"}" data-a="go:fridge">
      ${over.length ? `기한이 지난 재료 ${over.length}가지를 정리해 주세요`
                    : `<b>${soon.slice(0, 3).map((f) => esc(f.n)).join(", ")}</b>, 이틀 안에 쓰는 게 좋아요`}</button>`;
  }
  if (plan) {
    const ck = checkedOf(tw);
    const buy = shoppingList(tw).filter((i) => !i.have && !ck[i.n]).length;
    if (buy) h += `<button class="notice" data-a="goshop:${tw}">아직 못 산 재료가 ${buy}가지 있어요 · ${won(weekCost(tw))}</button>`;
  }
  if (S.archive.length >= 3 && (!S.lastBackup || gap(S.lastBackup, today()) > 30)) {
    h += `<button class="notice quiet" data-a="gobk">기록이 ${S.archive.length}주 쌓였어요. 백업해 두시겠어요?</button>`;
  }
  if (S.archive.length) h += `<div class="acts"><button class="mini" data-a="go:past">지난 메뉴와 별점 보기</button></div>`;
  return h;
}

function weekView() {
  const plan = curPlan();
  if (!plan) return weekBar() +
    `<div class="hero"><p><b>${weekLabel(targetWeek())}</b> 식단은 아직 없어요.<br>
      버튼을 누르면 이 주 7일치가 정해집니다. 다른 주 식단은 그대로 남습니다.</p>
     <button class="btn" data-a="gen">${weekLabel(targetWeek())} 식탁 짜기</button></div>`;
  const ti = todayIdx(), fresh = targetWeek() === thisWeek();
  const cs = S.settings;
  let h = weekBar() + `<button class="cond${V.cond ? " open" : ""}" data-a="cond">
      <span>반찬 <b>${cs.sideDay}</b> · 외식 <b>${cs.outDay}</b> · <b>${cs.people}명</b></span>
      <span class="ar">${V.cond ? "⌄" : "›"}</span></button>`;
  if (V.cond) {
    h += `<div class="card pad">`;
    [["sideDay", "반찬 사는 날"], ["outDay", "외식하는 날"]].forEach(([k, l]) => {
      h += `<div class="fl">${l}</div><div class="pills">` + DAYS.concat("없음").map((d) =>
        `<button class="pill${cs[k] === d ? " on" : ""}" data-a="cfg:${k}:${d}">${d}</button>`).join("") + `</div>`;
    });
    h += `<div class="fl">식구 수</div><div class="pills">` + [2, 3, 4, 5].map((n) =>
      `<button class="pill${cs.people === n ? " on" : ""}" data-a="cfg:people:${n}">${n}명</button>`).join("") + `</div>
      <div class="acts"><button class="btn" data-a="gen">이 조건으로 다시 짜기</button></div></div>`;
  }
  h += `<div class="bar"><span>메뉴 원가 합계</span>
    <span class="tot">${won(DAYS.reduce((a, d) => a + dayCost(d), 0))}</span></div>`;
  h += `<div class="week-list">`;
  h += DAYS.map((d, i) => {
    const p = plan[d]; if (!p) return "";
    const soup = p.soup ? getR(p.soup.id) : null, main = p.main ? getR(p.main) : null, side = p.side ? getR(p.side) : null;
    const mins = (main ? main.min : 0) + (side ? side.min : 0);
    const open = V.open === d;
    let body;
    if (p.type === "외식") body = `<div class="mn dim">바깥에서 먹는 날</div>`;
    else if (p.type === "반찬") body = `<div class="mn">반찬 사 오는 날</div><div class="sb">${soup ? esc(soup.name) + " · " : ""}밥과 국만</div>`;
    else body = `<div class="mn">${esc(main ? main.name : "메뉴를 골라 주세요")}</div>
      <div class="sb">${soup ? esc(soup.name) : ""}${soup && side ? " · " : ""}${side ? esc(side.name) : ""}</div>`;
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
  h += `<div class="acts"><button class="btn ghost" data-a="gen">${weekLabel(targetWeek())} 다시 짜기</button>
        <button class="btn ghost" data-a="finish">기록에 저장</button>
        <button class="btn ghost" data-a="delweek">이 주 식단 지우기</button></div>`;
  return h;
}

function dayDetail(d, p) {
  const cards = [];
  if (p.soup) cards.push(getR(p.soup.id));
  if (p.main) cards.push(getR(p.main));
  let h = `<div class="detail">`;
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
  const ws = targetWeek();
  if (!planOf(ws)) return weekBar() +
    `<div class="hero"><p><b>${weekLabel(ws)}</b> 식단이 없어서 살 것도 없어요.</p>
     <button class="btn" data-a="go:week">식단 짜러 가기</button></div>`;
  const list = shoppingList(ws);
  const ck = checkedOf(ws);
  const buy = list.filter((i) => !i.have);
  let h = weekBar() + `<p class="lead"><b>${weekLabel(ws)}</b> 메뉴에서 자동으로 뽑은 목록입니다. 메뉴를 바꾸면 여기도 바뀝니다.
    냉장고에 있는 건 회색으로 빠져 있어요.</p>
    <div class="bar"><span>살 것 ${buy.length}가지</span><span class="tot">${won(weekCost(ws))}</span></div>`;
  GROUP_ORDER.forEach((g) => {
    const items = list.filter((i) => GROUP[i.c] === g);
    if (!items.length) return;
    h += `<h3 class="gh">${g}${g === "양념·상비" ? ' <span class="dim">예산 제외</span>' : ""}</h3><div class="card">`;
    items.forEach((i) => {
      const tc = S.trash.filter((t) => t.n === i.n && gap(t.d, today()) < 35).length;
      h += `<div class="li${i.have ? " have" : ""}" ${i.have ? "" : `data-a="chk:${esc(i.n)}"`}>
        <span class="cb${ck[i.n] || i.have ? " on" : ""}"></span>
        <span class="ln">${esc(i.n)}${tc >= 2 ? `<i class="warn">최근 ${tc}번 버림 · 적게</i>` : ""}
          <i class="dim">${esc(i.from.slice(0, 2).join(", "))}</i></span>
        <span class="lq">${i.have ? "집에 있음" : i.q + i.u + (i.won ? "<br><i class='dim'>" + won(i.won) + "</i>" : "")}</span>
        ${i.extra ? `<button class="x" data-a="delextra:${esc(i.n)}">×</button>` : ""}</div>`;
    });
    h += `</div>`;
  });
  h += `<h3 class="gh">직접 추가</h3><div class="card pad">
    <div class="frow ingrow">${ingInput("ex.n", TMP.ex.n, "재료 이름 (예: 우유)")}
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
    <div class="frow ingrow">${ingInput("fr.n", TMP.fr.n, "재료 이름")}
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

const MFILTERS = ["전체", "국", "메인", "곁들임", "고기", "생선", "20분 이하", "내 메뉴"];
const SORTS = [["name", "이름순"], ["cost", "원가순"], ["rating", "별점순"], ["unused", "안 나온 순"]];

function matchFilter(r, kind) {
  const f = V.filter;
  if (f === "전체") return true;
  if (f === "국") return kind === "soup";
  if (f === "메인") return kind === "main";
  if (f === "곁들임") return kind === "side";
  if (f === "고기") return ["돼지", "소", "닭", "오리"].indexOf(r.p) > -1;
  if (f === "생선") return r.p === "생선";
  if (f === "20분 이하") return r.min <= 20;
  if (f === "내 메뉴") return r.id[0] === "c";
  return true;
}
function sortMenus(list) {
  const cp = list.slice();
  if (V.sort === "cost") return cp.sort((a, b) => costOf(b) - costOf(a));
  if (V.sort === "rating") return cp.sort((a, b) => (ratingOf(b.id) || 0) - (ratingOf(a.id) || 0));
  if (V.sort === "unused") {
    const seen = {};
    S.archive.forEach((w, wi) => DAYS.forEach((d) => {
      const p = w.days[d]; if (!p) return;
      [p.main, p.side, p.soup && p.soup.id].filter(Boolean).forEach((id) => { if (seen[id] === undefined) seen[id] = wi; });
    }));
    return cp.sort((a, b) => (seen[b.id] === undefined ? 999 : seen[b.id]) - (seen[a.id] === undefined ? 999 : seen[a.id]));
  }
  return cp.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function menuRow(r, kind) {
  const ex = S.excluded.indexOf(r.id) > -1, lo = S.loved.indexOf(r.id) > -1;
  const op = V.openRec === r.id, mine = r.id[0] === "c", ed = !!S.edits[r.id];
  const rt = ratingOf(r.id);
  let h = `<div class="mi${ex ? " off" : ""}"><div class="mrow">
    <button class="mname" data-a="rec:${r.id}">${esc(r.name)}
      ${mine ? '<i class="tag">내 메뉴</i>' : ed ? '<i class="tag">수정함</i>' : ""}
      ${rt ? `<i class="tag star">★${rt.toFixed(1)}</i>` : ""}</button>
    <span class="dim">${r.min}분 · ${won(costOf(r))}</span></div>`;
  if (op) h += `<div class="mdet">
    <div class="ings">${r.ing.length ? r.ing.map((i) => esc(i.n) + " " + i.q + i.u).join("  ·  ") : "등록된 재료가 없습니다"}</div>
    ${r.s && r.s.length ? "<ol>" + r.s.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>" : ""}
    ${r.tip ? `<div class="tip">${esc(r.tip)}</div>` : ""}
    <div class="acts">
      <button class="mini${lo ? " on" : ""}" data-a="love:${r.id}">${lo ? "자주 나오게 ✓" : "자주 나오게"}</button>
      <button class="mini" data-a="excl:${r.id}">${ex ? "다시 넣기" : "빼기"}</button>
      <button class="mini" data-a="edit:${r.id}">수정</button>
      ${mine ? `<button class="mini" data-a="delrec:${r.id}">삭제</button>`
             : ed ? `<button class="mini" data-a="reset:${r.id}">원래대로</button>` : ""}
    </div></div>`;
  return h + `</div>`;
}

function menuListView() {
  const q = (V.q.menu || "").trim();
  let h = `<div class="searchbar">
    <span class="material-symbols-rounded">search</span>
    <input id="q-menu" data-f="q.menu" value="${esc(q)}" placeholder="메뉴 이름이나 재료로 찾기" autocomplete="off">
    ${q ? `<button class="x" data-a="clearq:menu">×</button>` : ""}
  </div>
  <div class="chips">${MFILTERS.map((f) => `<button class="chip${V.filter === f ? " on" : ""}" data-a="filter:${f}">${f}</button>`).join("")}</div>
  <div class="sortrow">${SORTS.map(([k, l]) => `<button class="slink${V.sort === k ? " on" : ""}" data-a="sort:${k}">${l}</button>`).join("")}
    <button class="btn small" data-a="new:main">＋ 새 메뉴</button></div>`;

  const hit = (r) => !q || r.name.indexOf(q) > -1 || (r.ing || []).some((i) => i.n.indexOf(q) > -1);
  const groups = KINDS.map(([k, l]) => [l, k, sortMenus(pool(k).filter((r) => hit(r) && matchFilter(r, k)))]);
  const total = groups.reduce((a, g) => a + g[2].length, 0);
  if (!total) return h + `<p class="lead mt">찾는 메뉴가 없어요. 검색어를 지우거나 필터를 「전체」로 바꿔 보세요.</p>`;

  groups.forEach(([l, k, list]) => {
    if (!list.length) return;
    // 헤더와 목록을 한 덩어리로 묶어야 다음 분류가 올라올 때 이전 헤더가 밀려난다
    h += `<section class="grp"><h3 class="gh sticky">${l} <span class="dim">${list.length}</span></h3><div class="card">`;
    list.forEach((r) => { h += menuRow(r, k); });
    h += `</div></section>`;
  });
  return h;
}

function itemView() {
  const idx = ingIndex();
  const q = (V.q.item || "").trim();
  let h = `<div class="searchbar">
    <span class="material-symbols-rounded">search</span>
    <input id="q-item" data-f="q.item" value="${esc(q)}" placeholder="재료 이름으로 찾기" autocomplete="off">
    ${q ? `<button class="x" data-a="clearq:item">×</button>` : ""}
  </div>`;

  if (V.itemForm) {
    const f = V.itemForm;
    h += `<div class="card pad">
      <div class="fl">${f.old ? "재료 수정" : "새 재료"}</div>
      ${ingInput("itemForm.n", f.n, "재료 이름")}
      <div class="frow mt">
        <select data-f="itemForm.u" class="w80">${UNITS.map((u) => `<option${u === f.u ? " selected" : ""}>${u}</option>`).join("")}</select>
        <select data-f="itemForm.c" class="w90">${CATS.map((c) => `<option${c === f.c ? " selected" : ""}>${c}</option>`).join("")}</select>
        <input data-f="itemForm.price" value="${f.price}" class="w80" placeholder="가격"><span class="dim">원</span>
      </div>
      <p class="hint">g 단위 재료는 1g당 가격, 나머지는 1단위당 가격입니다.</p>
      <div class="acts"><button class="btn" data-a="itemsave">저장</button>
        <button class="btn ghost" data-a="itemcancel">취소</button></div>
    </div>`;
  } else {
    h += `<div class="sortrow"><span class="dim">${Object.keys(idx).length}가지</span>
      <button class="btn small" data-a="itemnew">＋ 재료 추가</button></div>`;
  }

  const names = Object.keys(idx).filter((n) => !q || n.indexOf(q) > -1).sort();
  const byGroup = {};
  names.forEach((n) => { const g = GROUP[idx[n].c] || "기타"; (byGroup[g] = byGroup[g] || []).push(n); });
  GROUP_ORDER.concat("기타").forEach((g) => {
    const list = byGroup[g]; if (!list || !list.length) return;
    h += `<section class="grp"><h3 class="gh sticky">${g} <span class="dim">${list.length}</span></h3><div class="card">`;
    list.forEach((n) => {
      const i = idx[n];
      h += `<div class="li"><span class="ln">${esc(n)}
        <i class="dim">${i.u === "g" ? "1g당" : "1" + i.u + "당"} · ${i.c}${i.uses ? " · 메뉴 " + i.uses + "개" : ""}${isMine(n) ? " · 직접 추가" : ""}</i></span>
        <span class="lq"><input class="pin" type="number" data-price="${esc(n)}" value="${priceOf(n)}">원</span>
        <button class="mini" data-a="itemedit:${encodeURIComponent(n)}">수정</button></div>`;
    });
    h += `</div></section>`;
  });
  if (!names.length) h += `<p class="lead mt">찾는 재료가 없어요.</p>`;
  return h;
}

function menuView() {
  if (V.form) return formView();
  const tabs = [["list", "메뉴"], ["item", "재료"], ["data", "백업"]];
  let h = `<div class="tabs">${tabs.map(([k, l]) =>
    `<button class="tb${V.sub === k ? " on" : ""}" data-a="sub:${k}">${l}</button>`).join("")}</div>`;
  if (V.sub === "data") return h + dataView();
  if (V.sub === "item") return h + itemView();
  return h + menuListView();
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
  // 메뉴만 담긴 배열
  if (Array.isArray(d)) return { recipes: d, mode: "skip" };
  // 이 앱이 내보낸 백업 파일
  if (d.app === "dinner-table" && d.data) {
    return { state: d.data, recipes: d.data.custom, prices: d.data.prices, mode: "skip" };
  }
  // 메뉴·가격을 담은 전달용 파일 (둘 중 하나만 있어도 된다)
  if (d.recipes || d.menus || d.prices) {
    return { recipes: d.recipes || d.menus || [], prices: d.prices || null, mode: d.mode === "replace" ? "replace" : "skip" };
  }
  // 예전 형식(상태 객체 그대로)
  if (d.custom || d.archive || d.settings) {
    return { state: d, recipes: d.custom, prices: d.prices, mode: "skip" };
  }
  throw new Error("형식을 알 수 없습니다");
}
function normalize(obj) {
  const base = JSON.parse(JSON.stringify(FRESH));
  const s = Object.assign(base, obj);
  s.settings = Object.assign({}, FRESH.settings, obj.settings || {});
  ["fridge", "extra", "trash", "loved", "excluded", "custom", "archive", "items"]
    .forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
  ["checked", "edits", "prices"].forEach((k) => { if (!s[k] || typeof s[k] !== "object") s[k] = {}; });
  return s;
}
function mergeRecipes(list, replace) {
  let added = 0, updated = 0, skipped = 0;
  (list || []).forEach((r) => {
    const name = (r.name || "").trim(); if (!name) return;
    const kind = ["soup", "main", "side"].indexOf(r.kind) > -1 ? r.kind : "main";
    const min = Number(r.min) || 20;
    const body = {
      name: name, min: min, w: min > 30, hearty: min >= 30,
      ing: (r.ing || []).filter((i) => i && i.n).map((i) => ({
        n: String(i.n).trim(), q: Number(i.q) || 1,
        u: UNITS.indexOf(i.u) > -1 ? i.u : "개",
        c: CATS.indexOf(i.c) > -1 ? i.c : "채소",
      })),
      s: Array.isArray(r.s) ? r.s : String(r.s || "").split("\n").filter(Boolean),
    };
    const hit = pool(kind).filter((x) => x.name === name)[0];
    if (hit) {
      if (replace !== true) { skipped++; return; }
      // 내가 만든 메뉴는 그 자리에서, 기본 메뉴는 수정분으로 덮는다
      if (hit.id[0] === "c") S.custom = S.custom.map((c) => c.id === hit.id ? Object.assign({}, c, body) : c);
      else S.edits[hit.id] = body;
      updated++; return;
    }
    S.custom.push(Object.assign({
      id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      kind: kind, p: r.p || "기타",
    }, body));
    added++;
  });
  return { added: added, updated: updated, skipped: skipped };
}

function mergePrices(obj) {
  let n = 0;
  Object.keys(obj || {}).forEach((k) => {
    const v = Number(obj[k]);
    if (!isNaN(v) && v >= 0) { S.prices[k] = v; n++; }
  });
  return n;
}

function formView() {
  const f = V.form;
  return `<h3 class="gh">${f.id ? "메뉴 수정" : "새 메뉴"}</h3><div class="card pad">
    <div class="pills">${KINDS.map(([k, l]) => `<button class="pill${f.kind === k ? " on" : ""}" data-a="fkind:${k}">${l}</button>`).join("")}</div>
    <input data-f="form.name" value="${esc(f.name)}" placeholder="메뉴 이름">
    <div class="frow mt"><span class="fl">조리 시간</span><input data-f="form.min" value="${f.min}" class="w70">분</div>
    <p class="hint">30분이 넘으면 평일에는 배정하지 않고 주말에만 올립니다.</p>
    <div class="fl mt">필요한 재료</div>
    ${f.ing.map((g, ix) => `<div class="frow ingrow">
      ${ingInput("form.ing." + ix + ".n", g.n, "재료")}
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
   히스토리에 여분 칸을 하나 두고, 뒤로가기가 그 칸을 소비할 때마다
   열린 창을 닫거나 홈으로 보낸다. 예전처럼 지나간 화면 상태를 되살리지 않는다. */
function pushGuard() { history.pushState({ guard: 1 }, ""); }
let exitHint = 0;
window.addEventListener("popstate", function () {
  cleanupDrag();
  if (V.picker || V.form || V.itemForm || V.sug) {
    V.picker = null; V.form = null; V.itemForm = null; V.sug = null;
    render(); pushGuard(); return;
  }
  if (V.screen !== "home") {
    V.screen = "home"; V.sub = "list"; V.open = null; V.openRec = null; V.openWeek = null;
    render(); pushGuard(); return;
  }
  if (Date.now() - exitHint > 2000) {         // 홈에서는 한 번 더 눌러야 닫힌다
    exitHint = Date.now(); toast("한 번 더 누르면 앱이 닫힙니다"); pushGuard();
  }
});

/* ══ 하단 탭바 ══ */
const TABS = [["home", "wb_twilight", "오늘"], ["week", "calendar_month", "식단"],
  ["shop", "shopping_bag", "장보기"], ["fridge", "kitchen", "냉장고"], ["menu", "menu_book", "메뉴관리"]];
function tabbarHTML() {
  const cur = V.screen === "past" ? "week" : V.screen;
  return TABS.map(([k, ic, l]) => `<button class="tab${cur === k ? " on" : ""}" data-a="go:${k}">
    <span class="material-symbols-rounded">${ic}</span><i>${l}</i></button>`).join("");
}

/* ══ 렌더 ══ */
const TITLES = { home: "오늘 저녁", week: "이번 주 식단", shop: "장보기", fridge: "냉장고 관리", menu: "메뉴 관리", past: "지난 메뉴" };
function render() {
  cleanupDrag();          // 화면을 다시 그리기 전에 떠 있는 클론을 없앤다
  const app = document.getElementById("app");
  document.getElementById("title").textContent = TITLES[V.screen];
  // 탭바가 있으므로 ‹ 는 되돌릴 곳이 있을 때만
  document.getElementById("back").style.visibility = (V.form || V.screen === "past") ? "visible" : "hidden";
  app.innerHTML = { home: homeView, week: weekView, shop: shopView, fridge: fridgeView, menu: menuView, past: pastView }[V.screen]();
  document.getElementById("sheet").innerHTML = V.picker ? pickerHTML() : "";
  document.getElementById("sheet").className = V.picker ? "on" : "";
  document.getElementById("tabbar").innerHTML = tabbarHTML();
  // 화면(또는 하위 탭)이 바뀔 때만 스크롤 초기화
  if (prevScreen !== V.screen + "/" + V.sub) {
    window.scrollTo(0, 0);
    prevScreen = V.screen + "/" + V.sub;
  }
  // 검색·재료를 입력하는 중에는 다시 그려도 커서를 잃지 않게
  if (V.focus) {
    const el = document.getElementById(V.focus);
    if (el) { el.focus(); if (el.setSelectionRange) { const n = String(el.value).length; el.setSelectionRange(n, n); } }
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

/* ══ 입력 ══
   한글은 자음과 모음이 합쳐지는 "조합" 과정을 거친다.
   그 도중에 화면을 다시 그리면 입력칸이 통째로 새로 만들어지면서
   조합 중이던 글자가 깨진다("삼치" → "ㅅㅏㅁㅊㅣ").
   그래서 조합 중에는 그리지 않고, 손이 멎은 뒤에 한 번만 그린다. */
let composing = false;
let renderTimer = null;
document.addEventListener("compositionstart", function () { composing = true; });
document.addEventListener("compositionend", function () { composing = false; });
function lazyRender(ms) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(function () {
    if (composing) { lazyRender(180); return; }   // 아직 조합 중이면 조금 더 기다린다
    render();
  }, ms || 320);
}

const TMP = { ex: { n: "", q: "1", u: "개", c: "채소" }, fr: { n: "", q: "", c: "채소" }, imp: { t: "" } };
document.addEventListener("input", (e) => {
  const f = e.target.dataset.f; if (!f) return;
  // 검색창
  if (f.indexOf("q.") === 0) {
    V.q[f.slice(2)] = e.target.value; V.focus = e.target.id; lazyRender(); return;
  }
  const parts = f.split(".");
  if (parts[0] === "form") {
    if (parts[1] === "ing") V.form.ing[+parts[2]][parts[3]] = e.target.value;
    else V.form[parts[1]] = e.target.value;
  } else TMP[parts[0]][parts[1]] = e.target.value;
  // 재료 이름이면 후보를 띄운다
  if (e.target.dataset.ing) {
    V.sug = e.target.dataset.ing; V.focus = e.target.id; lazyRender();
  }
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
  clearTimeout(renderTimer);          // 대기 중이던 그리기는 버린다
  composing = false;
  if (b.dataset.a !== "delweek") V.delw = false;
  const [a, x, y, z] = b.dataset.a.split(":");

  if (a === "go") { V.screen = x; V.open = null; V.form = null; }
  else if (a === "back") { V.screen = "home"; V.form = null; }
  else if (a === "gen") generate();
  else if (a === "day") V.open = V.open === x ? null : x;
  else if (a === "pick") V.picker = { day: x, slot: y };
  else if (a === "closepick") V.picker = null;
  else if (a === "putslot") {
    V.picker = null;
    const pl = curPlan();
    if (pl && pl[x]) {
      const p = Object.assign({}, pl[x]);
      if (y === "soup") p.soup = { id: z }; else p[y] = z;
      if (y === "main" && p.type !== "집밥") p.type = "집밥";
      pl[x] = p; save();
    } else toast("먼저 이 주 식단을 짜 주세요");
  }
  else if (a === "cfg") { S.settings[x] = x === "people" ? Number(y) : y; save(); }
  else if (a === "clear") { const pl = curPlan(); if (!pl) return;
    const p = Object.assign({}, pl[x]); if (y === "soup") p.soup = null; else p[y] = null; pl[x] = p; save(); }
  else if (a === "type") { const pl = curPlan(); if (!pl) return;
    pl[x] = Object.assign({}, pl[x], { type: y }); save(); }
  else if (a === "chk") { const ck = checkedOf(targetWeek()); ck[x] = !ck[x]; save(); }
  else if (a === "addextra") {
    if (!TMP.ex.n.trim()) return toast("재료 이름을 적어 주세요");
    S.extra.push({ n: TMP.ex.n.trim(), q: Number(TMP.ex.q) || 1, u: TMP.ex.u, c: TMP.ex.c });
    TMP.ex.n = ""; save();
  }
  else if (a === "delextra") { S.extra = S.extra.filter((i) => i.n !== x); save(); }
  else if (a === "buy") {
    const ws = targetWeek(), ck = checkedOf(ws);
    const list = shoppingList(ws).filter((i) => ck[i.n] && !i.have);
    if (!list.length) return toast("체크한 것이 없어요");
    S.fridge = S.fridge.filter((f) => !list.some((i) => i.n === f.n))
      .concat(list.map((i) => ({ id: Math.random().toString(36).slice(2), n: i.n, c: i.c, q: i.q + i.u, bought: today() })));
    S.checked[ws] = {}; save(); V.screen = "fridge"; toast(list.length + "가지를 냉장고에 넣었어요");
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
  else if (a === "sub") { V.sub = x; V.openRec = null; V.wipe = false; V.sug = null; V.focus = null; }
  else if (a === "cond") V.cond = !V.cond;
  else if (a === "wshift") { V.week = addDays(targetWeek(), Number(x)); V.open = null; }
  else if (a === "goweek") { V.week = x; V.screen = "week"; V.open = null; }
  else if (a === "goshop") { V.week = x; V.screen = "shop"; }
  else if (a === "delweek") {
    const ws = targetWeek();
    if (!V.delw) { V.delw = true; toast("한 번 더 누르면 이 주 식단이 지워집니다"); }
    else { delete S.plans[ws]; delete S.checked[ws]; V.delw = false; save(); toast(weekLabel(ws) + " 식단을 지웠어요"); }
  }
  else if (a === "filter") { V.filter = decodeURIComponent(x); V.openRec = null; }
  else if (a === "sort") V.sort = x;
  else if (a === "clearq") { V.q[x] = ""; V.focus = null; }
  else if (a === "usesug") {
    const path = decodeURIComponent(x), name = decodeURIComponent(y);
    const parts = path.split(".");
    if (parts[0] === "form") V.form.ing[+parts[2]].n = name;
    else if (parts[0] === "itemForm") V.itemForm.n = name;
    else TMP[parts[0]][parts[1]] = name;
    const known = ingIndex()[name];   // 이미 아는 재료면 단위·분류도 맞춘다
    if (known) {
      if (parts[0] === "form") { V.form.ing[+parts[2]].u = known.u; V.form.ing[+parts[2]].c = known.c; }
      else if (parts[0] === "itemForm") { V.itemForm.u = known.u; V.itemForm.c = known.c; }
      else if (TMP[parts[0]]) { if ("u" in TMP[parts[0]]) TMP[parts[0]].u = known.u; TMP[parts[0]].c = known.c; }
    }
    V.sug = null; V.focus = null;
  }
  else if (a === "itemnew") { V.itemForm = { n: "", u: "개", c: "채소", price: 0, old: null }; V.sug = null; }
  else if (a === "itemedit") {
    const n = decodeURIComponent(x), i = ingIndex()[n];
    V.itemForm = { n: n, u: i ? i.u : "개", c: i ? i.c : "채소", price: priceOf(n), old: n };
    V.sub = "item"; V.sug = null;
  }
  else if (a === "itemcancel") { V.itemForm = null; V.sug = null; }
  else if (a === "itemsave") {
    const f = V.itemForm, name = (f.n || "").trim();
    if (!name) return toast("재료 이름을 적어 주세요");
    S.prices[name] = Number(f.price) || 0;
    if (f.old && f.old !== name) { delete S.prices[f.old]; S.items = S.items.filter((i) => i.n !== f.old); }
    const at = S.items.filter((i) => i.n === name)[0];
    if (at) { at.u = f.u; at.c = f.c; } else S.items.push({ n: name, u: f.u, c: f.c });
    V.itemForm = null; V.sug = null; save(); toast(name + " 저장했어요");
  }
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
      const r = mergeRecipes(got.recipes || [], got.mode === "replace");
      const pn = mergePrices(got.prices);
      TMP.imp.t = ""; save();
      const bits = [];
      if (r.added) bits.push("메뉴 " + r.added + "개 추가");
      if (r.updated) bits.push(r.updated + "개 갱신");
      if (r.skipped) bits.push(r.skipped + "개는 이름이 같아 건너뜀");
      if (pn) bits.push("가격 " + pn + "개 반영");
      toast(bits.length ? bits.join(", ") : "가져올 것이 없었어요");
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
    Object.keys(S.plans).forEach((ws) => DAYS.forEach((d) => { const p = S.plans[ws][d]; if (!p) return;
      if (p.soup && p.soup.id === x) p.soup = null; if (p.main === x) p.main = null; if (p.side === x) p.side = null; }));
    save(); toast("메뉴를 지웠어요");
  }
  else if (a === "finish") { archiveWeek(targetWeek()); save(); V.screen = "past"; V.openWeek = 0; toast("기록에 저장했어요"); }
  else if (a === "wk") V.openWeek = V.openWeek === +x ? null : +x;
  else if (a === "rate") { S.archive[+x].days[y].rating = +z; save(); }
  else if (a === "delwk") { S.archive.splice(+x, 1); V.openWeek = null; save(); }
  else if (a === "reuse") {
    const w = S.archive[+x]; const plan = {};
    DAYS.forEach((d) => { const p = w.days[d]; plan[d] = p ? { type: p.type, soup: p.soup, main: p.main, side: p.side } : null; });
    const ws = targetWeek();
    archiveWeek(ws); S.plans[ws] = plan; S.checked[ws] = {};
    save(); V.screen = "week"; toast(weekLabel(ws) + " 식단으로 가져왔어요");
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
  if (V.form || V.itemForm || V.picker) { V.form = null; V.itemForm = null; V.picker = null; }
  else { V.screen = "home"; V.sub = "list"; }
  render();
});
/* 한 화면 넘게 내려갔을 때만 위로가기 버튼을 띄운다 */
window.addEventListener("scroll", function () {
  const b = document.getElementById("totop");
  if (b) b.classList.toggle("on", window.scrollY > 400);
}, { passive: true });
document.getElementById("totop").addEventListener("click", function () {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

render();
pushGuard();
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

function swapDays(a, b) {
  const plan = curPlan(); if (!plan) return;
  const old = JSON.parse(JSON.stringify(plan));
  plan[a] = old[b];
  plan[b] = old[a];
  save();
  V.open = null;
  render();
  toast(a + " ↔ " + b + " 메뉴를 바꿨어요");
}

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
      dragClone.removeAttribute('data-day');
      dragClone.style.width = dragSrc.offsetWidth + 'px';
      document.body.appendChild(dragClone);
      dragSrc.classList.add('drag-origin');
    }

    e.preventDefault();
    const containerRect = dragSrc.parentNode.parentNode.getBoundingClientRect();
    dragClone.style.top = (getY(e) - offsetY) + 'px';
    dragClone.style.left = dragSrc.getBoundingClientRect().left + 'px';

    // 드롭 대상 하이라이트
    // 클론(.dragging)은 손가락 바로 아래에 있고 data-day를 물려받았기 때문에
    // 제외하지 않으면 자기 자신이 드롭 대상으로 잡혀 아무 일도 일어나지 않는다
    const allCards = [...document.querySelectorAll('.day-content[data-day]:not(.dragging)')];
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
    if (dropTarget && dropTarget.dataset.day && dropTarget.dataset.day !== dragSrcDay) {
      swapDays(dragSrcDay, dropTarget.dataset.day);
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
      dragClone.removeAttribute('data-day');
      dragClone.style.width = dragSrc.offsetWidth + 'px';
      document.body.appendChild(dragClone);
      dragSrc.classList.add('drag-origin');
    }

    e.preventDefault();
    dragClone.style.top = (getY(e) - offsetY) + 'px';
    dragClone.style.left = dragSrc.getBoundingClientRect().left + 'px';

    // 터치 좌표로 대상 찾기 (elementFromPoint 사용)
    // 클론(.dragging)은 손가락 바로 아래에 있고 data-day를 물려받았기 때문에
    // 제외하지 않으면 자기 자신이 드롭 대상으로 잡혀 아무 일도 일어나지 않는다
    const allCards = [...document.querySelectorAll('.day-content[data-day]:not(.dragging)')];
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

    if (dropTarget && dropTarget.dataset.day && dropTarget.dataset.day !== dragSrcDay) {
      swapDays(dragSrcDay, dropTarget.dataset.day);
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
