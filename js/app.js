// js/app.js
// Expense Tracker full client logic with CSV/JSON import-export and XLSX (Excel) export.
// Comments are in English. This file is self-contained but expects the HTML to include:
// - elements with IDs used below (balance, income, expense, tx-list, tx-form, desc, amount, date, search, clear-all,
//   export-csv, export-json, export-xlsx, import-file, trendChart)
// - Chart.js is optional (if present chart will update)
// This script will dynamically load SheetJS (xlsx) when XLSX export is first used.

const LS_KEY = "expense-tracker::txs";

/* ---------------- DOM refs ---------------- */
const balanceEl = document.getElementById("balance");
const incomeEl = document.getElementById("income");
const expenseEl = document.getElementById("expense");
const txListEl = document.getElementById("tx-list");
const form = document.getElementById("tx-form");
const descInput = document.getElementById("desc");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("date");
const searchInput = document.getElementById("search");
const clearAllBtn = document.getElementById("clear-all");

const exportCsvBtn = document.getElementById("export-csv");
const exportJsonBtn = document.getElementById("export-json");
let exportXlsxBtn = document.getElementById("export-xlsx"); // optional button; if absent we create behavior without button
const importFileInput = document.getElementById("import-file");
const chartCanvas = document.getElementById("trendChart");

/* ---------------- state ---------------- */
let trendChart = null;
let sheetJsLoaded = false;

/* ---------------- Storage helpers ---------------- */
function loadTxs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to parse transactions from storage", e);
    return [];
  }
}

function saveTxs(txs) {
  localStorage.setItem(LS_KEY, JSON.stringify(txs));
}

/* ---------------- Utilities ---------------- */
function fmt(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

/* ---------------- Rendering ---------------- */
function render(txs = loadTxs(), filter = "") {
  const filtered = txs.filter(t => t.desc.toLowerCase().includes(filter.toLowerCase()));

  let income = 0, expense = 0;
  filtered.forEach(t => {
    if (t.amount >= 0) income += t.amount;
    else expense += Math.abs(t.amount);
  });
  const balance = income - expense;

  if (balanceEl) balanceEl.textContent = fmt(balance);
  if (incomeEl) incomeEl.textContent = fmt(income);
  if (expenseEl) expenseEl.textContent = fmt(expense);

  if (!txListEl) return;
  txListEl.innerHTML = "";
  if (filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "tx-item empty";
    li.textContent = "No transactions yet.";
    txListEl.appendChild(li);
  } else {
    filtered.forEach(tx => {
      const li = document.createElement("li");
      li.className = "tx-item";

      const left = document.createElement("div");
      left.className = "tx-desc";
      const d1 = document.createElement("div");
      d1.innerHTML = `<strong>${escapeHtml(tx.desc)}</strong><div class="tx-date">${tx.date || ""}</div>`;
      left.appendChild(d1);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "12px";

      const amt = document.createElement("div");
      amt.className = "tx-amt";
      amt.textContent = (tx.amount >= 0 ? "+ " : "- ") + fmt(Math.abs(tx.amount));
      amt.style.color = tx.amount >= 0 ? "var(--success)" : "var(--danger)";

      const del = document.createElement("button");
      del.className = "delete-btn";
      del.textContent = "Delete";
      del.onclick = () => {
        if (!confirm("Delete this transaction?")) return;
        const all = loadTxs().filter(t => t.id !== tx.id);
        saveTxs(all);
        render(all, searchInput.value);
        updateChart(all);
      };

      right.appendChild(amt);
      right.appendChild(del);

      li.appendChild(left);
      li.appendChild(right);

      txListEl.appendChild(li);
    });
  }

  updateChart(txs);
}

/* ---------------- Chart helpers ---------------- */
function build30DaySeries(txs) {
  const days = 30;
  const mapIncome = new Map();
  const mapExpense = new Map();
  const toYMD = (d) => d.toISOString().slice(0,10);
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = toYMD(dt);
    labels.push(key);
    mapIncome.set(key, 0);
    mapExpense.set(key, 0);
  }

  txs.forEach(t => {
    const d = t.date ? new Date(t.date) : new Date();
    const key = toYMD(d);
    if (!mapIncome.has(key)) return;
    if (t.amount >= 0) mapIncome.set(key, mapIncome.get(key) + Number(t.amount));
    else mapExpense.set(key, mapExpense.get(key) + Math.abs(Number(t.amount)));
  });

  const incomeData = labels.map(l => Math.round((mapIncome.get(l) || 0) * 100) / 100);
  const expenseData = labels.map(l => Math.round((mapExpense.get(l) || 0) * 100) / 100);

  return { labels, incomeData, expenseData };
}

