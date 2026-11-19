import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev65.0/+esm";

const FIELDS = ["day", "time", "sex", "smoker", "size"];
const DAYS = ["Thur", "Fri", "Sat", "Sun"];
const DAY_LABELS = { Thur: "Quinta", Fri: "Sexta", Sat: "Sábado", Sun: "Domingo" };
const DAY_COLORS = { Thur: "#4d7bf3", Fri: "#8364d8", Sat: "#21b899", Sun: "#f19c54" };
const TIME_COLORS = { Lunch: "#4d7bf3", Dinner: "#21b899" };
const $ = (id) => document.getElementById(id);
const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
let connection;
let updateVersion = 0;

function setStatus(message, type = "ready") {
  const element = $("status");
  element.textContent = message;
  element.className = `status ${type}`;
}

function toRows(table) {
  return table.toArray().map((row) => row.toJSON());
}

async function query(sql) {
  return toRows(await connection.query(sql));
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function whereClause() {
  const terms = FIELDS.flatMap((field) => {
    const value = $(field).value;
    if (!value) return [];
    return [field === "size" ? `size = ${Number(value)}` : `${field} = ${sqlLiteral(value)}`];
  });
  return terms.length ? `WHERE ${terms.join(" AND ")}` : "";
}

async function setupDatabase() {
  // GitHub Pages serve arquivos estáticos. O arquivo real é um Parquet, não JSON.
  const response = await fetch("./data/tips.parquet", { cache: "no-cache" });
  if (!response.ok) throw new Error(`Não foi possível carregar data/tips.parquet (HTTP ${response.status}).`);
  const parquetBytes = new Uint8Array(await response.arrayBuffer());
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(new Blob([
    `importScripts(${JSON.stringify(bundle.mainWorker)});`
  ], { type: "text/javascript" }));
  try {
    const worker = new Worker(workerUrl);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.registerFileBuffer("tips.parquet", parquetBytes);
    connection = await db.connect();
    await connection.query("CREATE VIEW tips AS SELECT * FROM read_parquet('tips.parquet')");
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

async function populateFilters() {
  for (const field of FIELDS) {
    const values = await query(`SELECT DISTINCT ${field} AS value FROM tips WHERE ${field} IS NOT NULL ORDER BY 1`);
    const select = $(field);
    for (const { value } of values) {
      const option = document.createElement("option");
      option.value = String(value);
      const v = String(value);
      option.textContent = field === "day" ? DAY_LABELS[v] || v
        : field === "time" ? ({ Lunch: "Almoço", Dinner: "Jantar" }[v] || v)
        : field === "sex" ? ({ Male: "Masculino", Female: "Feminino" }[v] || v)
        : field === "smoker" ? ({ Yes: "Sim", No: "Não" }[v] || v)
        : v;
      select.append(option);
    }
    select.addEventListener("change", () => void updateDashboard());
  }
  $("reset-filters").addEventListener("click", () => {
    for (const field of FIELDS) $(field).value = "";
    void updateDashboard();
  });
}

function baseLayout(extra = {}) {
  return {
    font: { family: 'Inter, "Segoe UI", sans-serif', size: 11, color: "#63728b" },
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 52, r: 16, t: 19, b: 48 },
    xaxis: { automargin: true, showgrid: false, zeroline: false, linecolor: "#e1e8f1" },
    yaxis: { automargin: true, gridcolor: "#edf1f7", zeroline: false },
    legend: { orientation: "h", x: 0, y: 1.12, font: { size: 10 } },
    hoverlabel: { bgcolor: "#15243f", font: { color: "#fff" } },
    ...extra
  };
}
const plotConfig = { responsive: true, displaylogo: false, scrollZoom: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] };
function plot(id, data, layout) {
  return Plotly.react(id, data, layout, plotConfig);
}

function renderKpis(stats) {
  const total = Number(stats.revenue || 0);
  const tips = Number(stats.tips || 0);
  const count = Number(stats.count || 0);
  $("kpi-revenue").textContent = usd.format(total);
  $("kpi-tips").textContent = usd.format(tips);
  $("kpi-average").textContent = usd.format(count ? tips / count : 0);
  $("kpi-count").textContent = decimal.format(count);
  $("kpi-rate").textContent = pct.format(total ? tips / total : 0);
}

function renderScatter(rows) {
  const traces = DAYS.filter((day) => rows.some((r) => r.day === day)).map((day) => {
    const subset = rows.filter((r) => r.day === day);
    return {
      type: "scatter", mode: "markers", name: DAY_LABELS[day],
      x: subset.map((r) => Number(r.total_bill)), y: subset.map((r) => Number(r.tip)),
      customdata: subset.map((r) => [Number(r.size), r.time]),
      marker: { color: DAY_COLORS[day], size: subset.map((r) => 6 + Number(r.size) * 2.4), opacity: 0.78, line: { color: "#fff", width: 0.7 } },
      hovertemplate: "Conta: $%{x:.2f}<br>Gorjeta: $%{y:.2f}<br>Pessoas: %{customdata[0]}<br>Período: %{customdata[1]}<extra>%{fullData.name}</extra>"
    };
  });
  return plot("chart-scatter", traces, baseLayout({ xaxis: { title: "Conta (USD)", gridcolor: "#edf1f7" }, yaxis: { title: "Gorjeta (USD)", gridcolor: "#edf1f7" } }));
}

function renderBar(groups) {
  const totals = DAYS.map((day) => ({ day, value: groups.filter((g) => g.day === day).reduce((s, g) => s + Number(g.revenue), 0) }));
  return plot("chart-bar", [{ type: "bar", x: totals.map((t) => DAY_LABELS[t.day]), y: totals.map((t) => t.value), marker: { color: totals.map((t) => DAY_COLORS[t.day]), cornerradius: 6 },
    hovertemplate: "Faturamento: $%{y:,.2f}<extra></extra>" }], baseLayout({ yaxis: { title: "Faturamento (USD)", gridcolor: "#edf1f7" }, showlegend: false }));
}

function renderBox(rows) {
  const traces = ["Lunch", "Dinner"].filter((time) => rows.some((r) => r.time === time)).map((time) => {
    const subset = rows.filter((r) => r.time === time);
    return { type: "box", name: time === "Lunch" ? "Almoço" : "Jantar", x: subset.map((r) => DAY_LABELS[r.day] || r.day), y: subset.map((r) => Number(r.tip)),
      marker: { color: TIME_COLORS[time] }, line: { color: TIME_COLORS[time] }, boxpoints: "outliers", hovertemplate: "Gorjeta: $%{y:.2f}<extra>%{fullData.name}</extra>" };
  });
  return plot("chart-box", traces, baseLayout({ boxmode: "group", xaxis: { categoryorder: "array", categoryarray: DAYS.map((d) => DAY_LABELS[d]) }, yaxis: { title: "Gorjeta (USD)", gridcolor: "#edf1f7" } }));
}

function renderHistogram(rows) {
  const traces = ["Lunch", "Dinner"].filter((time) => rows.some((r) => r.time === time)).map((time) => ({
    type: "histogram", name: time === "Lunch" ? "Almoço" : "Jantar",
    x: rows.filter((r) => r.time === time).map((r) => Number(r.total_bill)),
    marker: { color: TIME_COLORS[time], opacity: 0.75 },
    xbins: { start: 0, end: 60, size: 2.4 },
    hovertemplate: "%{x:.2f} USD<br>Contas: %{y}<extra>%{fullData.name}</extra>"
  }));
  return plot("chart-hist", traces, baseLayout({ barmode: "overlay", xaxis: { title: "Valor da conta (USD)", gridcolor: "#edf1f7" }, yaxis: { title: "Frequência", gridcolor: "#edf1f7" } }));
}

function renderTreemap(groups) {
  const ids = ["root"], labels = ["Total"], parents = [""], values = [0], colors = [0];
  const total = groups.reduce((s, g) => s + Number(g.revenue), 0);
  const tips = groups.reduce((s, g) => s + Number(g.tips), 0);
  values[0] = total;
  colors[0] = total ? (tips / total) * 100 : 0;
  for (const day of DAYS) {
    const items = groups.filter((g) => g.day === day && Number(g.revenue) > 0);
    if (!items.length) continue;
    const dayTotal = items.reduce((s, g) => s + Number(g.revenue), 0);
    const dayTips = items.reduce((s, g) => s + Number(g.tips), 0);
    ids.push(`day:${day}`); labels.push(DAY_LABELS[day]); parents.push("root"); values.push(dayTotal); colors.push(100 * dayTips / dayTotal);
    for (const item of items) {
      const amount = Number(item.revenue);
      ids.push(`item:${day}:${item.time}`); labels.push(item.time === "Lunch" ? "Almoço" : "Jantar"); parents.push(`day:${day}`);
      values.push(amount); colors.push(100 * Number(item.tips) / amount);
    }
  }
  return plot("chart-treemap", [{ type: "treemap", ids, labels, parents, values, branchvalues: "total", textinfo: "label+value+percent parent",
    texttemplate: "%{label}<br>$%{value:,.2f}", hovertemplate: "%{label}<br>Faturamento: $%{value:,.2f}<br>Participação: %{percentParent:.1%}<extra></extra>",
    marker: { colors, colorscale: [[0, "#dde9fc"], [0.5, "#79d9ca"], [1, "#1a987f"]], line: { color: "#fff", width: 2 }, colorbar: { title: { text: "Gorjeta (%)", side: "right" }, thickness: 12 } },
    pathbar: { visible: true }, root: { color: "#e8eef8" } }], baseLayout({ margin: { l: 4, r: 8, t: 18, b: 5 } }));
}

async function updateDashboard() {
  const version = ++updateVersion;
  try {
    const where = whereClause();
    const rows = await query(`SELECT total_bill, tip, day, time, size FROM tips ${where}`);
    const stats = (await query(`SELECT COUNT(*)::INTEGER AS count, COALESCE(SUM(total_bill),0)::DOUBLE AS revenue, COALESCE(SUM(tip),0)::DOUBLE AS tips FROM tips ${where}`))[0];
    const groups = await query(`SELECT day, time, SUM(total_bill)::DOUBLE AS revenue, SUM(tip)::DOUBLE AS tips FROM tips ${where} GROUP BY day, time`);
    if (version !== updateVersion) return;
    renderKpis(stats);
    if (Number(stats.count) === 0) {
      const emptyLayout = baseLayout({
        xaxis: { visible: false }, yaxis: { visible: false },
        annotations: [{ text: "Sem dados para os filtros selecionados", showarrow: false, x: 0.5, y: 0.5, xref: "paper", yref: "paper", font: { color: "#8b99ac", size: 13 } }]
      });
      await Promise.all(["chart-scatter", "chart-bar", "chart-box", "chart-hist", "chart-treemap"].map((id) => plot(id, [], emptyLayout)));
    } else {
      await Promise.all([renderScatter(rows), renderBar(groups), renderBox(rows), renderHistogram(rows), renderTreemap(groups)]);
    }
    if (version === updateVersion) setStatus(`${Number(stats.count)} contas encontradas · filtros aplicados automaticamente`);
  } catch (error) {
    console.error("Erro na atualização:", error);
    setStatus(`Erro ao atualizar o dashboard: ${error.message}`, "error");
  }
}

async function init() {
  try {
    if (!window.Plotly) throw new Error("Plotly.js não foi carregado. Verifique sua conexão com a internet.");
    await setupDatabase();
    await populateFilters();
    await updateDashboard();
  } catch (error) {
    console.error("Falha na inicialização:", error);
    setStatus(`Falha na inicialização: ${error.message}. Execute por HTTP (GitHub Pages ou python -m http.server), não via file://.`, "error");
  }
}

void init();
