// 競馬予想機能: レースと出走馬を登録し、簡易スコアで予想順位を算出。
// 結果・購入金額・払戻金額も記録して収支を集計する。
const Keiba = (() => {
  const STORAGE_KEY = "keiba_races";
  let races = Storage.load(STORAGE_KEY, []);
  let horseRowSeq = 0;

  const els = {};
  function cacheEls() {
    els.search = document.getElementById("keibaSearch");
    els.sort = document.getElementById("keibaSort");
    els.addBtn = document.getElementById("keibaAddBtn");
    els.formWrap = document.getElementById("keibaFormWrap");
    els.form = document.getElementById("keibaForm");
    els.cancelBtn = document.getElementById("keibaCancelBtn");
    els.id = document.getElementById("keibaId");
    els.name = document.getElementById("keibaName");
    els.date = document.getElementById("keibaDate");
    els.track = document.getElementById("keibaTrack");
    els.distance = document.getElementById("keibaDistance");
    els.horseRows = document.getElementById("keibaHorseRows");
    els.addHorseBtn = document.getElementById("keibaAddHorseBtn");
    els.stake = document.getElementById("keibaStake");
    els.payout = document.getElementById("keibaPayout");
    els.memo = document.getElementById("keibaMemo");
    els.list = document.getElementById("keibaList");
    els.empty = document.getElementById("keibaEmpty");
    els.stats = document.getElementById("keibaStats");
  }

  function persist() {
    Storage.save(STORAGE_KEY, races);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  const RATING_LABELS = ["-", "★☆☆☆☆", "★★☆☆☆", "★★★☆☆", "★★★★☆", "★★★★★"];
  function ratingOptions(selected) {
    return RATING_LABELS
      .map((label, i) => `<option value="${i}" ${Number(selected) === i ? "selected" : ""}>${label}</option>`)
      .join("");
  }

  // 簡易スコア: 人気・前走着順・自己評価から予想順位を算出する。
  function calcScore(horse) {
    const popScore = horse.popularity ? Math.max(0, 20 - horse.popularity) * 3 : 0;
    const lastScore = horse.lastFinish ? Math.max(0, 10 - horse.lastFinish) * 2 : 0;
    const ratingScore = (horse.selfRating || 0) * 8;
    return popScore + lastScore + ratingScore;
  }

  function horseRowHtml(h = {}) {
    const rowId = `h${horseRowSeq++}`;
    return `
    <div class="horse-row" data-row-id="${rowId}">
      <div class="horse-row-grid">
        <div><label>馬番</label><input type="number" min="1" class="h-number" value="${h.number ?? ""}"></div>
        <div><label>馬名</label><input type="text" class="h-name" value="${escapeHtml(h.name || "")}"></div>
        <div><label>騎手</label><input type="text" class="h-jockey" value="${escapeHtml(h.jockey || "")}"></div>
        <div><label>人気</label><input type="number" min="1" class="h-popularity" value="${h.popularity ?? ""}"></div>
        <div><label>オッズ</label><input type="number" min="0" step="0.1" class="h-odds" value="${h.odds ?? ""}"></div>
        <div><label>前走着順</label><input type="number" min="1" class="h-lastfinish" value="${h.lastFinish ?? ""}"></div>
        <div><label>自己評価</label><select class="h-rating">${ratingOptions(h.selfRating || 0)}</select></div>
        <div><label>着順(結果)</label><input type="number" min="1" class="h-finish" value="${h.finish ?? ""}"></div>
      </div>
      <button type="button" class="remove-horse-btn" title="この馬を削除">✕</button>
    </div>`;
  }

  function addHorseRow(horse) {
    els.horseRows.insertAdjacentHTML("beforeend", horseRowHtml(horse));
  }

  function readHorseRows() {
    return [...els.horseRows.querySelectorAll(".horse-row")]
      .map((row) => ({
        number: Number(row.querySelector(".h-number").value) || undefined,
        name: row.querySelector(".h-name").value.trim(),
        jockey: row.querySelector(".h-jockey").value.trim(),
        popularity: Number(row.querySelector(".h-popularity").value) || undefined,
        odds: Number(row.querySelector(".h-odds").value) || undefined,
        lastFinish: Number(row.querySelector(".h-lastfinish").value) || undefined,
        selfRating: Number(row.querySelector(".h-rating").value) || 0,
        finish: Number(row.querySelector(".h-finish").value) || undefined,
      }))
      .filter((h) => h.name);
  }

  function openForm(race) {
    els.formWrap.classList.remove("hidden");
    els.horseRows.innerHTML = "";
    if (race) {
      els.id.value = race.id;
      els.name.value = race.name;
      els.date.value = race.date || "";
      els.track.value = race.track || "";
      els.distance.value = race.distance || "";
      els.stake.value = race.stake ?? "";
      els.payout.value = race.payout ?? "";
      els.memo.value = race.memo || "";
      (race.horses || []).forEach(addHorseRow);
    } else {
      els.form.reset();
      els.id.value = "";
      addHorseRow();
    }
    els.name.focus();
  }

  function closeForm() {
    els.formWrap.classList.add("hidden");
    els.form.reset();
    els.id.value = "";
    els.horseRows.innerHTML = "";
  }

  function handleSubmit(e) {
    e.preventDefault();
    const name = els.name.value.trim();
    if (!name) return;

    const race = {
      id: els.id.value || String(Date.now()),
      name,
      date: els.date.value,
      track: els.track.value.trim(),
      distance: els.distance.value.trim(),
      horses: readHorseRows(),
      stake: Number(els.stake.value) || 0,
      payout: Number(els.payout.value) || 0,
      memo: els.memo.value.trim(),
    };

    const existingIdx = races.findIndex((r) => r.id === race.id);
    if (existingIdx >= 0) {
      races[existingIdx] = race;
    } else {
      races.push(race);
    }
    persist();
    closeForm();
    render();
  }

  function deleteRace(id) {
    if (!confirm("このレースの記録を削除しますか？")) return;
    races = races.filter((r) => r.id !== id);
    persist();
    render();
  }

  function editRace(id) {
    const race = races.find((r) => r.id === id);
    if (race) openForm(race);
  }

  function rankedHorses(race) {
    return [...(race.horses || [])]
      .map((h) => ({ ...h, score: calcScore(h) }))
      .sort((a, b) => b.score - a.score);
  }

  // 予想的中: スコア最上位の馬が実際に1着だった場合。着順未入力のレースは対象外。
  function predictionHit(race) {
    const ranked = rankedHorses(race);
    if (!ranked.length || !ranked.some((h) => h.finish)) return null;
    return ranked[0].finish === 1;
  }

  function renderStats() {
    const totalRaces = races.length;
    const totalStake = races.reduce((sum, r) => sum + (r.stake || 0), 0);
    const totalPayout = races.reduce((sum, r) => sum + (r.payout || 0), 0);
    const profit = totalPayout - totalStake;
    const recoveryRate = totalStake > 0 ? Math.round((totalPayout / totalStake) * 1000) / 10 : 0;
    const judged = races.map(predictionHit).filter((v) => v !== null);
    const hitRate = judged.length
      ? Math.round((judged.filter(Boolean).length / judged.length) * 1000) / 10
      : null;

    const tiles = [
      { label: "総レース数", value: `${totalRaces}件` },
      { label: "予想的中率", value: hitRate === null ? "-" : `${hitRate}%` },
      { label: "総購入額", value: `${totalStake.toLocaleString()}円` },
      { label: "総払戻額", value: `${totalPayout.toLocaleString()}円` },
      {
        label: "収支",
        value: `${profit >= 0 ? "+" : ""}${profit.toLocaleString()}円`,
        cls: profit > 0 ? "profit-pos" : profit < 0 ? "profit-neg" : "",
      },
      { label: "回収率", value: `${recoveryRate}%` },
    ];

    els.stats.innerHTML = tiles
      .map(
        (t) => `
      <div class="stat-tile">
        <div class="stat-label">${t.label}</div>
        <div class="stat-value ${t.cls || ""}">${t.value}</div>
      </div>`
      )
      .join("");
  }

  function getFilteredSorted() {
    const keyword = els.search.value.trim().toLowerCase();
    let list = races.filter((r) => {
      if (!keyword) return true;
      return (
        r.name.toLowerCase().includes(keyword) ||
        (r.track || "").toLowerCase().includes(keyword)
      );
    });

    const sort = els.sort.value;
    list = [...list].sort((a, b) => {
      if (sort === "date_asc") return (a.date || "").localeCompare(b.date || "");
      return (b.date || "").localeCompare(a.date || "");
    });
    return list;
  }

  function renderRaceCard(race) {
    const ranked = rankedHorses(race);
    const profit = (race.payout || 0) - (race.stake || 0);
    const hit = predictionHit(race);
    const metaParts = [race.track, race.distance, race.date].filter(Boolean);

    const badges = [];
    if (hit !== null) {
      badges.push(`<span class="badge ${hit ? "hit" : ""}">${hit ? "◎ 予想的中" : "予想外れ"}</span>`);
    }
    if (race.stake || race.payout) {
      badges.push(
        `<span class="badge ${profit > 0 ? "profit-pos" : profit < 0 ? "profit-neg" : ""}">収支 ${profit >= 0 ? "+" : ""}${profit.toLocaleString()}円</span>`
      );
    }

    const tableRows = ranked
      .map(
        (h, i) => `
      <tr>
        <td>${i + 1}位</td>
        <td>${h.number ?? "-"}</td>
        <td>${escapeHtml(h.name)}</td>
        <td>${escapeHtml(h.jockey || "-")}</td>
        <td>${h.popularity ? `${h.popularity}人気` : "-"}</td>
        <td>${h.odds ?? "-"}</td>
        <td>${RATING_LABELS[h.selfRating || 0]}</td>
        <td class="${h.finish === 1 ? "winner" : ""}">${h.finish ? `${h.finish}着` : "-"}</td>
      </tr>`
      )
      .join("");

    return `
    <div class="race-card" data-id="${race.id}">
      <div class="race-header">
        <div>
          <div class="race-title">${escapeHtml(race.name)}</div>
          ${metaParts.length ? `<div class="race-meta">${metaParts.map(escapeHtml).join(" ・ ")}</div>` : ""}
        </div>
        <div class="race-badges">${badges.join("")}</div>
      </div>
      ${
        ranked.length
          ? `<div class="horse-table-wrap">
        <table class="horse-table">
          <thead>
            <tr><th>予想</th><th>馬番</th><th>馬名</th><th>騎手</th><th>人気</th><th>オッズ</th><th>評価</th><th>着順</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`
          : ""
      }
      ${race.memo ? `<div class="race-memo">${escapeHtml(race.memo)}</div>` : ""}
      <div class="race-actions">
        <button data-action="edit" class="ghost-btn small-btn">編集</button>
        <button data-action="delete" class="ghost-btn small-btn">削除</button>
      </div>
    </div>`;
  }

  function render() {
    renderStats();
    const list = getFilteredSorted();
    els.empty.classList.toggle("hidden", races.length > 0);
    els.list.innerHTML = list.map(renderRaceCard).join("");
  }

  function handleListClick(e) {
    const card = e.target.closest(".race-card");
    if (!card) return;
    const id = card.dataset.id;
    const action = e.target.dataset.action;
    if (action === "edit") editRace(id);
    if (action === "delete") deleteRace(id);
  }

  function handleHorseRowsClick(e) {
    const removeBtn = e.target.closest(".remove-horse-btn");
    if (!removeBtn) return;
    removeBtn.closest(".horse-row").remove();
  }

  function init() {
    cacheEls();
    render();

    els.addBtn.addEventListener("click", () => openForm(null));
    els.cancelBtn.addEventListener("click", closeForm);
    els.form.addEventListener("submit", handleSubmit);
    els.addHorseBtn.addEventListener("click", () => addHorseRow());
    els.horseRows.addEventListener("click", handleHorseRowsClick);
    els.list.addEventListener("click", handleListClick);
    els.search.addEventListener("input", render);
    els.sort.addEventListener("change", render);
  }

  return { init };
})();
