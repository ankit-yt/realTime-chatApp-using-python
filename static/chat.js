const socket = io({
  transports: ['websocket', 'polling']
});

const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('name');
const roomInput = document.getElementById('room');
const passInput = document.getElementById('password');
const roomLabel = document.getElementById('roomLabel');
const status = document.getElementById('status');

const messagesEl = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');

// Connection status
socket.on('connect', () => {
  console.log('Connected to server');
  status.textContent = 'Connected';
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  status.textContent = 'Disconnected';
  msgInput.disabled = true;
  sendBtn.disabled = true;
});

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

  console.log('Attempting to join:', { name, room, password: '***' });
  socket.emit('join', { name, room, password });
  status.textContent = 'Joining...';
});

sendBtn.addEventListener('click', () => {
  const txt = msgInput.value.trim();
  if (!txt) return;
  console.log('Sending message:', txt);
  socket.emit('send_message', { message: txt });
  msgInput.value = '';
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

socket.on('joined', (data) => {
  console.log('Successfully joined room:', data);
  roomLabel.textContent = `Room: ${data.room}`;
  status.textContent = 'Joined';
  msgInput.disabled = false;
  sendBtn.disabled = false;
  
  // show history (server already decrypted with derived key on server side)
  messagesEl.innerHTML = '';
  const history = data.history || [];
  history.forEach(h => appendMessage(h, false));
});

socket.on('message', (data) => {
  console.log('Received message:', data);
  // data: { sender, plaintext, encrypted, iv, timestamp }
  const mine = (data.sender === nameInput.value.trim());
  appendMessage(data, mine);
});

socket.on('status', (d) => {
  console.log('Status update:', d);
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
  console.error('Socket error:', d);
  alert(d.msg || 'Error');
  status.textContent = 'Error';
});
