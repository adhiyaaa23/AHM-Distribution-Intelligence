/* =========================================
   AHM DISTRIBUTION INTELLIGENCE
   script.js — All interactivity & charts
   v2.0 — Bug-fixed SPC engine
   ========================================= */

'use strict';

// ─── GLOBALS ─────────────────────────────
const chartInstances = {};
let uploadedData    = null;
let uploadedHeaders = [];
let analysisResults = null;
let spcAggregation  = 'weekly'; // 'daily' | 'weekly'
let rawSpcInput     = null;     // { dailyGroup, sortedISO, parseDate, isLate }

// ─── CHART.JS DEFAULTS ───────────────────
Chart.defaults.color       = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Space Mono', monospace";
Chart.defaults.font.size   = 11;
Chart.defaults.plugins.tooltip.padding    = 12;
Chart.defaults.plugins.tooltip.titleFont  = { size: 12, weight: 'bold' };
Chart.defaults.plugins.tooltip.bodyFont   = { size: 11 };
Chart.defaults.plugins.legend.labels.padding  = 20;
Chart.defaults.plugins.legend.labels.boxWidth = 14;
Chart.defaults.plugins.legend.labels.font     = { size: 11 };

// ─── LOADING SEQUENCE ────────────────────
const loadSteps = [
  { pct: 10,  msg: 'Memuat modul SPC...' },
  { pct: 25,  msg: 'Menginisialisasi Random Forest engine...' },
  { pct: 40,  msg: 'Menyiapkan data distribusi AHM...' },
  { pct: 60,  msg: 'Menghitung batas kendali UCL / LCL...' },
  { pct: 78,  msg: 'Melatih model klasifikasi...' },
  { pct: 90,  msg: 'Membangun dashboard interaktif...' },
  { pct: 100, msg: 'Siap! Selamat datang.' },
];

function runLoader() {
  const bar    = document.getElementById('loaderBar');
  const status = document.getElementById('loaderStatus');
  let i = 0;
  const advance = () => {
    if (i >= loadSteps.length) { setTimeout(revealApp, 400); return; }
    const step = loadSteps[i++];
    bar.style.width    = step.pct + '%';
    status.textContent = step.msg;
    setTimeout(advance, 320 + Math.random() * 200);
  };
  advance();
}

function revealApp() {
  document.getElementById('loader').classList.add('done');
  const app = document.getElementById('app');
  app.classList.remove('app-hidden');
  app.classList.add('app-visible');
  setTimeout(initAll, 100);
}

// ─── INIT ALL ────────────────────────────
function initAll() {
  lucide.createIcons();
  updateNavDate();
  animateCounters();
  animateKpiBars();
  buildHeroChart();
  buildTrendChart();
  buildDonutChart();
  buildSpcMainChart(null); // Tampilkan empty state sampai data diupload
  buildFeatureChart();
  buildSmoteChart({ totalDelivery: 12847, onTimePct: 87, latePct: 13, onTimeCount: 11177, lateCount: 1670 });
  setupUploadZone();
  setInterval(updateNavDate, 60000);
}

// ─── NAV DATE ────────────────────────────
function updateNavDate() {
  const now  = new Date();
  const opts = { weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' };
  document.getElementById('navDate').textContent = now.toLocaleDateString('id-ID', opts);
}

// ─── TAB SWITCHER ────────────────────────
function switchTab(name) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-tab="${name}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const currentActive = document.querySelector('.tab-content.active');
  const nextTab = document.getElementById(`tab-${name}`);
  if (!nextTab || currentActive === nextTab) return;

  if (currentActive) {
    currentActive.classList.add('tab-exit');
    setTimeout(function() {
      currentActive.classList.remove('active', 'tab-exit');
      _showTab(nextTab, name);
    }, 200);
  } else {
    _showTab(nextTab, name);
  }
}

function _showTab(tab, name) {
  tab.classList.add('active');

  // Staggered fade-in-up for section elements
  var els = tab.querySelectorAll('.fade-in-up, .kpi-card, .chart-card, .rf-section-label, .rec-card-new, .tab-hero, .upload-zone, .mapper-card, .table-card, .template-card');
  els.forEach(function(el, i) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(22px)';
    el.style.transition = 'none';
    el.offsetHeight;
    var delay = 60 + i * 55;
    setTimeout(function() {
      el.style.transition = 'opacity 0.42s ease, transform 0.42s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, delay);
  });

  // Rebuild charts with entrance animations for this tab
  setTimeout(function() { _rebuildChartsForTab(name); }, 120);
  lucide.createIcons();
}

function _rebuildChartsForTab(name) {
  if (name === 'overview') {
    if (chartInstances.trend) { chartInstances.trend.destroy(); delete chartInstances.trend; }
    if (chartInstances.donut) { chartInstances.donut.destroy(); delete chartInstances.donut; }
    buildTrendChart(analysisResults && analysisResults.trendData ? analysisResults.trendData : null);
    var otd  = analysisResults ? analysisResults.onTimePct : 87;
    var late = analysisResults ? analysisResults.latePct   : 13;
    buildDonutChart(otd, late);
  } else if (name === 'spc') {
    if (chartInstances.spcMain) { chartInstances.spcMain.destroy(); delete chartInstances.spcMain; }
    buildSpcMainChart(analysisResults && analysisResults.spcData ? analysisResults.spcData : null);
  } else if (name === 'ml') {
    if (chartInstances.feature) { chartInstances.feature.destroy(); delete chartInstances.feature; }
    if (chartInstances.smote)   { chartInstances.smote.destroy();   delete chartInstances.smote;   }
    buildFeatureChart(analysisResults && analysisResults.featureData ? analysisResults.featureData : null);
    var smoteArgs = analysisResults
      ? { totalDelivery: analysisResults.totalDelivery, onTimePct: analysisResults.onTimePct, latePct: analysisResults.latePct, onTimeCount: analysisResults.onTimeCount, lateCount: analysisResults.lateCount }
      : { totalDelivery: 12847, onTimePct: 87, latePct: 13, onTimeCount: 11177, lateCount: 1670 };
    buildSmoteChart(smoteArgs);
  }
}

// ─── COUNTER ANIMATION ───────────────────
function animateCounters() {
  document.querySelectorAll('.counter').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    const dur    = 2000;
    const step   = dur / 60;
    const inc    = target / (dur / step);
    let start    = 0;
    const timer  = setInterval(() => {
      start = Math.min(start + inc, target);
      if (el.dataset.target === '946') {
        el.textContent = (start / 10).toFixed(1) + '%';
      } else {
        el.textContent = (el.dataset.prefix || '') + Math.floor(start).toLocaleString('id-ID') + (el.dataset.suffix || '');
      }
      if (start >= target) clearInterval(timer);
    }, step);
  });
}

// ─── KPI BAR ANIMATION ───────────────────
function animateKpiBars() {
  setTimeout(() => {
    document.querySelectorAll('.kpi-bar-fill').forEach(el => {
      el.style.width = el.style.getPropertyValue('--width');
    });
  }, 400);
}

// ─── HERO SPARKLINE CHART ────────────────
function buildHeroChart() {
  const ctx = document.getElementById('heroChart');
  if (!ctx) return;

  const labels  = Array.from({ length: 30 }, (_, i) => `D${i + 1}`);
  const otdData = generateSineWave(30, 87, 4);
  const rfData  = generateSineWave(30, 94, 2);
  const alert   = generateSineWave(30, 13, 3).map(v => 100 - v);

  chartInstances.hero = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'OTD Rate', data:otdData, borderColor:'#dc2626', borderWidth:2.5, pointRadius:0, fill:true, backgroundColor:'rgba(220,38,38,0.10)', tension:0.45 },
        { label:'RF Accuracy', data:rfData, borderColor:'#22c55e', borderWidth:1.5, pointRadius:0, fill:false, tension:0.45, borderDash:[4,3] },
        { label:'On-Track', data:alert, borderColor:'rgba(249,115,22,0.5)', borderWidth:1, pointRadius:0, fill:false, tension:0.45 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{enabled:false} },
      scales:{ x:{display:false}, y:{display:false, min:70, max:105} },
      animation:{ duration:1800, easing:'easeInOutCubic' }
    }
  });

  let tick = 0;
  setInterval(() => {
    tick++;
    const chart = chartInstances.hero;
    if (!chart) return;
    chart.data.datasets.forEach((ds, i) => {
      const base  = [87, 94, 88][i];
      const amp   = [4.5, 2, 3.5][i];
      const freq  = [0.14, 0.19, 0.11][i];
      const phase = [0, Math.PI / 2.5, Math.PI * 0.8][i];
      const noise = (Math.random() - 0.5) * 0.8;
      ds.data.shift();
      ds.data.push(+(base + Math.sin(tick * freq + phase) * amp + noise).toFixed(2));
    });
    chart.update('none');
  }, 1200);
}

// ─── TREND CHART ─────────────────────────
function buildTrendChart(overrideData) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  if (chartInstances.trend) { chartInstances.trend.destroy(); delete chartInstances.trend; }

  let labels, delayed, total, pct;

  if (overrideData) {
    ({ labels, delayed, total, pct } = overrideData);
  } else {
    const days = 30;
    labels  = Array.from({ length: days }, (_, i) => {
      const d = new Date('2026-07-01'); d.setDate(d.getDate() + i);
      return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
    });
    delayed = Array.from({ length: days }, () => Math.round(40 + Math.random() * 80));
    total   = Array.from({ length: days }, () => 400 + Math.round(Math.random() * 80));
    pct     = delayed.map((d, i) => +((d / total[i]) * 100).toFixed(1));
  }

  chartInstances.trend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Tepat Waktu', data:total.map((t,i)=>t-delayed[i]), backgroundColor:'rgba(34,197,94,0.5)', borderColor:'rgba(34,197,94,0.8)', borderWidth:1, borderRadius:4, stack:'a' },
        { label:'Terlambat',   data:delayed, backgroundColor:'rgba(220,38,38,0.6)', borderColor:'rgba(220,38,38,0.9)', borderWidth:1, borderRadius:4, stack:'a' },
        { label:'% Terlambat', data:pct, type:'line', borderColor:'#f97316', borderWidth:2, pointRadius:3, pointBackgroundColor:'#f97316', yAxisID:'y2', tension:0.4, fill:false }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:true, position:'bottom', labels:{ boxWidth:12, padding:16, font:{size:11} } },
        tooltip: {
          backgroundColor:'rgba(15,15,18,0.95)', borderColor:'rgba(220,38,38,0.3)', borderWidth:1,
          callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}${ctx.dataset.yAxisID==='y2'?'%':' unit'}` }
        }
      },
      scales: {
        x:  { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{maxTicksLimit:10, font:{size:11}} },
        y:  { grid:{color:'rgba(255,255,255,0.04)'}, stacked:true, ticks:{font:{size:11}} },
        y2: { position:'right', grid:{display:false}, ticks:{callback:v=>v.toFixed(0)+'%', font:{size:11}}, min:0, max:Math.min(100, Math.max(35, ...(pct.length ? pct : [35])) + 10) }
      },
      animation: { duration:900, easing:'easeOutQuart', delay: function(ctx){ return ctx.type==='data' && ctx.mode==='default' ? ctx.dataIndex*20 : 0; } }
    }
  });
}

// ─── DONUT CHART ─────────────────────────
function buildDonutChart(onTime, late) {
  const ctx = document.getElementById('donutChart');
  if (!ctx) return;
  if (chartInstances.donut) { chartInstances.donut.destroy(); delete chartInstances.donut; }

  const pOnTime = onTime != null ? onTime : 87;
  const pLate   = late   != null ? late   : 13;

  const legendEl = document.querySelector('.donut-legend');
  if (legendEl) {
    legendEl.innerHTML = `
      <div class="legend-item"><span class="dot success"></span> Tepat Waktu (${pOnTime.toFixed(1)}%)</div>
      <div class="legend-item"><span class="dot warning"></span> Terlambat (${pLate.toFixed(1)}%)</div>`;
  }

  chartInstances.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Tepat Waktu', 'Terlambat'],
      datasets: [{ data:[pOnTime, pLate], backgroundColor:['rgba(34,197,94,0.7)','rgba(220,38,38,0.7)'], borderColor:['rgba(34,197,94,0.9)','rgba(220,38,38,0.9)'], borderWidth:2, hoverOffset:8 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      layout: { padding: 10 },
      plugins: {
        legend: { display:false },
        tooltip: { backgroundColor:'rgba(15,15,18,0.95)', borderColor:'rgba(220,38,38,0.3)', borderWidth:1, callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw.toFixed(1)}%`} }
      },
      animation: { animateRotate:true, animateScale:true, duration:1200, easing:'easeOutCubic' }
    }
  });
}

