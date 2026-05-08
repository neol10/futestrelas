import { createInitialConfig } from './config.js';

export function createUI({ teams, onGoConfig, onBackToMenu, onRestart, onStartMatch }) {
  const els = {
    screenMenu: document.getElementById('screenMenu'),
    screenConfig: document.getElementById('screenConfig'),
    screenGame: document.getElementById('screenGame'),

    p1Team: document.getElementById('p1Team'),
    p2Team: document.getElementById('p2Team'),

    btnGoConfig: document.getElementById('btnGoConfig'),
    btnStartQuickMatch: document.getElementById('btnStartQuickMatch'),
    btnStartMatch: document.getElementById('btnStartMatch'),
    btnFullscreen: document.getElementById('btnFullscreen'),

    controlMode: document.getElementById('controlMode'),
    matchTime: document.getElementById('matchTime'),
    maxGoals: document.getElementById('maxGoals'),
    powerUpsEnabled: document.getElementById('powerUpsEnabled'),
    powerSpawnInterval: document.getElementById('powerSpawnInterval'),
    powerDuration: document.getElementById('powerDuration'),
    goalieAuto: document.getElementById('goalieAuto'),
    soundEnabled: document.getElementById('soundEnabled'),
    gameSpeed: document.getElementById('gameSpeed'),

    powerSpawnIntervalValue: document.getElementById('powerSpawnIntervalValue'),
    powerDurationValue: document.getElementById('powerDurationValue'),
    gameSpeedValue: document.getElementById('gameSpeedValue'),

    btnBack: document.getElementById('btnBack'),
    btnRestart: document.getElementById('btnRestart'),

    hudScore: document.getElementById('hudScore'),
    hudTime: document.getElementById('hudTime'),
    hudTurn: document.getElementById('hudTurn'),
    hudPower: document.getElementById('hudPower'),
    hudStatus: document.getElementById('hudStatus'),
    hudP1Power: document.getElementById('hudP1Power'),
    hudP2Power: document.getElementById('hudP2Power'),
    hudConfig: document.getElementById('hudConfig'),

    popStack: document.getElementById('popStack'),
    toast: document.getElementById('toast'),
  };

  function fillTeams() {
    const opts = teams.map((t) => `<option value="${t}">${t}</option>`).join('');
    els.p1Team.innerHTML = opts;
    els.p2Team.innerHTML = opts;
  }

  // Prevent choosing the same team for both players by auto-adjusting the other select
  function guardTeamSelection() {
    try {
      els.p1Team.addEventListener('change', () => {
        if (els.p1Team.value === els.p2Team.value) {
          // pick next available option for p2
          const options = Array.from(els.p2Team.options).map(o => o.value);
          const alt = options.find(v => v !== els.p1Team.value) ?? options[0];
          els.p2Team.value = alt;
          toast('Seleções iguais não são permitidas, ajustado jogador 2', 800);
        }
      });
      els.p2Team.addEventListener('change', () => {
        if (els.p1Team.value === els.p2Team.value) {
          const options = Array.from(els.p1Team.options).map(o => o.value);
          const alt = options.find(v => v !== els.p2Team.value) ?? options[0];
          els.p1Team.value = alt;
          toast('Seleções iguais não são permitidas, ajustado jogador 1', 800);
        }
      });
    } catch (err) {
      // defensive: if elements are missing or runtime errors occur, log and continue
      console.warn('guardTeamSelection failed', err);
    }
  }

  function showScreen(name) {
    els.screenMenu.hidden = name !== 'menu';
    els.screenConfig.hidden = name !== 'config';
    els.screenGame.hidden = name !== 'game';

    if (name === 'menu') setTopButtons({ back: false, restart: false });
    if (name === 'config') setTopButtons({ back: true, restart: false });
  }

  function setTopButtons({ back, restart }) {
    els.btnBack.hidden = !back;
    els.btnRestart.hidden = !restart;
  }

  function getSelections() {
    return {
      p1Team: els.p1Team.value,
      p2Team: els.p2Team.value,
    };
  }

  function getConfigFromForm() {
    const matchTime = els.matchTime.value;
    return {
      controlMode: els.controlMode.value,
      matchTime,
      maxGoals: els.maxGoals.value,
      powerUpsEnabled: !!els.powerUpsEnabled.checked,
      powerSpawnInterval: Number(els.powerSpawnInterval.value),
      powerDuration: Number(els.powerDuration.value),
      goalieAuto: !!els.goalieAuto.checked,
      soundEnabled: !!els.soundEnabled.checked,
      gameSpeed: Number(els.gameSpeed.value),
    };
  }

  function setTeams(sel) {
    els.p1Team.value = sel.p1Team;
    els.p2Team.value = sel.p2Team;
  }

  function setConfig(cfg) {
    const config = cfg ?? createInitialConfig();
    els.controlMode.value = String(config.controlMode);
    els.matchTime.value = String(config.matchTime);
    els.maxGoals.value = String(config.maxGoals);
    els.powerUpsEnabled.checked = !!config.powerUpsEnabled;
    els.powerSpawnInterval.value = String(config.powerSpawnInterval);
    els.powerDuration.value = String(config.powerDuration);
    els.goalieAuto.checked = !!config.goalieAuto;
    els.soundEnabled.checked = !!config.soundEnabled;
    els.gameSpeed.value = String(config.gameSpeed);

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

  function syncHUD({ players, currentPlayerIndex, match, config, state, canShoot, controlMode, keyboardSelectionText, goldenGoalMode, shotCount, maxShots }) {
    els.hudScore.textContent = `${match.score[0]} - ${match.score[1]}`;

    if (match.infinite || match.timeLeft === Infinity) {
      els.hudTime.textContent = '∞';
    } else {
      els.hudTime.textContent = `${Math.ceil(match.timeLeft)}s`;
    }

    const p = players[currentPlayerIndex];
    els.hudTurn.textContent = controlMode === 'keyboard'
      ? `${p.name} (${p.team}) - ${keyboardSelectionText || ''}`
      : `${p.name} (${p.team})`;

    els.hudPower.textContent = formatPowerLabel(p, config.controlMode);
    els.hudP1Power.textContent = formatPowerLabel(players[0], config.controlMode);
    els.hudP2Power.textContent = formatPowerLabel(players[1], config.controlMode);

    let shotsLeftText;
    let maxShotsText;
    if (!isFinite(maxShots)) {
      shotsLeftText = '∞';
      maxShotsText = '∞';
    } else {
      shotsLeftText = Math.max(0, maxShots - shotCount);
      maxShotsText = maxShots;
    }
    const shotText = `• Chutes: ${shotsLeftText}/${maxShotsText}`;

    if (state === 'finished') {
      els.hudStatus.textContent = 'partida encerrada';
    } else if (goldenGoalMode) {
      els.hudStatus.textContent = 'gol de ouro: primeiro gol vence ' + shotText;
    } else if (controlMode === 'keyboard') {
      els.hudStatus.textContent = (canShoot ? 'modo teclado ativo ' : 'botões em movimento ') + shotText;
    } else if (state === 'goalPause') {
      els.hudStatus.textContent = 'gol! reposicionando...';
    } else {
      els.hudStatus.textContent = (canShoot ? 'pronto para jogar ' : 'aguardando as peças pararem ') + shotText;
    }

    els.hudConfig.textContent = `modo=${config.controlMode === 'keyboard' ? 'teclado' : 'arrastar'} • tempo=${config.matchTime === 'infinite' ? '∞' : config.matchTime + 's'} • gols=${config.maxGoals} • powerups=${config.powerUpsEnabled ? 'on' : 'off'} • som=${config.soundEnabled ? 'on' : 'off'} • goleiro=${config.goalieAuto ? 'auto' : 'parado'} • speed=${Number(config.gameSpeed).toFixed(2)}x`;
  }

  function formatPowerLabel(player, controlMode) {
    let label = '';
    if (player.storedPower) {
      label = `[${player.storedPower}] `;
    }

    const power = player.activePower;
    if (!power) return label || 'nenhum';
    
    if (controlMode === 'keyboard') {
      const usesLeft = typeof power.usesLeft === 'number' ? power.usesLeft : 1;
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
    onStartMatch();
    showScreen('game');
  });

  els.btnBack.addEventListener('click', () => {
    onBackToMenu?.();
  });

  els.btnFullscreen.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('game:toggle-fullscreen'));
  });

  els.btnRestart.addEventListener('click', () => {
    onRestart?.();
  });

  for (const el of [els.powerSpawnInterval, els.powerDuration, els.gameSpeed]) {
    el.addEventListener('input', () => syncRanges());
  }

  els.btnStartMatch.addEventListener('click', () => {
    const config = getConfigFromForm();
    const selections = getSelections();
    if (selections.p1Team === selections.p2Team) {
      toast('Escolha seleções diferentes', 900);
      return;
    }
    onStartMatch?.(config, selections);
  });

  fillTeams();
  guardTeamSelection();
  syncRanges();

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
