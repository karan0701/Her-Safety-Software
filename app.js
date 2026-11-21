'use strict';

// ════════════════════════════════════════════
//  CONSTANTS & STATE
// ════════════════════════════════════════════
const APP_EMAIL = 'rahul09876goyal@gmail.com';
let gLat = 28.4744, gLng = 77.5040; // Default: Greater Noida
let gpsAccuracy = null;
let map = null, mapInited = false;
let userMarker = null;
let darkMapStyle = true;
let sosTimer = null, sosCount = 5;
let journeyTimer = null, journeyDest = '', journeyMins = 0;
let reportType = 'danger';
let editingContactId = null;
let deferredPrompt = null;
let sirenOsc = null, sirenCtx = null;

// ════════════════════════════════════════════
//  LOCAL STORAGE — CONTACTS
// ════════════════════════════════════════════
const LS_CONTACTS = 'safeher_contacts';
const LS_PROFILE  = 'safeher_profile';

function loadContacts() {
  try {
    const data = localStorage.getItem(LS_CONTACTS);
    if (data) return JSON.parse(data);
  } catch(e) {}
  // Default contacts
  return [
    { id:'c1', name:'Papa',  phone:'9817044674', rel:'Father',  emoji:'👨', primary:true  },
    { id:'c2', name:'Mummy', phone:'9817044674', rel:'Mother',  emoji:'👩', primary:false },
    { id:'c3', name:'Bhai',  phone:'9817044674', rel:'Brother', emoji:'👦', primary:false },
  ];
}

function saveContacts(contacts) {
  localStorage.setItem(LS_CONTACTS, JSON.stringify(contacts));
}

function loadProfile() {
  try {
    const data = localStorage.getItem(LS_PROFILE);
    if (data) return JSON.parse(data);
  } catch(e) {}
  return { name:'SafeHer User', email: APP_EMAIL };
}

function saveProfileData(p) {
  localStorage.setItem(LS_PROFILE, JSON.stringify(p));
}

let CONTACTS = loadContacts();
let PROFILE  = loadProfile();

// ════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════
function goTo(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('s-'+name).classList.add('active');
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
  const nb = document.getElementById('nb-'+name);
  if (nb) nb.classList.add('active');
  if (name === 'map' && !mapInited) initMap();
  if (name === 'contacts') renderContacts();
  if (name === 'alerts') renderAlerts();
  if (name === 'profile') renderProfile();
}

// ════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════
let _toastT;
function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast show ' + type;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), 3400);
}

// ════════════════════════════════════════════
//  GPS TRACKING
// ════════════════════════════════════════════
function startGPS() {
  if (!navigator.geolocation) { checkZone(); return; }
  navigator.geolocation.watchPosition(
    pos => {
      gLat = pos.coords.latitude;
      gLng = pos.coords.longitude;
      gpsAccuracy = pos.coords.accuracy;
      if (userMarker) userMarker.setLatLng([gLat, gLng]);
      checkZone();
      updateSOSLocDisplay();
    },
    () => { checkZone(); },
    { enableHighAccuracy:true, maximumAge:4000, timeout:10000 }
  );
  navigator.geolocation.getCurrentPosition(
    pos => { gLat=pos.coords.latitude; gLng=pos.coords.longitude; gpsAccuracy=pos.coords.accuracy; checkZone(); updateSOSLocDisplay(); },
    () => { checkZone(); }
  );
}

function locationString() {
  return `${gLat.toFixed(6)}, ${gLng.toFixed(6)}`;
}
function googleMapsLink() {
  return `https://maps.google.com/?q=${gLat},${gLng}`;
}
function appleMapsLink() {
  return `https://maps.apple.com/?q=${gLat},${gLng}`;
}

// ════════════════════════════════════════════
//  ZONE DATA — GREATER NOIDA
// ════════════════════════════════════════════
const DANGER_ZONES = [
  { id:'dz1', lat:28.4595, lng:77.5085, r:420, name:'Sector Phi Market',    why:'Chain snatching & harassment reported', risk:'HIGH'   },
  { id:'dz2', lat:28.4982, lng:77.5215, r:360, name:'Sector 63 Night Area', why:'Isolated roads, incidents after dark',  risk:'HIGH'   },
  { id:'dz3', lat:28.4421, lng:77.5304, r:330, name:'Kasna Road',           why:'Poor lighting, mugging cases at night', risk:'HIGH'   },
  { id:'dz4', lat:28.5099, lng:77.4785, r:300, name:'Surajpur Bypass',      why:'Stalking & assault reports',            risk:'HIGH'   },
  { id:'dz5', lat:28.4689, lng:77.5502, r:280, name:'Sector Gamma Area',    why:'Harassment incidents near park',        risk:'MEDIUM' },
  { id:'dz6', lat:28.4370, lng:77.5160, r:310, name:'Rabupura Road',        why:'Snatching near isolated stretch',       risk:'HIGH'   },
];