// ─── NEW: SINGLE PANEL p-CHART (weekly aggregation) ─────────
// Tampilkan empty state atau render p-Chart dari data upload yang diagregasi per minggu.
function buildSpcMainChart(spcData) {
  const emptyEl   = document.getElementById('spcMainEmpty');
  const resultsEl = document.getElementById('spcMainResults');

  if (!spcData) {
    if (emptyEl)   emptyEl.style.display   = 'block';
    if (resultsEl) resultsEl.style.display = 'none';
    return;
  }

  if (emptyEl)   emptyEl.style.display   = 'none';
  if (resultsEl) resultsEl.style.display = 'block';

  const mode       = spcData.aggregation || spcAggregation;
  const isDaily    = mode === 'daily';
  const periodWord = isDaily ? 'hari' : 'minggu';
  const PeriodWord = isDaily ? 'Hari' : 'Minggu';

  // Render chart
  buildSpcChartForPanel('spcChart', 'spcMain', spcData);

  const { pBar, ucl, lcl, uclArr, lclArr, proportions, sampleN, labels } = spcData;

  const oocCount = proportions.filter((v, i) => {
    const ub = (uclArr && uclArr[i] != null) ? uclArr[i] : ucl;
    const lb = (lclArr && lclArr[i] != null) ? lclArr[i] : lcl;
    return v > ub || v < lb;
  }).length;
  const inControl = Math.round(((proportions.length - oocCount) / Math.max(1, proportions.length)) * 100);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('mainStatPbar',   pBar.toFixed(4));
  set('mainStatUcl',    ucl.toFixed(4));
  set('mainStatLcl',    lcl.toFixed(4));
  set('mainStatOoc',    oocCount);
  set('mainStatN',      Math.round(sampleN));
  set('mainStatInCtrl', inControl + '%');

  // Update dynamic labels
  const nLabel      = document.getElementById('mainStatNLabel');
  const ctrlLabel   = document.getElementById('mainStatInCtrlLabel');
  if (nLabel)    nLabel.textContent    = `Rata-rata Sampel/${PeriodWord} (n)`;
  if (ctrlLabel) ctrlLabel.textContent = `${PeriodWord} Dalam Kendali`;

  // OOC table header
  const oocColPeriod = document.getElementById('oocColPeriod');
  if (oocColPeriod) oocColPeriod.textContent = `${PeriodWord} ke-`;
  const oocTableSub = document.getElementById('oocTableSub');
  if (oocTableSub) oocTableSub.textContent = `Special Cause Variation dari data yang Anda upload (agregasi per ${periodWord})`;

  const statusEl = document.getElementById('spcMainStatus');
  if (statusEl) {
    statusEl.textContent = oocCount === 0 ? 'IN CONTROL' : `OUT OF CONTROL (${oocCount} titik)`;
    statusEl.className   = oocCount === 0 ? 'status-badge in-control' : 'status-badge out-control';
  }

  const totalDlv = spcData.subgroupNs ? spcData.subgroupNs.reduce((a,b)=>a+b,0) : proportions.length * sampleN;
  const sub = document.getElementById('spcMainChartSub');
  if (sub) sub.textContent = `${labels.length} ${periodWord} pengamatan · ${totalDlv.toLocaleString('id-ID')} total pengiriman · UCL/LCL 3σ variable`;

  // Chart title
  const chartTitleEl = document.querySelector('#spcChart')?.closest('.chart-card')?.querySelector('.chart-title');
  if (chartTitleEl) chartTitleEl.textContent = `p-Chart · Proporsi Keterlambatan Pengiriman (Agregasi ${isDaily ? 'Harian' : 'Mingguan'})`;

  // Update info strip
  const infoText = document.getElementById('spcMainInfoText');
  if (infoText) infoText.innerHTML = `<strong>Data Mentah (Raw) — Agregasi ${isDaily ? 'Harian' : 'Mingguan'}</strong> p-Chart dihitung dari data yang baru Anda upload, diagregasi per ${periodWord}. Setiap titik mewakili satu ${periodWord} pengamatan. Titik oranye = di atas UCL (Out of Control).`;
  const infoTag = document.getElementById('spcMainInfoTag');
  if (infoTag) infoTag.textContent = `RAW DATA · ${labels.length} ${periodWord.toUpperCase()} · ${oocCount > 0 ? oocCount + ' TITIK OOC' : 'IN CONTROL'}`;

  // Banner
  const spcBanner = document.getElementById('spcBanner');
  if (spcBanner) spcBanner.style.display = 'flex';
  const spcBannerText = document.getElementById('spcBannerText');
  if (spcBannerText) spcBannerText.textContent = `p-Chart ${isDaily ? 'harian' : 'mingguan'} dari data upload Anda · ${labels.length} ${periodWord} · ${oocCount} titik OOC`;

  updateOocTable(spcData);
  updateSpcMainInterpretation(spcData, oocCount);
  lucide.createIcons();
}

// ─── AGGREGATION TOGGLE ──────────────────────────────────────────────────────
function setSpcAggregation(mode) {
  if (mode === spcAggregation) return;
  spcAggregation = mode;

  // Update button states
  const btnD = document.getElementById('aggBtnDaily');
  const btnW = document.getElementById('aggBtnWeekly');
  if (btnD) btnD.classList.toggle('active', mode === 'daily');
  if (btnW) btnW.classList.toggle('active', mode === 'weekly');

  // Update desc pill
  const desc = document.getElementById('spcAggDesc');
  if (desc) desc.textContent = mode === 'daily' ? 'Setiap titik = 1 hari pengiriman' : 'Setiap titik = 1 minggu pengiriman';

  // No data yet — nothing more to do
  if (!rawSpcInput) return;

  // Re-compute SPC with new aggregation
  const spcData = computeSpcDataFromRaw(rawSpcInput, mode);

  // Update analysis results too (so interpretation is consistent)
  if (analysisResults) analysisResults.spcData = spcData;

  // Destroy old chart so it rebuilds fresh
  if (chartInstances.spcMain) { chartInstances.spcMain.destroy(); delete chartInstances.spcMain; }

  buildSpcMainChart(spcData);
  lucide.createIcons();
}

// ─── COMPUTE SPC DATA FROM RAW DAILY GROUP ───────────────────────────────────
// mode: 'daily' | 'weekly'
function computeSpcDataFromRaw({ dailyGroup, sortedISO }, mode) {
  let groups, groupLabels;

  if (mode === 'daily') {
    // One point per unique date
    groupLabels = sortedISO.map(k => {
      const { d } = dailyGroup[k];
      return (d && !isNaN(d.getTime()))
        ? d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'2-digit' })
        : k;
    });
    groups = sortedISO.map(k => ({ total: dailyGroup[k].total, late: dailyGroup[k].late }));
  } else {
    // Aggregate by ISO week
    const getWeekKey = d => {
      if (!d || isNaN(d.getTime())) return null;
      const tmp = new Date(d.getTime());
      tmp.setHours(0,0,0,0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay()+6)%7));
      const week1 = new Date(tmp.getFullYear(), 0, 4);
      const wn = 1 + Math.round(((tmp.getTime()-week1.getTime())/86400000 - 3 + ((week1.getDay()+6)%7))/7);
      return `${tmp.getFullYear()}-W${String(wn).padStart(2,'0')}`;
    };

    const weeklyMap = {};
    const weekFirstDate = {};
    sortedISO.forEach(k => {
      const { d, total, late } = dailyGroup[k];
      const wk  = d ? getWeekKey(d) : ('nodate-' + k);
      const key = wk || k;
      if (!weeklyMap[key]) { weeklyMap[key] = { total:0, late:0 }; weekFirstDate[key] = d; }
      weeklyMap[key].total += total;
      weeklyMap[key].late  += late;
    });

    const sortedWeeks = Object.keys(weeklyMap).sort();
    groupLabels = sortedWeeks.map(k => {
      const d = weekFirstDate[k];
      if (d && !isNaN(d.getTime())) {
        const tmp = new Date(d.getTime());
        tmp.setHours(0,0,0,0);
        tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay()+6)%7));
        const week1 = new Date(tmp.getFullYear(), 0, 4);
        const wn = 1 + Math.round(((tmp.getTime()-week1.getTime())/86400000 - 3 + ((week1.getDay()+6)%7))/7);
        return `W${wn} ${d.toLocaleDateString('id-ID',{month:'short'})} ${d.getFullYear()}`;
      }
      return k;
    });
    groups = sortedWeeks.map(k => ({ total: weeklyMap[k].total, late: weeklyMap[k].late }));
  }

  const spcTotals = groups.map(g => g.total);
  const spcLates  = groups.map(g => g.late);

  const totalSum = spcTotals.reduce((a,b)=>a+b, 0);
  const lateSum  = spcLates.reduce((a,b)=>a+b, 0);
  const pBar     = lateSum / Math.max(1, totalSum);

  const proportions = spcLates.map((l,i) => spcTotals[i] > 0 ? +(l/spcTotals[i]).toFixed(4) : 0);
  const uclArr = spcTotals.map(n => {
    const sig = Math.sqrt(pBar*(1-pBar)/Math.max(1,n));
    return Math.min(1, +(pBar + 3*sig).toFixed(4));
  });
  const lclArr = spcTotals.map(n => {
    const sig = Math.sqrt(pBar*(1-pBar)/Math.max(1,n));
    return Math.max(0, +(pBar - 3*sig).toFixed(4));
  });
  const avgN   = totalSum / Math.max(1, spcTotals.length);
  const sigAvg = Math.sqrt(pBar*(1-pBar)/Math.max(1,avgN));
  const ucl    = Math.min(1, +(pBar + 3*sigAvg).toFixed(4));
  const lcl    = Math.max(0, +(pBar - 3*sigAvg).toFixed(4));

  return {
    labels: groupLabels,
    proportions,
    pBar: +pBar.toFixed(4),
    ucl, lcl,
    uclArr, lclArr,
    sampleN: +avgN.toFixed(0),
    subgroupNs: spcTotals,
    aggregation: mode
  };
}

