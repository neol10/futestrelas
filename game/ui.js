import { createInitialConfig } from './config.js';

export function createUI({ teams, flags, onGoConfig, onBackToMenu, onRestart, onStartMatch }) {
  const els = {
    screenMenu: document.getElementById('screenMenu'),
    screenConfig: document.getElementById('screenConfig'),
    screenGame: document.getElementById('screenGame'),

    p1TeamList: document.getElementById('p1TeamList'),
    p2TeamList: document.getElementById('p2TeamList'),

    btnGoConfig: document.getElementById('btnGoConfig'),
    btnStartQuickMatch: document.getElementById('btnStartQuickMatch'),
    btnStartMatch: document.getElementById('btnStartMatch'),
    btnFullscreen: document.getElementById('btnFullscreen'),
    btnOpenOnline: document.getElementById('btnOpenOnline'),
    btnOnlineBack: document.getElementById('btnOnlineBack'),
    btnCopyId: document.getElementById('btnCopyId'),
    btnConnect: document.getElementById('btnConnect'),
    screenOnline: document.getElementById('screenOnline'),
    myPeerId: document.getElementById('myPeerId'),
    remotePeerId: document.getElementById('remotePeerId'),

    controlMode: document.getElementById('controlMode'),
    dribbleAssist: document.getElementById('dribbleAssist'),
    matchTime: document.getElementById('matchTime'),
    maxGoals: document.getElementById('maxGoals'),
    botsPerTeam: document.getElementById('botsPerTeam'),
    powerUpsEnabled: document.getElementById('powerUpsEnabled'),
    powerSpawnInterval: document.getElementById('powerSpawnInterval'),
    powerDuration: document.getElementById('powerDuration'),
    goalieAuto: document.getElementById('goalieAuto'),
    soundEnabled: document.getElementById('soundEnabled'),
    gameSpeed: document.getElementById('gameSpeed'),
    difficulty: document.getElementById('difficulty'),
    botDifficulty: document.getElementById('botDifficulty'),
    goalieDifficulty: document.getElementById('goalieDifficulty'),
    weatherMode: document.getElementById('weatherMode'),

    powerSpawnIntervalValue: document.getElementById('powerSpawnIntervalValue'),
    powerDurationValue: document.getElementById('powerDurationValue'),
    gameSpeedValue: document.getElementById('gameSpeedValue'),

    btnBack: document.getElementById('btnBack'),
    btnRestart: document.getElementById('btnRestart'),

    hudScore: document.getElementById('hudScore'),
    hudTime: document.getElementById('hudTime'),
    scoreValue: document.getElementById('scoreValue'),
    hudTurn: document.getElementById('hudTurn'),
    p1Label: document.getElementById('p1Label'),
    p2Label: document.getElementById('p2Label'),

    popStack: document.getElementById('popStack'),
    toast: document.getElementById('toast'),
  };

  let selectedP1 = teams[0];
  let selectedP2 = teams[1];

  function fillTeams() {
    renderTeamList(els.p1TeamList, 1);
    renderTeamList(els.p2TeamList, 2);
  }

  function renderTeamList(container, playerNum) {
    if (!container) return;
    container.innerHTML = '';
    teams.forEach((team) => {
      const flag = flags[team] || '\ud83c\udff3\ufe0f';
      const card = document.createElement('div');
      card.className = `teamCard ${ (playerNum === 1 ? selectedP1 : selectedP2) === team ? 'selected' : '' }`;
      card.innerHTML = `
        <div class="teamCard-inner">
          <span class="flag">${flag}</span>
          <span class="name">${team}</span>
        </div>
        <div class="selection-indicator"></div>
      `;
      card.onclick = () => selectTeam(playerNum, team);
      container.appendChild(card);
    });
  }

  function selectTeam(playerNum, team, remote = false) {
    // No online, Host só escolhe J1 e Cliente só escolhe J2
    const isOnline = els.screenOnline.style.display !== 'none' || els.screenConfig.style.display !== 'none';
    if (isOnline && !remote) {
      const isHost = !els.btnStartMatch.classList.contains('client-wait');
      if (isHost && playerNum === 2) return toast('Você é o J1. O oponente escolhe o J2.', 1500);
      if (!isHost && playerNum === 1) return toast('Você é o J2. O host escolhe o J1.', 1500);
    }

    if (playerNum === 1) {
      if (team === selectedP2) {
        toast('Este time já foi escolhido pelo oponente', 800);
        return;
      }
      selectedP1 = team;
    } else {
      if (team === selectedP1) {
        toast('Este time já foi escolhido pelo oponente', 800);
        return;
      }
      selectedP2 = team;
    }
    
    fillTeams();

    // Notifica o sistema de que houve uma mudança na seleção (apenas se for local)
    if (!remote) {
      document.dispatchEvent(new CustomEvent('ui:team-selected', { 
        detail: { playerNum, team } 
      }));
    }
  }

  function showScreen(name) {
    // Não depender apenas do atributo `hidden`:
    // a tela do jogo usa CSS com `display:flex` e pode ficar por cima interceptando cliques.
    const setVisible = (el, visible) => {
      if (!el) return;
      el.hidden = !visible;
      el.style.display = visible ? '' : 'none';
    };

    setVisible(els.screenMenu, name === 'menu');
    setVisible(els.screenConfig, name === 'config');
    setVisible(els.screenGame, name === 'game');
    setVisible(els.screenOnline, name === 'online');

    if (name === 'menu') setTopButtons({ back: false, restart: false });
    if (name === 'config' || name === 'online') setTopButtons({ back: true, restart: false });
  }

  function setTopButtons({ back, restart }) {
    els.btnBack.hidden = !back;
    els.btnRestart.hidden = !restart;
  }

  function getSelections() {
    return {
      p1Team: selectedP1,
      p2Team: selectedP2,
    };
  }

  function getConfigFromForm() {
    return {
      controlMode: els.controlMode.value,
      dribbleAssist: !!els.dribbleAssist?.checked,
      matchTime: els.matchTime.value,
      maxGoals: els.maxGoals.value,
      botsPerTeam: els.botsPerTeam?.value ?? '3',
      powerUpsEnabled: !!els.powerUpsEnabled.checked,
      powerSpawnInterval: Number(els.powerSpawnInterval.value),
      powerDuration: Number(els.powerDuration.value),
      goalieAuto: !!els.goalieAuto.checked,
      soundEnabled: !!els.soundEnabled.checked,
      gameSpeed: Number(els.gameSpeed.value),
      // support separate difficulty controls if present, otherwise fallback to legacy `difficulty`
      botDifficulty: els.botDifficulty?.value ?? els.difficulty?.value ?? 'medium',
      goalieDifficulty: els.goalieDifficulty?.value ?? els.difficulty?.value ?? 'medium',
      weatherMode: els.weatherMode?.value ?? 'clear',
    };
  }

  function setTeams(sel) {
    selectedP1 = sel.p1Team;
    selectedP2 = sel.p2Team;
    fillTeams();
  }

  function setConfig(cfg) {
    const config = cfg ?? createInitialConfig();
    els.controlMode.value = String(config.controlMode);
    if (els.dribbleAssist) els.dribbleAssist.checked = !!config.dribbleAssist;
    els.matchTime.value = String(config.matchTime);
    els.maxGoals.value = String(config.maxGoals);
    if (els.botsPerTeam) els.botsPerTeam.value = String(config.botsPerTeam ?? '3');
    els.powerUpsEnabled.checked = !!config.powerUpsEnabled;
    els.powerSpawnInterval.value = String(config.powerSpawnInterval);
    els.powerDuration.value = String(config.powerDuration);
    els.goalieAuto.checked = !!config.goalieAuto;
    els.soundEnabled.checked = !!config.soundEnabled;
    els.gameSpeed.value = String(config.gameSpeed);
    if (els.weatherMode && config.weatherMode) els.weatherMode.value = String(config.weatherMode);

    // If the UI has separate selects for bot/goalie difficulty, set them; otherwise keep legacy `difficulty` select
    if (els.botDifficulty) els.botDifficulty.value = config.botDifficulty ?? config.difficulty ?? 'medium';
    if (els.goalieDifficulty) els.goalieDifficulty.value = config.goalieDifficulty ?? config.difficulty ?? 'medium';

    syncRanges();
  }

  function syncRanges() {
    els.powerSpawnIntervalValue.textContent = String(els.powerSpawnInterval.value);
    els.powerDurationValue.textContent = String(els.powerDuration.value);
    els.gameSpeedValue.textContent = Number(els.gameSpeed.value).toFixed(2);
  }

  function toast(text, ms = 900) {
    els.toast.hidden = false;
    els.toast.textContent = text;
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => (els.toast.hidden = true), ms);
  }

  function pop({ title, message, kind = 'info', ttl = 2400 }) {
    const node = document.createElement('div');
    node.className = `popMsg ${kind}`;
    node.style.setProperty('--ttl', `${Math.max(400, ttl)}ms`);
    node.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
    els.popStack.appendChild(node);

    window.setTimeout(() => {
      node.remove();
    }, Math.max(500, ttl) + 260);
  }

  function syncHUD({ players, currentPlayerIndex, match, config, state, keyboardSelectionText }) {
    if (!els.hudScore) return;

    // Placar e Tempo
    if (els.hudScore) els.hudScore.textContent = `${match.score[0]} - ${match.score[1]}`;
    if (els.hudTime) {
      const t = Math.ceil(match.timeLeft);
      if (t > 90) {
        const m = Math.floor(t / 60), s = t % 60;
        els.hudTime.textContent = `${m}:${String(s).padStart(2,'0')}`;
      } else {
        els.hudTime.textContent = t;
      }
    }
    
    // Nomes dos Times
    if (els.p1Label) els.p1Label.textContent = players[0].team;
    if (els.p2Label) els.p2Label.textContent = players[1].team;

    // Turno e Status
    let turnText = '';
    if (state === 'goalCelebration') {
      turnText = 'GOL!!!';
    } else if (state === 'playing') {
      const p = players[currentPlayerIndex];
      turnText = `VEZ: ${p.team}`;
      if (config.controlMode === 'keyboard' && keyboardSelectionText) {
        turnText += ` (${keyboardSelectionText})`;
      }
    }

    if (els.hudTurn) {
      els.hudTurn.hidden = true;
    }
  }

  function formatPowerLabel(player, controlMode) {
    if (!player) { console.warn('formatPowerLabel: jogador inválido'); return ''; }
    let label = '';
    if (player.storedPower) {
      label = `[${player.storedPower}] `;
    }

    const power = player.activePower;
    if (!power) return label || 'nenhum';
    
    if (controlMode === 'keyboard') {
      return label + `${power.type} (ativo)`;
    }
    const timeLeft = typeof power.timeLeft === 'number' ? Math.ceil(power.timeLeft) : 0;
    return label + `${power.type} (${timeLeft}s)`;
  }

  els.btnGoConfig.addEventListener('click', () => {
    onGoConfig();
    showScreen('config');
  });

  els.btnStartQuickMatch.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('online:stop'));
    onStartMatch(null, getSelections());
    showScreen('game');
  });

  els.btnBack.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('online:stop'));
    onBackToMenu?.();
  });

  els.btnFullscreen.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('game:toggle-fullscreen'));
  });

  els.btnRestart.addEventListener('click', () => {
    onRestart?.();
  });

  for (const el of [els.powerSpawnInterval, els.powerDuration, els.gameSpeed, els.matchTime, els.maxGoals, els.botsPerTeam, els.difficulty, els.botDifficulty, els.goalieDifficulty, els.weatherMode]) {
    el.addEventListener('input', () => {
      syncRanges();
      notifyConfigChange();
    });
    el.addEventListener('change', () => {
      notifyConfigChange();
    });
  }

  function notifyConfigChange() {
    const isOnline = els.screenOnline.style.display !== 'none' || els.screenConfig.style.display !== 'none';
    const isHost = !els.btnStartMatch.classList.contains('client-wait');
    if (isOnline && isHost) {
      document.dispatchEvent(new CustomEvent('ui:config-changed', { 
        detail: getConfigFromForm() 
      }));
    }
  }

  els.btnStartMatch.addEventListener('click', () => {
    // No online, apenas o host clica em iniciar. O cliente recebe o sinal via data.
    const isOnline = els.screenOnline.style.display !== 'none' || els.screenGame.style.display !== 'none';
    if (isOnline && els.btnStartMatch.classList.contains('client-wait')) {
      toast('Aguardando o Host iniciar...', 2000);
      return;
    }

    const config = getConfigFromForm();
    const selections = getSelections();
    onStartMatch?.(config, selections);
  });

  // ONLINE ACTIONS
  els.btnOpenOnline.addEventListener('click', () => {
    showScreen('online');
    document.dispatchEvent(new CustomEvent('online:init'));
  });

  els.btnOnlineBack.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('online:stop'));
    showScreen('menu');
  });

  els.btnCopyId.addEventListener('click', () => {
    const id = els.myPeerId.textContent;
    if (!id || id.includes('...')) return;
    
    // Tenta usar API moderna
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id)
        .then(() => toast('ID Copiado!', 1500))
        .catch(() => fallbackCopy(id));
    } else {
      fallbackCopy(id);
    }
  });

  function fallbackCopy(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      toast('ID Copiado (fallback)!', 1500);
    } catch (err) {
      toast('Erro ao copiar. Selecione e copie manualmente.', 2000);
    }
    document.body.removeChild(input);
  }

  els.btnConnect.addEventListener('click', () => {
    const remoteId = els.remotePeerId.value.trim();
    if (!remoteId) return toast('Insira o ID do amigo', 1500);
    els.btnConnect.textContent = 'Conectando...';
    els.btnConnect.disabled = true;
    document.dispatchEvent(new CustomEvent('online:connect', { detail: { remoteId } }));
    // Restaura botão após 8s caso falhe
    setTimeout(() => {
      els.btnConnect.textContent = 'Conectar';
      els.btnConnect.disabled = false;
    }, 8000);
  });

  fillTeams();
  syncRanges();

  // Estado inicial consistente: garante que a tela do jogo não fique por cima do menu.
  showScreen('menu');

  return {
    showScreen,
    setTopButtons,
    setTeams,
    setConfig,
    getSelections,
    getConfigFromForm,
    syncHUD,
    toast,
    pop,
  };
}
