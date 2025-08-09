const socket = io();

const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('name');
const roomInput = document.getElementById('room');
const passInput = document.getElementById('password');
const roomLabel = document.getElementById('roomLabel');
const status = document.getElementById('status');

const messagesEl = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');

function appendMessage(data, mine=false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'msg ' + (mine ? 'me' : 'other');

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${data.sender} • ${new Date(data.timestamp * 1000).toLocaleTimeString()}`;
  wrapper.appendChild(meta);

  const text = document.createElement('div');
  text.textContent = data.plaintext;
  wrapper.appendChild(text);

  const enc = document.createElement('div');
  enc.className = 'encrypted';
  enc.textContent = `stored (base64): ${data.encrypted}`;
  wrapper.appendChild(enc);

  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Anonymous';
  const room = roomInput.value.trim() || 'lobby';
  const password = passInput.value || '';

  socket.emit('join', { name, room, password });
  roomLabel.textContent = `Room: ${room}`;
  status.textContent = 'Joined';
  msgInput.disabled = false;
  sendBtn.disabled = false;
});

sendBtn.addEventListener('click', () => {
  const txt = msgInput.value.trim();
  if (!txt) return;
  socket.emit('send_message', { message: txt });
  msgInput.value = '';
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

socket.on('joined', (data) => {
  // show history (server already decrypted with derived key on server side)
  messagesEl.innerHTML = '';
  const history = data.history || [];
  history.forEach(h => appendMessage(h, false));
});

socket.on('message', (data) => {
  // data: { sender, plaintext, encrypted, iv, timestamp }
  const mine = (data.sender === nameInput.value.trim());
  appendMessage(data, mine);
});

socket.on('status', (d) => {
  // small status messages
  const el = document.createElement('div');
  el.className = 'small';
  el.style.padding = '6px';
  el.style.opacity = '0.8';
  el.textContent = d.msg;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

socket.on('error', (d) => {
  alert(d.msg || 'Error');
});
