/* JD ANALYSIS · Aura Scalper (v2.6): M1 entry chart, multi-timeframe bias, engine-drawn Buy/Sell, OB zones, sweeps, SL/TP. */
(function () {
  const C = { bg: '#060a12', up: '#1fb184', dn: '#ee3b57', grid: 'rgba(255,255,255,.045)', axis: '#7b8aa0', buy: '#2f6bff', sell: '#f0384f', sl: '#ff2d55', tp: '#10c46f', cyan: '#35d0ff', gold: '#f0c35e' };
  const STYLES = [
    { id: 'normal', name: 'Normal', tag: 'BALANCED', cls: 'bal', ico: '↗', ic: 'n' },
    { id: 'scalping', name: 'Scalping M1', tag: 'M1 FAST', cls: '', ico: '⚡', ic: 's' },
    { id: 'shadow', name: 'Shadow Pulse', tag: 'SNIPER TRAP', cls: 'snp', ico: '⛉', ic: 'h' },
  ];
  const TZ = 7 * 3600e3; // Cambodia, UTC+7
  const S = { symbol: 'XAUUSD', style: 'scalping', data: null, bars: [], idx: new Map(), busy: false, loaded: false, vis: 90, end: null, yShift: 0, hover: null, drag: null, pointers: new Map(), layers: { signals: true, zones: true, levels: true, plan: true, aura: true }, sound: true, seen: new Set(), first: true, timer: null };
  try { const st = localStorage.getItem('auraStyle'); if (st && STYLES.some((x) => x.id === st)) S.style = st; } catch (e) { /* storage may be blocked */ }
  const $$ = (id) => document.getElementById(id);
  const esc = (s) => escapeHtml(s);
  const dec = () => (S.symbol === 'BTCUSD' ? 1 : 2);
  const px = (v, d) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d ?? dec(), maximumFractionDigits: d ?? dec() }) : '—');
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (ts) => { const d = new Date(ts + TZ); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
  const dhm = (ts) => { const d = new Date(ts + TZ); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + ' ' + hm(ts); };

  /* ---------------- geometry ---------------- */
  function view(w, h) {
    const L = 8, R = 74, T = 14, B = 26, pw = w - L - R, ph = h - T - B, n = S.bars.length;
    const end = S.end == null ? n - 1 + 14 : S.end, left = end - S.vis;
    let lo = Infinity, hi = -Infinity;
    for (let i = Math.max(0, Math.floor(left)); i <= Math.min(n - 1, Math.ceil(end)); i++) { lo = Math.min(lo, S.bars[i].low); hi = Math.max(hi, S.bars[i].high); }
    const sig = S.layers.plan && S.data && S.data.latest;
    if (sig && isFinite(lo)) { lo = Math.min(lo, sig.sl, sig.tp1); hi = Math.max(hi, sig.sl, sig.tp1); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const p = (hi - lo) * 0.07 || 1; lo -= p; hi += p;
    lo += S.yShift || 0; hi += S.yShift || 0;
    return { L, R, T, B, pw, ph, w, h, left, end, lo, hi, x: (i) => L + ((i - left) / S.vis) * pw, y: (p2) => T + ((hi - p2) / (hi - lo)) * ph };
  }
  function niceStep(range, n) { const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }

  /* ---------------- drawing helpers ---------------- */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function tagBox(ctx, text, x, y, bg, fg, align) {
    ctx.font = '700 12px Inter, Segoe UI, Arial'; const w = ctx.measureText(text).width + 18, h = 22, x0 = align === 'right' ? x - w : x;
    ctx.fillStyle = bg; rr(ctx, x0, y - h / 2, w, h, 5); ctx.fill(); ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + 9, y + 0.5); return x0;
  }
  function bubble(ctx, text, x, y, bg, up) {
    ctx.font = '700 11px Inter, Segoe UI, Arial'; const w = ctx.measureText(text).width + 20, h = 21, top = up ? y + 8 : y - 8 - h;
    ctx.fillStyle = bg; rr(ctx, x - w / 2, top, w, h, 5); ctx.fill();
    ctx.beginPath(); if (up) { ctx.moveTo(x - 5, top); ctx.lineTo(x, top - 7); ctx.lineTo(x + 5, top); } else { ctx.moveTo(x - 5, top + h); ctx.lineTo(x, top + h + 7); ctx.lineTo(x + 5, top + h); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, x - w / 2 + 10, top + h / 2 + 0.5); return up ? top + h : top;
  }
  function pill(ctx, text, x, y) {
    ctx.font = '800 11px Inter, Segoe UI, Arial'; const w = ctx.measureText(text).width + 18, h = 20;
    ctx.fillStyle = '#f4f8ff'; rr(ctx, x - w / 2, y - h / 2, w, h, 10); ctx.fill(); ctx.strokeStyle = '#4a86ff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#10203a'; ctx.textBaseline = 'middle'; ctx.fillText(text, x - w / 2 + 9, y + 0.5);
  }
  function target(ctx, x, y, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 7.5, y); ctx.moveTo(x + 7.5, y); ctx.lineTo(x + 10, y); ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 7.5); ctx.moveTo(x, y + 7.5); ctx.lineTo(x, y + 10); ctx.stroke(); ctx.restore();
  }

  function draw() {
    const cv = $$('auCanvas'); if (!cv) return;
    const wrap = cv.parentElement, dpr = window.devicePixelRatio || 1, w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    if (!S.bars.length) { ctx.fillStyle = C.axis; ctx.font = '13px Inter, Arial'; ctx.fillText(S.busy ? 'Loading M1 candles…' : 'No data. Press Refresh.', 20, 30); return; }
    const v = view(w, h), d = S.data, plotR = w - v.R;
    // grid + price axis
    const step = niceStep(v.hi - v.lo, v.ph / 58); ctx.font = '11px Inter, Arial'; ctx.textBaseline = 'middle';
    for (let p = Math.ceil(v.lo / step) * step; p < v.hi; p += step) { const y = v.y(p); ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(v.L, y); ctx.lineTo(plotR, y); ctx.stroke(); ctx.fillStyle = C.axis; ctx.fillText(px(p, step < 1 ? 2 : 2), plotR + 8, y); }
    // time axis (UTC+7)
    const minsStep = [1, 5, 10, 15, 30, 60, 120].find((m) => (v.pw / S.vis) * m >= 62) || 120;
    ctx.fillStyle = C.axis; ctx.textAlign = 'center';
    for (let i = Math.max(0, Math.ceil(v.left)); i <= Math.min(S.bars.length - 1, Math.floor(v.end)); i++) {
      const m = Math.floor((S.bars[i].timestamp_ms + TZ) / 60000); if (m % minsStep) continue;
      const x = v.x(i); ctx.fillText(hm(S.bars[i].timestamp_ms), x, h - 10); ctx.strokeStyle = 'rgba(255,255,255,.025)'; ctx.beginPath(); ctx.moveTo(x, v.T); ctx.lineTo(x, h - v.B); ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.save(); ctx.beginPath(); ctx.rect(v.L, v.T, v.pw, v.ph); ctx.clip();
    // zones
    if (d && S.layers.zones) for (const z of d.zones || []) {
      const y1 = v.y(z.hi), y2 = v.y(z.lo), bull = z.dir === 'BUY', col = bull ? '16,185,129' : '240,56,79';
      let i0 = S.bars.findIndex((b) => b.timestamp_ms >= z.ob_ms); if (i0 < 0) i0 = 0; const x0 = Math.max(v.L, v.x(i0));
      if (y2 < v.T || y1 > h - v.B) continue;
      ctx.fillStyle = `rgba(${col},.11)`; ctx.fillRect(x0, y1, plotR - x0, y2 - y1); ctx.strokeStyle = `rgba(${col},.85)`; ctx.lineWidth = 1.2; ctx.strokeRect(x0, y1, plotR - x0, y2 - y1);
      ctx.setLineDash([6, 5]); ctx.strokeStyle = `rgba(${col},.5)`; ctx.beginPath(); ctx.moveTo(x0, (y1 + y2) / 2); ctx.lineTo(plotR, (y1 + y2) / 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '600 10.5px Inter, Arial'; ctx.fillStyle = `rgba(${col},1)`; ctx.fillText(`${z.label} · ${z.tf}`, x0 + 6, Math.min(y2 - 8, y1 + 11));
    }
    // levels (unswept HTF liquidity)
    const lblY = [];
    if (d && S.layers.levels) for (const L of d.levels || []) {
      const y = v.y(L.price); if (y < v.T || y > h - v.B) continue; const nearN = lblY.filter((q) => Math.abs(q - y) < 12).length; lblY.push(y); ctx.strokeStyle = 'rgba(240,195,94,.4)'; ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.moveTo(v.L, y); ctx.lineTo(plotR, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(240,195,94,.75)'; ctx.font = '10px Inter, Arial'; ctx.fillText(`${L.tf} ${L.kind === 'H' ? 'BSL' : 'SSL'}`, v.L + 6 + nearN * 62, y - 6);
    }
    // aura line
    if (d && d.aura_line && S.layers.aura) { const y = v.y(d.aura_line.value); if (y > v.T && y < h - v.B) { ctx.strokeStyle = 'rgba(95,227,174,.7)'; ctx.setLineDash([8, 5]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(v.L, y); ctx.lineTo(plotR, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5fe3ae'; ctx.font = '700 10.5px Inter, Arial'; ctx.fillText('AURA LINE', v.L + 6, y - 6); } }
    // candles
    const cw = Math.max(1.2, (v.pw / S.vis) * 0.68);
    for (let i = Math.max(0, Math.floor(v.left)); i <= Math.min(S.bars.length - 1, Math.ceil(v.end)); i++) {
      const b = S.bars[i], x = v.x(i), up = b.close >= b.open, col = up ? C.up : C.dn;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, v.y(b.high)); ctx.lineTo(x, v.y(b.low)); ctx.stroke();
      const y1 = v.y(Math.max(b.open, b.close)), y2 = v.y(Math.min(b.open, b.close)); ctx.fillRect(x - cw / 2, y1, cw, Math.max(1, y2 - y1));
    }
    // sweep markers
    if (d && S.layers.signals) for (const m of d.markers || []) { const i = S.idx.get(m.ts); if (i === undefined) continue; const x = v.x(i); if (x < v.L || x > plotR) continue; target(ctx, x, v.y(m.price) + (m.side === 'high' ? -13 : 13), m.side === 'high' ? C.sell : C.cyan); }
    // signals
    if (d && S.layers.signals) for (const s of d.signals || []) {
      const i = S.idx.get(s.ts); if (i === undefined) continue; const x = v.x(i); if (x < v.L - 20 || x > plotR + 20) continue; const b = S.bars[i], buy = s.dir === 'BUY';
      const edge = bubble(ctx, buy ? 'Buy' : 'Sell', x, buy ? v.y(b.low) + 4 : v.y(b.high) - 4, buy ? C.buy : C.sell, buy);
      if (s.aura) pill(ctx, 'AURA', x, buy ? edge + 18 : edge - 28);
    }
    // plan for the latest signal
    if (d && d.latest && S.layers.plan) {
      const s = d.latest, i = S.idx.get(s.ts), x0 = i === undefined ? v.L : Math.max(v.L, v.x(i)), x1 = plotR - 6, hit = s.outcome;
      const rows = [['SL', s.sl, C.sl, hit === 'SL'], ['TP1', s.tp1, C.tp, hit === 'TP1' || hit === 'TP2'], ['TP2', s.tp2, C.tp, hit === 'TP2']];
      ctx.restore(); ctx.save();
      for (const [name, price, col, done] of rows) {
        const y = v.y(price); if (y < v.T || y > h - v.B) continue; ctx.strokeStyle = col; ctx.lineWidth = name === 'SL' ? 2 : 1.6; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        tagBox(ctx, `${name}: ${px(price)}${done ? ' ✔' : ''}`, x1, y, col, '#fff', 'right');
      }
    }
    ctx.restore();
    // last price + candle countdown
    const last = S.bars[S.bars.length - 1], yl = v.y(last.close), up = last.close >= last.open;
    ctx.strokeStyle = 'rgba(31,177,132,.8)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(v.L, yl); ctx.lineTo(plotR, yl); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = up ? '#1aa66b' : '#d9344f'; ctx.fillRect(plotR, yl - 10, v.R, 20); ctx.fillStyle = '#fff'; ctx.font = '700 11.5px Inter, Arial'; ctx.fillText(px(last.close), plotR + 6, yl + 0.5);
    ctx.fillStyle = 'rgba(20,45,85,.9)'; ctx.fillRect(plotR, yl + 11, v.R, 18); ctx.fillStyle = '#8cc0ff'; ctx.font = '600 11px Inter, Arial'; ctx.fillText(countdown(), plotR + 8, yl + 20.5);
    // crosshair
    if (S.hover) { const hx = S.hover.x, hy = S.hover.y; if (hx > v.L && hx < plotR && hy > v.T && hy < h - v.B) { ctx.strokeStyle = 'rgba(180,200,230,.35)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(hx, v.T); ctx.lineTo(hx, h - v.B); ctx.moveTo(v.L, hy); ctx.lineTo(plotR, hy); ctx.stroke(); ctx.setLineDash([]); const pr = v.hi - ((hy - v.T) / v.ph) * (v.hi - v.lo); ctx.fillStyle = '#2a3a52'; ctx.fillRect(plotR, hy - 10, v.R, 20); ctx.fillStyle = '#fff'; ctx.font = '600 11px Inter, Arial'; ctx.fillText(px(pr), plotR + 6, hy + 0.5); } }
  }

  /* ---------------- ui ---------------- */
  function countdown() { const s = 60 - (Math.floor(Date.now() / 1000) % 60); return `${pad(Math.floor((s === 60 ? 0 : s) / 60))}:${pad(s === 60 ? 0 : s)}`; }
  function ohlc(b) { const el = $$('auOhlc'); if (!el || !b) return; el.querySelector('[data-o]').textContent = px(b.open); el.querySelector('[data-h]').textContent = px(b.high); el.querySelector('[data-l]').textContent = px(b.low); el.querySelector('[data-c]').textContent = px(b.close); }
  function renderStyleMenu() {
    const cur = STYLES.find((s) => s.id === S.style);
    $$('auStyleName').textContent = cur.name; const t = $$('auStyleTag'); t.textContent = cur.tag; t.className = 'au-tag ' + cur.cls;
    $$('auMenu').innerHTML = `<h5>✦ EXECUTION ENGINE <span>3 Modes</span></h5>` + STYLES.map((s) => `<div class="au-opt ${s.id === S.style ? 'on' : ''}" data-style="${s.id}"><div class="au-ico ${s.ic}">${s.ico}</div><span>${s.name}</span><span class="au-tag ${s.cls}">${s.tag}</span><span class="ck">✓</span></div>`).join('');
  }
  function render() {
    const d = S.data; if (!d) return;
    const f = d.feed || {}, live = $$('auLive'); const closed = f.market_closed, stale = f.is_stale;
    live.className = 'au-chip au-live ' + (closed ? 'warn' : stale ? 'bad' : ''); live.innerHTML = `<i></i> ${closed ? 'Market closed' : stale ? 'Stale feed' : 'Live'}`;
    $$('auSymTag').textContent = d.symbol === 'XAUUSD' ? 'GOLD 1M' : 'BTC 1M';
    ohlc(S.bars[S.bars.length - 1]);
    const al = d.aura_line; $$('auAuraPill').innerHTML = al ? `↗ Aura Line: ${px(al.value)} (${al.diff >= 0 ? '+' : ''}${px(al.diff)})` : 'Aura Line: —';
    $$('auAuraPill').title = al ? 'Baseline = ' + al.basis : '';
    const nw = d.news; $$('auNews').innerHTML = nw && nw.available ? (nw.blackout ? `<span class="badge warn">NEWS BLACKOUT</span><span class="tiny">${esc((nw.active || []).map((e) => e.title).join(', '))}: scalping into a release is a coin-flip. Stand aside.</span>` : nw.next ? `<span class="badge">NEXT NEWS</span><span class="tiny">${esc(nw.next.title)} in ${nw.next.in_minutes} min (${esc(nw.next.impact || '')})</span>` : '<span class="badge">NEWS</span><span class="tiny">No upcoming events</span>') : '<span class="badge">NEWS</span><span class="tiny">Calendar unavailable</span>';
    // signal card
    const L = d.latest, st = d.state, big = st === 'SIGNAL' && L ? L.dir : st === 'WATCH' && d.watch ? 'WATCH' : 'WAIT';
    $$('auState').className = 'au-state ' + st; $$('auState').textContent = st;
    $$('auDir').className = 'au-dir ' + big; $$('auDir').textContent = st === 'WATCH' && d.watch ? `WATCH ${d.watch.dir}` : big;
    $$('auNote').textContent = d.state_note;
    $$('auKv').innerHTML = L ? [['Entry', px(L.price)], ['Stop', `<span style="color:var(--red)">${px(L.sl)}</span>`], ['TP1', `<span style="color:var(--green)">${px(L.tp1)}</span>`], ['TP2', `<span style="color:var(--green)">${px(L.tp2)}</span>`], ['R:R TP1/TP2', `${L.r1} / ${L.r2}`], ['Score · grade', `${L.score} · ${L.grade}${L.aura ? ' · AURA' : ''}`]].map(([k, v]) => `<div><label>${k}</label><strong>${v}</strong></div>`).join('') : '<div style="grid-column:1/-1"><label>No signal in the loaded window</label></div>';
    $$('auReasons').innerHTML = L ? `<li><b>Last signal:</b> ${esc(L.dir)} · ${dhm(L.ts)} (UTC+7) · <span class="au-res ${L.outcome}">${L.outcome}</span></li>` + L.reasons.map((r) => `<li>${esc(r)}</li>`).join('') : '<li>Engine is scanning. Zones and sweeps are drawn on the chart.</li>';
    // mtf
    const arrow = { UP: '▲', DOWN: '▼', FLAT: '■' };
    $$('auMtf').innerHTML = (d.mtf || []).map((m) => `<tr><td><b>${m.tf}</b></td><td>${m.available ? `<span class="au-b ${m.bias}">${m.bias}</span>` : '<span class="tiny">n/a</span>'}</td><td>${m.available ? arrow[m.ema_trend] : ''}</td><td class="tiny">${esc(m.structure)}</td><td class="tiny">${m.rsi ?? '—'}</td></tr>`).join('');
    $$('auMeterDot').style.left = (50 + d.alignment / 2) + '%'; $$('auAlign').textContent = `${d.alignment > 0 ? '+' : ''}${d.alignment} · ${d.bias}`;
    // history
    const sigs = [...(d.signals || [])].reverse().slice(0, 14);
    $$('auHist').innerHTML = sigs.length ? sigs.map((s) => `<tr><td>${dhm(s.ts)}</td><td><b style="color:${s.dir === 'BUY' ? '#6fa8ff' : 'var(--red)'}">${s.dir}</b></td><td class="tiny">${esc(s.triggers.join('+'))}</td><td>${s.score}</td><td class="mono">${px(s.price)}</td><td class="mono">${px(s.sl)} / ${px(s.tp1)}</td><td><span class="au-res ${s.outcome}">${s.outcome}</span></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No signals in the loaded window for this style.</td></tr>';
    const k = d.stats; $$('auStats').innerHTML = `<b>${esc(d.style_label)}</b> · ${k.total} signals · win ${k.win_rate === null ? '—' : k.win_rate + '%'} (${k.wins}W / ${k.losses}L) · total ${k.total_r > 0 ? '+' : ''}${k.total_r}R<div class="au-note">${esc(k.note)}</div>`;
    const miss = (d.frames_missing || []).length ? ` Missing timeframes: ${d.frames_missing.join(', ')} (bias uses what is available).` : '';
    $$('auFeed').textContent = `${f.source || ''} · last M1 ${f.last_bar_time ? hm(Date.parse(f.last_bar_time)) : '—'} (UTC+7) · age ${f.age_seconds ?? '—'}s.${miss}${f.fallback_reason ? ' Fallback: ' + f.fallback_reason : ''}`;
    $$('auSession').textContent = (d.session || '').replace('_', ' ');
  }
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.18); } catch (e) { /* audio blocked */ } }
  function announce(d) {
    const L = d.latest; if (!L) return; const fresh = d.state === 'SIGNAL' && !S.seen.has(L.id); S.seen.add(L.id);
    if (S.first) { S.first = false; return; }
    if (fresh) { if (S.sound) beep(); if (window.toast) toast(`Aura ${L.dir} · ${px(L.price)} · SL ${px(L.sl)} · TP1 ${px(L.tp1)}${d.signal_delivery?.telegram_sent ? ' · Telegram sent' : ''}`); }
  }

  async function load(silent) {
    if (S.busy) return; S.busy = true; if (!silent) { $$('auRefresh').disabled = true; draw(); }
    try {
      const d = await request(`/api/aura/scan?symbol=${S.symbol}&style=${S.style}`);
      S.data = d; S.bars = d.bars || []; S.idx = new Map(S.bars.map((b, i) => [b.timestamp_ms, i]));
      render(); announce(d);
    } catch (e) { if (!silent && window.toast) toast('Aura: ' + e.message); $$('auLive').className = 'au-chip au-live bad'; $$('auLive').innerHTML = '<i></i> Offline'; }
    S.busy = false; $$('auRefresh').disabled = false; draw();
  }

  function wire() {
    renderStyleMenu();
    $$('auStyle').addEventListener('click', (e) => {
      const opt = e.target.closest('[data-style]');
      if (opt) { S.style = opt.dataset.style; try { localStorage.setItem('auraStyle', S.style); } catch (x) { /* ignore */ } S.first = true; S.yShift = 0; renderStyleMenu(); $$('auStyle').classList.remove('open'); load(); return; }
      $$('auStyle').classList.toggle('open');
    });
    document.addEventListener('click', (e) => { if (!$$('auStyle').contains(e.target)) $$('auStyle').classList.remove('open'); });
    $$('auSymbol').addEventListener('change', (e) => { S.symbol = e.target.value; S.data = null; S.bars = []; S.yShift = 0; S.first = true; $$('auSymName').textContent = S.symbol; load(); });
    $$('auRefresh').addEventListener('click', () => load());
    $$('auReset').addEventListener('click', () => { S.vis = 90; S.end = null; S.yShift = 0; draw(); });
    document.querySelectorAll('#auPills [data-layer]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.layer; S.layers[k] = !S.layers[k]; b.classList.toggle('on', S.layers[k]); draw(); }));
    $$('auSound').addEventListener('click', (e) => { S.sound = !S.sound; e.currentTarget.classList.toggle('on', S.sound); if (S.sound) beep(); });
    const wrap = $$('auCanvas').parentElement;
    wrap.addEventListener('wheel', (e) => { e.preventDefault(); S.vis = Math.max(20, Math.min(300, S.vis * (e.deltaY > 0 ? 1.12 : 0.89))); draw(); }, { passive: false });
    wrap.addEventListener('dblclick', () => { S.vis = 90; S.end = null; S.yShift = 0; draw(); });
    wrap.addEventListener('pointerdown', (e) => { wrap.setPointerCapture(e.pointerId); S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); const v = view(wrap.clientWidth, wrap.clientHeight); S.drag = { x: e.clientX, y: e.clientY, end: S.end == null ? S.bars.length - 1 + 14 : S.end, yShift: S.yShift || 0, priceRange: v.hi - v.lo, plotHeight: v.ph, d: null }; });
    wrap.addEventListener('pointermove', (e) => {
      const r = wrap.getBoundingClientRect(); S.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (S.pointers.has(e.pointerId)) {
        S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (S.pointers.size === 2) { const [a, b] = [...S.pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y); if (S.drag && S.drag.d) S.vis = Math.max(20, Math.min(300, S.vis * (S.drag.d / dist))); if (S.drag) S.drag.d = dist; }
        else if (S.drag) { const pw = wrap.clientWidth - 82; S.end = Math.max(20, Math.min(S.bars.length + 60, S.drag.end - ((e.clientX - S.drag.x) / pw) * S.vis)); S.yShift = S.drag.yShift + ((e.clientY - S.drag.y) / Math.max(1, S.drag.plotHeight)) * S.drag.priceRange; }
      }
      const v = view(wrap.clientWidth, wrap.clientHeight), i = Math.round(v.left + ((S.hover.x - v.L) / v.pw) * S.vis); if (S.bars[i]) ohlc(S.bars[i]);
      draw();
    });
    const up = (e) => { S.pointers.delete(e.pointerId); if (!S.pointers.size) S.drag = null; else if (S.drag) S.drag.d = null; };
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
    wrap.addEventListener('pointerleave', () => { S.hover = null; ohlc(S.bars[S.bars.length - 1]); draw(); });
    window.addEventListener('resize', draw);
    setInterval(() => { if (!$$('page-aura').classList.contains('active')) return; const c = $$('auCd'); if (c) c.textContent = countdown(); draw(); }, 1000);
    setInterval(() => { if ($$('page-aura').classList.contains('active') && !document.hidden) load(true); }, 15000);
  }
  window.auraOpen = function () { if (!S.loaded) { S.loaded = true; wire(); } load(); setTimeout(draw, 50); };
})();