function updateChart(txs = loadTxs()) {
  if (!chartCanvas) return;
  if (typeof Chart === "undefined") return; // Chart.js not available
  const { labels, incomeData, expenseData } = build30DaySeries(txs);

  if (!trendChart) {
    const ctx = chartCanvas.getContext("2d");
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Income",
            data: incomeData,
            borderColor: "#10b981",
            backgroundColor: "rgba(16,185,129,0.06)",
            tension: 0.25,
            pointRadius: 2,
            borderWidth: 2,
            fill: true
          },
          {
            label: "Expense",
            data: expenseData,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239,68,68,0.06)",
            tension: 0.25,
            pointRadius: 2,
            borderWidth: 2,
            fill: true
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (v) => v } }
        },
        plugins: { legend: { position: "top" } }
      }
    });
  } else {
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = incomeData;
    trendChart.data.datasets[1].data = expenseData;
    trendChart.update();
  }
}

/* ---------------- CSV / JSON export helpers ---------------- */
function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function txsToCSV(txs) {
  const header = ["id","desc","amount","date"];
  const rows = txs.map(t => [
    csvEscape(t.id),
    csvEscape(t.desc),
    t.amount,
    csvEscape(t.date || "")
  ].join(","));
  return header.join(",") + "\n" + rows.join("\n");
}

function downloadFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- XLSX (Excel) export ----------------
   We dynamically load SheetJS (xlsx.full.min.js) from CDN when user triggers XLSX export
   to avoid requiring the library in HTML.
*/
function ensureSheetJsLoaded(callback) {
  if (sheetJsLoaded || typeof XLSX !== "undefined") {
    sheetJsLoaded = true;
    return callback && callback();
  }
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  s.onload = () => {
    sheetJsLoaded = true;
    callback && callback();
  };
  s.onerror = () => {
    alert("Failed to load XLSX library. Please check your connection.");
  };
  document.head.appendChild(s);
}

function exportToXLSX(txs) {
  if (!txs || !txs.length) return alert("No transactions to export.");
  ensureSheetJsLoaded(() => {
    // Normalize rows for Excel: Date as YYYY-MM-DD, Amount numeric
    const rows = txs.map(t => ({
      ID: t.id,
      Description: t.desc,
      Amount: t.amount,
      Date: t.date || ""
    }));
    // Create worksheet & workbook
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    // Write workbook binary and trigger download
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

/* ---------------- Import helpers ---------------- */
function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1);
  const res = [];
  for (const row of rows) {
    const values = row.match(/("([^"]|"")*"|[^,]+)/g) || [];
    const clean = values.map(v => v.replace(/^"|"$/g, "").replace(/""/g, '"'));
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = clean[i] || "";
    }
    const amount = parseFloat(obj.amount || "0");
    res.push({
      id: obj.id || uid(),
      desc: obj.desc || "",
      amount: Number.isNaN(amount) ? 0 : Math.round(amount * 100) / 100,
      date: obj.date || new Date().toISOString().slice(0,10)
    });
  }
  return res;
}

