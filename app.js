let stocksData = [];
let unlistedData = [];
let activeStock = null;
let historyChart = null;
let currentChartTab = 'historical';
let collapsedCategories = {};
let refreshTimer = null;
let currentHistoryData = null;
let logoDataUrl = '';

(function preloadLogo() {
  var img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = function() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 313;
      canvas.height = img.naturalHeight || 84;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      logoDataUrl = canvas.toDataURL('image/jpeg');
    } catch(e) {}
  };
  img.src = 'logo.svg';
})();

// Official Investor Relations website portals for shipping companies
const COMPANY_OFFICIAL_IR_SITES = {
  "SBLK": "https://www.starbulk.com/investor-relations",
  "GOGL": "https://www.goldenocean.bm/investor-relations/",
  "GNK": "https://investors.gencoshipping.com/financial-information/quarterly-results",
  "2343.HK": "https://www.pacificbasin.com/en/ir/reports.php",
  "MAERSK-B.CO": "https://investor.maersk.com/financial-information/reports-presentations",
  "ZIM": "https://investors.zim.com/financials/quarterly-results/",
  "DSX": "https://www.dianashippinginc.com/financial-reports/",
  "SB": "https://www.safebulkers.com/financial-reports/",
  "EDRY": "https://www.eurodry.gr/investor-relations/press-releases.html",
  "ESEA": "https://www.euroseas.gr/investor-relations/press-releases.html",
  "PANL": "https://investors.pangaeals.com/financial-information/quarterly-results",
  "GRIN": "https://www.grindrodshipping.com/investor-relations",
  "CTRM": "https://castormaritime.com/investor-relations/",
  "HSHIP.OL": "https://www.himalaya-shipping.com/investors",
  "2020.OL": "https://2020bulkers.com/investor-relations/",
  "5077.KL": "https://www.maybulk.com.my/investor-relations",
  "CHOWGULSTM.BO": "https://www.chowgule.co.in/chowgule-steamships-ltd/",
  "SCI.NS": "https://www.shipindia.com/investor-relations/financial-results",
  "GESHIP.NS": "https://www.greatship.com/investors.html",
  "MATS": "https://investors.matson.com/financials/quarterly-results",
  "CMRE": "https://www.costamare.com/investors/press-releases",
  "DAC": "https://www.danaos.com/investor-relations/news/default.aspx",
  "INSW": "https://www.intlseaways.com/investors/news-and-events/press-releases",
  "FRO": "https://www.frontline.bm/investor-relations/",
  "DHT": "https://www.dhtankers.com/investors/",
  "TNK": "https://www.teekay.com/investor-centre/teekay-tankers-ltd/",
  "TK": "https://www.teekay.com/investor-centre/",
  "STNG": "https://www.scorpiotankers.com/investor-relations/",
  "TRMD": "https://www.torm.com/investors/",
  "HESM": "https://investors.hessmidstream.com/",
  "GLNG": "https://www.golarlng.com/investor-relations",
  "CLCO": "https://www.coolco.com/investors",
  "FLNG": "https://www.flexlng.com/investors/"
};

function getExactReportUrl(symbol, qLabel, companyName) {
  if (COMPANY_OFFICIAL_IR_SITES[symbol]) {
    return COMPANY_OFFICIAL_IR_SITES[symbol];
  }
  var query = (companyName || symbol) + " official investor relations website quarterly reports";
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function renderQtrReports(selectedStock) {
  var container = document.getElementById("qtr-reports-container");
  var tagEl = document.getElementById("qtr-reports-stock-tag");
  if (!container) return;

  if (!selectedStock || selectedStock.isUnlisted) {
    if (tagEl) tagEl.innerText = "Select Company";
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:90px;color:var(--color-text-muted);font-size:0.78rem;">
        Select a company to view its last 4 quarterly reports
      </div>`;
    return;
  }

  var sym = selectedStock.symbol || "";
  var name = selectedStock.name || sym;
  if (tagEl) tagEl.innerText = sym;

  // Dynamically compute the 4 latest available financial quarters (auto-updates in the future)
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;

  var latestQ, latestYr;
  if (month >= 1 && month <= 3) {
    latestQ = 4; latestYr = year - 1;
  } else if (month >= 4 && month <= 6) {
    latestQ = 1; latestYr = year;
  } else if (month >= 7 && month <= 9) {
    latestQ = 2; latestYr = year;
  } else {
    latestQ = 3; latestYr = year;
  }

  var quarters = [];
  var q = latestQ;
  var y = latestYr;

  var qDetails = {
    1: { name: "Q1 Financial Report", desc: "Three Months Ended March 31," },
    2: { name: "Q2 Financial Report", desc: "Three Months Ended June 30," },
    3: { name: "Q3 Financial Report", desc: "Three Months Ended September 30," },
    4: { name: "Q4 & Annual Report", desc: "Fourth Quarter & Full Year Ended Dec 31," }
  };

  for (var i = 0; i < 4; i++) {
    var qLabel = y + " Q" + q;
    var info = qDetails[q];
    quarters.push({
      qLabel: qLabel,
      badgeColor: i === 0 ? "#00f2fe" : "#0082f0",
      title: `${sym} ${qLabel} ${info.name}`,
      desc: `${info.desc} ${y}`,
      isLatest: i === 0,
      url: getExactReportUrl(sym, qLabel, name)
    });
    q--;
    if (q < 1) { q = 4; y--; }
  }

  var html = '';
  quarters.forEach(function(q) {
    var latestBadge = q.isLatest 
      ? '<span style="font-size:0.6rem; background:linear-gradient(135deg, #00f2fe, #0082f0); color:#000; padding:1px 5px; border-radius:3px; font-weight:800; text-transform:uppercase; margin-left:4px;">Latest</span>' 
      : '';

    var cleanSym = sym.split('.')[0];
    var secUrl = `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(cleanSym + " " + q.qLabel + " report")}`;

    html += `
      <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; transition: all 0.2s ease;" onmouseover="this.style.borderColor='rgba(0,242,254,0.3)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)';">
        <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1;">
          <span style="font-size: 0.72rem; font-weight: 700; background: rgba(0, 130, 240, 0.15); color: ${q.badgeColor}; border: 1px solid rgba(0, 130, 240, 0.3); padding: 3px 7px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; flex-shrink: 0;">
            ${q.qLabel}
          </span>
          <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: nowrap;">
              <strong style="font-size: 0.78rem; color: var(--color-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${q.title}">${q.title}</strong>
              ${latestBadge}
            </div>
            <span style="font-size: 0.7rem; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q.desc}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <a href="${q.url}" target="_blank" rel="noopener noreferrer" style="font-size: 0.72rem; color: var(--color-primary); font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px; background: rgba(0, 130, 240, 0.12); padding: 5px 9px; border-radius: 4px; border: 1px solid rgba(0, 130, 240, 0.25);" onmouseover="this.style.background='var(--color-primary)';this.style.color='#fff';" onmouseout="this.style.background='rgba(0, 130, 240, 0.12)';this.style.color='var(--color-primary)';" title="Visit Official Corporate Web Page">
            🌐 Web ↗
          </a>
          <button onclick="openQtrReportModal('${q.qLabel}', '${q.title.replace(/'/g, "\\'")}', '${q.desc.replace(/'/g, "\\'")}', '${sym}', '${q.url}', '${secUrl}')" style="font-size: 0.72rem; color: var(--color-secondary); font-weight: 600; background: rgba(255, 255, 255, 0.05); padding: 5px 9px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer;" onmouseover="this.style.background='rgba(255,255,255,0.15)';this.style.color='#fff';" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='var(--color-secondary)';" title="View Report Overview">
            📄 Overview
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function openQtrReportModal(qLabel, title, periodEnd, symbol, officialUrl, secUrl) {
  var bEl = document.getElementById("modal-qtr-badge");
  var tEl = document.getElementById("modal-qtr-title");
  var pEl = document.getElementById("modal-period-end");
  var tkEl = document.getElementById("modal-ticker");
  var offBtn = document.getElementById("modal-official-url");
  var secBtn = document.getElementById("modal-sec-url");

  if (bEl) bEl.innerText = qLabel;
  if (tEl) tEl.innerText = title;
  if (pEl) pEl.innerText = periodEnd;
  if (tkEl) tkEl.innerText = symbol;
  if (offBtn) offBtn.href = officialUrl;
  if (secBtn) secBtn.href = secUrl;

  var modal = document.getElementById("qtr-report-modal");
  if (modal) modal.style.display = "flex";
}

