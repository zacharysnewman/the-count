const wsUrl = "wss://the-count-backend.onrender.com/ws";
let ws;
let myUuid = null;
let cooldownEnd = 0;
let cooldownTimer = null;

let playerName = localStorage.getItem('playerName') || 'User';

// The player key is the identity. It lives only here and in the player's
// other browsers — the server stores a hash and cannot ever send it back.
let playerKey = localStorage.getItem('playerKey') || '';

const counterEl = document.getElementById('counter');
const numberInput = document.getElementById('numberInput');
const submitBtn = document.getElementById('submitBtn');
const msgEl = document.getElementById('message');
const boardTbody = document.querySelector('#board tbody');
const playerNameDisplay = document.getElementById('playerNameDisplay');
const nameModal = document.getElementById('nameModal');
const nameModalInput = document.getElementById('nameModalInput');
const nameModalSave = document.getElementById('nameModalSave');

// Admin tools elements
const adminToolsBtn = document.getElementById('adminToolsBtn');
const adminModal = document.getElementById('adminModal');
const resetCounterBtn = document.getElementById('resetCounterBtn');
const clearLeaderboardBtn = document.getElementById('clearLeaderboardBtn');
const removePlayerInput = document.getElementById('removePlayerInput');
const removePlayerBtn = document.getElementById('removePlayerBtn');
const adminTokenInput = document.getElementById('adminTokenInput');
const adminCloseBtn = document.getElementById('adminCloseBtn');

// Player key elements
const keyBtn = document.getElementById('keyBtn');
const keyModal = document.getElementById('keyModal');
const keyDisplay = document.getElementById('keyDisplay');
const keyRevealBtn = document.getElementById('keyRevealBtn');
const keyCopyBtn = document.getElementById('keyCopyBtn');
const keyInput = document.getElementById('keyInput');
const keyUseBtn = document.getElementById('keyUseBtn');
const keyRotateBtn = document.getElementById('keyRotateBtn');
const keyCloseBtn = document.getElementById('keyCloseBtn');

playerNameDisplay.textContent = playerName + ' \u2699';

// --- Ensure only integers can be typed ---
numberInput.addEventListener('input', () => {
  numberInput.value = numberInput.value.replace(/\D/g, '');
});

// --- Connection status tracking ---
let connectionStatus = false; // true = connected
let statusTimeout = null;

function showMsg(text, isError = false, isSuccess = false, duration = 3500) {
  clearTimeout(statusTimeout);

  if (!text) { 
	// Show connection status
	msgEl.className = connectionStatus ? 'msg success' : 'msg err';
	msgEl.textContent = connectionStatus ? 'Connected' : 'Disconnected';
	msgEl.style.display = 'block';
	return;
  }

  if (isError) {
	msgEl.className = 'msg err';
  } else if (isSuccess) {
	msgEl.className = 'msg success';
  } else {
	msgEl.className = 'msg';
  }

  msgEl.textContent = text;
  msgEl.style.display = 'block';

  statusTimeout = setTimeout(() => {
	msgEl.style.display = 'block';
	msgEl.className = connectionStatus ? 'msg success' : 'msg err';
	msgEl.textContent = connectionStatus ? 'Connected' : 'Disconnected';
  }, duration);
}