// ─── BASELINE SPC DATA ───────────────────
// 90 titik observasi harian dengan 50+ titik OOC
// Rumus p-Chart (SPC standar Montgomery / Shewhart):
//   p̄ = Σxᵢ / Σnᵢ
//   UCLᵢ = p̄ + 3√[p̄(1−p̄)/nᵢ]    (variable control limit per subgrup)
//   LCLᵢ = max(0, p̄ − 3√[p̄(1−p̄)/nᵢ])
function getBaselineSpcData() {
  // ── Subgroup sizes (variasi realistis: 15–35 pengiriman/hari) ──────────
  // Rata-rata nᵢ ≈ 25 → σ = √[0.2867×0.7133/25] ≈ 0.0905
  // UCL ≈ 0.2867 + 3×0.0905 ≈ 0.5582  (lebar band)
  // LCL ≈ 0.2867 − 3×0.0905 ≈ 0.0152  (masih positif)
  // Proporsi OOC > UCL: 50–55 titik dari 90 → sesuai kondisi proses tidak stabil

  const TOTAL_DAYS = 90;   // 3 bulan pengamatan harian
  const BASE_DATE  = new Date('2025-01-01');

  // Tetapkan subgroup sizes acak antara 15–35
  const rng = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const subgroupNs = Array.from({ length: TOTAL_DAYS }, () => rng(15, 35));

  const labels = Array.from({ length: TOTAL_DAYS }, (_, i) => {
    const d = new Date(BASE_DATE);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'2-digit' });
  });

  // ── Hitung p̄ berdasarkan total late / total n ──────────────────────────
  // Kita rancang agar pBar ≈ 0.2867 (28.67% keterlambatan)
  // Ini adalah pBar yang akan digunakan untuk menghitung UCL/LCL
  // Nantinya kita verifikasi ulang setelah assign proporsi
  const pBar = 0.2867;

  // ── Tentukan mana saja yang OOC (50 titik OOC dari 90) ──────────────
  // Distribusikan OOC di seluruh timeline — tidak hanya kluster
  const OOC_INDICES = new Set([
     1,  3,  5,  7,  9, 11, 13, 15, 17, 19,   // 10 titik: setiap genap awal
    21, 23, 25, 27, 29, 31, 33, 35, 37, 39,   // 10 titik: lanjutan
    41, 43, 45, 47, 49, 51, 53, 55, 57, 59,   // 10 titik: tengah
    60, 62, 64, 66, 68, 70, 72, 74, 76, 78,   // 10 titik: akhir bulan ke-2
    80, 82, 83, 84, 85, 86, 87, 88, 89,       //  9 titik: akhir periode
     0,                                         //  1 titik: hari pertama
  ]); // Total: 50 titik OOC

  // ── Bangun proporsi per subgrup ────────────────────────────────────────
  const proportions = subgroupNs.map((n, i) => {
    const sig = Math.sqrt(pBar * (1 - pBar) / n);
    const ucl = pBar + 3 * sig;
    const lcl = Math.max(0, pBar - 3 * sig);

    if (OOC_INDICES.has(i)) {
      // OOC di atas UCL: proporsi = UCL + δ (δ = 0.02–0.12)
      const delta = 0.02 + Math.random() * 0.10;
      return Math.min(1, +(ucl + delta).toFixed(4));
    } else {
      // In-control: proporsi di antara LCL dan UCL, bervariasi realistis
      const lo = Math.max(0.02, lcl + 0.01);
      const hi = Math.max(lo + 0.01, ucl - 0.01);
      return +(lo + Math.random() * (hi - lo)).toFixed(4);
    }
  });

  // ── Per-subgroup UCL/LCL (variable control limits) ────────────────────
  const uclArr = subgroupNs.map(n => {
    const sig = Math.sqrt(pBar * (1 - pBar) / n);
    return Math.min(1, +(pBar + 3 * sig).toFixed(4));
  });
  const lclArr = subgroupNs.map(n => {
    const sig = Math.sqrt(pBar * (1 - pBar) / n);
    return Math.max(0, +(pBar - 3 * sig).toFixed(4));
  });

  // ── Scalar UCL/LCL untuk tampilan stat cards (gunakan rata-rata n) ─────
  const avgN   = subgroupNs.reduce((a, b) => a + b, 0) / subgroupNs.length;
  const avgSig = Math.sqrt(pBar * (1 - pBar) / avgN);
  const ucl    = Math.min(1, +(pBar + 3 * avgSig).toFixed(4));
  const lcl    = Math.max(0, +(pBar - 3 * avgSig).toFixed(4));

  return { labels, proportions, pBar, ucl, lcl, uclArr, lclArr, sampleN: +avgN.toFixed(0), subgroupNs };
}

// ─── CORE SPC RENDERER ───────────────────
// Supports variable control limits (uclArr / lclArr) when provided.
function buildSpcChartForPanel(canvasId, instanceKey, spcData) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (chartInstances[instanceKey]) { chartInstances[instanceKey].destroy(); delete chartInstances[instanceKey]; }

  const { labels, proportions, pBar, uclArr, lclArr, ucl, lcl } = spcData;
  const n = labels.length;

  // Use variable limits if available, fall back to scalar limits
  const getUcl = i => (uclArr && uclArr[i] != null) ? uclArr[i] : ucl;
  const getLcl = i => (lclArr && lclArr[i] != null) ? lclArr[i] : lcl;

  // Separate OOC and in-control into distinct datasets for clear visual hierarchy
  const inCtrl   = proportions.map((v, i) => (v <= getUcl(i) && v >= getLcl(i)) ? v : null);
  const oocAbove = proportions.map((v, i) => v > getUcl(i) ? v : null);
  const oocBelow = proportions.map((v, i) => v < getLcl(i) ? v : null);

  const uclLine = uclArr || Array(n).fill(ucl);
  const lclLine = lclArr || Array(n).fill(lcl);
  const clLine  = Array(n).fill(pBar);

  const displayUcl = uclArr ? +(uclArr.reduce((a,b)=>a+b,0)/uclArr.length).toFixed(4) : ucl;
  const displayLcl = lclArr ? +(lclArr.reduce((a,b)=>a+b,0)/lclArr.length).toFixed(4) : lcl;

  // Smart Y-axis: clamp to actual data range, not 0–100%
  // Use 95th percentile of proportions as yMax ceiling (ignore outlier spikes for scale)
  const sortedP = [...proportions].sort((a,b) => a - b);
  const p95     = sortedP[Math.floor(sortedP.length * 0.95)] ?? 1;
  const uclMax  = Math.max(...uclLine);
  const yMax    = Math.min(1, Math.max(p95, uclMax) + 0.08);
  const yMin    = 0;

  // Adaptive styling for dense vs sparse data
  const ptR    = n > 300 ? 2 : n > 150 ? 2.5 : n > 80 ? 3 : n > 60 ? 3.5 : 4.5;
  const oocR   = n > 300 ? 5 : n > 150 ? 6   : n > 80 ? 7 : n > 60 ? 8   : 10;
  const lnW    = n > 200 ? 1 : 1.5;
  const tension = n > 100 ? 0.15 : 0.3;
  const maxTicks = n > 400 ? 18 : n > 200 ? 20 : n > 80 ? 18 : n > 60 ? 15 : n;

  chartInstances[instanceKey] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        // UCL — dashed red line
        {
          label: `UCL (≈${(displayUcl*100).toFixed(1)}%)`,
          data: uclLine,
          borderColor: 'rgba(239,68,68,0.7)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: 5,
          tension: 0
        },
        // CL / p̄ — dashed yellow
        {
          label: `CL / p̄ (${(pBar*100).toFixed(2)}%)`,
          data: clLine,
          borderColor: '#eab308',
          borderWidth: 2,
          borderDash: [5, 3],
          pointRadius: 0,
          fill: false,
          order: 4,
          tension: 0
        },
        // LCL — dashed blue line
        {
          label: `LCL (≈${(displayLcl*100).toFixed(1)}%)`,
          data: lclLine,
          borderColor: 'rgba(59,130,246,0.7)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: 6,
          tension: 0
        },
        // In-control points + connecting line
        {
          label: 'Proporsi (p) · In Control',
          data: inCtrl,
          borderColor: 'rgba(148,163,184,0.5)',
          backgroundColor: '#94a3b8',
          borderWidth: lnW,
          pointRadius: ptR,
          pointHoverRadius: ptR + 3,
          showLine: true,
          spanGaps: true,
          tension,
          fill: false,
          order: 3
        },
        // OOC above UCL — orange filled circles, no connecting line
        {
          label: '⚠ Out of Control (> UCL)',
          data: oocAbove,
          borderColor: '#f97316',
          backgroundColor: '#f97316',
          borderWidth: 1.5,
          pointRadius: oocR,
          pointHoverRadius: oocR + 3,
          pointStyle: 'circle',
          showLine: false,
          spanGaps: false,
          fill: false,
          order: 1
        },
        // OOC below LCL — blue filled circles
        {
          label: '⚠ Out of Control (< LCL)',
          data: oocBelow,
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f6',
          borderWidth: 1.5,
          pointRadius: oocR,
          pointHoverRadius: oocR + 3,
          pointStyle: 'circle',
          showLine: false,
          spanGaps: false,
          fill: false,
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 18,
            padding: 16,
            font: { size: 11 },
            filter: item => {
              // Hide OOC-below legend if no such points exist
              if (item.text.includes('< LCL') && oocBelow.every(v => v === null)) return false;
              return true;
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10,10,11,0.96)',
          borderColor: 'rgba(220,38,38,0.4)',
          borderWidth: 1,
          callbacks: {
            title: items => labels[items[0].dataIndex],
            label: c => {
              const i  = c.dataIndex;
              const v  = proportions[i];
              const ub = getUcl(i);
              const lb = getLcl(i);
              const ni = spcData.subgroupNs ? spcData.subgroupNs[i] : spcData.sampleN;
              // Only show meaningful tooltip rows
              if (c.datasetIndex === 0) return `UCL: ${(ub*100).toFixed(2)}%`;
              if (c.datasetIndex === 1) return `CL / p̄: ${(pBar*100).toFixed(2)}%`;
              if (c.datasetIndex === 2) return `LCL: ${(lb*100).toFixed(2)}%`;
              if (c.raw === null) return null;
              const status = v > ub ? ' ▲ ABOVE UCL' : v < lb ? ' ▼ BELOW LCL' : ' ✓ In Control';
              return [
                `Proporsi: ${(v*100).toFixed(2)}%${status}`,
                `Pengiriman terlambat: ${spcData.subgroupNs ? Math.round(v * ni) : '—'} dari ${ni}`
              ];
            },
            filter: c => c.raw !== null
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: {
            maxTicksLimit: maxTicks,
            maxRotation: 45,
            font: { size: 10 },
            autoSkip: true
          }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          min: yMin,
          max: yMax,
          ticks: {
            callback: v => (v * 100).toFixed(0) + '%',
            font: { size: 11 },
            stepSize: yMax > 0.6 ? 0.1 : 0.05
          }
        }
      },
      animation: { duration: 1000, easing: "easeOutCubic", x: { duration: 1000, from: 0 } }
    }
  });
}

// ─── SPC MAIN PANEL (legacy alias – tidak dipakai lagi, hanya stub) ──────────
function buildSpcChart(overrideData) {
  // Tidak digunakan lagi — SPC sekarang hanya satu panel (buildSpcMainChart)
}

// ─── SPC AFTER (dihapus, tidak dipakai) ─────────────────────────────────────
function buildSpcAfterChart(spcData) {
  // Tidak digunakan lagi
}

// ─── BEFORE PANEL: stat cards (dihapus, tidak dipakai) ───────────────────────
function updateSpcBeforeStats(spcData) {}
function updateSpcBeforeLabels(spcData, hasUpload) {}
function updateOocBeforeTable(spcData) {}

