// 食べログ機能: 自分専用のお店訪問記録
const Tabelog = (() => {
  const STORAGE_KEY = "tabelog_entries";
  let entries = Storage.load(STORAGE_KEY, []);

  const els = {};
  function cacheEls() {
    els.search = document.getElementById("tabelogSearch");
    els.genreFilter = document.getElementById("tabelogGenreFilter");
    els.sort = document.getElementById("tabelogSort");
    els.addBtn = document.getElementById("tabelogAddBtn");
    els.formWrap = document.getElementById("tabelogFormWrap");
    els.form = document.getElementById("tabelogForm");
    els.cancelBtn = document.getElementById("tabelogCancelBtn");
    els.id = document.getElementById("tabelogId");
    els.name = document.getElementById("tabelogName");
    els.genre = document.getElementById("tabelogGenre");
    els.area = document.getElementById("tabelogArea");
    els.ratingInput = document.getElementById("tabelogRatingInput");
    els.price = document.getElementById("tabelogPrice");
    els.date = document.getElementById("tabelogDate");
    els.photo = document.getElementById("tabelogPhoto");
    els.memo = document.getElementById("tabelogMemo");
    els.list = document.getElementById("tabelogList");
    els.empty = document.getElementById("tabelogEmpty");
    els.genreList = document.getElementById("genreList");
  }

  function persist() {
    Storage.save(STORAGE_KEY, entries);
  }

  function openForm(entry) {
    els.formWrap.classList.remove("hidden");
    if (entry) {
      els.id.value = entry.id;
      els.name.value = entry.name;
      els.genre.value = entry.genre || "";
      els.area.value = entry.area || "";
      setRating(entry.rating || 0);
      els.price.value = entry.price || "";
      els.date.value = entry.date || "";
      els.photo.value = entry.photo || "";
      els.memo.value = entry.memo || "";
    } else {
      els.form.reset();
      els.id.value = "";
      setRating(0);
    }
    els.name.focus();
  }

  function closeForm() {
    els.formWrap.classList.add("hidden");
    els.form.reset();
    els.id.value = "";
    setRating(0);
  }

  function setRating(value) {
    els.ratingInput.dataset.value = value;
    [...els.ratingInput.children].forEach((star, i) => {
      star.classList.toggle("filled", i < value);
    });
  }

  function handleRatingClick(e) {
    const star = e.target.closest("[data-star]");
    if (!star) return;
    setRating(Number(star.dataset.star));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const name = els.name.value.trim();
    if (!name) return;

    const entry = {
      id: els.id.value || String(Date.now()),
      name,
      genre: els.genre.value.trim(),
      area: els.area.value.trim(),
      rating: Number(els.ratingInput.dataset.value) || 0,
      price: els.price.value,
      date: els.date.value,
      photo: els.photo.value.trim(),
      memo: els.memo.value.trim(),
    };

    const existingIdx = entries.findIndex((e2) => e2.id === entry.id);
    if (existingIdx >= 0) {
      entries[existingIdx] = entry;
    } else {
      entries.push(entry);
    }
    persist();
    closeForm();
    renderGenreOptions();
    render();
  }

  function deleteEntry(id) {
    if (!confirm("このお店の記録を削除しますか？")) return;
    entries = entries.filter((e) => e.id !== id);
    persist();
    render();
  }

  function editEntry(id) {
    const entry = entries.find((e) => e.id === id);
    if (entry) openForm(entry);
  }

  function starString(rating) {
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function renderGenreOptions() {
    const genres = [...new Set(entries.map((e) => e.genre).filter(Boolean))].sort();
    const current = els.genreFilter.value;
    els.genreFilter.innerHTML =
      '<option value="">ジャンル: すべて</option>' +
      genres.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
    els.genreFilter.value = genres.includes(current) ? current : "";

    els.genreList.innerHTML = genres.map((g) => `<option value="${escapeHtml(g)}">`).join("");
  }

  function getFilteredSorted() {
    const keyword = els.search.value.trim().toLowerCase();
    const genre = els.genreFilter.value;
    let list = entries.filter((e) => {
      const matchesKeyword =
        !keyword ||
        e.name.toLowerCase().includes(keyword) ||
        (e.area || "").toLowerCase().includes(keyword);
      const matchesGenre = !genre || e.genre === genre;
      return matchesKeyword && matchesGenre;
    });

    const sort = els.sort.value;
    list = [...list].sort((a, b) => {
      if (sort === "date_desc") return (b.date || "").localeCompare(a.date || "");
      if (sort === "date_asc") return (a.date || "").localeCompare(b.date || "");
      if (sort === "rating_desc") return b.rating - a.rating;
      if (sort === "rating_asc") return a.rating - b.rating;
      return 0;
    });
    return list;
  }

  function render() {
    const list = getFilteredSorted();
    els.empty.classList.toggle("hidden", entries.length > 0);
    els.list.innerHTML = list
      .map((e) => {
        const metaParts = [e.genre, e.area, e.price, e.date].filter(Boolean);
        return `
        <div class="entry-card" data-id="${e.id}">
          ${e.photo ? `<img src="${escapeHtml(e.photo)}" alt="${escapeHtml(e.name)}" onerror="this.remove()">` : ""}
          <div class="entry-main">
            <div class="entry-title-row">
              <span class="entry-name">${escapeHtml(e.name)}</span>
              <span class="entry-stars">${starString(e.rating)}</span>
            </div>
            ${metaParts.length ? `<div class="entry-meta">${metaParts.map(escapeHtml).join(" ・ ")}</div>` : ""}
            ${e.memo ? `<div class="entry-memo">${escapeHtml(e.memo)}</div>` : ""}
            <div class="entry-actions">
              <button data-action="edit">編集</button>
              <button data-action="delete">削除</button>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }

  function handleListClick(e) {
    const card = e.target.closest(".entry-card");
    if (!card) return;
    const id = card.dataset.id;
    const action = e.target.dataset.action;
    if (action === "edit") editEntry(id);
    if (action === "delete") deleteEntry(id);
  }

  function init() {
    cacheEls();
    renderGenreOptions();
    render();

    els.addBtn.addEventListener("click", () => openForm(null));
    els.cancelBtn.addEventListener("click", closeForm);
    els.form.addEventListener("submit", handleSubmit);
    els.ratingInput.addEventListener("click", handleRatingClick);
    els.list.addEventListener("click", handleListClick);
    els.search.addEventListener("input", render);
    els.genreFilter.addEventListener("change", render);
    els.sort.addEventListener("change", render);
  }

  return { init };
})();