function closeQtrReportModal() {
  var modal = document.getElementById("qtr-report-modal");
  if (modal) modal.style.display = "none";
}

// Category display names (no more "Fleet" everywhere)
const CATEGORY_LABELS = {
  'Container': 'Container',
  'Dry Bulk': 'Dry Bulk',
  'Tanker': 'Tanker',
  'Gas Carrier': 'Gas Carrier',
  'Ports & Logistics': 'Ports & Logistics',
  'Shipbuilding': 'Shipbuilding',
  'Offshore': 'Offshore',
  'Marine Services': 'Marine Services',
  'Diversified': 'Diversified'
};

function getCategoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

// Sanitize category names for safe DOM IDs
function catId(cat) {
  return cat.replace(/[^a-zA-Z0-9]/g, '_');
}

// Convert Yahoo Finance symbols to TradingView symbols
function getTradingViewSymbol(yfSymbol) {
  if (!yfSymbol) return "";
  const parts = yfSymbol.split('.');
  if (parts.length === 1) return yfSymbol;
  const ticker = parts[0];
  const suffix = parts[1].toUpperCase();
  const map = {
    'NS': 'NSE', 'BO': 'BSE', 'KL': 'MYX', 'HK': 'HKEX', 'TW': 'TWSE',
    'TWO': 'TPEX', 'T': 'TSE', 'DE': 'XETR', 'SI': 'SGX', 'VN': 'HOSE',
    'JK': 'IDX', 'BK': 'SET', 'SS': 'SSE', 'SZ': 'SZSE', 'SA': 'BMFBOVESPA',
    'SN': 'BCS', 'ST': 'OMXSTO', 'IC': 'OMXICE', 'CO': 'CPH', 'OL': 'OSE',
    'HE': 'OMXHEX', 'BR': 'EURONEXT', 'AX': 'ASX', 'L': 'LSE', 'F': 'FRA',
    'MU': 'MUN', 'DU': 'DUS', 'HM': 'HAM', 'KS': 'KRX', 'SR': 'TADAWUL',
    'TA': 'TASE', 'JO': 'JSE',
  };
  const exchange = map[suffix];
  if (exchange) {
    const t = suffix === 'CO' ? ticker.replace('-', '_') : ticker;
    return exchange + ':' + t;
  }
  return yfSymbol;
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", function() {
  updateSystemTime();
  setInterval(updateSystemTime, 1000);
  fetchData();

  document.getElementById("search-input").addEventListener("input", function() {
    renderStockCards();
  });

  var categoryTabs = document.querySelectorAll(".category-tab");
  categoryTabs.forEach(function(tab) {
    tab.addEventListener("click", function() {
      categoryTabs.forEach(function(t) { t.classList.remove("active"); });
      tab.classList.add("active");
      renderStockCards();
    });
  });

  // Auto-refresh every 30s to pick up crawler data
  refreshTimer = setInterval(refreshStockData, 30000);

  // Years range slider listener for historical chart
  var slider = document.getElementById("chart-year-slider");
  if (slider) {
    slider.addEventListener("input", function() {
      var val = slider.value;
      var label = document.getElementById("chart-year-label");
      if (label) label.innerText = val + "Y";
      updateChartRange(val);
    });
  }
});

function updateSystemTime() {
  var now = new Date();
  var timeStr = now.toISOString().replace('T', ' ').substring(0, 19);
  document.getElementById("market-time").innerText = "SYS_TIME: " + timeStr + " UTC";
}

// Auto-refresh
async function refreshStockData() {
  try {
    var res = await fetch("/api/stocks");
    if (!res.ok) return;
    var newData = await res.json();
    var currentSymbol = (activeStock && !activeStock.isUnlisted) ? activeStock.symbol : null;
    var hadNoPrice = activeStock && !activeStock.isUnlisted && activeStock.price === 0;
    stocksData = newData;

    var stockList = document.getElementById("stock-list");
    var scrollPos = stockList.scrollTop;
    renderStockCards();
    renderTickerTape();
    stockList.scrollTop = scrollPos;

    // If currently viewing a stock that just got data, refresh detail
    if (hadNoPrice && currentSymbol) {
      var updated = stocksData.find(function(s) { return s.symbol === currentSymbol; });
      if (updated && updated.price > 0) {
        selectStock(updated.symbol, false);
      }
    }
  } catch (e) {
    // silent
  }
}

// ===== DATA FETCH =====
async function fetchData() {
  showLoader(true);
  try {
    var responses = await Promise.all([
      fetch("/api/stocks"),
      fetch("/api/unresolved")
    ]);

    if (responses[0].ok) stocksData = await responses[0].json();
    if (responses[1].ok) unlistedData = await responses[1].json();

    var unlistedTab = document.querySelector('.category-tab[data-category="unlisted"]');
    if (unlistedTab) unlistedTab.innerText = "Unlisted (" + unlistedData.length + ")";

    if (stocksData && stocksData.length > 0) {
      var first = stocksData.find(function(s) { return s.price > 0; }) || stocksData[0];
      
      // Collapse all categories by default on initial landing page load
      collapsedCategories = {};
      stocksData.forEach(function(s) {
        collapsedCategories[catId(s.category)] = true;
      });
      
      renderStockCards();
      renderTickerTape();
      selectStock(first.symbol, false, null, true);
    } else {
      document.getElementById("stock-list").innerHTML = '<p style="padding:16px;color:var(--color-danger);">No shipping stocks found.</p>';
    }
  } catch (error) {
    console.error("Failed to load:", error);
    document.getElementById("stock-list").innerHTML = '<p style="padding:16px;color:var(--color-danger);">Error contacting terminal.</p>';
  } finally {
    showLoader(false);
  }
}

// ===== SIDEBAR RENDERING =====
function renderStockCards() {
  var container = document.getElementById("stock-list");
  container.innerHTML = "";

  var activeTab = document.querySelector(".category-tab.active").getAttribute("data-category");
  var searchQuery = document.getElementById("search-input").value.toLowerCase();

  if (activeTab === "unlisted") {
    renderUnlistedCards(container, searchQuery);
  } else {
    renderListedCards(container, searchQuery, activeTab);
  }
}