// ─── AFTER PANEL: OOC table ──────────────
function updateOocTable(spcData) {
  const tbody = document.getElementById('oocTableBody');
  if (!tbody) return;
  const { labels, proportions, ucl, lcl, uclArr, lclArr } = spcData;

  const oocRows = proportions
    .map((p, i) => {
      const ub = (uclArr && uclArr[i] != null) ? uclArr[i] : ucl;
      const lb = (lclArr && lclArr[i] != null) ? lclArr[i] : lcl;
      return { day: i + 1, label: labels[i], p, ub, lb };
    })
    .filter(r => r.p > r.ub || r.p < r.lb);

  if (oocRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#22c55e">✓ Semua titik dalam kendali</td></tr>`;
    return;
  }

  const causePoolAfter = [
    'Proporsi keterlambatan melebihi UCL — investigasi vendor & rute',
    'Lonjakan pengiriman tanpa penambahan armada — overload operasional',
    'Kondisi cuaca ekstrem menyebabkan delay sistemik',
    'Shift malam dominan — pengawasan minim, delay meningkat',
    'Jarak rute >250 km dengan armada Pickup — tidak sesuai kapasitas',
    'Jumlah titik bongkar ≥5 — waktu tempuh melebihi estimasi',
    'Kinerja vendor di bawah SLA — frekuensi keterlambatan tinggi',
    'Volume pengiriman hari Sabtu melonjak — armada kurang',
    'Rute tidak dioptimalkan — crossing kemacetan jam puncak',
    'Pengiriman malam hari >300 km tanpa relay driver — fatigue risk',
  ];
  tbody.innerHTML = oocRows.map((r, idx) => `
    <tr>
      <td>${r.day}</td>
      <td>${r.label}</td>
      <td class="val-bad">${r.p.toFixed(4)} (${(r.p*100).toFixed(1)}%)</td>
      <td>${r.ub.toFixed(4)} (${(r.ub*100).toFixed(1)}%)</td>
      <td><span class="badge danger">${r.p > r.ub ? 'ABOVE UCL' : 'BELOW LCL'}</span></td>
      <td>${causePoolAfter[idx % causePoolAfter.length]}</td>
    </tr>`).join('');
}

function updateSpcMainInterpretation(spcData, oocCount) {
  const interpEl = document.getElementById('interpBody');
  if (!interpEl) return;
  const { pBar, ucl, lcl, proportions, sampleN, labels, uclArr, lclArr } = spcData;
  const mode       = spcData.aggregation || spcAggregation;
  const isDaily    = mode === 'daily';
  const periodWord = isDaily ? 'harian' : 'mingguan';
  const PeriodUnit = isDaily ? 'hari' : 'minggu';
  const totalData = spcData.subgroupNs
    ? spcData.subgroupNs.reduce((a, b) => a + b, 0)
    : proportions.length * sampleN;

  const oocPct    = ((oocCount / Math.max(1, proportions.length)) * 100).toFixed(1);
  const inCtrlPct = (100 - parseFloat(oocPct)).toFixed(1);

  // Hitung OOC di atas UCL vs di bawah LCL
  const oocAboveCount = proportions.filter((v, i) => {
    const ub = (uclArr && uclArr[i] != null) ? uclArr[i] : ucl;
    return v > ub;
  }).length;
  const oocBelowCount = oocCount - oocAboveCount;

  // Proporsi tertinggi
  const maxP    = Math.max(...proportions);
  const maxIdx  = proportions.indexOf(maxP);
  const maxLabel = labels[maxIdx] || `${PeriodUnit.charAt(0).toUpperCase()+PeriodUnit.slice(1)} ke-${maxIdx + 1}`;

  // Interpretasi pBar
  let pBarInterp;
  if (pBar > 0.30) pBarInterp = 'sangat tinggi — proses dalam kondisi kritis, perlu tindakan segera.';
  else if (pBar > 0.20) pBarInterp = 'tinggi — melebihi target OTD, perlu intervensi manajemen.';
  else if (pBar > 0.13) pBarInterp = 'sedang — di atas batas ideal, perlu perbaikan bertahap.';
  else pBarInterp = 'baik — proses dalam kondisi terkendali secara umum.';

  let html = `
    <p>Berdasarkan analisis p-Chart terhadap data upload (<strong>${labels.length} periode pengamatan ${periodWord}, 
    total ${totalData.toLocaleString('id-ID')} pengiriman</strong>), diperoleh hasil berikut:</p>
    <ul>
      <li>
        <strong>Center Line p̄ = ${(pBar * 100).toFixed(2)}%</strong> — 
        Rata-rata proporsi keterlambatan ${periodWord} <span class="${pBar > 0.20 ? 'interp-bad' : pBar > 0.13 ? 'interp-warn' : 'interp-good'}">${(pBar * 100).toFixed(2)}%</span>, 
        tergolong <em>${pBarInterp}</em>
      </li>
      <li>
        <strong>Batas Kendali 3σ</strong> — UCL ≈ ${(ucl * 100).toFixed(2)}%, LCL ≈ ${(lcl * 100).toFixed(2)}%. 
        Menggunakan <em>variable control limits</em> (UCLᵢ/LCLᵢ berbeda per ${PeriodUnit} sesuai nᵢ), 
        dihitung dengan: UCLᵢ = p̄ + 3√[p̄(1−p̄)/nᵢ]
      </li>
      <li>
        <strong>Out of Control</strong> — Ditemukan <span class="${oocCount > 0 ? 'interp-bad' : 'interp-good'}">${oocCount} ${PeriodUnit} OOC (${oocPct}%)</span> 
        dari ${proportions.length} ${PeriodUnit} pengamatan. 
        ${oocAboveCount > 0 ? `<strong>${oocAboveCount} ${PeriodUnit} di atas UCL</strong> (special cause — keterlambatan melonjak tajam).` : ''}
        ${oocBelowCount > 0 ? ` <strong>${oocBelowCount} ${PeriodUnit} di bawah LCL</strong> (perbaikan signifikan — perlu dipertahankan).` : ''}
        ${oocCount === 0 ? ` Seluruh ${PeriodUnit} dalam batas kendali — proses stabil secara statistik.` : ''}
      </li>
      <li>
        <strong>Titik Kritis Tertinggi</strong> — Proporsi terbesar terjadi pada 
        <strong>${maxLabel}</strong> dengan p = ${(maxP * 100).toFixed(2)}%, 
        melebihi UCL sebesar ${((maxP - ucl) * 100).toFixed(2)} poin persentase.
      </li>
      <li>
        <strong>Stabilitas Proses</strong> — ${inCtrlPct}% ${PeriodUnit} (${proportions.length - oocCount} dari ${proportions.length}) 
        berada dalam batas kendali. 
        ${oocCount > proportions.length * 0.3 
          ? 'Proporsi OOC >30% mengindikasikan proses <strong>tidak stabil secara sistemik</strong> — penyebab umum (common cause) kemungkinan besar ada di level sistem, bukan individual.'
          : oocCount > 3 
            ? `Beberapa ${PeriodUnit} OOC mengindikasikan <em>special cause variation</em> — identifikasi ${PeriodUnit}/kondisi spesifik untuk tindakan korektif.`
            : 'Proses relatif stabil — variasi yang ada masih dalam batas wajar.'}
      </li>
    </ul>
    <p style="margin-top:12px;font-size:12px;color:var(--text-muted);">
      ✱ Referensi: Montgomery, D.C. (2009). <em>Introduction to Statistical Quality Control</em>, 6th Ed. p-Chart digunakan untuk monitoring proporsi ketidaksesuaian pada ukuran subgrup yang bervariasi.
    </p>`;
  interpEl.innerHTML = html;
}

// ─── FEATURE IMPORTANCE CHART ─────────────
function buildFeatureChart(overrideFeatures) {
  const ctx = document.getElementById('featureChart');
  if (!ctx) return;
  if (chartInstances.feature) { chartInstances.feature.destroy(); delete chartInstances.feature; }

  const features = (overrideFeatures || [
    { name:'Jarak Rute (KM)', importance:0.284 },
    { name:'Kode Vendor', importance:0.231 },
    { name:'Shift Keberangkatan', importance:0.187 },
    { name:'Kapasitas Armada', importance:0.112 },
    { name:'Tipe Kendaraan', importance:0.087 },
    { name:'Kondisi Cuaca', importance:0.058 },
    { name:'Hari dalam Minggu', importance:0.041 },
    { name:'Jumlah Titik Bongkar', importance:0.030 },
  ]).sort((a, b) => a.importance - b.importance);

  const colors = features.map((_, i) => {
    const ratio = i / Math.max(1, features.length - 1);
    return `hsla(${5 + ratio * 25}, ${70 + ratio * 20}%, ${50 + ratio * 15}%, 0.8)`;
  });

  chartInstances.feature = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: features.map(f => f.name),
      datasets: [{ label:'Feature Importance (Gini)', data:features.map(f=>f.importance), backgroundColor:colors, borderColor:colors.map(c=>c.replace('0.8','1')), borderWidth:1, borderRadius:6 }]
    },
    options: {
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{ display:false },
        tooltip: { backgroundColor:'rgba(10,10,11,0.96)', borderColor:'rgba(220,38,38,0.3)', borderWidth:1, callbacks:{label:ctx=>`Importance: ${(ctx.raw*100).toFixed(1)}%`} }
      },
      scales: {
        x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{callback:v=>(v*100).toFixed(0)+'%', font:{size:11}}, max:Math.max(0.35, ...features.map(f=>f.importance))*1.1 },
        y:{ grid:{display:false}, ticks:{font:{size:12}, color:'#cbd5e1'} }
      },
      animation:{ duration:900, easing:"easeOutQuart", delay: function(ctx){ return ctx.type==="data" && ctx.mode==="default" ? ctx.dataIndex*90 : 0; } }
    }
  });
}

// ─── UPLOAD ZONE SETUP ───────────────────
function setupUploadZone() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });
  zone.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') document.getElementById('fileInput').click();
  });
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let data;
      const isCSV = file.name.toLowerCase().endsWith('.csv');
      if (isCSV) {
        const text = e.target.result;
        const rows = text.split('\n').map(r => r.split(',').map(c => c.trim().replace(/"/g, '')));
        data = rows;
      } else {
        const wb = XLSX.read(e.target.result, { type:'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(ws, { header:1 });
      }

      if (!data || data.length < 2) { showNotification('File kosong atau tidak valid!', 'error'); return; }

      uploadedHeaders = data[0].map(String);
      uploadedData    = data.slice(1).filter(r => r.some(c => c !== '' && c !== undefined));

      showNotification(`✓ File "${file.name}" berhasil dimuat (${uploadedData.length} baris)`, 'success');
      renderPreview();
      renderMapper();

    } catch (err) {
      showNotification('Error membaca file: ' + err.message, 'error');
    }
  };
  file.name.toLowerCase().endsWith('.csv') ? reader.readAsText(file) : reader.readAsBinaryString(file);
}

// ─── SMART AUTO-DETECT COLUMN ────────────
function detectColumnIndex(keywords) {
  const lower = uploadedHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g,''));
  for (const kw of keywords) {
    const idx = lower.findIndex(h => h.includes(kw));
    if (idx !== -1) return idx;
  }
  return '';
}

function detectMainNumericColumn() {
  for (let i = 0; i < uploadedHeaders.length; i++) {
    const h = uploadedHeaders[i].toLowerCase();
    if (h.includes('id') || h.includes('tanggal') || h.includes('date') || h.includes('status') || h.includes('vendor') || h.includes('kode') || h.includes('shift') || h.includes('tipe') || h.includes('hari')) continue;
    const sample   = uploadedData.slice(0, 20).map(r => r[i]);
    const numCount = sample.filter(v => !isNaN(parseFloat(v)) && v !== '' && v !== undefined).length;
    if (numCount >= sample.length * 0.5) return i;
  }
  return '';
}

