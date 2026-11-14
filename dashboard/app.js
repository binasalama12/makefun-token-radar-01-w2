// Sentinel Board dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a detail view and a filter. No network:
// every byte shown comes from data.js. Views come from the URL:
//   ?view=board            the full board (default)
//   ?view=detail&slug=X    one protocol's detail on top of the board
//   ?view=filtered&f=TEXT  the board filtered by TEXT (name, category, chain)
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var params = new URLSearchParams(window.location.search);
  var view = params.get('view') || 'board';
  var state = { q: '', category: 'all', sort: 'implied', dir: -1, selected: null };
  if (view === 'detail' && params.get('slug')) state.selected = params.get('slug');
  if (view === 'filtered' && params.get('f')) {
    state.q = params.get('f');
    var cats = DATA.rows.map(function (r) { return r.category || 'Other'; });
    if (cats.indexOf(state.q) >= 0) state.category = state.q;
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  // The model, recomputed in the page from the same snapshot figures main.ts
  // used, so the page and board.json visibly agree on every row.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * m.base_multiple * row.category_multiplier * growthMult * maturity));
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (state.sort === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (state.sort === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function setSort(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = -1; }
    render();
  }
  function openDetail(slug) {
    state.selected = slug;
    render();
    var d = document.getElementById('detail');
    if (d) d.scrollIntoView();
  }
  function goBoard() { state.selected = null; state.q = ''; state.category = 'all'; render(); }

  function topCards() {
    // When a filter is active the cards show the filtered set's top three, so
    // the cards and the table always agree; otherwise the board's top three.
    var pool = (state.q || state.category !== 'all') ? sortedRows(filteredRows()) : DATA.rows;
    var top = pool.slice(0, 3);
    if (top.length === 0) return '';
    var html = '<section class="cards" aria-label="Top three protocols">';
    top.forEach(function (r) {
      html += '<article class="card" data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<span class="rank">Rank ' + r.rank + ' — top 3</span>' +
        '<h3>' + esc(r.name) + '</h3>' +
        '<div class="sub">' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</div>' +
        '<div class="val">' + fmtUsd(r.implied_value_usd) + '<small>implied value · TVL ' + fmtUsd(r.tvl_usd) + '</small></div>' +
        '</article>';
    });
    return html + '</section>';
  }

  function detailHtml(row) {
    var m = DATA.model;
    var steps = (row.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    var check = impliedOf(row) === row.implied_value_usd ? 'the page recomputes the same number.' : 'the page recomputes a different number: the data would be stale.';
    return '<section class="detail" id="detail" aria-labelledby="detail-title">' +
      '<div class="head"><div><span class="badge">Rank ' + row.rank + ' of ' + DATA.board_size + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') +
      ' · listed ' + esc(row.listed_at || 'unknown') + ' · no token on record</p></div>' +
      '<button class="button ghost" type="button" id="close-detail">Back to board</button></div>' +
      '<h3>Implied value</h3><div class="equation">' +
      '<div><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>7-day change</span><b>' + fmtPct(row.change_7d) + '</b></div>' +
      '<div><span>Age with no token</span><b>' + fmtAge(row.age_days) + '</b></div>' +
      '<div><span>Category multiplier</span><b>' + row.category_multiplier + '× (' + esc(row.category || 'Other') + ')</b></div>' +
      '<div><span>Growth multiplier</span><b>' + row.growth_multiplier + '</b></div>' +
      '<div><span>Maturity multiplier</span><b>' + row.maturity_multiplier + '</b></div>' +
      '<div><span>Implied value</span><b>' + fmtMoney(row.implied_value_usd) + '</b></div>' +
      '</div><p class="sub">Model sentinel-1: implied = round(TVL × ' + m.base_multiple + ' × category × (1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × maturity). ' + check + ' This is an estimate, not a price.</p>' +
      '<h3>Farm plan — five steps</h3><ol class="steps">' + steps + '</ol></section>';
  }

  function tableHtml() {
    var list = sortedRows(filteredRows());
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var opts = '<option value="all">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var head = '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + opts + '</select></div>' +
      '<span class="count">' + list.length + ' of ' + DATA.board_size + ' rows shown</span></div>';
    if (list.length === 0) {
      return head + '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category to see the board again.</p><button class="button" type="button" id="clear-filters">Clear filters</button></div></div>';
    }
    function th(key, label) {
      var arrow = state.sort === key ? (state.dir < 0 ? ' ▼' : ' ▲') : '';
      return '<th scope="col"><button type="button" data-sort="' + key + '">' + label + esc(arrow) + '</button></th>';
    }
    var rows = list.map(function (r) {
      var g = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.selected === r.slug ? 'sel' : '') + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.slug) + '</span></div></td>' +
        '<td>' + esc(r.category || 'Other') + '</td>' +
        '<td>' + esc((r.chains || []).slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + gc + '">' + g + '</td>' +
        '<td class="num">' + fmtUsd(r.implied_value_usd) + '</td></tr>';
    }).join('');
    return head + '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + th('implied', 'Rank') + th('name', 'Protocol') + th('category', 'Category') + '<th scope="col">Chains</th>' + th('tvl', 'TVL') + th('growth', '7d') + th('implied', 'Implied value') + '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function render() {
    var m = DATA.model;
    var selected = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    var html = '<div class="shell">' +
      '<header class="top"><div class="brand">Sentinel <b>Board</b></div>' +
      '<div class="top-meta"><span>Snapshot ' + esc(DATA.as_of) + '</span><span>DefiLlama protocol index</span><span>sentinel-1 model</span></div></header>' +
      '<section class="lede"><h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by implied value</h1>' +
      '<p>The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value weights TVL by category — Dexs 1.15×, Lending 1.10×, Yield and Derivatives 1.05× — then by seven-day growth and by how long the protocol has run with no token. It is a model, not a promise.</p>' +
      '<div class="facts">' +
      '<div class="fact"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="fact"><span>Pre-token rows scored</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="fact"><span>Early rows below floor</span><b>' + DATA.early_size + '</b></div>' +
      '<div class="fact"><span>Top implied value</span><b>' + fmtUsd(DATA.rows[0].implied_value_usd) + '</b></div>' +
      '</div></section>' +
      topCards() +
      (selected ? detailHtml(selected) : '') +
      tableHtml() +
      '<section class="panel model"><h2>How implied value is computed</h2>' +
      '<p class="sub">One function scores every protocol; no name is special-cased.</p>' +
      '<div class="formula">implied = round( tvl_usd × ' + m.base_multiple + ' × category × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') )</div>' +
      '<p class="sub">Category: Dexs 1.15, Lending 1.10, Yield 1.05, Derivatives 1.05, everything else 1.00. Age is the time since the protocol was first listed; an unknown age counts as ' + m.unknown_age_days + ' days. Every row carries five farm steps with a cost and a time.</p></section>' +
      '<p class="note">Source: ' + esc(DATA.source) + '. A protocol records no token when the snapshot carries no market cap, CoinGecko id or symbol for it — that is the record, not proof it has none.</p>' +
      '</div>';
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');

    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var sel = document.getElementById('category');
    if (sel) sel.addEventListener('change', function () { state.category = sel.value; render(); });
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', goBoard);
    var close = document.getElementById('close-detail');
    if (close) close.addEventListener('click', goBoard);
    document.querySelectorAll('th button[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () { setSort(b.getAttribute('data-sort')); });
    });
    document.querySelectorAll('tbody tr[data-slug], .card[data-slug]').forEach(function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-slug')); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(el.getAttribute('data-slug')); } });
    });
  }

  render();
})();
