const fs = require('fs');
const path = 'c:\\Users\\Dell\\Desktop\\Her Safety\\Her Safety Software\\index.html';
let html = fs.readFileSync(path, 'utf8');

// Remove the OLD Telegram modal (the second one, starting with <!-- TELEGRAM SETUP MODAL -->)
const oldMarker = '<!-- TELEGRAM SETUP MODAL -->';
const idx = html.indexOf(oldMarker);
if (idx === -1) { console.log('Old modal not found'); process.exit(0); }

// Find its end by counting div depth
let i = idx, depth = 0, started = false;
while (i < html.length) {
  if (html[i] === '<' && html.slice(i,i+5) === '<div ') { depth++; started = true; }
  else if (html[i] === '<' && html.slice(i,i+6) === '</div>') {
    if (started) { depth--; if (depth === 0) { i += 6; break; } }
  }
  i++;
}
// skip trailing newlines
while (i < html.length && (html[i] === '\r' || html[i] === '\n')) i++;

html = html.slice(0, idx) + html.slice(i);
fs.writeFileSync(path, html, 'utf8');
console.log('Old Telegram modal removed');