function renderUnlistedCards(container, searchQuery) {
  var filtered = unlistedData.filter(function(name) {
    return name.toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p style="padding:12px;color:var(--color-text-muted);font-size:0.8rem;">No unlisted companies match search.</p>';
    return;
  }

  filtered.forEach(function(name, idx) {
    var cardId = "unlisted-" + idx;
    var card = document.createElement("div");
    card.className = "stock-card" + ((activeStock && activeStock.name === name && activeStock.isUnlisted) ? " active" : "");
    card.id = cardId;
    card.setAttribute("data-action", "select-unlisted");
    card.setAttribute("data-name", name);
    card.setAttribute("data-card-id", cardId);

    card.innerHTML =
      '<div class="card-top-row">' +
        '<span class="card-name" title="' + name + '">' + name + '</span>' +
        '<span class="card-price" style="color:var(--color-danger);font-size:0.78rem;font-family:JetBrains Mono;font-weight:bold;">UNLISTED</span>' +
      '</div>' +
      '<div class="card-bottom-row">' +
        '<div class="card-bottom-left">' +
          '<span class="symbol-tag" style="background:rgba(255,75,75,0.1);border-color:rgba(255,75,75,0.2);color:var(--color-danger);font-size:0.65rem;">OFFLINE</span>' +
          '<span class="card-region-tag">No public exchange</span>' +
        '</div>' +
        '<div class="card-changes">' +
          '<span class="change-badge" style="background:rgba(255,255,255,0.05);color:var(--color-text-muted);">N/A</span>' +
        '</div>' +
      '</div>';

    card.onclick = (function(n, cid) {
      return function(e) { e.stopPropagation(); selectStock(n, true, cid); };
    })(name, cardId);

    container.appendChild(card);
  });
}

function renderListedCards(container, searchQuery, activeTab) {
  var filtered = stocksData.filter(function(stock) {
    var matchesSearch = stock.symbol.toLowerCase().includes(searchQuery) || stock.name.toLowerCase().includes(searchQuery);
    var matchesCategory = activeTab === "all" || stock.category === activeTab;
    return matchesSearch && matchesCategory;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p style="padding:12px;color:var(--color-text-muted);font-size:0.8rem;">No stocks match search.</p>';
    return;
  }

  // Group by category
  var groups = {};
  filtered.forEach(function(stock) {
    if (!groups[stock.category]) groups[stock.category] = [];
    groups[stock.category].push(stock);
  });

  var categories = Object.keys(groups).sort();

  // If only one category (user clicked a specific tab), don't show group headers
  var showHeaders = categories.length > 1;

  categories.forEach(function(cat) {
    var catStocks = groups[cat];
    var safeId = catId(cat);
    var isCollapsed = collapsedCategories[safeId] === true;

    if (showHeaders) {
      // Category group header
      var header = document.createElement("div");
      header.className = "category-group-header" + (isCollapsed ? " collapsed" : "");
      header.id = "group-header-" + safeId;

      header.innerHTML =
        '<span class="category-group-title">' + getCategoryLabel(cat) + '</span>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span class="category-group-count">' + catStocks.length + '</span>' +
          '<span class="category-group-arrow">' + (isCollapsed ? '▶' : '▼') + '</span>' +
        '</div>';

      header.onclick = (function(sid) {
        return function(e) {
          e.stopPropagation();
          toggleCategoryGroup(sid);
        };
      })(safeId);

      container.appendChild(header);
    }

    // Stock cards wrapper
    var wrapper = document.createElement("div");
    wrapper.className = "category-group-content" + ((showHeaders && isCollapsed) ? " collapsed" : "");
    wrapper.id = "group-content-" + safeId;

    catStocks.forEach(function(stock) {
      var isPositive = stock.daily_change >= 0;
      var sign = isPositive ? "+" : "";
      var badgeClass = isPositive ? "positive" : "negative";
      var isActive = activeStock && activeStock.symbol === stock.symbol && !activeStock.isUnlisted;

      var card = document.createElement("div");
      card.className = "stock-card" + (isActive ? " active" : "");
      card.id = "card-" + stock.symbol;

      var priceHTML = stock.price > 0
        ? stock.price + ' <span style="font-size:0.7rem;color:var(--color-text-muted);">' + stock.currency + '</span>'
        : '<span style="color:var(--color-text-muted);font-size:0.78rem;">Crawling...</span>';
      var changeText = stock.price > 0 ? sign + stock.daily_change_pct + "%" : "--%";
      var wowText = stock.price > 0 ? "WoW: " + (stock.wow_change_pct >= 0 ? "+" : "") + stock.wow_change_pct.toFixed(2) + "%" : "";

      card.innerHTML =
        '<div class="card-top-row">' +
          '<span class="card-name" title="' + stock.name + '">' + stock.name + '</span>' +
          '<span class="card-price">' + priceHTML + '</span>' +
        '</div>' +
        '<div class="card-bottom-row">' +
          '<div class="card-bottom-left">' +
            '<span class="symbol-tag">' + stock.symbol + '</span>' +
            '<span class="card-region-tag">' + stock.region + '</span>' +
          '</div>' +
          '<div class="card-changes">' +
            '<span class="change-badge ' + (stock.price > 0 ? badgeClass : '') + '"' +
              (stock.price === 0 ? ' style="background:rgba(255,255,255,0.05);color:var(--color-text-muted);"' : '') +
            '>' + changeText + '</span>' +
            (wowText ? '<span class="wow-label">' + wowText + '</span>' : '') +
          '</div>' +
        '</div>';

      card.onclick = (function(sym) {
        return function(e) { e.stopPropagation(); selectStock(sym, false); };
      })(stock.symbol);

      wrapper.appendChild(card);
    });

    container.appendChild(wrapper);
  });
}

function toggleCategoryGroup(safeId) {
  var content = document.getElementById("group-content-" + safeId);
  var header = document.getElementById("group-header-" + safeId);
  if (!content || !header) return;

  var arrow = header.querySelector(".category-group-arrow");
  var isCollapsed = content.classList.contains("collapsed");

  if (isCollapsed) {
    content.classList.remove("collapsed");
    header.classList.remove("collapsed");
    if (arrow) arrow.textContent = "▼";
    collapsedCategories[safeId] = false;
  } else {
    content.classList.add("collapsed");
    header.classList.add("collapsed");
    if (arrow) arrow.textContent = "▶";
    collapsedCategories[safeId] = true;
  }
}

// ===== LOADER =====
function showLoader(show) {
  var loader = document.getElementById("hud-loader");
  if (show) {
    loader.style.display = "flex";
    loader.style.opacity = "1";
  } else {
    loader.style.opacity = "0";
    setTimeout(function() { loader.style.display = "none"; }, 500);
  }
}

// ===== STOCK SELECTION =====
async function selectStock(key, isUnlisted, cardId, isInitialLoad) {
  document.querySelectorAll(".stock-card").forEach(function(c) { c.classList.remove("active"); });

  if (isUnlisted) {
    activeStock = { name: key, isUnlisted: true, price: 0 };
    var elCard = document.getElementById(cardId);
    if (elCard) elCard.classList.add("active");

    document.getElementById("active-name").innerText = key;
    document.getElementById("active-symbol").innerText = "UNLISTED";
    document.getElementById("active-region").innerText = "Exchange Data Unavailable";
    document.getElementById("active-currency").innerText = "Currency: N/A";
    document.getElementById("active-price").innerText = "N/A";
    document.getElementById("active-close").innerText = "N/A";

    var dc = document.getElementById("active-daily-change");
    dc.innerText = "N/A"; dc.className = "metric-value";
    var wc = document.getElementById("active-weekly-change");
    wc.innerText = "N/A"; wc.className = "metric-value";

    document.getElementById("summary-today-rate").innerText = "N/A";
    document.getElementById("summary-yesterday-rate").innerText = "N/A";
    var sc = document.getElementById("summary-change");
    sc.innerText = "N/A"; sc.style.color = "var(--color-text-muted)";
    document.getElementById("summary-text").innerHTML =
      'We could not find public trading data for <strong>' + key + '</strong>. ' +
      'This company may be privately held, delisted, or traded on an unsupported exchange. ' +
      '<span style="color:var(--color-danger);">No dummy data generated.</span>';

    document.getElementById("news-feed-container").innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:0.8rem;">News unavailable for unlisted companies</div>';
    var btnSingle = document.getElementById("btn-export-single");
    if (btnSingle) btnSingle.disabled = true;

    showChartPlaceholder("EXCHANGE FEED OFFLINE", "This company is unlisted. Price data cannot be fetched.", true);
  } else {
    var stock = stocksData.find(function(s) { return s.symbol === key; });
    if (!stock) return;

    // Auto-expand category group of the selected stock if currently collapsed (unless initial page load)
    if (!isInitialLoad) {
      var safeId = catId(stock.category);
      if (collapsedCategories[safeId] === true) {
        collapsedCategories[safeId] = false;
        renderStockCards();
      }
    }

    activeStock = JSON.parse(JSON.stringify(stock));
    activeStock.isUnlisted = false;

    var card = document.getElementById("card-" + key);
    if (card) card.classList.add("active");

    var btnSingle = document.getElementById("btn-export-single");
    if (btnSingle) btnSingle.disabled = false;

    document.getElementById("active-name").innerText = stock.name;
    document.getElementById("active-symbol").innerText = stock.symbol;
    document.getElementById("active-region").innerText = stock.region;
    document.getElementById("active-currency").innerText = "Currency: " + stock.currency;

    var pt = stock.price > 0 ? stock.price + " " + stock.currency : "Crawling...";
    var ct = stock.price > 0 ? stock.prev_close + " " + stock.currency : "Crawling...";
    document.getElementById("active-price").innerText = pt;
    document.getElementById("active-close").innerText = ct;

    var ds = stock.daily_change >= 0 ? "+" : "";
    var dcEl = document.getElementById("active-daily-change");
    dcEl.innerText = stock.price > 0 ? ds + stock.daily_change + " (" + ds + stock.daily_change_pct + "%)" : "--.--";
    dcEl.className = "metric-value" + (stock.price > 0 ? (stock.daily_change >= 0 ? " positive" : " negative") : "");

    var ws = stock.wow_change >= 0 ? "+" : "";
    var wcEl = document.getElementById("active-weekly-change");
    wcEl.innerText = stock.price > 0 ? ws + stock.wow_change + " (" + ws + stock.wow_change_pct.toFixed(2) + "%)" : "--.--";
    wcEl.className = "metric-value" + (stock.price > 0 ? (stock.wow_change >= 0 ? " positive" : " negative") : "");

    document.getElementById("summary-today-rate").innerText = pt;
    document.getElementById("summary-yesterday-rate").innerText = ct;
    var scEl = document.getElementById("summary-change");
    scEl.innerText = stock.price > 0 ? ds + stock.daily_change + " (" + ds + stock.daily_change_pct + "%)" : "--.--";
    scEl.style.color = stock.price > 0 ? (stock.daily_change >= 0 ? "var(--color-success)" : "var(--color-danger)") : "var(--color-text-muted)";

    if (stock.price > 0) {
      var word = stock.daily_change >= 0 ? "gained" : "lost";
      document.getElementById("summary-text").innerHTML =
        'Today\'s rate for <strong>' + stock.symbol + '</strong> is <strong>' + stock.price + ' ' + stock.currency + '</strong>. ' +
        'It has ' + word + ' <strong>' + Math.abs(stock.daily_change_pct) + '%</strong> ' +
        'compared to yesterday\'s close of <strong>' + stock.prev_close + ' ' + stock.currency + '</strong>.';
    } else {
      document.getElementById("summary-text").innerHTML = 'Background crawler is fetching live rates for <strong>' + stock.symbol + '</strong>...';
    }

    // Charts
    hideChartPlaceholder();
    switchChartTab(currentChartTab);

    if (stock.price > 0) {
      loadHistoryChart(stock.symbol);
      loadTradingViewWidgets(stock.symbol);
    } else {
      showChartPlaceholder("CRAWLING DAILY STATS...", "The background crawler is fetching quotes for this stock. Data will appear shortly.", false);
    }

    // News
    loadCompanyNews(stock.symbol);
  }

  // Quarterly Reports
  renderQtrReports(activeStock);
}

// ===== CHART PLACEHOLDER =====
function showChartPlaceholder(title, message, isError) {
  document.getElementById("historical-chart-container").style.display = "none";
  document.getElementById("tradingview-chart-container").style.display = "none";

  var el = document.getElementById("chart-placeholder");
  if (!el) {
    el = document.createElement("div");
    el.id = "chart-placeholder";
    el.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;border:1px dashed rgba(0,242,254,0.2);border-radius:6px;background:rgba(0,0,0,0.1);gap:12px;padding:20px;text-align:center;position:absolute;left:0;top:0;";
    document.querySelector(".chart-content").appendChild(el);
  }
  el.style.display = "flex";

  var color = isError ? "var(--color-danger)" : "var(--color-primary)";
  var icon = isError
    ? '<svg viewBox="0 0 24 24" style="fill:' + color + ';width:48px;height:48px;animation:pulse 2s infinite;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
    : '<div class="spinner" style="width:32px;height:32px;border-width:2px;"></div>';

  el.innerHTML = icon +
    '<div style="font-family:JetBrains Mono,monospace;font-size:0.85rem;color:' + color + ';font-weight:bold;">' + title + '</div>' +
    '<div style="font-size:0.78rem;color:var(--color-text-muted);max-width:400px;">' + message + '</div>';
}

function hideChartPlaceholder() {
  var el = document.getElementById("chart-placeholder");
  if (el) el.style.display = "none";
}

// ===== CHART LOADING =====
// ===== CHART LOADING =====
function updateChartRange(years) {
  if (!currentHistoryData || !historyChart) return;
  
  var yearsInt = parseInt(years);
  var cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsInt);
  var cutoffStr = cutoffDate.toISOString().substring(0, 10);
  
  var filteredTimestamps = [];
  var filteredPrices = [];
  for (var i = 0; i < currentHistoryData.timestamps.length; i++) {
    if (currentHistoryData.timestamps[i] >= cutoffStr) {
      filteredTimestamps.push(currentHistoryData.timestamps[i]);
      filteredPrices.push(currentHistoryData.prices[i]);
    }
  }
  
  if (filteredTimestamps.length === 0 && currentHistoryData.timestamps.length > 0) {
    var numDays = yearsInt * 252;
    filteredTimestamps = currentHistoryData.timestamps.slice(-numDays);
    filteredPrices = currentHistoryData.prices.slice(-numDays);
  }
  
  historyChart.data.labels = filteredTimestamps;
  historyChart.data.datasets[0].data = filteredPrices;
  historyChart.data.datasets[0].label = (activeStock ? activeStock.symbol : '') + " Daily Close (" + yearsInt + "-Year View)";
  historyChart.update();
}

async function loadHistoryChart(symbol) {
  try {
    var response = await fetch("/api/history?symbol=" + symbol);
    if (!response.ok) throw new Error("History API error");
    var data = await response.json();

    if (!data.timestamps || data.timestamps.length === 0) {
      console.warn("No history data for", symbol);
      return;
    }

    // Cache the full 20-year history
    currentHistoryData = data;

    // 1. Calculate 52-week High & Low from prices in the last year
    var oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    var oneYearAgoStr = oneYearAgo.toISOString().substring(0, 10);
    
    var pricesLastYear = [];
    for (var i = 0; i < data.timestamps.length; i++) {
      if (data.timestamps[i] >= oneYearAgoStr) {
        pricesLastYear.push(data.prices[i]);
      }
    }
    if (pricesLastYear.length === 0) {
      pricesLastYear = data.prices.slice(-252);
    }
    var low52 = Math.min(...pricesLastYear);
    var high52 = Math.max(...pricesLastYear);
    
    var low52El = document.getElementById("summary-52w-low");
    var high52El = document.getElementById("summary-52w-high");
    if (low52El && activeStock) low52El.innerText = low52.toFixed(2) + " " + activeStock.currency;
    if (high52El && activeStock) high52El.innerText = high52.toFixed(2) + " " + activeStock.currency;

    // 2. Clear & rebuild canvas context
    if (historyChart) {
      historyChart.destroy();
      historyChart = null;
    }

    var container = document.getElementById("historical-chart-container");
    container.innerHTML = '<canvas id="historyChart"></canvas>';
    var canvas = document.getElementById("historyChart");
    var ctx = canvas.getContext("2d");

    var gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, "rgba(0, 242, 254, 0.35)");
    gradient.addColorStop(1, "rgba(6, 9, 19, 0)");

    // 3. Slice default data range based on range slider (default 5 years)
    var sliderEl = document.getElementById("chart-year-slider");
    var sliderVal = sliderEl ? parseInt(sliderEl.value) : 5;
    var labelEl = document.getElementById("chart-year-label");
    if (labelEl) labelEl.innerText = sliderVal + "Y";

    var cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - sliderVal);
    var cutoffStr = cutoffDate.toISOString().substring(0, 10);
    
    var initialTimestamps = [];
    var initialPrices = [];
    for (var i = 0; i < data.timestamps.length; i++) {
      if (data.timestamps[i] >= cutoffStr) {
        initialTimestamps.push(data.timestamps[i]);
        initialPrices.push(data.prices[i]);
      }
    }
    if (initialTimestamps.length === 0) {
      var numDays = sliderVal * 252;
      initialTimestamps = data.timestamps.slice(-numDays);
      initialPrices = data.prices.slice(-numDays);
    }

    // 4. Instantiate Chart
    historyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: initialTimestamps,
        datasets: [{
          label: symbol + " Daily Close (" + sliderVal + "-Year View)",
          data: initialPrices,
          borderColor: "#00f2fe",
          borderWidth: 2,
          // Point styling callback to highlight only the last point (today's rate)
          pointRadius: function(context) {
            var index = context.dataIndex;
            var count = context.dataset.data.length;
            return index === count - 1 ? 6 : 0;
          },
          pointHoverRadius: 6,
          pointBackgroundColor: function(context) {
            var index = context.dataIndex;
            var count = context.dataset.data.length;
            return index === count - 1 ? '#00ff87' : '#00f2fe';
          },
          pointHoverBackgroundColor: "#00f2fe",
          pointBorderWidth: function(context) {
            var index = context.dataIndex;
            var count = context.dataset.data.length;
            return index === count - 1 ? 2 : 0;
          },
          pointBorderColor: "#ffffff",
          pointHoverBorderColor: "#060913",
          pointHoverBorderWidth: 2,
          fill: true,
          backgroundColor: gradient,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            backgroundColor: "rgba(8, 12, 24, 0.95)",
            titleColor: "#00f2fe",
            bodyColor: "#f3f4f6",
            borderColor: "rgba(0, 242, 254, 0.3)",
            borderWidth: 1,
            titleFont: { family: "JetBrains Mono", size: 12 },
            bodyFont: { family: "Inter", size: 11 },
            callbacks: {
              label: function(context) {
                return "Price: " + context.parsed.y + " " + (activeStock ? activeStock.currency : "");
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.02)" },
            ticks: {
              color: "#9ca3af",
              font: { family: "JetBrains Mono", size: 9 },
              autoSkip: false,
              maxRotation: 0,
              // Custom tick callback to display quarterly months (Mar, Jun, Sep, Dec)
              callback: function(val, index) {
                var labels = this.chart.data.labels;
                var dateStr = labels[index];
                if (!dateStr) return '';
                
                var parts = dateStr.split('-');
                if (parts.length < 3) return '';
                var year = parts[0];
                var month = parts[1];
                
                // Only label quarterly months: March (03), June (06), September (09), December (12)
                if (!['03', '06', '09', '12'].includes(month)) return '';
                
                // Only show label on the first data point for that month
                if (index > 0) {
                  var prevMonth = labels[index - 1].split('-')[1];
                  if (prevMonth === month) return '';
                }
                
                var monthNames = { '03': 'Mar', '06': 'Jun', '09': 'Sep', '12': 'Dec' };
                return monthNames[month] + " '" + year.substring(2);
              }
            }
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { color: "#9ca3af", font: { family: "JetBrains Mono", size: 9 } }
          }
        }
      }
    });
  } catch (error) {
    console.error("Failed to load history:", error);
  }
}

