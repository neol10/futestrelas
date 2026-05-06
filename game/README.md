# Futebol de Botao 2D

Jogo local 2D de futebol de botao com Canvas + JavaScript puro.

## Como rodar

### Opcao 1: Live Server (VS Code)
1. Abra a pasta `game` no VS Code.
2. Clique com o botao direito em `index.html`.
3. Selecione **Open with Live Server**.
4. O jogo abre em localhost automaticamente.

### Opcao 2: servidor local HTTP
Se tiver Python instalado e configurado no PATH:

```powershell
cd game
python -m http.server 8000
```

Depois abra: `http://localhost:8000`

## Controles
- Mouse: clicar + arrastar + soltar em um botao para chutar.
- Tecla `R`: reiniciar partida.
- Tecla `C`: ir do menu para configuracao.

## Recursos implementados
- Menu com 2 jogadores e 16 selecoes.
- Configuracao completa da partida.
- 5 botoes por jogador e turnos locais.
- Fisica com atrito, colisao circular, parede e transferencia de energia.
- Spin e curva por impacto lateral.
- Goleiro automatico/parado.
- Power-ups aleatorios: superShot, curve, magnet, slow, precision.
- HUD com placar, tempo, turno, poderes e status.
- Animacoes de impacto, camera shake, power-up flutuando e gol.
- Detecta gol, atualiza placar, pausa curta e reset.
