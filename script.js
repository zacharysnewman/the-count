const wsUrl = "wss://the-count-backend.onrender.com/ws";
let ws;
let myUuid = null;
let cooldownEnd = 0;
let cooldownTimer = null;

let playerName = localStorage.getItem('playerName') || 'User';

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
const adminCloseBtn = document.getElementById('adminCloseBtn');

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

    if (payload.type === 'init') {
      myUuid = payload.yourUuid;
      applyState(payload);
    } else if (payload.type === 'state') {
      applyState(payload);
    } else if (payload.type === 'error') {
      showMsg(payload.message || 'Error', true);
    }
  };
}

// --- Update counter and leaderboard ---
function applyState(state) {
  counterEl.textContent = state.counter;

  const rows = (state.leaderboard || []);
  boardTbody.innerHTML = '';

  rows.forEach((r, idx) => {
    const displayId = r.uuid === myUuid ? 'You' : r.uuid.slice(0,8);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx + 1}</td><td class="uuidCell">${displayId}</td><td>${r.playerName}</td><td>${r.score}</td>`;

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

  if (state.playerUuid === myUuid && state.cooldownEnd) {
    cooldownEnd = state.cooldownEnd;
    startCooldownTimer();
  }

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

resetCounterBtn.onclick = () => {
  ws.send(JSON.stringify({ action: "admin:resetCounter" }));
  showMsg("Sent reset counter command", false, true);
};

clearLeaderboardBtn.onclick = () => {
  ws.send(JSON.stringify({ action: "admin:clearLeaderboard" }));
  showMsg("Sent clear leaderboard command", false, true);
};

removePlayerBtn.onclick = () => {
  const target = removePlayerInput.value.trim();
  if (!target) {
    showMsg("Enter target UUID", true);
    return;
  }
  ws.send(JSON.stringify({ action: "admin:removePlayer", targetUuid: target }));
  showMsg(`Sent remove player command for ${target}`, false, true);
  removePlayerInput.value = "";
};

// --- Window click handler ---
window.onclick = (e) => {
  if (e.target === nameModal) nameModal.style.display = 'none'; 
  if (e.target === adminModal) adminModal.style.display = 'none';
};

// --- Initialize ---
checkAdminTools();
connect();
showMsg(); // initialize to show current connection status
