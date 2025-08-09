from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding, hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import os, base64, time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dev-secret-key'  # fine for demo
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# In-memory storage for demo: { room_name: [ {sender, enc, iv, ts} ] }
room_messages = {}
# Map socket sid to derived key and room for convenience: { sid: {key, room, name} }
session_keys = {}

# --- Crypto helpers ---
def derive_key(password: str, salt: bytes) -> bytes:
    """Derive a 32-byte key from password and salt using PBKDF2-HMAC-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100_000,
    )
    return kdf.derive(password.encode())

def encrypt_aes_cbc(key: bytes, plaintext: str) -> (bytes, bytes):
    """Return (iv, ciphertext) where both are raw bytes."""
    iv = os.urandom(16)
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode()) + padder.finalize()
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ct = encryptor.update(padded) + encryptor.finalize()
    return iv, ct

def decrypt_aes_cbc(key: bytes, iv: bytes, ciphertext: bytes) -> str:
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    data = unpadder.update(padded) + unpadder.finalize()
    return data.decode()

# --- Routes ---
@app.route('/')
def index():
    return render_template('index.html')

# --- Socket handlers ---
@socketio.on('join')
def on_join(data):
    """
    data = { 'name': str, 'room': str, 'password': str }
    We derive a key per user session using a deterministic salt per room for demo.
    """
    name = data.get('name', 'Anonymous')
    room = data.get('room', 'lobby')
    password = data.get('password', 'demo-pass')

    # For demo: use deterministic room salt so people joining same room with same password derive same key.
    # In a real system you'd use a secure key exchange.
    salt = (room + "_salt_demo").encode()[:16].ljust(16, b'\0')  # 16 bytes
    key = derive_key(password, salt)

    session_keys[request.sid] = {'key': key, 'room': room, 'name': name}
    join_room(room)

    # ensure room message list
    msgs = room_messages.get(room, [])
    # Send last few messages (showing encrypted blobs) so new user sees stored encrypted entries
    history = []
    for m in msgs[-30:]:
        history.append({
            'sender': m['sender'],
            'plaintext': decrypt_aes_cbc(key, base64.b64decode(m['iv']), base64.b64decode(m['enc'])),
            'encrypted': m['enc'],
            'timestamp': m['ts']
        })

    emit('joined', {'room': room, 'name': name, 'history': history}, room=request.sid)
    emit('status', {'msg': f"{name} has joined the room."}, room=room)

@socketio.on('send_message')
def on_send_message(data):
    """
    data = { 'message': str }
    Server will encrypt message for storage, store encrypted blob, then broadcast plaintext and encrypted blob for demo.
    """
    sid = request.sid
    session = session_keys.get(sid)
    if not session:
        emit('error', {'msg': 'Session not initialized. Join room first.'}, room=sid)
        return

    key = session['key']
    room = session['room']
    name = session['name']
    message = data.get('message', '')

    # encrypt and store
    iv, ct = encrypt_aes_cbc(key, message)
    enc_b64 = base64.b64encode(ct).decode()
    iv_b64 = base64.b64encode(iv).decode()
    ts = int(time.time())

    entry = {'sender': name, 'enc': enc_b64, 'iv': iv_b64, 'ts': ts}
    room_messages.setdefault(room, []).append(entry)

    # For demo: decrypt with the same key and broadcast both readable and stored encrypted form
    plaintext = decrypt_aes_cbc(key, iv, ct)

    emit('message', {
        'sender': name,
        'plaintext': plaintext,
        'encrypted': enc_b64,
        'iv': iv_b64,
        'timestamp': ts
    }, room=room)

@socketio.on('disconnect')
def on_disconnect():
    session = session_keys.pop(request.sid, None)
    if session:
        emit('status', {'msg': f"{session['name']} disconnected."}, room=session['room'])

if __name__ == '__main__':
    # use eventlet for SocketIO
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