function loadTradingViewWidgets(symbol) {
  var tvSymbol = getTradingViewSymbol(symbol);
  var chartContainer = document.getElementById("tradingview-chart-container");
  chartContainer.innerHTML = '<div id="tv_chart_inner" style="width:100%;height:100%;"></div>';

  if (typeof TradingView !== "undefined") {
    new TradingView.widget({
      width: "100%", height: "100%",
      symbol: tvSymbol, interval: "D",
      timezone: "Etc/UTC", theme: "dark", style: "1",
      locale: "en", enable_publishing: false,
      hide_side_toolbar: false, allow_symbol_change: false,
      container_id: "tv_chart_inner"
    });
  }
}

function switchChartTab(tab) {
  currentChartTab = tab;
  var tabBtns = document.querySelectorAll(".chart-tab-btn");
  tabBtns.forEach(function(btn) { btn.classList.remove("active"); });

  if (activeStock && activeStock.isUnlisted) return;

  var histEl = document.getElementById("historical-chart-container");
  var tvEl = document.getElementById("tradingview-chart-container");

  if (tab === "historical") {
    if (tabBtns[0]) tabBtns[0].classList.add("active");
    histEl.style.display = "block";
    tvEl.style.display = "none";
    if (historyChart) {
      historyChart.resize();
    }
  } else {
    if (tabBtns[1]) tabBtns[1].classList.add("active");
    histEl.style.display = "none";
    tvEl.style.display = "block";
  }
}