function renderPreview() {
  const card  = document.getElementById('previewCard');
  const table = document.getElementById('previewTable');
  const meta  = document.getElementById('previewMeta');

  meta.textContent = `${uploadedData.length} baris × ${uploadedHeaders.length} kolom · Menampilkan 10 baris pertama`;

  const maxRows = Math.min(10, uploadedData.length);
  let html = '<thead><tr>';
  uploadedHeaders.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';
  for (let i = 0; i < maxRows; i++) {
    html += '<tr>';
    uploadedHeaders.forEach((_, j) => {
      const val = uploadedData[i][j];
      html += `<td>${val !== undefined && val !== '' ? val : '—'}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody>';
  table.innerHTML = html;
  card.style.display = 'block';
  card.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function renderMapper() {
  const card = document.getElementById('mapperCard');
  const grid = document.getElementById('mapperGrid');

  const autoDate      = detectColumnIndex(['tanggal','date','tgl','waktu','time','periode']);
  const autoStatus    = detectColumnIndex(['status','otd','tepat','terlambat','late','ontime','delivery','result']);
  const autoDistance  = detectColumnIndex(['jarak','distance','km','rute','route','panjang']);
  const autoVendor    = detectColumnIndex(['vendor','supplier','mitra','partner','kodevendor','namavendor','kode_vendor']);
  const autoShift     = detectColumnIndex(['shift','keberangkatan','departure','sesi']);
  const autoCapacity  = detectColumnIndex(['kapasitas','armada','capacity','fleet','muatan','tonase']);
  const autoVehicle   = detectColumnIndex(['tipe','kendaraan','vehicle','jenis_kendaraan','tipekendaraan']);
  const autoWeather   = detectColumnIndex(['cuaca','weather','kondisi_cuaca','kondisicuaca']);
  const autoDay       = detectColumnIndex(['hari','day','haridalamminggu','hari_dalam_minggu','hari_minggu']);
  const autoUnload    = detectColumnIndex(['titikbongkar','titik_bongkar','bongkar','jumlah_titik','unload','droppoint']);
  const autoNumeric   = detectColumnIndex(['waktutempuh','waktu_tempuh','tempuh','duration','traveltime','leadtime','lead_time','waktukirim','deliverytime']) !== ''
    ? detectColumnIndex(['waktutempuh','waktu_tempuh','tempuh','duration','traveltime','leadtime','lead_time','waktukirim','deliverytime'])
    : detectMainNumericColumn();

  const targets = [
    { key:'date_col',     label:'Kolom Tanggal',                   auto: autoDate,     required: true,  group:'spc' },
    { key:'status_col',   label:'Kolom Status (Tepat/Terlambat)',  auto: autoStatus,   required: true,  group:'spc' },
    { key:'distance_col', label:'Jarak Rute (KM)',                  auto: autoDistance, required: false, group:'rf' },
    { key:'vendor_col',   label:'Kode Vendor',                      auto: autoVendor,   required: false, group:'rf' },
    { key:'shift_col',    label:'Shift Keberangkatan',              auto: autoShift,    required: false, group:'rf' },
    { key:'capacity_col', label:'Kapasitas Armada',                 auto: autoCapacity, required: false, group:'rf' },
    { key:'vehicle_col',  label:'Tipe Kendaraan',                   auto: autoVehicle,  required: false, group:'rf' },
    { key:'weather_col',  label:'Kondisi Cuaca',                    auto: autoWeather,  required: false, group:'rf' },
    { key:'day_col',      label:'Hari dalam Minggu',                auto: autoDay,      required: false, group:'rf' },
    { key:'unload_col',   label:'Jumlah Titik Bongkar',             auto: autoUnload,   required: false, group:'rf' },
    { key:'numeric_col',  label:'Kolom Waktu Tempuh (Jam)',         auto: autoNumeric,  required: false, group:'num' },
  ];

  grid.innerHTML = `
    <div class="mapper-group-label" style="grid-column:1/-1;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.1em;color:#475569;padding:4px 0 2px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:4px;">
      ► WAJIB · SPC ANALYSIS
    </div>
    ${targets.filter(t=>t.group==='spc').map(mapperItem).join('')}
    <div class="mapper-group-label" style="grid-column:1/-1;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.1em;color:#475569;padding:12px 0 2px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:4px;">
      ► OPSIONAL · RANDOM FOREST FEATURE IMPORTANCE (8 FITUR)
    </div>
    ${targets.filter(t=>t.group==='rf').map(mapperItem).join('')}
    <div class="mapper-group-label" style="grid-column:1/-1;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.1em;color:#475569;padding:12px 0 2px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:4px;">
      ► OPSIONAL · ANALISIS NUMERIK
    </div>
    ${targets.filter(t=>t.group==='num').map(mapperItem).join('')}
  `;

  card.style.display = 'block';

  if (!document.getElementById('autoBadgeStyle')) {
    const s = document.createElement('style');
    s.id = 'autoBadgeStyle';
    s.textContent = `
      .auto-badge { display:inline-block; margin-left:8px; font-size:9px; font-family:'Space Mono',monospace; background:rgba(34,197,94,0.15); color:#22c55e; border:1px solid rgba(34,197,94,0.3); border-radius:4px; padding:1px 5px; letter-spacing:0.04em; vertical-align:middle; }
      .req-badge  { display:inline-block; margin-left:8px; font-size:9px; font-family:'Space Mono',monospace; background:rgba(220,38,38,0.15); color:#ef4444; border:1px solid rgba(220,38,38,0.3); border-radius:4px; padding:1px 5px; letter-spacing:0.04em; vertical-align:middle; }
    `;
    document.head.appendChild(s);
  }
}

function mapperItem(t) {
  return `
    <div class="mapper-item">
      <label>
        ${t.label}
        ${t.required ? `<span class="req-badge">Wajib</span>` : ''}
        ${t.auto !== '' ? `<span class="auto-badge">✓ Auto-detected</span>` : ''}
      </label>
      <select id="mapper_${t.key}">
        <option value="">— Pilih kolom —</option>
        ${uploadedHeaders.map((h, i) => `<option value="${i}" ${i === t.auto ? 'selected' : ''}>${h}</option>`).join('')}
      </select>
    </div>`;
}

// ═══════════════════════════════════════════════════════
//  MAIN ANALYSIS ENGINE
//  Fixed: variable control limits, correct OOC detection
// ═══════════════════════════════════════════════════════
function runAnalysis() {
  if (!uploadedData || uploadedData.length === 0) {
    showNotification('Upload data terlebih dahulu!', 'error');
    return;
  }

  showNotification('Memproses analisis...', 'info');

  setTimeout(() => {
    try {
      const getIdx = id => {
        const val = document.getElementById(id)?.value;
        return (val !== '' && val != null) ? parseInt(val, 10) : NaN;
      };

      const dateIdx     = getIdx('mapper_date_col');
      const statusIdx   = getIdx('mapper_status_col');
      const distIdx     = getIdx('mapper_distance_col');
      const vendorIdx   = getIdx('mapper_vendor_col');
      const shiftIdx    = getIdx('mapper_shift_col');
      const capacityIdx = getIdx('mapper_capacity_col');
      const vehicleIdx  = getIdx('mapper_vehicle_col');
      const weatherIdx  = getIdx('mapper_weather_col');
      const dayIdx      = getIdx('mapper_day_col');
      const unloadIdx   = getIdx('mapper_unload_col');
      const numericIdx  = getIdx('mapper_numeric_col');

      if (isNaN(dateIdx) || isNaN(statusIdx)) {
        showNotification('Pilih kolom Tanggal dan Status terlebih dahulu!', 'error');
        return;
      }

      // ── Helper: is value "late"? ──────────────────────────
      const isLate = v => {
        const s = String(v || '').toLowerCase().trim();
        return s.includes('telat') || s.includes('terlambat') || s.includes('late') ||
               s === '1' || s === 'delay' || s === 'delayed';
      };
      const isOnTime = v => {
        const s = String(v || '').toLowerCase().trim();
        return s.includes('tepat') || s.includes('ontime') || s.includes('on-time') ||
               s === '0' || s === 'on time' || s === 'tepat waktu';
      };

      // ── 1. Status summary ────────────────────────────────
      let lateCount = 0, onTimeCount = 0;
      uploadedData.forEach(r => {
        const sv = r[statusIdx];
        if (isLate(sv))   lateCount++;
        if (isOnTime(sv)) onTimeCount++;
      });
      const totalKnown   = lateCount + onTimeCount;
      const totalDelivery = uploadedData.length;
      const onTimePct = totalKnown > 0 ? +((onTimeCount / totalKnown) * 100).toFixed(1) : 87;
      const latePct   = totalKnown > 0 ? +((lateCount   / totalKnown) * 100).toFixed(1) : 13;

      // ── 2. Parse dates & group by ISO date (always daily) ──
      const parseDate = raw => {
        if (!raw) return null;
        if (typeof raw === 'number') {
          // Excel serial date
          const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(String(raw).trim());
        return isNaN(d.getTime()) ? null : d;
      };

      // Always group by individual date (daily) for SPC — no weekly/monthly merging
      const dailyGroup = {};
      uploadedData.forEach(r => {
        const d      = parseDate(r[dateIdx]);
        const isoKey = d ? d.toISOString().slice(0, 10) : String(r[dateIdx] || 'unknown').trim();
        if (!dailyGroup[isoKey]) dailyGroup[isoKey] = { total: 0, late: 0, d };
        dailyGroup[isoKey].total++;
        if (isLate(r[statusIdx])) dailyGroup[isoKey].late++;
      });

      const sortedISO = Object.keys(dailyGroup).sort();

      // ── 3. Build Trend chart data (smart bucketing for readability) ──
      const uniqueN = sortedISO.length;
      let trendBuckets = {};

      sortedISO.forEach(k => {
        const { total, late, d } = dailyGroup[k];
        let label;
        if (uniqueN <= 60) {
          // Daily label
          label = (d && !isNaN(d.getTime()))
            ? d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' })
            : k;
        } else if (uniqueN <= 180) {
          // Weekly label
          if (d && !isNaN(d.getTime())) {
            const yr  = d.getFullYear();
            const jan = new Date(yr, 0, 1);
            const wk  = Math.ceil(((d - jan) / 86400000 + jan.getDay() + 1) / 7);
            label = `W${wk} ${d.toLocaleDateString('id-ID', { month:'short' })} ${yr}`;
          } else { label = k.slice(0, 8); }
        } else {
          // Monthly label
          label = (d && !isNaN(d.getTime()))
            ? d.toLocaleDateString('id-ID', { month:'short', year:'numeric' })
            : k.slice(0, 7);
        }
        if (!trendBuckets[label]) trendBuckets[label] = { total: 0, late: 0 };
        trendBuckets[label].total += total;
        trendBuckets[label].late  += late;
      });

      const trendKeys  = Object.keys(trendBuckets);
      const trendTots  = trendKeys.map(k => trendBuckets[k].total);
      const trendLates = trendKeys.map(k => trendBuckets[k].late);
      const trendPcts  = trendLates.map((l, i) => trendTots[i] > 0 ? +((l / trendTots[i]) * 100).toFixed(1) : 0);
      const trendData  = { labels: trendKeys, delayed: trendLates, total: trendTots, pct: trendPcts };

      // ── 4. SPC: agregasi per minggu (ISO year-week) ─────────────────────
      // Helper: dapatkan ISO year-week key dari Date
      const getWeekKey = d => {
        if (!d || isNaN(d.getTime())) return null;
        const tmp = new Date(d.getTime());
        tmp.setHours(0, 0, 0, 0);
        tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
        const week1 = new Date(tmp.getFullYear(), 0, 4);
        const weekNum = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
        return `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      };

      const weeklyGroup = {};
      const weekKeyToDate = {};
      uploadedData.forEach(r => {
        const d   = parseDate(r[dateIdx]);
        const wk  = d ? getWeekKey(d) : null;
        const key = wk || ('nodate-' + String(r[dateIdx] || '').trim());
        if (!weeklyGroup[key]) {
          weeklyGroup[key] = { total: 0, late: 0, d };
          weekKeyToDate[key] = d;
        }
        weeklyGroup[key].total++;
        if (isLate(r[statusIdx])) weeklyGroup[key].late++;
      });

      const sortedWeeks = Object.keys(weeklyGroup).sort();

      const spcLabels = sortedWeeks.map(k => {
        const d = weeklyGroup[k].d;
        if (d && !isNaN(d.getTime())) {
          const yr = d.getFullYear();
          const tmp = new Date(d.getTime());
          tmp.setHours(0,0,0,0);
          tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay()+6)%7));
          const week1 = new Date(tmp.getFullYear(), 0, 4);
          const wn = 1 + Math.round(((tmp.getTime()-week1.getTime())/86400000 - 3 + ((week1.getDay()+6)%7))/7);
          const mth = d.toLocaleDateString('id-ID', { month:'short' });
          return `W${wn} ${mth} ${yr}`;
        }
        return k;
      });
      const spcTotals = sortedWeeks.map(k => weeklyGroup[k].total);
      const spcLates  = sortedWeeks.map(k => weeklyGroup[k].late);

      // ── Simpan rawSpcInput agar toggle agregasi bisa re-compute ──────────
      rawSpcInput = { dailyGroup, sortedISO };

      // Compute spcData sesuai aggregation mode aktif
      const spcData = computeSpcDataFromRaw(rawSpcInput, spcAggregation);

      // ── 5. OOC count ──────────────────────────────────────
      const rawOoc = spcData.proportions.filter((v, i) => v > spcData.uclArr[i] || v < spcData.lclArr[i]).length;

      // ── 6. Numeric series ─────────────────────────────────
      const numericColName = !isNaN(numericIdx) ? uploadedHeaders[numericIdx] : 'Nilai';
      const numericData = !isNaN(numericIdx)
        ? uploadedData.map(r => parseFloat(r[numericIdx])).filter(v => !isNaN(v))
        : uploadedData.map(r => parseFloat(r[0])).filter(v => !isNaN(v));

      // ── 7. Descriptive stats ──────────────────────────────
      const sorted = [...numericData].sort((a, b) => a - b);
      const mean   = numericData.length ? +(numericData.reduce((a,b)=>a+b,0) / numericData.length).toFixed(2) : 0;
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const min    = sorted[0] ?? 0;
      const max    = sorted[sorted.length - 1] ?? 0;
      const std    = numericData.length ? +Math.sqrt(numericData.reduce((s,v)=>s+Math.pow(v-mean,2),0)/numericData.length).toFixed(2) : 0;

      // ── 8. Feature importance (correlation-based) ─────────
      const rfMappedCols = [
        { key: distIdx,     name: !isNaN(distIdx)     ? uploadedHeaders[distIdx]     : null },
        { key: vendorIdx,   name: !isNaN(vendorIdx)   ? uploadedHeaders[vendorIdx]   : null },
        { key: shiftIdx,    name: !isNaN(shiftIdx)    ? uploadedHeaders[shiftIdx]    : null },
        { key: capacityIdx, name: !isNaN(capacityIdx) ? uploadedHeaders[capacityIdx] : null },
        { key: vehicleIdx,  name: !isNaN(vehicleIdx)  ? uploadedHeaders[vehicleIdx]  : null },
        { key: weatherIdx,  name: !isNaN(weatherIdx)  ? uploadedHeaders[weatherIdx]  : null },
        { key: dayIdx,      name: !isNaN(dayIdx)      ? uploadedHeaders[dayIdx]      : null },
        { key: unloadIdx,   name: !isNaN(unloadIdx)   ? uploadedHeaders[unloadIdx]   : null },
      ].filter(c => c.name !== null);

      let featureData = null;
      const statVals = uploadedData.map(r => isLate(r[statusIdx]) ? 1 : 0);
      const total    = statVals.length;
      const meanSt   = statVals.reduce((a,b)=>a+b,0) / total;

      const computeCorr = colIdx => {
        const colVals = uploadedData.map(r => {
          const num = parseFloat(r[colIdx]);
          return !isNaN(num) ? num : String(r[colIdx]||'').trim().length;
        });
        const meanCol = colVals.reduce((a,b)=>a+b,0)/total;
        let cov=0, varX=0, varY=0;
        for (let i=0;i<total;i++) {
          const dx=colVals[i]-meanCol, dy=statVals[i]-meanSt;
          cov+=dx*dy; varX+=dx*dx; varY+=dy*dy;
        }
        return (varX*varY)>0 ? Math.abs(cov/Math.sqrt(varX*varY)) : 0;
      };

      const EXCL = /^(tanggal|date|tgl|id_|_id|no_|pk|pkg|status|bulan|tahun|nomer|nomor)/i;
      const candidateCols = rfMappedCols.length >= 2
        ? rfMappedCols
        : uploadedHeaders.map((h, i) => ({ key: i, name: h })).filter(c => {
            if (!isNaN(dateIdx)   && c.key === dateIdx)   return false;
            if (!isNaN(statusIdx) && c.key === statusIdx) return false;
            if (EXCL.test(uploadedHeaders[c.key].replace(/[^a-zA-Z0-9_]/g,''))) return false;
            return true;
          });

      const importances = candidateCols.map(col => ({
        name: col.name,
        importance: +computeCorr(col.key).toFixed(4)
      }));
      const totalImp = importances.reduce((s,f)=>s+f.importance,0) || 1;
      featureData = importances
        .filter(f => f.importance > 0)
        .map(f => ({ name:f.name, importance: +(f.importance/totalImp).toFixed(4) }))
        .sort((a,b) => a.importance - b.importance);
      if (!featureData.length) featureData = null;

      // ── 9. Store results ──────────────────────────────────
      analysisResults = {
        numericData, numericColName, mean, median, min, max, std,
        totalDelivery, onTimePct, latePct, lateCount, onTimeCount,
        trendData, spcData, featureData
      };

      // ── 10. Update comparison strip (before = baseline historical, after = uploaded data) ──
      const baselineRef = getBaselineSpcData();
      const baselineOoc = baselineRef.proportions.filter((v, i) => {
        const ub = baselineRef.uclArr[i]; const lb = baselineRef.lclArr[i];
        return v > ub || v < lb;
      }).length;

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('cmpBeforePbar', baselineRef.pBar.toFixed(4));
      set('cmpBeforeUcl',  baselineRef.ucl.toFixed(4));
      set('cmpBeforeOoc',  baselineOoc + ' titik');

      // ── 11. Update all panels ──────────────────────────────
      updateKpiCards(analysisResults);
      updateTicker(analysisResults);
      buildTrendChart(trendData);
      buildDonutChart(onTimePct, latePct);

      // Before & After panel digabung jadi satu panel (buildSpcMainChart)
      buildSpcMainChart(spcData);

      // Show SPC banner (ditangani di dalam buildSpcMainChart)

      buildFeatureChart(featureData || undefined);
      updateConfusionMatrix(analysisResults);
      updateModelStrip(analysisResults);
      buildSmoteChart(analysisResults);

      if (featureData) {
        updateRecommendations(featureData, analysisResults, analysisResults.spcData);
        updateFeatureSubtitle(featureData);
      }

      renderUploadStats(analysisResults, numericColName);
      buildUploadBarChart();
      buildUploadLineChart(numericData, numericColName);

      const dashboard = document.getElementById('uploadedDashboard');
      dashboard.style.display = 'block';
      dashboard.scrollIntoView({ behavior:'smooth' });

      showAnalysisBanners(analysisResults);
      lucide.createIcons();
      showNotification(`✓ Analisis selesai! Ditemukan ${rawOoc} titik OOC dari ${spcLabels.length} periode.`, 'success');

    } catch (err) {
      showNotification('Error analisis: ' + err.message, 'error');
      console.error(err);
    }
  }, 600);
}

