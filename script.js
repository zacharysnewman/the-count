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

playerNameDisplay.textContent = playerName + ' \u2699';

// --- Ensure only integers can be typed ---
numberInput.addEventListener('input', () => {
  numberInput.value = numberInput.value.replace(/\D/g, '');
});

function connect() {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => { 
	showMsg('Connected', false, true); // green for connected
	updateSubmitButton(); 
  };
  ws.onclose = () => { 
	showMsg('Disconnected — reconnecting...', true); // red for disconnected
	setTimeout(connect, 1000 + Math.random() * 1000); 
  };
  ws.onerror = () => showMsg('Connection error', true);

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

function applyState(state) {
  counterEl.textContent = state.counter;

  const rows = (state.leaderboard || []);
  boardTbody.innerHTML = '';
  rows.forEach((r, idx) => {
	const displayId = r.uuid === myUuid ? 'You' : r.uuid.slice(0,8);
	const tr = document.createElement('tr');
	tr.innerHTML = `<td>${idx + 1}</td><td>${displayId}</td><td>${r.playerName}</td><td>${r.score}</td>`;
	boardTbody.appendChild(tr);
  });

  if (state.playerUuid === myUuid && state.cooldownEnd) {
	cooldownEnd = state.cooldownEnd;
	startCooldownTimer();
  }

  updateSubmitButton();
}

function showMsg(text, isError = false, isSuccess = false) {
  if (!text) { 
	msgEl.style.display = 'none'; 
	return; 
  }

  // Apply proper class
  if (isError) {
	msgEl.className = 'msg err';
  } else if (isSuccess) {
	msgEl.className = 'msg success';
  } else {
	msgEl.className = 'msg';
  }

  msgEl.textContent = text;
  msgEl.style.display = 'block';

  setTimeout(() => { msgEl.style.display = 'none'; }, 3500);
}

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
};

window.onclick = (e) => { 
  if (e.target === nameModal) nameModal.style.display = 'none'; 
};

connect();