// ===== NEWS FEED =====
async function loadCompanyNews(symbol) {
  var container = document.getElementById("news-feed-container");
  container.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:80px;gap:8px;">' +
      '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>' +
      '<span style="font-size:0.8rem;color:var(--color-text-muted);">Fetching news for ' + symbol + '...</span>' +
    '</div>';

  try {
    var res = await fetch("/api/news?symbol=" + symbol);
    if (!res.ok) throw new Error("News API error");
    var news = await res.json();

    if (news.length === 0) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:0.8rem;">No recent news found</div>';
      return;
    }

    // Sort newest-first on top
    news.sort(function(a, b) {
      var tsA = a.timestamp || (a.pubDate ? Date.parse(a.pubDate) : 0);
      var tsB = b.timestamp || (b.pubDate ? Date.parse(b.pubDate) : 0);
      return tsB - tsA;
    });

    container.innerHTML = "";
    news.forEach(function(item) {
      var div = document.createElement("div");
      div.className = "news-item";
      var ts = item.timestamp || (item.pubDate ? Date.parse(item.pubDate) : 0);
      var pubDate = ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

      div.innerHTML =
        '<a class="news-title" href="' + item.link + '" target="_blank" rel="noopener">' + item.title + '</a>' +
        '<div class="news-meta">' +
          '<span>' + (item.source || "News") + '</span>' +
          '<span style="color:var(--color-primary);font-weight:600;">' + pubDate + '</span>' +
        '</div>';
      container.appendChild(div);
    });
  } catch (e) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:0.8rem;">Could not load news</div>';
  }
}