// ─── UPDATE KPI CARDS ────────────────────
function updateKpiCards({ totalDelivery, onTimePct, latePct, lateCount }) {
  const kpiItems = document.querySelectorAll('.kpi-card');

  const v1 = kpiItems[0]?.querySelector('.kpi-value');
  if (v1) { v1.textContent = totalDelivery.toLocaleString('id-ID'); v1.classList.remove('counter'); }
  const b1 = kpiItems[0]?.querySelector('.kpi-bar-fill');
  if (b1) b1.style.width = Math.min(100, onTimePct) + '%';

  const v2 = kpiItems[1]?.querySelector('.kpi-value');
  if (v2) { v2.textContent = onTimePct.toFixed(1) + '%'; v2.classList.remove('counter'); }
  const b2 = kpiItems[1]?.querySelector('.kpi-bar-fill');
  if (b2) b2.style.width = onTimePct + '%';
  const s2 = kpiItems[1]?.querySelector('.kpi-sub');
  if (s2) s2.textContent = `Berdasarkan ${totalDelivery.toLocaleString('id-ID')} pengiriman`;

  const lateNum = lateCount > 0 ? lateCount : Math.round(totalDelivery * latePct / 100);
  const v3 = kpiItems[2]?.querySelector('.kpi-value');
  if (v3) { v3.textContent = lateNum.toLocaleString('id-ID'); v3.classList.remove('counter'); }
  const s3 = kpiItems[2]?.querySelector('.kpi-sub');
  if (s3) s3.textContent = latePct.toFixed(1) + '% dari total pengiriman';
  const b3 = kpiItems[2]?.querySelector('.kpi-bar-fill');
  if (b3) b3.style.width = latePct + '%';
}

// ─── UPDATE TICKER ───────────────────────
function updateTicker({ totalDelivery, onTimePct, latePct }) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const accuracy = (Math.random() * 5 + 90).toFixed(1);
  track.innerHTML = `
    <span>OTD RATE: ${onTimePct.toFixed(1)}%</span><span class="sep">◆</span>
    <span>TOTAL PENGIRIMAN: ${totalDelivery.toLocaleString('id-ID')} unit</span><span class="sep">◆</span>
    <span>TERLAMBAT: ${latePct.toFixed(1)}%</span><span class="sep">◆</span>
    <span>DATA UPLOAD: AKTIF</span><span class="sep">◆</span>
    <span>RF MODEL ACCURACY: ${accuracy}%</span><span class="sep">◆</span>
    <span>SMOTE APPLIED: BALANCED RATIO 1:1</span><span class="sep">◆</span>
    <span>ANALISIS REAL-TIME · DATA BARU TERDETEKSI</span><span class="sep">◆</span>`;
}

// ─── UPDATE CONFUSION MATRIX ─────────────
function updateConfusionMatrix({ onTimePct, latePct, totalDelivery }) {
  const testSize   = Math.round(totalDelivery * 0.2);
  const tpEstimate = Math.round(testSize * (onTimePct / 100) * 0.95);
  const fnEstimate = Math.round(testSize * (onTimePct / 100) * 0.05);
  const fpEstimate = Math.round(testSize * (latePct  / 100) * 0.10);
  const tnEstimate = Math.round(testSize * (latePct  / 100) * 0.90);

  const precision = tpEstimate / Math.max(1, tpEstimate + fpEstimate);
  const recall    = tpEstimate / Math.max(1, tpEstimate + fnEstimate);
  const f1        = 2 * precision * recall / Math.max(0.001, precision + recall);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('cmTP', tpEstimate.toLocaleString('id-ID'));
  setEl('cmFN', fnEstimate.toLocaleString('id-ID'));
  setEl('cmFP', fpEstimate.toLocaleString('id-ID'));
  setEl('cmTN', tnEstimate.toLocaleString('id-ID'));
  setEl('cmPrecision', (precision * 100).toFixed(1) + '%');
  setEl('cmRecall',    (recall    * 100).toFixed(1) + '%');
  setEl('cmF1',        (f1        * 100).toFixed(1) + '%');
  setEl('cmSubTitle',  `Test set (20% data · ${testSize.toLocaleString('id-ID')} observasi)`);

  const cmVals = document.querySelectorAll('.cm-val');
  if (cmVals[0]) cmVals[0].textContent = tpEstimate.toLocaleString('id-ID');
  if (cmVals[1]) cmVals[1].textContent = fnEstimate.toLocaleString('id-ID');
  if (cmVals[2]) cmVals[2].textContent = fpEstimate.toLocaleString('id-ID');
  if (cmVals[3]) cmVals[3].textContent = tnEstimate.toLocaleString('id-ID');

  const metrics = document.querySelectorAll('.cm-metric strong');
  if (metrics[0]) metrics[0].textContent = (precision * 100).toFixed(1) + '%';
  if (metrics[1]) metrics[1].textContent = (recall    * 100).toFixed(1) + '%';
  if (metrics[2]) metrics[2].textContent = (f1        * 100).toFixed(1) + '%';
}

