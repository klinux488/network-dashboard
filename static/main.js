const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

document.querySelectorAll('.nav__tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav__tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'interfaces') loadInterfaces();
  });
});

function fmt(b) {
  if (b == null) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function setBar(id, pct) {
  const el = $(id);
  el.style.width = pct + '%';
  el.style.background = pct > 85 ? 'var(--danger)' : pct > 65 ? 'var(--warning)' : 'var(--accent)';
}

function cidrFromMask(mask) {
  if (!mask) return '';
  return mask.split('.').reduce((acc, o) => acc + (parseInt(o, 10).toString(2).match(/1/g) || []).length, 0);
}

async function api(url, body) {
  const opt = body ? { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) } : {};
  return fetch(url, opt).then(r => r.json());
}

async function loadSysInfo() {
  try {
    const d = await api('/api/sysinfo');
    $('ov-cpu').textContent = d.cpu_percent + '%';
    $('ov-mem').textContent = fmt(d.memory.used) + ' / ' + fmt(d.memory.total);
    $('ov-disk').textContent = fmt(d.disk.used) + ' / ' + fmt(d.disk.total);
    $('ov-host').textContent = d.hostname;
    $('ov-os').textContent = d.os;
    $('sys-bar').textContent = `CPU ${d.cpu_percent}% | RAM ${d.memory.percent}% | Disk ${d.disk.percent}% | ${d.hostname}`;
    setBar('bar-cpu', d.cpu_percent); setBar('bar-mem', d.memory.percent); setBar('bar-disk', d.disk.percent);
  } catch (e) { $('sys-bar').textContent = 'خطا در بارگذاری'; }
}

async function loadOverviewIfaces() {
  try {
    const list = await api('/api/interfaces');
    $('ov-ifaces').innerHTML = list.map(i => {
      const v4 = i.addresses.find(a => a.family === 'AF_INET');
      return `<div class="card">
        <div class="iface-card__header"><span class="iface-card__name">${esc(i.name)}</span>
        <span class="badge ${i.is_up ? 'badge--up' : 'badge--down'}">${i.is_up ? 'UP' : 'DOWN'}</span></div>
        <div class="iface-card__addr">${v4 ? esc(v4.address) + '/' + cidrFromMask(v4.netmask) : 'بدون IPv4'}</div>
        <div class="iface-card__stat"><span>↓ <b>${fmt(i.bytes_recv)}</b></span><span>↑ <b>${fmt(i.bytes_sent)}</b></span></div></div>`;
    }).join('');
  } catch (e) {}
}

async function loadInterfaces() {
  try {
    const list = await api('/api/interfaces');
    $('iface-detail').innerHTML = list.map(i => `<div class="card" style="margin-bottom:16px">
      <div class="iface-card__header"><span class="iface-card__name">${esc(i.name)}</span>
      <span class="badge ${i.is_up ? 'badge--up' : 'badge--down'}">${i.is_up ? 'UP' : 'DOWN'}</span></div>
      ${i.addresses.map(a => `<div class="iface-card__addr">[${esc(a.family)}] ${esc(a.address)}${a.netmask ? ' / ' + esc(a.netmask) : ''}</div>`).join('')}
      <div class="iface-card__stat">
        <span>دریافت: <b>${fmt(i.bytes_recv)}</b> (${i.packets_recv} پکت)</span>
        <span>ارسال: <b>${fmt(i.bytes_sent)}</b> (${i.packets_sent} پکت)</span>
        ${i.speed ? `<span>سرعت: <b>${i.speed} Mb/s</b></span>` : ''}</div></div>`).join('');
  } catch (e) { $('iface-detail').textContent = 'خطا: ' + e.message; }
}

async function tool(url, body, out, wait) {
  out.textContent = wait;
  try { const r = await api(url, body); out.textContent = r.output || r.error || 'بدون نتیجه'; }
  catch (e) { out.textContent = 'خطا: ' + e.message; }
}

function runScan() {
  const target = $('scan-target').value.trim();
  if (!target) { $('scan-output').textContent = 'هدف را وارد کنید.'; return; }
  tool('/api/scan', { target, type: $('scan-type').value }, $('scan-output'), 'در حال اسکن...');
}
function runPing() {
  const host = $('ping-host').value.trim();
  if (!host) { $('ping-output').textContent = 'هاست را وارد کنید.'; return; }
  tool('/api/ping', { host }, $('ping-output'), 'در حال پینگ...');
}
function runTrace() {
  const host = $('trace-host').value.trim();
  if (!host) { $('trace-output').textContent = 'هاست را وارد کنید.'; return; }
  tool('/api/traceroute', { host }, $('trace-output'), 'در حال traceroute...');
}
function loadRoutes() { tool('/api/routes', null, $('routes-output'), 'در حال بارگذاری...'); }

async function loadArp() {
  const c = $('arp-table');
  c.textContent = 'در حال بارگذاری...';
  try {
    const e = await api('/api/arp');
    if (!Array.isArray(e) || !e.length) { c.textContent = 'جدول ARP خالی است.'; return; }
    c.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>IP</th><th>وضعیت</th><th>MAC</th><th>اینترفیس</th></tr></thead><tbody>` +
      e.map(x => `<tr><td>${esc(x.ip)}</td><td>${esc(x.type)}</td><td style="font-family:monospace">${esc(x.mac)}</td><td>${esc(x.iface)}</td></tr>`).join('') +
      '</tbody></table></div>';
  } catch (err) { c.textContent = 'خطا: ' + err.message; }
}

function calcSubnet() {
  const p = $('subnet-ip').value.trim().split('.').map(Number);
  const prefix = parseInt($('subnet-mask').value, 10);
  const res = $('subnet-result');
  if (p.length !== 4 || p.some(x => isNaN(x) || x < 0 || x > 255) || isNaN(prefix) || prefix < 0 || prefix > 32) {
    res.innerHTML = '<span style="color:var(--danger)">IP یا prefix نامعتبر است.</span>'; return;
  }
  const ip = ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const net = (ip & mask) >>> 0;
  const bc = (net | ~mask) >>> 0;
  const hosts = prefix >= 31 ? (prefix === 31 ? 2 : 1) : 2 ** (32 - prefix) - 2;
  const toIP = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const first = prefix >= 31 ? net : net + 1, last = prefix >= 31 ? bc : bc - 1;
  res.innerHTML = [
    ['آدرس شبکه', toIP(net)], ['Subnet Mask', toIP(mask)], ['Broadcast', toIP(bc)],
    ['اولین هاست', toIP(first)], ['آخرین هاست', toIP(last)],
    ['تعداد هاست', hosts.toLocaleString('en-US')], ['Wildcard', toIP((~mask) >>> 0)],
  ].map(([k, v]) => `<div class="subnet-row"><span>${k}</span><span>${v}</span></div>`).join('');
}

loadSysInfo();
loadOverviewIfaces();
setInterval(loadSysInfo, 5000);
setInterval(loadOverviewIfaces, 10000);