const SAFE_ZONES = [
  { id:'sz1', lat:28.4744, lng:77.5040, r:600, name:'Alpha 1 Commercial',     why:'CCTV covered, active police patrol' },
  { id:'sz2', lat:28.4895, lng:77.5134, r:460, name:'Pari Chowk',            why:'Busy 24/7 intersection, cameras everywhere' },
  { id:'sz3', lat:28.4622, lng:77.4911, r:380, name:'Grand Venice Mall Area', why:'Mall security, indoor safe zone' },
  { id:'sz4', lat:28.4803, lng:77.5368, r:350, name:'Knowledge Park III',     why:'University area, well-monitored' },
  { id:'sz5', lat:28.5010, lng:77.5080, r:300, name:'Sector Beta',            why:'Residential, good street lighting' },
];

const CAUTION_ZONES = [
  { id:'cz1', lat:28.4550, lng:77.5220, r:300, name:'Eco Tech I',    why:'Low foot traffic in evenings' },
  { id:'cz2', lat:28.4900, lng:77.4900, r:260, name:'Sector Chi',    why:'Street lights out in some lanes' },
  { id:'cz3', lat:28.4710, lng:77.5260, r:240, name:'Tughlakabad',   why:'Sparse area after 9 PM' },
];

// Haversine
function dist(la1,lo1,la2,lo2) {
  const R=6371000, dL=(la2-la1)*Math.PI/180, dG=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dG/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function checkZone() {
  const pill = document.getElementById('zone-pill');
  const ztxt = document.getElementById('zone-text');
  const sz   = document.getElementById('stat-zone');

  const dz = DANGER_ZONES.find(z => dist(gLat,gLng,z.lat,z.lng) <= z.r);
  const cz = CAUTION_ZONES.find(z => dist(gLat,gLng,z.lat,z.lng) <= z.r);
  const sf = SAFE_ZONES.find(z   => dist(gLat,gLng,z.lat,z.lng) <= z.r);

  if (dz) {
    pill.className='zone-badge danger'; ztxt.textContent='⚠️ DANGER ZONE';
    sz.textContent='DANGER'; sz.style.color='var(--red)'; sz.style.fontSize='12px';
    if (document.getElementById('tog-zone')?.checked)
      toast('⚠️ DANGER! You are in '+dz.name, 'danger');
  } else if (cz) {
    pill.className='zone-badge warn'; ztxt.textContent='⚡ CAUTION';
    sz.textContent='CAUTION'; sz.style.color='var(--yellow)'; sz.style.fontSize='12px';
  } else if (sf) {
    pill.className='zone-badge safe'; ztxt.textContent='✅ SAFE ZONE';
    sz.textContent='SAFE'; sz.style.color='var(--green)'; sz.style.fontSize='14px';
  } else {
    pill.className='zone-badge neutral'; ztxt.textContent='📍 Greater Noida';
    sz.textContent='NORMAL'; sz.style.color='var(--sub)'; sz.style.fontSize='13px';
  }
}

// ════════════════════════════════════════════
//  MAP — GOOGLE MAPS TILES
// ════════════════════════════════════════════
let tileLayer = null;

const MAP_TILES = {
  dark:    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light:   'https://mt{s}.google.com/vt/lyrs=r&x={x}&y={y}&z={z}',
  satellite:'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
};

function initMap() {
  mapInited = true;
  map = L.map('map', { zoomControl:false, attributionControl:false }).setView([gLat, gLng], 14);

  // Google Maps road tiles (looks exactly like Google Maps)
  tileLayer = L.tileLayer(MAP_TILES.light, {
    subdomains:['0','1','2','3'], maxZoom:21, attribution:''
  }).addTo(map);

  L.control.zoom({ position:'bottomleft' }).addTo(map);

  // ── Draw zones ──
  DANGER_ZONES.forEach(z => {
    L.circle([z.lat,z.lng],{
      radius:z.r, color:'#FF3055', fillColor:'#FF3055',
      fillOpacity:.18, weight:2.5, opacity:.8,
      dashArray: z.risk==='MEDIUM'?'6,4':undefined
    }).addTo(map);
    const icon = makeDot('#FF3055', 20, true);
    L.marker([z.lat,z.lng],{icon}).addTo(map).bindPopup(
      `<div class="pop-title">⚠️ ${z.name}</div><div class="pop-info">${z.why}</div><span class="pop-chip chip-d">${z.risk} RISK</span>
       <div class="pop-actions"><div class="pop-btn" onclick="reportFromHere(${z.lat},${z.lng})">📍 Navigate Away</div></div>`
    );
  });

  SAFE_ZONES.forEach(z => {
    L.circle([z.lat,z.lng],{
      radius:z.r, color:'#00C96B', fillColor:'#00C96B',
      fillOpacity:.14, weight:2, opacity:.75
    }).addTo(map);
    const icon = makeDot('#00C96B', 17, false);
    L.marker([z.lat,z.lng],{icon}).addTo(map).bindPopup(
      `<div class="pop-title">✅ ${z.name}</div><div class="pop-info">${z.why}</div><span class="pop-chip chip-s">SAFE ZONE</span>
       <div class="pop-actions"><div class="pop-btn" onclick="navigateTo(${z.lat},${z.lng})">🧭 Go Here</div></div>`
    );
  });

  CAUTION_ZONES.forEach(z => {
    L.circle([z.lat,z.lng],{
      radius:z.r, color:'#FFB800', fillColor:'#FFB800',
      fillOpacity:.1, weight:2, opacity:.6, dashArray:'8,4'
    }).addTo(map);
    const icon = makeDot('#FFB800', 14, false);
    L.marker([z.lat,z.lng],{icon}).addTo(map).bindPopup(
      `<div class="pop-title">⚡ ${z.name}</div><div class="pop-info">${z.why}</div><span class="pop-chip chip-w">CAUTION</span>`
    );
  });

  // ── User location marker (blue pulsing dot like Google Maps) ──
  const userHTML = `
    <div style="position:relative;width:24px;height:24px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,.3);animation:userRing 2s ease-out infinite;"></div>
      <div style="position:absolute;inset:4px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 2px 8px rgba(59,130,246,.6);"></div>
    </div>`;
  const userIcon = L.divIcon({ className:'', html:userHTML, iconSize:[24,24], iconAnchor:[12,12] });
  userMarker = L.marker([gLat, gLng], { icon:userIcon, zIndexOffset:1000 })
    .addTo(map)
    .bindPopup('<div class="pop-title">🔵 You are here</div><div class="pop-info">Greater Noida, UP<br>Live GPS tracking active</div>');

  // Add CSS for user marker animation
  const styleEl = document.createElement('style');
  styleEl.textContent = `@keyframes userRing{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(2.5)}}`;
  document.head.appendChild(styleEl);

  // Click to report
  map.on('click', e => {
    L.popup().setLatLng(e.latlng)
      .setContent(`<div class="pop-title">📍 Tap to report</div><div class="pop-info">${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}</div><div class="pop-actions"><div class="pop-btn" onclick="reportAt(${e.latlng.lat},${e.latlng.lng})">🚨 Report Here</div></div>`)
      .openOn(map);
  });

  darkMapStyle = false;
  document.getElementById('map-style-btn').textContent = '🗺️';
}

function makeDot(color, size, pulse) {
  const p = pulse ? `animation:dotPulse 1.8s ease-in-out infinite;` : '';
  return L.divIcon({
    className:'',
    html:`<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,.9);box-shadow:0 0 10px ${color},0 2px 6px rgba(0,0,0,.3);${p}"></div>`,
    iconSize:[size,size], iconAnchor:[size/2,size/2]
  });
}

function flyToMe() {
  if (map) { map.flyTo([gLat, gLng], 16, { animate:true, duration:1.2 }); userMarker?.openPopup(); }
}
function toggleMapStyle() {
  if (!map) return;
  if (tileLayer) map.removeLayer(tileLayer);
  const btn = document.getElementById('map-style-btn');
  if (!darkMapStyle) {
    tileLayer = L.tileLayer(MAP_TILES.dark, { subdomains:'abcd', maxZoom:21 }).addTo(map);
    darkMapStyle=true; btn.textContent='☀️';
    toast('🌙 Dark map mode', '');
  } else {
    tileLayer = L.tileLayer(MAP_TILES.light, { subdomains:['0','1','2','3'], maxZoom:21 }).addTo(map);
    darkMapStyle=false; btn.textContent='🌙';
    toast('🗺️ Google Maps style', '');
  }
}
function navigateTo(lat, lng) {
  window.open(`https://maps.google.com/maps?daddr=${lat},${lng}&saddr=${gLat},${gLng}`, '_blank');
}
function reportFromHere(lat, lng) { flyToMe(); }
function reportAt(lat, lng) {
  const icon = makeDot('#FF3055', 14, false);
  L.marker([lat,lng],{icon}).addTo(map)
    .bindPopup('<div class="pop-title">🆕 Your Report</div><div class="pop-info">Pending community review</div><span class="pop-chip chip-d">PENDING</span>')
    .openPopup();
  toast('🚨 Incident reported! Thank you.', 'danger');
}

// ════════════════════════════════════════════
//  SOS SYSTEM
// ════════════════════════════════════════════
function updateSOSLocDisplay() {
  const el = document.getElementById('sos-loc-display');
  if (el) el.textContent = `${locationString()} — ${googleMapsLink()}`;
}

function triggerSOS() {
  const primary = CONTACTS.find(c=>c.primary) || CONTACTS[0];
  const allNames = CONTACTS.map(c=>c.name).join(', ');
  document.getElementById('sos-contacts-text').textContent = `Alerting: ${allNames}`;
  updateSOSLocDisplay();

  sosCount = 5;
  document.getElementById('sos-cd').textContent = 5;
  document.getElementById('sos-modal').classList.add('open');

  sosTimer = setInterval(() => {
    sosCount--;
    document.getElementById('sos-cd').textContent = sosCount;
    if (sosCount <= 0) { clearInterval(sosTimer); executeSOS(); }
  }, 1000);
}

function cancelSOS() {
  clearInterval(sosTimer);
  document.getElementById('sos-modal').classList.remove('open');
  toast('✅ SOS cancelled — you are safe', 'success');
}

function executeSOS() {
  clearInterval(sosTimer);
  document.getElementById('sos-modal').classList.remove('open');

  const primary = CONTACTS.find(c=>c.primary) || CONTACTS[0];
  if (!primary) { toast('⚠️ Add a guardian first!', 'warn'); return; }

  const locLink = googleMapsLink();
  const locStr  = locationString();
  const now     = new Date().toLocaleString('en-IN', { hour12:true });

  // Message sent via SMS — concise & clear
  const smsBody = `🆘 SOS! I need IMMEDIATE help!\n📍 Location: ${locLink}\nCoords: ${locStr}\nTime: ${now}\n— SafeHer App`;
  const waBody  = `🆘 *SOS EMERGENCY!*\nI need immediate help right now!\n📍 *Location:* ${locLink}\n🕐 ${now}\n_(Sent automatically via SafeHer App)_`;

  if (document.getElementById('tog-siren')?.checked) playSiren();

  // 1️⃣ Send SMS to ALL guardians immediately (opens SMS app pre-filled — no extra permission needed)
  const allNums    = CONTACTS.map(c => c.phone).join(',');
  const encodedSMS = encodeURIComponent(smsBody);
  window.location.href = `sms:${allNums}?body=${encodedSMS}`;

  // 2️⃣ Call primary guardian after a short delay (gives SMS app a moment to open)
  setTimeout(() => {
    window.location.href = `tel:${primary.phone}`;
  }, 1500);

  // 3️⃣ WhatsApp message to primary (optional, based on setting)
  if (document.getElementById('tog-wa')?.checked) {
    setTimeout(() => {
      const waNum = primary.phone.replace(/\D/g, '');
      window.open(`https://wa.me/91${waNum}?text=${encodeURIComponent(waBody)}`, '_blank');
    }, 3000);
  }

  toast(`🆘 SOS sent to ${CONTACTS.length} guardian(s)!`, 'danger');
}

function callPrimary() {
  const p = CONTACTS.find(c=>c.primary) || CONTACTS[0];
  if (!p) { toast('⚠️ Add a guardian first', 'warn'); return; }
  window.location.href = `tel:${p.phone}`;
}

// ════════════════════════════════════════════
//  SEND LOCATION
// ════════════════════════════════════════════
function openSendLocation() {
  const sub = document.getElementById('loc-modal-sub');
  sub.textContent = `📍 ${locationString()}`;
  document.getElementById('location-modal').classList.add('open');
}
function closeLocModal() { document.getElementById('location-modal').classList.remove('open'); }

function sendViaSMS() {
  closeLocModal();
  const primary = CONTACTS.find(c=>c.primary) || CONTACTS[0];
  if (!primary) { toast('⚠️ Add a guardian first', 'warn'); return; }
  const allNums = CONTACTS.map(c=>c.phone).join(',');
  const msg = encodeURIComponent(`📍 My live location:\n${googleMapsLink()}\nCoords: ${locationString()}\n— Sent via SafeHer`);
  window.location.href = `sms:${allNums}?body=${msg}`;
  toast('💬 Opening SMS with live location…', 'info');
}

function sendViaWhatsApp() {
  closeLocModal();
  const p = CONTACTS.find(c=>c.primary) || CONTACTS[0];
  if (!p) { toast('⚠️ Add a guardian first', 'warn'); return; }
  const num  = p.phone.replace(/\D/g,'');
  const msg  = encodeURIComponent(`📍 *My live location:*\n${googleMapsLink()}\n_(Sent via SafeHer app)_`);
  window.open(`https://wa.me/91${num}?text=${msg}`, '_blank');
  toast('💚 Opening WhatsApp…', 'success');
}

function sendViaEmail() {
  closeLocModal();
  const profile = loadProfile();
  const subject = encodeURIComponent('📍 My Live Location — SafeHer');
  const body    = encodeURIComponent(`Hi,\n\nMy current live location:\n${googleMapsLink()}\n\nCoordinates: ${locationString()}\nTime: ${new Date().toLocaleString()}\n\n— Sent via SafeHer Women's Safety App`);
  window.location.href = `mailto:${profile.email}?subject=${subject}&body=${body}`;
  toast('📧 Opening email…', 'info');
}

function copyLocationLink() {
  closeLocModal();
  const link = googleMapsLink();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => toast('🔗 Location link copied!', 'success'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    toast('🔗 Location link copied!', 'success');
  }
}

// ════════════════════════════════════════════
//  CONTACTS MANAGEMENT
// ════════════════════════════════════════════
function renderContacts() {
  CONTACTS = loadContacts();
  const list = document.getElementById('contacts-list');
  document.getElementById('stat-contacts').textContent = CONTACTS.length;

  list.innerHTML = CONTACTS.map(c => `
    <div class="gc">
      <div class="gc-av ${c.primary?'primary':''}">${c.emoji||'👤'}</div>
      <div class="gc-info">
        <div class="gc-name">
          ${c.name}
          ${c.primary ? '<span class="gc-primary-tag">PRIMARY SOS</span>' : ''}
        </div>
        <div class="gc-num">📱 ${formatPhone(c.phone)}</div>
        <div class="gc-rel">${c.rel||''}</div>
      </div>
      <div class="gc-actions">
        <a class="gc-btn" href="tel:${c.phone}">📞</a>
        <a class="gc-btn" href="sms:${c.phone}?body=${encodeURIComponent('Hi, I am checking in via SafeHer app.')}">💬</a>
        <button class="gc-btn edit" onclick="openEditContact('${c.id}')">✏️</button>
      </div>
    </div>
  `).join('');
}

function formatPhone(p) {
  const d = p.replace(/\D/g,'');
  if (d.length === 10) return `+91 ${d.slice(0,5)} ${d.slice(5)}`;
  return p;
}

function openAddContact() {
  editingContactId = null;
  document.getElementById('contact-modal-title').textContent = 'Add Guardian';
  document.getElementById('contact-modal-sub').textContent   = 'This person will get your SOS alerts';
  document.getElementById('c-name').value  = '';
  document.getElementById('c-phone').value = '';
  document.getElementById('c-rel').value   = '';
  document.getElementById('c-emoji').value = '👤';
  document.getElementById('c-primary').checked = false;
  document.getElementById('delete-contact-btn').style.display = 'none';
  document.getElementById('contact-modal').classList.add('open');
}

function openEditContact(id) {
  editingContactId = id;
  const c = CONTACTS.find(x => x.id === id);
  if (!c) return;
  document.getElementById('contact-modal-title').textContent = 'Edit Guardian';
  document.getElementById('contact-modal-sub').textContent   = `Editing ${c.name}`;
  document.getElementById('c-name').value    = c.name;
  document.getElementById('c-phone').value   = c.phone;
  document.getElementById('c-rel').value     = c.rel||'';
  document.getElementById('c-emoji').value   = c.emoji||'👤';
  document.getElementById('c-primary').checked = c.primary||false;
  document.getElementById('delete-contact-btn').style.display = 'block';
  document.getElementById('contact-modal').classList.add('open');
}

function saveContact() {
  const name  = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim().replace(/\D/g,'');
  const rel   = document.getElementById('c-rel').value.trim();
  const emoji = document.getElementById('c-emoji').value.trim() || '👤';
  const primary = document.getElementById('c-primary').checked;

  if (!name || !phone) { toast('⚠️ Name and phone are required', 'warn'); return; }
  if (phone.length < 10) { toast('⚠️ Enter a valid 10-digit number', 'warn'); return; }

  CONTACTS = loadContacts();

  if (primary) CONTACTS.forEach(c => c.primary = false);

  if (editingContactId) {
    const idx = CONTACTS.findIndex(c => c.id === editingContactId);
    if (idx >= 0) CONTACTS[idx] = { ...CONTACTS[idx], name, phone, rel, emoji, primary };
  } else {
    CONTACTS.push({ id:'c'+Date.now(), name, phone, rel, emoji, primary: primary || CONTACTS.length===0 });
  }

  saveContacts(CONTACTS);
  closeContactModal();
  renderContacts();
  toast('✅ Guardian saved!', 'success');
}

function deleteContact() {
  if (!editingContactId) return;
  if (!confirm('Remove this guardian?')) return;
  CONTACTS = CONTACTS.filter(c => c.id !== editingContactId);
  if (CONTACTS.length > 0 && !CONTACTS.find(c=>c.primary)) CONTACTS[0].primary = true;
  saveContacts(CONTACTS);
  closeContactModal();
  renderContacts();
  toast('🗑️ Guardian removed', '');
}

function closeContactModal() {
  document.getElementById('contact-modal').classList.remove('open');
  editingContactId = null;
}

// ════════════════════════════════════════════
//  JOURNEY TRACKING
// ════════════════════════════════════════════
function openJourneyModal() {
  document.getElementById('journey-modal').classList.add('open');
}
function closeJourneyModal() {
  document.getElementById('journey-modal').classList.remove('open');
}

function startJourney() {
  const dest = document.getElementById('j-dest').value.trim();
  const mins = parseInt(document.getElementById('j-mins').value);
  if (!dest || !mins || mins < 1) { toast('⚠️ Please fill both fields', 'warn'); return; }

  journeyDest = dest; journeyMins = mins;
  closeJourneyModal();

  const banner = document.getElementById('journey-banner');
  const jbText = document.getElementById('jb-text');
  banner.classList.add('show');

  let remaining = mins;
  jbText.textContent = `🚶 To ${dest} — ${remaining} min left`;
  toast(`🚶‍♀️ Journey started! Alert in ${mins} min if no check-in`, 'success');

  clearInterval(journeyTimer);
  journeyTimer = setInterval(() => {
    remaining--;
    jbText.textContent = `🚶 To ${dest} — ${remaining} min left`;
    if (remaining <= 0) {
      clearInterval(journeyTimer);
      banner.classList.remove('show');
      const msg = encodeURIComponent(`⚠️ LATE ALERT from SafeHer: ${PROFILE.name||'User'} has NOT arrived at ${dest} on time!\n📍 Last location: ${googleMapsLink()}`);
      const allNums = CONTACTS.map(c=>c.phone).join(',');
      window.location.href = `sms:${allNums}?body=${msg}`;
      toast('⚠️ Time up! Alerting guardians…', 'danger');
    }
  }, 60000);
}

function arrivedSafe() {
  clearInterval(journeyTimer);
  document.getElementById('journey-banner').classList.remove('show');
  const msg = encodeURIComponent(`✅ Safe arrival! ${PROFILE.name||'User'} has arrived at ${journeyDest} safely.\n— SafeHer App 🌸`);
  const allNums = CONTACTS.map(c=>c.phone).join(',');
  window.location.href = `sms:${allNums}?body=${msg}`;
  toast('✅ Arrived safely! Guardians notified 🎉', 'success');
}

// ════════════════════════════════════════════
//  REPORT MODAL
// ════════════════════════════════════════════
let reportLat = null, reportLng = null;

function openReportModal() {
  reportLat = gLat; reportLng = gLng;
  document.getElementById('rep-desc').value = '';
  document.getElementById('report-modal').classList.add('open');
}
function closeReportModal() {
  document.getElementById('report-modal').classList.remove('open');
}
function selectReportType(type, btn) {
  reportType = type;
  document.querySelectorAll('.rep-type-btn').forEach(b => {
    b.style.background='var(--s2)'; b.style.color='var(--sub)'; b.style.borderColor='var(--border)';
  });
  btn.style.background = type==='danger' ? 'var(--red-glow)' : 'var(--yellow-glow)';
  btn.style.color  = type==='danger' ? 'var(--red)' : 'var(--yellow)';
  btn.style.borderColor = type==='danger' ? 'rgba(255,48,85,.4)' : 'rgba(255,184,0,.4)';
}
function submitReport() {
  const desc = document.getElementById('rep-desc').value.trim();
  if (!desc) { toast('⚠️ Please describe the incident', 'warn'); return; }
  closeReportModal();
  if (map && reportLat) {
    const icon = makeDot(reportType==='danger'?'#FF3055':'#FFB800', 14, false);
    L.marker([reportLat, reportLng], {icon}).addTo(map)
      .bindPopup(`<div class="pop-title">🆕 ${reportType==='danger'?'⚠️ Danger':'⚡ Caution'} Report</div><div class="pop-info">${desc}</div><span class="pop-chip ${reportType==='danger'?'chip-d':'chip-w'}">NEW REPORT</span>`)
      .openPopup();
    goTo('map');
  }
  toast('🚨 Incident reported to community!', reportType==='danger'?'danger':'warn');
}

// ════════════════════════════════════════════
//  FAKE CALL
// ════════════════════════════════════════════
let fakeCallInterval = null;
function startFakeCall() {
  const caller = CONTACTS[1] || CONTACTS[0];
  document.getElementById('fc-name').textContent = caller?.name || 'Mummy';
  document.getElementById('fc-av').textContent   = caller?.emoji || '👩';
  document.getElementById('fc-status').textContent = 'Incoming call…';
  toast('📞 Fake call in 5 seconds…', 'info');
  setTimeout(() => {
    document.getElementById('fake-call-screen').classList.add('open');
    playRing();
  }, 5000);
}
function acceptFakeCall() {
  stopRing();
  let s=0;
  document.getElementById('fc-status').textContent = 'Connected • 0:00';
  fakeCallInterval = setInterval(() => {
    s++; const m=Math.floor(s/60), sec=String(s%60).padStart(2,'0');
    document.getElementById('fc-status').textContent=`Connected • ${m}:${sec}`;
  },1000);
}
function endFakeCall() {
  stopRing(); clearInterval(fakeCallInterval);
  document.getElementById('fake-call-screen').classList.remove('open');
  document.getElementById('fc-status').textContent = 'Incoming call…';
}

// ════════════════════════════════════════════
//  ALERTS DATA
// ════════════════════════════════════════════
const ALERTS_DATA = [
  { type:'danger', title:'Eve-teasing – Sector Phi Market', desc:'Multiple reports of harassment near main gate. Avoid after 8 PM.', time:'2 hours ago', area:'Sector Phi' },
  { type:'danger', title:'Snatching – Kasna Road', desc:'Bag snatching on motorcycle near Kasna bus stop.', time:'5 hours ago', area:'Kasna' },
  { type:'caution', title:'Poor Lighting – Eco Tech I', desc:'Several street lights non-functional. Extra care after sunset.', time:'Yesterday', area:'Eco Tech' },
  { type:'safe',   title:'New CCTV – Alpha 1', desc:'Authority installed 48 new cameras. Area now fully covered.', time:'2 days ago', area:'Alpha 1' },
  { type:'caution', title:'Unknown persons – Sector 63 Park', desc:'Reported men loitering near park entrance at late hours.', time:'3 days ago', area:'Sector 63' },
  { type:'safe',   title:'Police Beat – Pari Chowk', desc:'Dedicated women safety patrol deployed at Pari Chowk.', time:'4 days ago', area:'Pari Chowk' },
  { type:'danger', title:'Assault attempt – Surajpur Bypass', desc:'Isolated stretch near bypass. Avoid solo travel at night.', time:'5 days ago', area:'Surajpur' },
];

function renderAlerts() {
  const c = document.getElementById('alerts-container');
  c.innerHTML = ALERTS_DATA.map(a => `
    <div class="alert-item">
      <div class="ai-dot ai-${a.type==='danger'?'d':a.type==='caution'?'w':'s'}"></div>
      <div class="ai-body">
        <div class="ai-title">${a.title}</div>
        <div class="ai-desc">${a.desc}</div>
        <div class="ai-meta">
          <span class="ai-time">⏱ ${a.time}</span>
          <span class="ai-loc">📍 ${a.area}</span>
        </div>
      </div>
    </div>`).join('');
}

// ════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════
function renderProfile() {
  PROFILE = loadProfile();
  const primary = loadContacts().find(c=>c.primary) || loadContacts()[0];
  document.getElementById('p-name-display').textContent  = PROFILE.name || 'SafeHer User';
  document.getElementById('p-email-display').textContent = PROFILE.email || APP_EMAIL;
  document.getElementById('p-sos-display').textContent   = `Primary SOS: ${primary ? formatPhone(primary.phone) : '—'}`;
}
function openEditProfile() {
  PROFILE = loadProfile();
  document.getElementById('p-name-input').value  = PROFILE.name  || '';
  document.getElementById('p-email-input').value = PROFILE.email || '';
  document.getElementById('profile-modal').classList.add('open');
}
function closeProfileModal() { document.getElementById('profile-modal').classList.remove('open'); }
function saveProfile() {
  const name  = document.getElementById('p-name-input').value.trim();
  const email = document.getElementById('p-email-input').value.trim();
  if (!name) { toast('⚠️ Name required', 'warn'); return; }
  saveProfileData({ name, email: email||APP_EMAIL });
  closeProfileModal();
  renderProfile();
  toast('✅ Profile saved!', 'success');
}

function sendTestAlert() {
  const primary = CONTACTS.find(c=>c.primary) || CONTACTS[0];
  if (!primary) { toast('⚠️ Add a guardian first', 'warn'); return; }
  const msg = encodeURIComponent(`🧪 SafeHer TEST ALERT\n📍 My location: ${googleMapsLink()}\n\nThis is a test — your SafeHer app is working correctly! 🌸`);
  window.location.href = `sms:${primary.phone}?body=${msg}`;
  toast('🧪 Test alert sent to '+primary.name, 'success');
}

// ════════════════════════════════════════════
//  AUDIO
// ════════════════════════════════════════════
function playSiren() {
  try {
    sirenCtx = new (window.AudioContext || window.webkitAudioContext)();
    sirenOsc = sirenCtx.createOscillator();
    const g = sirenCtx.createGain();
    sirenOsc.connect(g); g.connect(sirenCtx.destination);
    sirenOsc.type = 'sawtooth'; g.gain.value = 0.5;
    sirenOsc.frequency.setValueAtTime(600, sirenCtx.currentTime);
    sirenOsc.frequency.linearRampToValueAtTime(1100, sirenCtx.currentTime+0.5);
    sirenOsc.frequency.linearRampToValueAtTime(600, sirenCtx.currentTime+1.0);
    sirenOsc.frequency.linearRampToValueAtTime(1100, sirenCtx.currentTime+1.5);
    sirenOsc.frequency.linearRampToValueAtTime(600, sirenCtx.currentTime+2.0);
    sirenOsc.start(); sirenOsc.stop(sirenCtx.currentTime+2.1);
  } catch(e) {}
}

let ringOsc = null, ringCtx = null;
function playRing() {
  try {
    ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    function beep() {
      const o = ringCtx.createOscillator();
      const g = ringCtx.createGain();
      o.connect(g); g.connect(ringCtx.destination);
      o.type='sine'; o.frequency.value=880;
      g.gain.setValueAtTime(0.4, ringCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ringCtx.currentTime+0.3);
      o.start(); o.stop(ringCtx.currentTime+0.3);
    }
    let i=0; ringOsc = setInterval(()=>{ beep(); if(++i>20) stopRing(); },600);
  } catch(e) {}
}
function stopRing() { clearInterval(ringOsc); try{ ringCtx?.close(); }catch(e){} }

// ════════════════════════════════════════════
//  PWA INSTALL
// ════════════════════════════════════════════
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt=e; });
function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(()=>{ deferredPrompt=null; });
  } else {
    toast('📲 Open browser menu → "Add to Home Screen"', 'info');
  }
}

// ════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  startGPS();
  renderProfile();

  // PWA manifest
  const manifest={name:"SafeHer – Women's Safety",short_name:"SafeHer",start_url:"./",display:"standalone",background_color:"#0C0C12",theme_color:"#FF3055",orientation:"portrait"};
  const bl=new Blob([JSON.stringify(manifest)],{type:'application/json'});
  const lk=document.createElement('link'); lk.rel='manifest'; lk.href=URL.createObjectURL(bl);
  document.head.appendChild(lk);

  // Service worker for offline
  if('serviceWorker' in navigator){
    const sw=`const C='sh-v2';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['./','/']))));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('./')))));`;
    const swB=new Blob([sw],{type:'application/javascript'});
    navigator.serviceWorker.register(URL.createObjectURL(swB)).catch(()=>{});
  }

  setTimeout(()=>toast('📲 Tip: Browser menu → Add to Home Screen to install!','info'),8000);
});

// Prevent double-tap zoom
document.addEventListener('touchend', e => {
  if (e.timeStamp - (window.__lastTap||0) < 400) e.preventDefault();
  window.__lastTap = e.timeStamp;
}, {passive:false});