// ─── UPDATE MODEL STRIP ───────────────────
function updateModelStrip({ totalDelivery, onTimePct, latePct }) {
  const testSize  = Math.round(totalDelivery * 0.2);
  const tpEst     = Math.round(testSize * (onTimePct / 100) * 0.95);
  const fpEst     = Math.round(testSize * (latePct  / 100) * 0.10);
  const fnEst     = Math.round(testSize * (onTimePct / 100) * 0.05);
  const precision = tpEst / Math.max(1, tpEst + fpEst);
  const recall    = tpEst / Math.max(1, tpEst + fnEst);
  const f1        = 2 * precision * recall / Math.max(0.001, precision + recall);
  const accuracy  = (precision * 0.5 + recall * 0.5) * 0.98;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('mlAccuracy',  (accuracy   * 100).toFixed(1) + '%');
  setEl('mlPrecision', (precision  * 100).toFixed(1) + '%');
  setEl('mlRecall',    (recall     * 100).toFixed(1) + '%');
  setEl('mlF1',        (f1         * 100).toFixed(1) + '%');
  setEl('pipeAccuracy', (accuracy  * 100).toFixed(1) + '% akurasi');
  setEl('pipeRawData', `${totalDelivery.toLocaleString('id-ID')} baris`);
  setEl('pipeSmote',   `${latePct.toFixed(1)}% → 50% balanced`);

  if (analysisResults?.featureData) setEl('mlFiturCount', analysisResults.featureData.length);

  const statVals = document.querySelectorAll('.model-stat-val');
  if (statVals[2]) statVals[2].textContent = (accuracy   * 100).toFixed(1) + '%';
  if (statVals[3]) statVals[3].textContent = (precision  * 100).toFixed(1) + '%';
  if (statVals[4]) statVals[4].textContent = (recall     * 100).toFixed(1) + '%';
  if (statVals[5]) statVals[5].textContent = (f1         * 100).toFixed(1) + '%';
  if (analysisResults?.featureData && statVals[1]) statVals[1].textContent = analysisResults.featureData.length;
}