// --- WebSocket connection ---
function connect() {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
	connectionStatus = true;
	showMsg('Connected', false, true);
	// Identity is established by the first message, not by the connection.
	ws.send(JSON.stringify(playerKey ? { action: 'hello', playerKey } : { action: 'hello' }));
	updateSubmitButton();
  };

  ws.onclose = () => { 
	connectionStatus = false;
	showMsg('Disconnected — reconnecting...', true); 
	setTimeout(connect, 1000 + Math.random() * 1000); 
  };

  ws.onerror = () => {
	connectionStatus = false;
	showMsg('Connection error', true);
  };

  ws.onmessage = ev => {
	let payload;
	try { payload = JSON.parse(ev.data); } catch { return; }

	if (payload.type === 'you') {
	  // Personal state: only the submitter is told anything happened.
	  if (typeof payload.cooldownEnd === 'number') {
		cooldownEnd = payload.cooldownEnd;
		updateSubmitButton();
		startCooldownTimer();
	  }
	  return;
	}

	if (payload.type === 'init') {
	  myUuid = payload.yourUuid;
	  // Only ever sent once, when a key is minted. Save it immediately —
	  // the server keeps a hash and cannot reissue this.
	  if (payload.playerKey) savePlayerKey(payload.playerKey);
	  applyState(payload);
	} else if (payload.type === 'keyRotated') {
	  savePlayerKey(payload.playerKey);
	  showMsg('New key saved. The old one no longer works.', false, true);
	} else if (payload.type === 'state') {
	  applyState(payload);
	} else if (payload.type === 'error') {
	  showMsg(payload.message || 'Error', true);
	  // A key we no longer recognise would otherwise wedge every reconnect in
	  // a rejection loop, so drop it and come back as a new player.
	  if (payload.error === 'unknown_key' || payload.error === 'invalid_key') {
		savePlayerKey('');
		showMsg('That key was not recognised — starting a new player.', true);
		ws.close();
	  }
	  // A rejected submission still costs a cooldown, so the button has to
	  // reflect it — otherwise the player just gets "please wait" on every
	  // retry with no visible reason.
	  if (typeof payload.cooldownEnd === 'number') {
		cooldownEnd = payload.cooldownEnd;
		updateSubmitButton();
		startCooldownTimer();
	  }
	}
  };
}

/**
 * The number to enter arrives as an SVG image; its value is never sent.
 *
 * The image shows the goal directly, not the current count, so the player types
 * what they read rather than doing arithmetic on it.
 *
 * Rendered through an <img> data URI rather than innerHTML: SVG inside an
 * <img> cannot execute script, so even though this markup comes from our own
 * server there is no path from a bad frame to code execution.
 */
function renderTargetImage(svg, containerEl) {
  if (typeof svg !== 'string' || !svg.startsWith('<svg')) return;
  let img = containerEl.querySelector('img.counterImg');
  if (!img) {
	containerEl.innerHTML = '';
	img = document.createElement('img');
	img.className = 'counterImg';
	img.alt = 'The current count';
	containerEl.appendChild(img);
  }
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// --- Update counter and leaderboard ---
function applyState(state) {
  if (state.targetImage) renderTargetImage(state.targetImage, counterEl);

  const rows = (state.leaderboard || []);
  boardTbody.innerHTML = '';

  rows.forEach((r, idx) => {
	const displayId = r.uuid === myUuid ? 'You' : r.uuid.slice(0,8);
	const tr = document.createElement('tr');

	// Cells are built with textContent, never innerHTML. playerName is
	// attacker-controlled: it comes from another player, through the server,
	// to every client. Interpolating it into an HTML string made any name a
	// stored XSS payload executing in every viewer's browser. The server also
	// strips markup characters now, but this is the layer that has to be right
	// — it is the one that decides whether the value is code or text.
	const cells = [String(idx + 1), displayId, r.playerName, String(r.score)];
	cells.forEach((value, cellIdx) => {
	  const td = document.createElement('td');
	  td.textContent = value;
	  if (cellIdx === 1) td.className = 'uuidCell';
	  tr.appendChild(td);
	});

	// Admin: copy full UUID on click
	if (playerName === "Admin" && r.uuid !== myUuid) {
	  const uuidCell = tr.querySelector('.uuidCell');
	  uuidCell.style.cursor = "pointer";
	  uuidCell.title = "Click to copy full UUID";
	  uuidCell.onclick = () => {
		navigator.clipboard.writeText(r.uuid)
		  .then(() => showMsg(`Copied UUID ${r.uuid} to clipboard`, false, true))
		  .catch(() => showMsg('Failed to copy UUID', true));
	  };
	}

	boardTbody.appendChild(tr);
  });

  updateSubmitButton();
}

// --- Submit handling ---
function updateSubmitButton() {
  const now = Date.now();
  const remaining = Math.max(0, cooldownEnd - now);
  if (remaining > 0) {
	submitBtn.disabled = true;
	submitBtn.textContent = `Wait ${Math.ceil(remaining/1000)}s`;
  } else {
	submitBtn.disabled = false;
	submitBtn.textContent = 'Submit';
  }
}

function startCooldownTimer() {
  if (cooldownTimer) return;
  cooldownTimer = setInterval(() => {
	updateSubmitButton();
	if (Date.now() >= cooldownEnd) {
	  clearInterval(cooldownTimer);
	  cooldownTimer = null;
	  updateSubmitButton();
	}
  }, 200);
}

submitBtn.onclick = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) { 
	showMsg('Not connected', true); 
	return; 
  }
  const num = Number(numberInput.value);
  if (!Number.isInteger(num)) { 
	showMsg('Enter a valid integer', true); 
	return; 
  }
  ws.send(JSON.stringify({ action:'submit', number: num, playerName }));
  numberInput.value = '';
};