function drawHeaderLogo(doc, title, subtitle, isLandscape) {
  var width = isLandscape ? 841.89 : 595.28;
  
  // Header Banner Background
  doc.setFillColor(0, 58, 108); // Navy Blue
  doc.rect(0, 0, width, 85, 'F');
  
  // Red Accent Band at bottom of header banner
  doc.setFillColor(207, 32, 39); // Red
  doc.rect(0, 85, width, 5, 'F');
  
  // Logo in Left Corner (starts at x=40, y=20)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'JPEG', 40, 20, 150, 45);
    } catch (e) {
      // Fallback if image fails
      doc.setFillColor(0, 58, 108);
      doc.rect(40, 22, 110, 20, 'F');
      doc.setFillColor(207, 32, 39);
      doc.rect(40, 43, 110, 20, 'F');
      doc.setFillColor(255, 255, 255);
      doc.rect(150, 22, 41, 41, 'F');
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1);
      doc.line(40, 42.5, 150, 42.5);
      doc.setDrawColor(0, 58, 108);
      doc.setLineWidth(1.5);
      doc.rect(40, 22, 151, 41);
      doc.setTextColor(255, 255, 255);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("HOWE ROBINSON", 45, 34);
      doc.setFontSize(7.5);
      doc.text("P A R T N E R S", 45, 56);
      doc.setFillColor(0, 58, 108);
      doc.triangle(155, 27, 185, 27, 180, 44, 'F');
      doc.rect(155, 27, 25, 17, 'F');
      doc.setFillColor(207, 32, 39);
      doc.rect(155, 45, 25, 13, 'F');
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1);
      doc.line(155, 44.5, 185, 44.5);
    }
  } else {
    doc.setFillColor(0, 58, 108);
    doc.rect(40, 22, 110, 20, 'F');
    doc.setFillColor(207, 32, 39);
    doc.rect(40, 43, 110, 20, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(150, 22, 41, 41, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1);
    doc.line(40, 42.5, 150, 42.5);
    doc.setDrawColor(0, 58, 108);
    doc.setLineWidth(1.5);
    doc.rect(40, 22, 151, 41);
    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("HOWE ROBINSON", 45, 34);
    doc.setFontSize(7.5);
    doc.text("P A R T N E R S", 45, 56);
    doc.setFillColor(0, 58, 108);
    doc.triangle(155, 27, 185, 27, 180, 44, 'F');
    doc.rect(155, 27, 25, 17, 'F');
    doc.setFillColor(207, 32, 39);
    doc.rect(155, 45, 25, 13, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1);
    doc.line(155, 44.5, 185, 44.5);
  }
  
  // Title and Subtitle next to the logo
  doc.setTextColor(255, 255, 255);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 205, 42);
  
  doc.setTextColor(243, 244, 246);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.text(subtitle, 205, 60);
}

function getExchangeName(symbol) {
  if (!symbol) return "Unknown";
  var dotIdx = symbol.lastIndexOf(".");
  if (dotIdx === -1) return "NYSE/NASDAQ";
  
  var suffix = symbol.substring(dotIdx).toUpperCase();
  switch (suffix) {
    case ".NS": return "NSE";
    case ".BO": return "BSE";
    case ".HK": return "HKEX";
    case ".OL": return "OSE";
    case ".T": return "TSE";
    case ".KL": return "Bursa Malaysia";
    case ".JK": return "IDX";
    case ".KS": return "KRX";
    case ".SI": return "SGX";
    case ".TW": return "TWSE";
    case ".TWO": return "TPEx";
    case ".SS": return "SSE";
    case ".SZ": return "SZSE";
    case ".BK": return "SET";
    case ".AX": return "ASX";
    case ".L": return "LSE";
    case ".CO": return "OMXC";
    case ".F": return "Frankfurt";
    case ".MU": return "Munich";
    case ".DE": return "Xetra";
    case ".SG": return "Stuttgart";
    case ".DU": return "Dusseldorf";
    case ".HM": return "Hamburg";
    case ".AS": return "Euronext Amsterdam";
    case ".MI": return "Borsa Italiana";
    case ".HE": return "Nasdaq Helsinki";
    case ".ST": return "Nasdaq Stockholm";
    case ".BR": return "Euronext Brussels";
    case ".AT": return "ATHEX";
    case ".XD": return "ZSE";
    case ".IC": return "Nasdaq Iceland";
    case ".SA": return "B3";
    case ".SN": return "SSE (Santiago)";
    case ".QA": return "QSE";
    case ".SR": return "Tadawul";
    case ".JO": return "JSE";
    case ".TA": return "TASE";
    case ".VN": return "HOSE/HNX";
    default: return suffix.substring(1);
  }
}