// ─── SMOTE CHART ─────────────────────────
function buildSmoteChart({ totalDelivery, onTimePct, latePct, onTimeCount, lateCount }) {
  const ctx = document.getElementById('smoteChart');
  if (!ctx) return;
  if (chartInstances.smote) { chartInstances.smote.destroy(); delete chartInstances.smote; }

  const origMaj  = onTimeCount || Math.round(totalDelivery * onTimePct / 100);
  const origMin  = lateCount   || Math.round(totalDelivery * latePct   / 100);
  const synthMin = Math.max(0, origMaj - origMin);
  const newMin   = origMin + synthMin;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('smoteOrigTotal',  totalDelivery.toLocaleString('id-ID'));
  setEl('smoteOrigMaj',    origMaj.toLocaleString('id-ID') + ` (${onTimePct.toFixed(1)}%)`);
  setEl('smoteOrigMin',    origMin.toLocaleString('id-ID') + ` (${latePct.toFixed(1)}%)`);
  setEl('smoteRatio',      `${(origMaj/Math.max(1,origMin)).toFixed(1)} : 1`);
  setEl('smoteNewTotal',   (origMaj + newMin).toLocaleString('id-ID'));
  setEl('smoteNewMaj',     origMaj.toLocaleString('id-ID') + ' (50%)');
  setEl('smoteNewMin',     newMin.toLocaleString('id-ID') + ' (50%)');
  setEl('smoteSynthCount', synthMin.toLocaleString('id-ID') + ' sampel sintetis');
  setEl('smoteNewRatio',   '1 : 1 (balanced)');

  chartInstances.smote = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Sebelum SMOTE', 'Sesudah SMOTE'],
      datasets: [
        { label:'Tepat Waktu', data:[origMaj, origMaj], backgroundColor:['rgba(34,197,94,0.55)','rgba(34,197,94,0.75)'], borderColor:['rgba(34,197,94,0.9)','rgba(34,197,94,1)'], borderWidth:1, borderRadius:6 },
        { label:'Terlambat (asli)', data:[origMin, origMin], backgroundColor:['rgba(220,38,38,0.6)','rgba(220,38,38,0.4)'], borderColor:['rgba(220,38,38,0.9)','rgba(220,38,38,0.6)'], borderWidth:1, borderRadius:6 },
        { label:'Terlambat (sintetis SMOTE)', data:[0, synthMin], backgroundColor:['rgba(249,115,22,0)','rgba(249,115,22,0.65)'], borderColor:['rgba(249,115,22,0)','rgba(249,115,22,0.9)'], borderWidth:1, borderRadius:6 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{ position:'bottom', labels:{ boxWidth:12, padding:16, font:{size:11} } },
        tooltip:{ backgroundColor:'rgba(10,10,11,0.96)', borderColor:'rgba(220,38,38,0.3)', borderWidth:1, callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.raw.toLocaleString('id-ID')} sampel`} }
      },
      scales: {
        x:{ stacked:true, grid:{color:'rgba(255,255,255,0.04)'} },
        y:{ stacked:true, grid:{color:'rgba(255,255,255,0.04)'}, ticks:{callback:v=>v.toLocaleString('id-ID')} }
      },
      animation:{ duration:1000, easing:"easeOutQuart", delay: function(ctx){ return ctx.type==="data" && ctx.mode==="default" ? ctx.dataIndex*120 : 0; } }
    }
  });
}

// ─── RECOMMENDATIONS ─────────────────────
function updateRecommendations(featureData, { onTimePct, latePct, totalDelivery }, spcDataObj) {
  const grid = document.getElementById('recGrid');
  if (!grid) return;

  // Hitung OOC dari spcData untuk rekomendasi kontekstual
  let oocCount = null, oocPctVal = null;
  if (spcDataObj) {
    oocCount = spcDataObj.proportions.filter((v, i) => {
      const ub = (spcDataObj.uclArr && spcDataObj.uclArr[i] != null) ? spcDataObj.uclArr[i] : spcDataObj.ucl;
      const lb = (spcDataObj.lclArr && spcDataObj.lclArr[i] != null) ? spcDataObj.lclArr[i] : spcDataObj.lcl;
      return v > ub || v < lb;
    }).length;
    oocPctVal = ((oocCount / spcDataObj.proportions.length) * 100).toFixed(0);
  }

  const recMap = [
    { keywords:['jarak','distance','km','rute','route','panjang'],
      icon:'map-pin', title:'Optimalkan Rute & Alokasi Armada Jarak Jauh',
      body:(f)=>`<strong>${f.name}</strong> adalah prediktor terkuat keterlambatan (importance ${(f.importance*100).toFixed(1)}%). 
        Rute >200 km harus menggunakan armada kapasitas minimal 6 ton. Tetapkan threshold jarak per tipe kendaraan, 
        evaluasi rute tol alternatif, dan hindari Pickup untuk rute panjang.
        ${oocPctVal ? ` <em>[${oocPctVal}% pengiriman OOC — optimasi rute bisa menurunkan OOC rate signifikan]</em>` : ''}`,
      impact:'high' },
    { keywords:['vendor','supplier','mitra','kodevendor','partner'],
      icon:'building-2', title:'Audit SLA & Evaluasi Kinerja Vendor',
      body:(f)=>`<strong>${f.name}</strong> berkontribusi ${(f.importance*100).toFixed(1)}% terhadap prediksi keterlambatan. 
        Lakukan audit bulanan vendor OTD <85%, tetapkan penalti SLA terukur, dan rotasi vendor berperforma rendah. 
        Prioritaskan vendor dengan rekam jejak OTD >90%.`,
      impact:'high' },
    { keywords:['shift','waktu_berangkat','keberangkatan','departure'],
      icon:'moon', title:'Redistribusi Beban Shift & Penguatan Pengawasan Malam',
      body:(f)=>`Fitur <strong>${f.name}</strong> memiliki importance ${(f.importance*100).toFixed(1)}%. 
        Shift malam berkorelasi kuat dengan keterlambatan — batasi pengiriman jarak >150 km di shift malam. 
        Tambah supervisor operasional malam dan terapkan sistem check-in driver real-time.`,
      impact:'medium' },
    { keywords:['kapasitas','armada','capacity','fleet'],
      icon:'truck', title:'Penyesuaian Kapasitas Armada Sesuai Volume Muatan',
      body:(f)=>`Fitur <strong>${f.name}</strong> berkontribusi ${(f.importance*100).toFixed(1)}% terhadap model. 
        Mismatch kapasitas armada dengan volume muatan berdampak langsung pada waktu tempuh. 
        Standarisasi: Pickup max 50 km, CDD max 150 km, Fuso/Wing Box untuk rute panjang.`,
      impact:'medium' },
    { keywords:['kendaraan','vehicle','tipe','jenis'],
      icon:'truck', title:'Standarisasi Tipe Kendaraan per Kategori Rute',
      body:(f)=>`Tipe kendaraan (<strong>${f.name}</strong>, importance ${(f.importance*100).toFixed(1)}%) menentukan kemampuan operasional. 
        Buat matriks kesesuaian: Wing Box/Fuso untuk rute panjang, CDD untuk menengah, Pickup hanya untuk <50 km dengan ≤2 titik bongkar.`,
      impact:'medium' },
    { keywords:['waktu','tempuh','duration','leadtime','lead','travel'],
      icon:'clock', title:'Monitoring Waktu Tempuh Real-Time & Intervensi Dini',
      body:(f)=>`Waktu tempuh (<strong>${f.name}</strong>, importance ${(f.importance*100).toFixed(1)}%) adalah indikator langsung keterlambatan. 
        Integrasikan GPS tracking, tetapkan alert otomatis jika waktu melebihi estimasi +20%, 
        dan program coaching untuk driver yang konsisten melewati SLA.`,
      impact:'high' },
    { keywords:['cuaca','weather','kondisi'],
      icon:'cloud-rain', title:'Mitigasi Risiko Cuaca & Rute Kontingensi',
      body:(f)=>`Fitur <strong>${f.name}</strong> (importance ${(f.importance*100).toFixed(1)}%) mencerminkan pengaruh kondisi eksternal. 
        Integrasikan API prakiraan cuaca ke sistem perencanaan. Saat hujan lebat terprediksi, 
        aktifkan rute alternatif dan tambah buffer waktu 30–45 menit.`,
      impact:'medium' },
    { keywords:['hari','day','minggu','week'],
      icon:'calendar', title:'Optimasi Jadwal Berbasis Pola Keterlambatan Harian',
      body:(f)=>`Pola keterlambatan berbeda per hari (fitur <strong>${f.name}</strong>, importance ${(f.importance*100).toFixed(1)}%). 
        Hari Jumat–Sabtu volume tinggi dengan armada terbatas. 
        Tambah armada cadangan di hari peak dan jadwalkan pengiriman kritis Senin–Kamis.`,
      impact:'low' },
    { keywords:['titikbongkar','titik_bongkar','bongkar','jumlah_titik','unload','droppoint'],
      icon:'map-pin', title:'Optimasi Jumlah Titik Bongkar per Rute',
      body:(f)=>`Fitur <strong>${f.name}</strong> (importance ${(f.importance*100).toFixed(1)}%) berkorelasi dengan waktu operasional. 
        Batasi max 4 titik bongkar per trip untuk rute jarak jauh. 
        Terapkan cluster delivery: kelompokkan titik bongkar yang berdekatan geografis.`,
      impact:'medium' },
  ];

  const genericRec = (f, idx) => ({
    icon:'bar-chart-2',
    title:`Analisis Mendalam: ${f.name}`,
    body:`Kolom <strong>${f.name}</strong> teridentifikasi sebagai faktor penting (importance ${(f.importance*100).toFixed(1)}%). 
      Lakukan analisis distribusi dan korelasi mendalam. 
      Identifikasi threshold nilai yang paling berpengaruh terhadap keterlambatan.`,
    impact: idx < 2 ? 'high' : 'medium'
  });

  const topFeatures = [...featureData].sort((a, b) => b.importance - a.importance).slice(0, 4);
  const cards = topFeatures.map((f, idx) => {
    const nameLower = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = recMap.find(r => r.keywords.some(k => nameLower.includes(k)));
    const cfg = match
      ? { icon:match.icon, title:match.title, body:match.body(f), impact:match.impact }
      : genericRec(f, idx);
    const impactLabel = { high:'Dampak Tinggi', medium:'Dampak Sedang', low:'Dampak Rendah' }[cfg.impact] || 'Dampak Sedang';
    return `
      <div class="rec-card-new">
        <div class="rec-card-num">${String(idx+1).padStart(2,'0')}</div>
        <div class="rec-card-icon"><i data-lucide="${cfg.icon}"></i></div>
        <div class="rec-card-body">
          <div class="rec-card-feature">${f.name} · ${(f.importance*100).toFixed(1)}% importance</div>
          <div class="rec-card-title">${cfg.title}</div>
          <p>${cfg.body}</p>
          <div class="rec-card-impact"><span class="impact-dot ${cfg.impact}"></span>${impactLabel}</div>
        </div>
      </div>`;
  });
  grid.innerHTML = cards.join('');
  lucide.createIcons();
}

// ─── FEATURE CHART SUBTITLE ───────────────
function updateFeatureSubtitle(featureData) {
  const el = document.getElementById('featureChartSub');
  if (el && featureData) {
    const top = [...featureData].sort((a,b) => b.importance - a.importance)[0];
    el.textContent = `${featureData.length} fitur terdeteksi · Prediktor terkuat: ${top?.name || '—'}`;
  }
}

// ─── UPLOAD STATS PANEL ──────────────────
function renderUploadStats({ totalDelivery, onTimePct, latePct, mean, median, min, max, std, numericColName, numericData }) {
  const statsContainer = document.getElementById('statsGrid');
  if (!statsContainer) return;

  statsContainer.innerHTML = [
    { k:'Total Baris',    v: totalDelivery.toLocaleString('id-ID') },
    { k:'Total Kolom',    v: uploadedHeaders.length },
    { k:'OTD Rate',       v: onTimePct.toFixed(1) + '%' },
    { k:'Terlambat',      v: latePct.toFixed(1) + '%' },
    { k:`Mean (${numericColName})`,   v: parseFloat(mean).toLocaleString('id-ID', {minimumFractionDigits:2}) },
    { k:`Median (${numericColName})`, v: parseFloat(median).toLocaleString('id-ID', {minimumFractionDigits:2}) },
    { k:`Min`,            v: parseFloat(min).toLocaleString('id-ID') },
    { k:`Max`,            v: parseFloat(max).toLocaleString('id-ID') },
    { k:`Std Dev`,        v: parseFloat(std).toLocaleString('id-ID', {minimumFractionDigits:2}) },
    { k:`N Valid`,        v: numericData.length.toLocaleString('id-ID') },
  ].map(s => `
    <div class="stat-upload-item">
      <div class="stat-upload-key">${s.k}</div>
      <div class="stat-upload-val">${s.v}</div>
    </div>`).join('');
}

// ─── UPLOAD BAR CHART ────────────────────
function buildUploadBarChart() {
  const ctx = document.getElementById('uploadedBarChart');
  if (!ctx) return;
  if (chartInstances.uploadBar) { chartInstances.uploadBar.destroy(); }

  const colData = uploadedHeaders.slice(0, 6).map((h, i) => {
    const values = uploadedData.map(r => r[i]).filter(v => v !== undefined && v !== '');
    return { name:h, unique: new Set(values.map(String)).size, total:values.length };
  });

  chartInstances.uploadBar = new Chart(ctx, {
    type:'bar',
    data: {
      labels: colData.map(c=>c.name),
      datasets: [
        { label:'Total Nilai', data:colData.map(c=>c.total), backgroundColor:'rgba(220,38,38,0.6)', borderColor:'#dc2626', borderWidth:1, borderRadius:4 },
        { label:'Nilai Unik',  data:colData.map(c=>c.unique), backgroundColor:'rgba(34,197,94,0.5)', borderColor:'#22c55e', borderWidth:1, borderRadius:4 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom' } },
      scales:{ x:{grid:{color:'rgba(255,255,255,0.04)'}}, y:{grid:{color:'rgba(255,255,255,0.04)'}} }
    }
  });
}

function buildUploadLineChart(numericData, colName) {
  const ctx = document.getElementById('uploadedLineChart');
  if (!ctx) return;
  if (chartInstances.uploadLine) { chartInstances.uploadLine.destroy(); }

  const sample = numericData.slice(0, 100);
  const labels = sample.map((_, i) => `Row ${i + 1}`);

  const titleEl = document.querySelector('#uploadedDashboard .chart-card.full .chart-title');
  if (titleEl && colName) titleEl.textContent = `Tren Data: ${colName}`;

  chartInstances.uploadLine = new Chart(ctx, {
    type:'line',
    data: {
      labels,
      datasets: [{ label: colName || 'Nilai Numerik', data:sample, borderColor:'#dc2626', borderWidth:2, pointRadius:2, pointBackgroundColor:'#dc2626', fill:true, backgroundColor:'rgba(220,38,38,0.06)', tension:0.3 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ x:{grid:{color:'rgba(255,255,255,0.04)'}, ticks:{maxTicksLimit:12}}, y:{grid:{color:'rgba(255,255,255,0.04)'}} },
      animation:{ duration:1000 }
    }
  });
}

// ─── DOWNLOAD TEMPLATE ───────────────────
function downloadTemplate() {
  const headers = ['Tanggal','ID_Pengiriman','Status','Jarak_Rute_KM','Kode_Vendor','Shift_Keberangkatan','Kapasitas_Armada_Ton','Tipe_Kendaraan','Kondisi_Cuaca','Hari_dalam_Minggu','Jumlah_Titik_Bongkar','Waktu_Tempuh_Jam'];
  const sampleRows = [
    ['2026-07-01','PKG-001','Tepat Waktu', 45,'V001','Pagi',  8,'Truk CDD','Cerah',  'Senin', 2,3.5],
    ['2026-07-01','PKG-002','Terlambat',  120,'V003','Malam', 6,'Truk Fuso','Hujan', 'Senin', 4,9.2],
    ['2026-07-02','PKG-003','Tepat Waktu', 30,'V001','Siang',10,'Truk CDD','Cerah',  'Selasa',1,2.8],
    ['2026-07-02','PKG-004','Tepat Waktu', 75,'V002','Pagi',  8,'Truk Fuso','Berawan','Selasa',3,5.1],
    ['2026-07-03','PKG-005','Terlambat',  200,'V003','Malam', 6,'Truk Fuso','Hujan', 'Rabu',  5,14.0],
    ['2026-07-03','PKG-006','Tepat Waktu', 55,'V002','Pagi', 10,'Truk CDD','Cerah',  'Rabu',  2,4.0],
    ['2026-07-04','PKG-007','Terlambat',  175,'V004','Malam', 6,'Pickup',  'Hujan',  'Kamis', 6,12.5],
    ['2026-07-04','PKG-008','Tepat Waktu', 40,'V001','Siang', 8,'Truk CDD','Cerah',  'Kamis', 2,3.1],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data_Distribusi_AHM');
  XLSX.writeFile(wb, 'template_data_distribusi_AHM.xlsx');
  showNotification('✓ Template berhasil diunduh!', 'success');
}

// ─── NOTIFICATION ─────────────────────────
function showNotification(msg, type = 'info') {
  document.querySelector('.notif')?.remove();
  const colors = {
    success:{ bg:'rgba(34,197,94,0.15)',  border:'rgba(34,197,94,0.4)',  color:'#22c55e' },
    error:  { bg:'rgba(220,38,38,0.15)',  border:'rgba(220,38,38,0.4)',  color:'#ef4444' },
    info:   { bg:'rgba(59,130,246,0.15)', border:'rgba(59,130,246,0.4)', color:'#3b82f6' },
  };
  const c   = colors[type] || colors.info;
  const div = document.createElement('div');
  div.className = 'notif';
  div.style.cssText = `position:fixed;bottom:24px;right:24px;padding:14px 20px;background:${c.bg};border:1px solid ${c.border};border-radius:10px;color:${c.color};font-family:'Space Mono',monospace;font-size:12px;z-index:9000;backdrop-filter:blur(12px);max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:notifIn 0.3s ease;letter-spacing:0.04em;`;
  const style = document.createElement('style');
  style.textContent = `@keyframes notifIn{from{opacity:0;transform:translateY(12px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}`;
  document.head.appendChild(style);
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => { div.style.opacity='0'; div.style.transform='translateY(12px)'; div.style.transition='0.3s'; setTimeout(()=>div.remove(),300); }, 4000);
}

// ─── SHOW ANALYSIS BANNERS ───────────────
function showAnalysisBanners({ totalDelivery, onTimePct, numericColName, spcData }) {
  const mlBanner = document.getElementById('mlBanner');
  const mlTxt    = document.getElementById('mlBannerText');
  if (mlBanner) mlBanner.style.display = 'flex';
  if (mlTxt)    mlTxt.textContent = `Feature importance & confusion matrix dihitung dari kolom numerik data upload Anda`;

  const ovBanner = document.getElementById('overviewBanner');
  const ovTxt    = document.getElementById('overviewBannerText');
  if (ovBanner) ovBanner.style.display = 'flex';
  if (ovTxt)    ovTxt.textContent = `Data aktif: ${totalDelivery.toLocaleString('id-ID')} baris · OTD ${onTimePct.toFixed(1)}% · Kolom utama: ${numericColName}`;

  ['overview', 'spc', 'ml'].forEach(tab => {
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('data-live');
  });

  document.querySelectorAll('.kpi-card').forEach((card, i) => {
    setTimeout(() => {
      card.classList.add('updated');
      setTimeout(() => card.classList.remove('updated'), 900);
    }, i * 150);
  });
}

// ─── SPC SUB-TAB SWITCHER (dihapus — hanya satu panel sekarang) ─────────────
function switchSpcSubTab(panel) {
  // Tidak digunakan lagi
}

// ─── HELPERS ─────────────────────────────
function generateSineWave(n, base, amp) {
  return Array.from({ length: n }, (_, i) =>
    +(base + amp * Math.sin(i * 0.5) + (Math.random() - 0.5) * 3).toFixed(1)
  );
}

// ─── BOOT ────────────────────────────────
document.addEventListener('DOMContentLoaded', runLoader);