// --- Player key ---
function savePlayerKey(key) {
  playerKey = key || '';
  if (playerKey) {
	localStorage.setItem('playerKey', playerKey);
  } else {
	localStorage.removeItem('playerKey');
  }
  keyDisplay.value = playerKey;
}

keyBtn.onclick = () => {
  keyDisplay.value = playerKey;
  keyDisplay.type = 'password';
  keyRevealBtn.textContent = 'Show';
  keyInput.value = '';
  keyModal.style.display = 'flex';
};

keyRevealBtn.onclick = () => {
  const hidden = keyDisplay.type === 'password';
  keyDisplay.type = hidden ? 'text' : 'password';
  keyRevealBtn.textContent = hidden ? 'Hide' : 'Show';
};

keyCopyBtn.onclick = () => {
  if (!playerKey) { showMsg('No key yet', true); return; }
  navigator.clipboard.writeText(playerKey)
	.then(() => showMsg('Key copied to clipboard', false, true))
	.catch(() => showMsg('Could not copy — reveal it and copy by hand', true));
};

keyUseBtn.onclick = () => {
  const pasted = keyInput.value.trim();
  if (!pasted) { showMsg('Paste a key first', true); return; }
  savePlayerKey(pasted);
  keyModal.style.display = 'none';
  showMsg('Switching player...', false, true);
  // Identity is fixed for the life of a connection, so reconnect to adopt it.
  ws.close();
};

keyRotateBtn.onclick = () => {
  if (!confirm('Replace your key? The current one will stop working everywhere.')) return;
  ws.send(JSON.stringify({ action: 'rotateKey' }));
};

keyCloseBtn.onclick = () => keyModal.style.display = 'none';

// --- Name modal ---
playerNameDisplay.onclick = () => {
  nameModalInput.value = playerName;
  nameModal.style.display = 'flex';
  nameModalInput.focus();
};

nameModalSave.onclick = () => {
  playerName = nameModalInput.value.trim() || 'User';
  localStorage.setItem('playerName', playerName);
  playerNameDisplay.textContent = playerName + ' \u2699';
  nameModal.style.display = 'none';
  checkAdminTools();
};

// --- Admin tools ---
function checkAdminTools() {
  if (playerName === "Admin") {
	adminToolsBtn.style.display = "block";
  } else {
	adminToolsBtn.style.display = "none";
  }
}

adminToolsBtn.onclick = () => adminModal.style.display = "flex";
adminCloseBtn.onclick = () => adminModal.style.display = "none";

// Admin authorisation is a server-side token, not an IP or a display name.
// Nothing here grants anything: the server rejects any admin command whose
// token does not match, so this input is a convenience, not a control.
function adminToken() {
  return (adminTokenInput && adminTokenInput.value.trim()) || '';
}

resetCounterBtn.onclick = () => {
  ws.send(JSON.stringify({ action: "admin:resetCounter", adminToken: adminToken() }));
  showMsg("Sent reset counter command", false, true);
};

clearLeaderboardBtn.onclick = () => {
  ws.send(JSON.stringify({ action: "admin:clearLeaderboard", adminToken: adminToken() }));
  showMsg("Sent clear leaderboard command", false, true);
};

removePlayerBtn.onclick = () => {
  const target = removePlayerInput.value.trim();
  if (!target) {
	showMsg("Enter target UUID", true);
	return;
  }
  ws.send(JSON.stringify({ action: "admin:removePlayer", targetUuid: target, adminToken: adminToken() }));
  showMsg(`Sent remove player command for ${target}`, false, true);
  removePlayerInput.value = "";
};

// --- Window click handler ---
window.onclick = (e) => {
  if (e.target === nameModal) nameModal.style.display = 'none'; 
  if (e.target === adminModal) adminModal.style.display = 'none';
  if (e.target === keyModal) keyModal.style.display = 'none';
};

// --- Initialize ---
checkAdminTools();
connect();
showMsg(); // initialize to show current connection status