// ===== EXPORT / DOWNLOAD =====
async function exportSingleCompany() {
  if (!activeStock || activeStock.isUnlisted) return;

  var btn = document.getElementById("btn-export-single");
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Generating...';

  try {
    const { jsPDF } = window.jspdf;
    var doc = new jsPDF('p', 'pt', 'a4');
    
    // Page dimensions: 595.28 x 841.89
    // Draw branded header logo banner
    drawHeaderLogo(doc, activeStock.name, "COMPANY RESEARCH & FINANCIAL REPORT - GENERATED " + new Date().toISOString().substring(0,10) + " UTC", false);
    
    // Company Info Section
    doc.setTextColor(0, 58, 108);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.text(activeStock.name, 40, 130);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Symbol: " + activeStock.symbol + "   |   Sector: " + activeStock.category + "   |   Exchange: " + getExchangeName(activeStock.symbol) + "   |   Currency: " + activeStock.currency, 40, 150);
    
    // Line separator
    doc.setDrawColor(0, 58, 108);
    doc.setLineWidth(1.5);
    doc.line(40, 160, 555.28, 160);
    
    // Rates & WoW Changes Table
    const sign = activeStock.daily_change >= 0 ? "+" : "";
    const wSign = activeStock.wow_change >= 0 ? "+" : "";
    
    var low52Text = document.getElementById("summary-52w-low") ? document.getElementById("summary-52w-low").innerText : "--.--";
    var high52Text = document.getElementById("summary-52w-high") ? document.getElementById("summary-52w-high").innerText : "--.--";

    doc.autoTable({
      startY: 180,
      margin: { left: 40, right: 40 },
      head: [['Metric', 'Value']],
      body: [
        ['Today\'s Active Rate', activeStock.price + ' ' + activeStock.currency],
        ['Yesterday\'s Close Rate', activeStock.prev_close + ' ' + activeStock.currency],
        ['Daily Change', sign + activeStock.daily_change + ' (' + sign + activeStock.daily_change_pct + '%)'],
        ['Weekly Change (WoW)', wSign + activeStock.wow_change + ' (' + wSign + activeStock.wow_change_pct.toFixed(2) + '%)'],
        ['52-Week High', high52Text],
        ['52-Week Low', low52Text]
      ],
      theme: 'striped',
      headStyles: { fillColor: [0, 58, 108], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { cellPadding: 6, fontSize: 9 },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 1) {
          // Color based on performance rules
          if (data.row.index === 0) { // Today's Rate
            data.cell.styles.textColor = activeStock.daily_change >= 0 ? [0, 150, 0] : [200, 0, 0];
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.row.index === 2) { // Daily Change
            data.cell.styles.textColor = activeStock.daily_change >= 0 ? [0, 150, 0] : [200, 0, 0];
          }
          if (data.row.index === 3) { // Weekly Change (WoW)
            data.cell.styles.textColor = activeStock.wow_change >= 0 ? [0, 150, 0] : [200, 0, 0];
          }
          if (data.row.index === 4) { // 52-Week High
            data.cell.styles.textColor = [0, 150, 0]; // Green
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.row.index === 5) { // 52-Week Low
            data.cell.styles.textColor = [200, 0, 0]; // Red
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    
    let currentY = doc.lastAutoTable.finalY + 25;
    
    // Embed the Chart.js Canvas (forced to 5-year view for report export)
    var canvas = document.getElementById("historyChart");
    if (canvas && activeStock.price > 0) {
      try {
        var sliderEl = document.getElementById("chart-year-slider");
        var currentSliderVal = sliderEl ? sliderEl.value : 5;
        
        // Temporarily force graph rendering to 5 years for PDF export
        updateChartRange(5);
        
        var chartImgData = canvas.toDataURL("image/png");
        
        // Revert back immediately to user's selected slider value
        updateChartRange(currentSliderVal);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(0, 58, 108);
        doc.text("5-Year Price Trend Analytics", 40, currentY);
        
        // Render graph image (width: 515, height: 180)
        doc.addImage(chartImgData, 'PNG', 40, currentY + 10, 515, 180);
        currentY += 210;
      } catch (err) {
        console.error("Failed to add chart to PDF:", err);
      }
    }
    
    // News section deleted by user request
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Page " + i + " of " + pageCount + "  |  Howe Robinson Shipping Stocks Terminal", 40, 815);
    }
    
    doc.save(activeStock.symbol + "_financial_report.pdf");
  } catch (err) {
    console.error("PDF generation failed:", err);
    alert("Failed to generate PDF report. Please check the console.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" style="fill:currentColor;width:16px;height:16px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Download PDF Report';
  }
}

async function exportConsolidated() {
  var checkedBoxes = document.querySelectorAll(".chk-export-sector:checked");
  if (checkedBoxes.length === 0) { alert("Please select at least one sector to export."); return; }

  var selectedSectors = Array.from(checkedBoxes).map(function(cb) { return cb.value; });

  var btn = document.getElementById("btn-export-consolidated");
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>';

  try {
    const { jsPDF } = window.jspdf;
    // Landscape A4 size: 841.89 x 595.28
    var doc = new jsPDF('l', 'pt', 'a4');
    
    // 1. Calculate previous Friday and the Friday before that
    var today = new Date();
    var currentDay = today.getDay();
    var dayToSubtract = currentDay === 0 ? 6 : currentDay - 1; // days since this week's Monday
    
    var prevMonday = new Date(today);
    prevMonday.setDate(today.getDate() - dayToSubtract - 7); // previous week's Monday
    var prevFriday = new Date(prevMonday);
    prevFriday.setDate(prevMonday.getDate() + 4); // previous week's Friday (e.g. July 17th)
    
    var currFriday = new Date(prevFriday);
    var lastFriday = new Date(prevFriday);
    lastFriday.setDate(prevFriday.getDate() - 7); // Friday before previous week's Friday (e.g. July 10th)

    var currFridayStr = currFriday.getFullYear() + '-' + 
                        String(currFriday.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(currFriday.getDate()).padStart(2, '0');
    var lastFridayStr = lastFriday.getFullYear() + '-' + 
                        String(lastFriday.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(lastFriday.getDate()).padStart(2, '0');

    var options = { month: 'short', day: 'numeric' };
    var lastFridayLabel = lastFriday.toLocaleDateString('en-US', options);
    var currFridayLabel = currFriday.toLocaleDateString('en-US', options);
    var dateRangeHeader = lastFridayLabel + " to " + currFridayLabel + ", " + currFriday.getFullYear();
    
    // Helper to get prices from history data for a specific date
    function getPriceForDate(stock, targetDateStr) {
      if (stock.history && stock.history.length > 0) {
        for (var i = stock.history.length - 1; i >= 0; i--) {
          var h = stock.history[i];
          if (h.date === targetDateStr) {
            return h.price;
          }
        }
      }
      return null;
    }

    // Get selected exchanges
    var checkedExchanges = document.querySelectorAll(".chk-export-exchange:checked");
    if (checkedExchanges.length === 0) { alert("Please select at least one exchange to export."); return; }
    var selectedExchanges = Array.from(checkedExchanges).map(function(cb) { return cb.value; });

    // 2. Draw Header
    var sectorLabel = selectedSectors.length === 9 ? "ALL SECTORS" : selectedSectors.join(", ");
    var exchangeLabel = selectedExchanges.length === 18 ? "ALL EXCHANGES" : selectedExchanges.join(", ");
    drawHeaderLogo(doc, "CONSOLIDATED WEEKLY REPORT", "SECTORS: " + sectorLabel + "  |  EXCHANGES: " + exchangeLabel + "  |  WEEK: " + dateRangeHeader, true);
    
    function matchStockExchangeGroup(symbol, selectedGroups) {
      if (!symbol) return false;
      var dotIdx = symbol.lastIndexOf(".");
      if (dotIdx === -1) return selectedGroups.includes("US");
      
      var suffix = symbol.substring(dotIdx).toUpperCase();
      if (suffix === ".NS" || suffix === ".BO") return selectedGroups.includes("IN");
      if (suffix === ".HK") return selectedGroups.includes("HK");
      if (suffix === ".OL") return selectedGroups.includes("NO");
      if (suffix === ".T") return selectedGroups.includes("JP");
      if (suffix === ".KL") return selectedGroups.includes("MY");
      if (suffix === ".JK") return selectedGroups.includes("ID");
      if (suffix === ".KS") return selectedGroups.includes("KR");
      if (suffix === ".SI") return selectedGroups.includes("SG");
      if (suffix === ".TW" || suffix === ".TWO") return selectedGroups.includes("TW");
      if (suffix === ".SS" || suffix === ".SZ") return selectedGroups.includes("CN");
      if (suffix === ".BK") return selectedGroups.includes("TH");
      if (suffix === ".AX") return selectedGroups.includes("AU");
      if (suffix === ".L") return selectedGroups.includes("GB");
      if (suffix === ".CO") return selectedGroups.includes("DK");
      
      var isGerman = [".F", ".MU", ".DE", ".SG", ".DU", ".HM"].includes(suffix);
      if (isGerman) return selectedGroups.includes("DE");
      
      var isOtherEurope = [".AS", ".MI", ".HE", ".ST", ".BR", ".AT", ".XD", ".IC"].includes(suffix);
      if (isOtherEurope) return selectedGroups.includes("OtherEurope");
      
      var isOtherGlobal = [".SA", ".SN", ".QA", ".SR", ".JO", ".TA", ".VN"].includes(suffix);
      if (isOtherGlobal) return selectedGroups.includes("OtherMarkets");
      
      return false;
    }

    // Gather matching stocks, excluding any that are crawling/offline (price <= 0) and filtering by Exchange checkboxes
    const matchedStocks = stocksData.filter(function(s) {
      if (!selectedSectors.includes(s.category)) return false;
      if (s.price <= 0) return false;
      return matchStockExchangeGroup(s.symbol, selectedExchanges);
    });
    
    if (matchedStocks.length === 0) {
      doc.setTextColor(0, 58, 108);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.text("No active stocks found in the selected categories and exchanges.", 40, 120);
    } else {
      const tableHeaders = [
        ['Company Name', 'Sector', 'Exchange', 'Currency', 'Previous Friday (' + lastFridayLabel + ')', 'Current Friday (' + currFridayLabel + ')', 'WoW Change %', '52-Week High', '52-Week Low']
      ];
      
      const tableBody = matchedStocks.map(stock => {
        var pLast = getPriceForDate(stock, lastFridayStr) || stock.prev_close || stock.price;
        var pCurr = getPriceForDate(stock, currFridayStr) || stock.price;
        
        var wowDiff = pCurr - pLast;
        var wowPct = pLast > 0 ? (wowDiff / pLast) * 100 : 0.0;
        var sign = wowDiff >= 0 ? "+" : "";

        var low52 = stock.low_52 || pLast;
        var high52 = stock.high_52 || pCurr;

        return [
          stock.name,
          stock.category,
          getExchangeName(stock.symbol),
          stock.currency,
          pLast.toFixed(2),
          pCurr.toFixed(2),
          sign + wowPct.toFixed(2) + '%',
          high52.toFixed(2),
          low52.toFixed(2)
        ];
      });
      
      doc.autoTable({
        startY: 105,
        margin: { left: 40, right: 40 },
        head: tableHeaders,
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [0, 58, 108], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        styles: { cellPadding: 5, fontSize: 8 },
        didParseCell: function(data) {
          if (data.section === 'body') {
            // Colors formatting: Green for up, Red for down
            if (data.column.index === 6) { // WoW Change %
              var val = data.cell.raw;
              if (val.startsWith('+')) {
                data.cell.styles.textColor = [0, 150, 0]; // Green
                data.cell.styles.fontStyle = 'bold';
              } else if (val.startsWith('-')) {
                data.cell.styles.textColor = [200, 0, 0]; // Red
                data.cell.styles.fontStyle = 'bold';
              }
            }
            if (data.column.index === 7) { // 52w High
              data.cell.styles.textColor = [0, 150, 0]; // Green
              data.cell.styles.fontStyle = 'bold';
            }
            if (data.column.index === 8) { // 52w Low
              data.cell.styles.textColor = [200, 0, 0]; // Red
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });
      
      // Consolidated news section deleted by user request
    }
    
    // Add page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Page " + i + " of " + pageCount + "  |  Howe Robinson Shipping Stocks Terminal", 40, 570);
    }
    
    function getOrdinalNum(n) {
      return n + (n > 0 ? ['th', 'st', 'nd', 'rd'][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : '');
    }
    
    var monDay = getOrdinalNum(prevMonday.getDate());
    var friDay = getOrdinalNum(prevFriday.getDate());
    var monMonth = prevMonday.toLocaleDateString('en-US', { month: 'long' });
    var friMonth = prevFriday.toLocaleDateString('en-US', { month: 'long' });
    var yearStr = prevFriday.getFullYear();
    
    var dateLabel = "";
    if (monMonth === friMonth) {
      dateLabel = monDay + " to " + friDay + " " + monMonth + " " + yearStr;
    } else {
      dateLabel = monDay + " " + monMonth + " to " + friDay + " " + friMonth + " " + yearStr;
    }
    
    doc.save("HRP Shipping weekly report " + dateLabel + ".pdf");
  } catch (err) {
    console.error("Consolidated PDF export failed:", err);
    alert("Failed to generate PDF. Check Console.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" style="fill:currentColor;width:16px;height:16px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Download';
  }
}

// Checkboxes state triggers
function toggleAllExportSectors(source) {
  var checkboxes = document.querySelectorAll(".chk-export-sector");
  checkboxes.forEach(function(cb) {
    cb.checked = source.checked;
  });
}

function updateAllSectorsCheckbox() {
  var allCheckbox = document.getElementById("chk-all-sectors");
  var total = document.querySelectorAll(".chk-export-sector").length;
  var checked = document.querySelectorAll(".chk-export-sector:checked").length;
  allCheckbox.checked = (total === checked);
}

function toggleAllExportExchanges(source) {
  var checkboxes = document.querySelectorAll(".chk-export-exchange");
  checkboxes.forEach(function(cb) {
    cb.checked = source.checked;
  });
}

function updateAllExchangesCheckbox() {
  var allCheckbox = document.getElementById("chk-all-exchanges");
  var total = document.querySelectorAll(".chk-export-exchange").length;
  var checked = document.querySelectorAll(".chk-export-exchange:checked").length;
  allCheckbox.checked = (total === checked);
}

function renderTickerTape() {
  var container = document.querySelector(".ticker-tape-container");
  if (!container) return;
  
  var filtered = stocksData.filter(function(s) {
    return (s.category === "Dry Bulk" || s.category === "Diversified") && s.price > 0;
  });
  
  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding-left:20px; font-size:0.78rem; color:var(--color-text-muted);">No stock rates loaded yet.</div>';
    return;
  }
  
  var items = filtered.concat(filtered).concat(filtered);
  var html = '<div class="ticker-tape-scroll">';
  items.forEach(function(s) {
    var isPositive = s.daily_change >= 0;
    var sign = isPositive ? "+" : "";
    var color = isPositive ? "var(--color-success)" : "var(--color-danger)";
    
    html += 
      '<div class="ticker-tape-item">' +
        '<span class="ticker-tape-symbol">' + s.symbol + '</span>' +
        '<span style="color:var(--color-text-muted); font-size:0.68rem; margin-right:4px;">' + s.name + '</span>' +
        '<span class="ticker-tape-price">' + s.price.toFixed(2) + ' ' + s.currency + '</span>' +
        '<span class="ticker-tape-change" style="color:' + color + ';">' + sign + s.daily_change_pct.toFixed(2) + '%</span>' +
      '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}