function handleImportContent(filename, content, options = { merge: true }) {
  const lower = filename.toLowerCase();
  let incoming = [];
  try {
    if (lower.endsWith(".json")) {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) incoming = parsed;
      else if (parsed && Array.isArray(parsed.txs)) incoming = parsed.txs;
      else incoming = [];
    } else if (lower.endsWith(".csv")) {
      incoming = parseCSV(content);
    } else {
      alert("Unsupported file type. Use JSON or CSV.");
      return;
    }
  } catch (e) {
    console.error("Import parse error", e);
    alert("Failed to parse imported file. See console for details.");
    return;
  }

  if (!incoming.length) {
    alert("No transactions found in imported file.");
    return;
  }

  incoming = incoming.map(t => ({
    id: t.id || uid(),
    desc: String(t.desc || "").trim(),
    amount: typeof t.amount === "number" ? Math.round(t.amount * 100) / 100 : Number(parseFloat(t.amount) || 0),
    date: t.date || new Date().toISOString().slice(0,10)
  }));

  const existing = loadTxs();
  let result;
  if (options.merge) {
    const map = new Map();
    existing.forEach(t => map.set(t.id, t));
    incoming.forEach(t => map.set(t.id, t));
    result = Array.from(map.values()).sort((a,b) => {
      if (a.date === b.date) return b.id.localeCompare(a.id);
      return a.date < b.date ? 1 : -1;
    });
  } else {
    result = incoming;
  }

  saveTxs(result);
  render(result, searchInput.value);
  alert(`Imported ${incoming.length} transactions (${options.merge ? "merged" : "replaced"}).`);
}

/* ---------------- Wire file input change ---------------- */
if (importFileInput) {
  importFileInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      if (typeof text !== "string") {
        alert("File reading error.");
        return;
      }
      const merge = confirm("Merge imported transactions with existing ones? OK=Merge, Cancel=Replace");
      handleImportContent(f.name, text, { merge });
      importFileInput.value = "";
    };
    reader.onerror = () => {
      alert("Failed to read file.");
    };
    reader.readAsText(f, "utf-8");
  });
}

/* ---------------- Export button handlers ---------------- */
exportCsvBtn?.addEventListener("click", () => {
  const txs = loadTxs();
  if (!txs.length) return alert("No transactions to export.");
  const csv = txsToCSV(txs);
  downloadFile("transactions.csv", csv, "text/csv;charset=utf-8");
});

exportJsonBtn?.addEventListener("click", () => {
  const txs = loadTxs();
  if (!txs.length) return alert("No transactions to export.");
  const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), txs }, null, 2);
  downloadFile("transactions.json", json, "application/json;charset=utf-8");
});

// If export-xlsx button exists in DOM, wire it. Otherwise, create a small floating control when user triggers (not necessary).
if (exportXlsxBtn) {
  exportXlsxBtn.addEventListener("click", () => {
    const txs = loadTxs();
    exportToXLSX(txs);
  });
} else {
  // If there's no button named export-xlsx, optionally create it near export-json if that exists
  if (exportJsonBtn && !exportXlsxBtn) {
    const b = document.createElement("button");
    b.className = "btn ghost";
    b.id = "export-xlsx";
    b.textContent = "Export XLSX";
    exportJsonBtn.insertAdjacentElement("afterend", b);
    exportXlsxBtn = b;
    exportXlsxBtn.addEventListener("click", () => {
      const txs = loadTxs();
      exportToXLSX(txs);
    });
  }
}

/* ---------------- Form handlers ---------------- */
form?.addEventListener("submit", function (e) {
  e.preventDefault();
  const desc = descInput.value.trim();
  const amt = parseFloat(amountInput.value);
  if (!desc || Number.isNaN(amt)) {
    alert("Please enter a valid description and amount.");
    return;
  }
  const tx = {
    id: uid(),
    desc,
    amount: Math.round(amt * 100) / 100,
    date: dateInput.value || new Date().toISOString().slice(0,10)
  };
  const txs = loadTxs();
  txs.unshift(tx);
  saveTxs(txs);

  descInput.value = "";
  amountInput.value = "";
  dateInput.value = "";

  render(txs, searchInput.value);
});

/* ---------------- Clear / Search handlers ---------------- */
clearAllBtn?.addEventListener("click", () => {
  if (!confirm("Clear all transactions? This cannot be undone.")) return;
  localStorage.removeItem(LS_KEY);
  render([]);
});

searchInput?.addEventListener("input", () => {
  const txs = loadTxs();
  render(txs, searchInput.value);
});

/* ---------------- Initial render ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const txs = loadTxs();
  render(txs);
});