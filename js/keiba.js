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
    els.importBtn = document.getElementById("keibaImportBtn");
    els.importFile = document.getElementById("keibaImportFile");
    els.importMapWrap = document.getElementById("keibaImportMapWrap");
    els.importMapTable = document.getElementById("keibaImportMapTable");
    els.importApplyBtn = document.getElementById("keibaImportApplyBtn");
    els.importCancelBtn = document.getElementById("keibaImportCancelBtn");
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
        <div><label>性齢</label><input type="text" class="h-sexage" value="${escapeHtml(h.sexAge || "")}" placeholder="例: 牝7"></div>
        <div><label>騎手</label><input type="text" class="h-jockey" value="${escapeHtml(h.jockey || "")}"></div>
        <div><label>人気</label><input type="number" min="1" class="h-popularity" value="${h.popularity ?? ""}"></div>
        <div><label>オッズ</label><input type="number" min="0" step="0.1" class="h-odds" value="${h.odds ?? ""}"></div>
        <div><label>前走着順</label><input type="number" min="1" class="h-lastfinish" value="${h.lastFinish ?? ""}"></div>
        <div><label>体重(kg)</label><input type="number" min="0" class="h-weight" value="${h.weight ?? ""}"></div>
        <div><label>父小系統</label><input type="text" class="h-sireline" value="${escapeHtml(h.sireLine || "")}" placeholder="例: サンデー系"></div>
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
        sexAge: row.querySelector(".h-sexage").value.trim(),
        jockey: row.querySelector(".h-jockey").value.trim(),
        popularity: Number(row.querySelector(".h-popularity").value) || undefined,
        odds: Number(row.querySelector(".h-odds").value) || undefined,
        lastFinish: Number(row.querySelector(".h-lastfinish").value) || undefined,
        weight: Number(row.querySelector(".h-weight").value) || undefined,
        sireLine: row.querySelector(".h-sireline").value.trim(),
        selfRating: Number(row.querySelector(".h-rating").value) || 0,
        finish: Number(row.querySelector(".h-finish").value) || undefined,
      }))
      .filter((h) => h.name);
  }

  // --- CSV/TSVインポート ---
  // JRA-VANのエクスポートCSVやnetkeibaのダウンロードデータなど、列の並びは
  // ファイルによって異なるため、ヘッダー名から候補を自動推測しつつ
  // ユーザーに列の対応を確認してもらう方式にする。
  const IMPORT_FIELDS = [
    { key: "", label: "使用しない" },
    { key: "raceName", label: "レース名" },
    { key: "date", label: "開催日" },
    { key: "track", label: "競馬場" },
    { key: "distance", label: "距離・馬場状態" },
    { key: "number", label: "馬番" },
    { key: "name", label: "馬名" },
    { key: "sexAge", label: "性齢" },
    { key: "jockey", label: "騎手" },
    { key: "popularity", label: "人気" },
    { key: "odds", label: "オッズ" },
    { key: "lastFinish", label: "前走着順" },
    { key: "weight", label: "体重" },
    { key: "sireLine", label: "父小系統" },
    { key: "finish", label: "着順(結果)" },
  ];

  const GUESS_KEYWORDS = {
    raceName: ["レース名", "競走名"],
    date: ["開催日", "年月日", "日付", "date"],
    track: ["競馬場", "場名", "開催場所"],
    distance: ["距離", "馬場状態", "コース"],
    number: ["馬番", "馬no", "horseno"],
    name: ["馬名", "horsename"],
    sexAge: ["性齢", "性別・年齢", "性年齢"],
    jockey: ["騎手", "jockey"],
    popularity: ["人気", "推定人気", "推人"],
    odds: ["オッズ", "単勝", "odds"],
    lastFinish: ["前走着順", "前走"],
    weight: ["体重", "馬体重", "weight"],
    sireLine: ["父小系統", "父系統", "小系統", "血統"],
    finish: ["着順", "確定着順", "result"],
  };

  let importHeaders = [];
  let importRows = [];
  let importMapping = [];

  function guessField(header) {
    const h = (header || "").toLowerCase().trim();
    for (const [key, keywords] of Object.entries(GUESS_KEYWORDS)) {
      if (keywords.some((kw) => h.includes(kw.toLowerCase()))) return key;
    }
    return "";
  }

  // JRA-VAN由来のCSVはShift-JIS、netkeibaのダウンロードはUTF-8であることが多いため、
  // UTF-8として不正なバイト列ならShift-JISとして読み直す。
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buf = reader.result;
        try {
          resolve(new TextDecoder("utf-8", { fatal: true }).decode(buf));
        } catch (e) {
          try {
            resolve(new TextDecoder("shift_jis").decode(buf));
          } catch (e2) {
            resolve(new TextDecoder("utf-8").decode(buf));
          }
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function parseDelimited(text) {
    const firstLine = text.split(/\r?\n/)[0] || "";
    const delimiter = firstLine.split("\t").length > firstLine.split(",").length ? "\t" : ",";
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // skip
      } else {
        field += c;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((f) => f.trim() !== ""));
  }

  function toNumber(str) {
    if (str == null) return undefined;
    const cleaned = String(str).replace(/[^\d.\-]/g, "");
    const n = Number(cleaned);
    return cleaned !== "" && Number.isFinite(n) ? n : undefined;
  }

  function normalizeDate(str) {
    if (!str) return "";
    const s = String(str).trim();
    let m = s.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return "";
  }

  function renderImportMap() {
    els.importMapTable.innerHTML = importHeaders
      .map(
        (h, i) => `
      <div class="import-map-row">
        <div class="import-col-name" title="${escapeHtml(h)}">${escapeHtml(h)}</div>
        <select class="import-col-select" data-idx="${i}">
          ${IMPORT_FIELDS.map(
            (f) => `<option value="${f.key}" ${importMapping[i] === f.key ? "selected" : ""}>${f.label}</option>`
          ).join("")}
        </select>
      </div>`
      )
      .join("");
  }

  async function handleImportFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const text = await readFileAsText(file);
    const rows = parseDelimited(text);
    if (rows.length < 2) {
      alert("データ行が見つかりませんでした。ヘッダー行と1件以上のデータ行が必要です。");
      return;
    }
    importHeaders = rows[0];
    importRows = rows.slice(1);
    importMapping = importHeaders.map(guessField);
    renderImportMap();
    els.importMapWrap.classList.remove("hidden");
  }

  function handleImportMapChange(e) {
    const select = e.target.closest(".import-col-select");
    if (!select) return;
    importMapping[Number(select.dataset.idx)] = select.value;
  }

  function applyImport() {
    const colIdx = {};
    importMapping.forEach((key, i) => {
      if (key) colIdx[key] = i;
    });

    if (colIdx.name === undefined) {
      alert("「馬名」の列を割り当ててください。");
      return;
    }

    const first = importRows[0];
    if (colIdx.raceName !== undefined && !els.name.value.trim()) {
      els.name.value = (first[colIdx.raceName] || "").trim();
    }
    if (colIdx.date !== undefined && !els.date.value) {
      els.date.value = normalizeDate(first[colIdx.date]);
    }
    if (colIdx.track !== undefined && !els.track.value.trim()) {
      els.track.value = (first[colIdx.track] || "").trim();
    }
    if (colIdx.distance !== undefined && !els.distance.value.trim()) {
      els.distance.value = (first[colIdx.distance] || "").trim();
    }

    els.horseRows.innerHTML = "";
    importRows.forEach((r) => {
      const name = (r[colIdx.name] || "").trim();
      if (!name) return;
      addHorseRow({
        number: colIdx.number !== undefined ? toNumber(r[colIdx.number]) : undefined,
        name,
        sexAge: colIdx.sexAge !== undefined ? (r[colIdx.sexAge] || "").trim() : "",
        jockey: colIdx.jockey !== undefined ? (r[colIdx.jockey] || "").trim() : "",
        popularity: colIdx.popularity !== undefined ? toNumber(r[colIdx.popularity]) : undefined,
        odds: colIdx.odds !== undefined ? toNumber(r[colIdx.odds]) : undefined,
        lastFinish: colIdx.lastFinish !== undefined ? toNumber(r[colIdx.lastFinish]) : undefined,
        weight: colIdx.weight !== undefined ? toNumber(r[colIdx.weight]) : undefined,
        sireLine: colIdx.sireLine !== undefined ? (r[colIdx.sireLine] || "").trim() : "",
        finish: colIdx.finish !== undefined ? toNumber(r[colIdx.finish]) : undefined,
      });
    });
    if (!els.horseRows.children.length) addHorseRow();

    closeImportMap();
  }

  function closeImportMap() {
    els.importMapWrap.classList.add("hidden");
    importHeaders = [];
    importRows = [];
    importMapping = [];
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
    closeImportMap();
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
        <td>${escapeHtml(h.sexAge || "-")}</td>
        <td>${escapeHtml(h.jockey || "-")}</td>
        <td>${h.popularity ? `${h.popularity}人気` : "-"}</td>
        <td>${h.odds ?? "-"}</td>
        <td>${h.weight ? `${h.weight}kg` : "-"}</td>
        <td>${escapeHtml(h.sireLine || "-")}</td>
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
            <tr><th>予想</th><th>馬番</th><th>馬名</th><th>性齢</th><th>騎手</th><th>人気</th><th>オッズ</th><th>体重</th><th>父小系統</th><th>評価</th><th>着順</th></tr>
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

    els.importBtn.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", handleImportFile);
    els.importMapTable.addEventListener("change", handleImportMapChange);
    els.importApplyBtn.addEventListener("click", applyImport);
    els.importCancelBtn.addEventListener("click", closeImportMap);
  }

  return { init };
})();
