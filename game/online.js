/**
 * Gerenciador de Conexão Peer-to-Peer (Online)
 * Compatível com deploy na Vercel (PeerJS via CDN global)
 */

let peer = null;
let conn = null;
let _isHost = false;
let _onConnectionSuccess = null;
let _onDataReceived = null;
let _onPeerError = null;

let _pendingRemoteId = null;

// Garante que PeerJS esteja disponível (carregado via CDN no HTML)
function getPeerClass() {
  if (typeof Peer === 'undefined') {
    console.error('[Online] PeerJS não encontrado! Verifique o script CDN no index.html.');
    return null;
  }
  return Peer;
}

export function initOnlineSystem({ onConnectionSuccess, onDataReceived, onPeerError }) {
  _onConnectionSuccess = onConnectionSuccess;
  _onDataReceived = onDataReceived;
  _onPeerError = onPeerError;

  const PeerClass = getPeerClass();
  if (!PeerClass) {
    onPeerError?.({ message: 'PeerJS não carregado. Verifique sua conexão.' });
    return;
  }

  // Destrói peer anterior se existir
  if (peer) {
    try { peer.destroy(); } catch (_) {}
    peer = null;
    conn = null;
  }
  _pendingRemoteId = null;

  const randomId = Math.floor(1000 + Math.random() * 9000);
  const peerId = `MAMO-${randomId}`;

  try {
    peer = new PeerClass(peerId, {
      debug: 0, // Silencioso em produção
      // Explicita servidor de sinalização HTTPS/WSS (mais previsível em deploys)
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      path: '/',
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },

          // TURN público (openrelay) — melhora bastante em NAT restrito/VPN/4G.
          // Obs: serviços públicos podem ter instabilidade/limites.
          {
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp',
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
        ]
      }
    });
  } catch (err) {
    console.error('[Online] Falha ao criar Peer:', err);
    onPeerError?.(err);
    return;
  }

  peer.on('open', (id) => {
    console.log('[Online] Meu ID Peer:', id);
    const el = document.getElementById('myPeerId');
    if (el) {
      el.textContent = id;
      el.classList.add('ready');
    }

    // Se o usuário clicou em conectar antes do peer abrir, tenta agora com pequeno atraso
    if (_pendingRemoteId) {
      const remoteId = _pendingRemoteId;
      _pendingRemoteId = null;
      setTimeout(() => {
        connectToPeer(remoteId, { onConnectionSuccess, onDataReceived });
      }, 300);
    }
  });

  // Escuta por conexões de entrada (Host)
  peer.on('connection', (connection) => {
    // Se já tiver uma conexão aberta, fecha a nova para evitar bugs de estado duplo
    if (conn && conn.open) {
      console.warn('[Online] Bloqueando conexão duplicada.');
      connection.close();
      return;
    }
    conn = connection;
    _isHost = true;
    setupConnection(onConnectionSuccess, onDataReceived);
  });

  peer.on('error', (err) => {
    console.error('[Online] Erro crítico no PeerJS:', err.type, err);
    
    // Tratamento amigável de erros comuns
    let msg = 'Erro na conexão online';
    if (err.type === 'peer-unavailable') {
      msg = 'O código do seu amigo não foi encontrado. Verifique se ele está com a tela aberta.';
    } else if (err.type === 'webrtc') {
      msg = 'Bloqueio de rede detectado (NAT/Firewall). Tente usar 4G ou outra rede.';
    } else if (err.type === 'unavailable-id') {
      msg = 'ID indisponível. Reiniciando sistema...';
      setTimeout(() => initOnlineSystem({ onConnectionSuccess, onDataReceived, onPeerError }), 1000);
    } else if (err.type === 'server-error' || err.type === 'network') {
      msg = 'Falha no servidor de sinalização. Tentando reconectar...';
    }
    
    onPeerError?.({ ...err, message: msg });
  });

  peer.on('disconnected', () => {
    console.warn('[Online] Desconectado do servidor. Tentando reconectar em 3s...');
    setTimeout(() => {
      if (peer && !peer.destroyed) {
        try { peer.reconnect(); } catch (_) {}
      }
    }, 3000);
  });
}

export function connectToPeer(remoteId, { onConnectionSuccess, onDataReceived }) {
  const trimmedId = remoteId?.trim() || '';
  if (!trimmedId) {
    _onPeerError?.({ message: 'O ID não pode estar vazio.' });
    return;
  }

  if (!peer) {
    console.error('[Online] Sistema não inicializado.');
    return;
  }

  // Se o Peer ainda não abriu no servidor, guardamos o ID para conectar automático
  if (!peer.open) {
    _pendingRemoteId = trimmedId;
    console.log('[Online] Aguardando Peer abrir para conectar ao ID:', trimmedId);
    return;
  }

  // Evita conectar no próprio ID (acontece quando a pessoa testa na mesma aba).
  if (peer?.id && trimmedId === peer.id) {
    console.warn('[Online] Tentativa de auto-conexão bloqueada.');
    _onPeerError?.({ message: 'Use o código do seu amigo (não o seu).' });
    return;
  }

  // Fecha conexão existente se houver
  if (conn) {
    try { conn.close(); } catch (_) {}
    conn = null;
  }

  console.log('[Online] Conectando ao peer:', trimmedId);
  try {
    conn = peer.connect(trimmedId, { reliable: true });
    _isHost = false;
    setupConnection(onConnectionSuccess, onDataReceived);
  } catch (err) {
    console.error('[Online] Falha ao conectar:', err);
    onDataReceived?.({ type: 'error', message: 'Falha ao conectar.' });
  }
}

function setupConnection(onSuccess, onData) {
  if (!conn) return;

  conn.on('open', () => {
    console.log('[Online] Conexão estabelecida! isHost:', _isHost);
    onSuccess?.({ isHost: _isHost });
    conn.send({ type: 'ready', isHost: _isHost });
  });

  conn.on('data', (data) => {
    try {
      onData?.(data);
    } catch (err) {
      console.error('[Online] Erro ao processar dados recebidos:', err);
    }
  });

  conn.on('close', () => {
    console.warn('[Online] Conexão fechada pelo parceiro.');
    conn = null;
    // Dispara evento para que o jogo exiba mensagem sem recarregar
    window.dispatchEvent(new CustomEvent('online:disconnected'));
  });

  conn.on('error', (err) => {
    console.error('[Online] Erro na conexão:', err);
    window.dispatchEvent(new CustomEvent('online:error', { detail: err }));
  });
}

export function sendGameData(data) {
  if (conn && conn.open) {
    try {
      conn.send(data);
    } catch (err) {
      console.warn('[Online] Falha ao enviar dados:', err);
    }
  }
}

export function getIsHost() {
  return _isHost;
}

export function destroyOnlineSession() {
  if (conn) {
    try { conn.close(); } catch (_) {}
    conn = null;
  }
  if (peer) {
    try { peer.destroy(); } catch (_) {}
    peer = null;
  }
  _isHost = false;
  _pendingRemoteId = null;
}
