# Clawd rouba o cursor — design

Pedido: "uma ação dele que ele pega o mouse da pessoa, engole e cospe um mouse com o ícone sendo o
Clawd, e aí tem uma animação para cada ação".

## Experiência

1. **Roubo.** O ponteiro fica parado perto do Clawd (até 3 corpos de distância, 1,5 s sem mexer).
   Com a configuração "Roubar o cursor" em *Às vezes* (padrão) ou *Sempre que der*, ele pode decidir
   roubar: olhos arregalados + "!", chega mais perto, abre a boca e puxa o ponteiro (o ponteiro real
   some e um ponteiro desenhado voa até a boca), mastiga ("nhac"), engole ("glup") e cospe ("ptui!")
   um cursor do Clawd, que voa em arco até onde o mouse está agora. Ao pousar, os cursores do sistema
   viram os do Clawd. Ele ri.
2. **Cursor do Clawd.** Um cursor animado para cada ação do Windows: ponteiro (o Clawd carrega a
   seta e pisca), link (aponta com o braço), texto (barra laranja que pisca como o caret), ocupado
   (o Clawd correndo), carregando em segundo plano (seta + Clawd correndo) e não permitido (placa de
   "proibido" balançando). Os demais (redimensionar, mira etc.) continuam os do sistema.
3. **Devolução.** Clicar no Clawd faz a cena ao contrário (ele engole o cursor dele e cospe a seta
   normal). Também devolve: item "Devolver meu cursor" na bandeja, depois de 10 min sozinho, ao
   desligar a configuração, ao trocar de modo/fechar o app (na hora, sem animação).
4. **Gatilhos explícitos.** Bandeja "Clawd, roube meu cursor!" e `clawd-pet --cursor steal|return`
   (também chega à instância aberta). Pedidos explícitos ignoram a frequência configurada.

Frequência: *Às vezes* = no máximo um roubo a cada 15 min, 35% de chance por "pausa" do mouse perto
dele; *Sempre que der* = intervalo de 2 min, 80%. O primeiro roubo só pode acontecer 90 s depois de
abrir. Nunca durante missões, cochilos ou reações.

## Plataformas

Só o Windows deixa um app trocar o cursor do sistema (`SetSystemCursor`). No macOS e no Linux a
opção não aparece e o roubo nunca acontece. No modo papel de parede, só rouba se o ponteiro estiver
sobre a área de trabalho (senão ele não "vê" o mouse).

## Arquitetura

- `features/cursor/` (MVC): `model/` (fases normal → heist → clawd → giving-back, ponteiro desenhado
  em voo, regras de gatilho puras), `sprites/` (arte 16×16 de cada cursor + a seta comum),
  `controller/` (sequências usando `ClawdApi` e a porta do host), `view/` (desenha o ponteiro em voo).
- `features/clawd`: boca (`mouth` no modelo, `PlayOptions.mouth`), poses `inhale`/`chew`/`spit`,
  `ClawdApi.pose()`.
- `host`: `SystemCursorPort { hide, apply, restore, visible? }` e `onCursorCommand`. Tipos da arte
  (`CursorArt`) ficam em `shared/` para o host não depender de features.
  - `host/cursor-files.ts` (puro, testado): sprite → RGBA em 32/48/64/96/128 px (escala inteira, sem
    borrar), arquivo `.cur` (estático) ou `.ani` (animado, o Windows anima sozinho, zero CPU).
  - `TauriHost`: envia os bytes por IPC binário (`cursor_store`), depois `cursor_apply`.
  - `BrowserHost`: simula com CSS `cursor` (preview e testes).
- Rust `cursors.rs`: grava em `%LOCALAPPDATA%\dev.clawdpet.app\cursors\`, `LoadCursorFromFileW` +
  `SetSystemCursor`; esconder = cursor transparente em todos os ids; restaurar =
  `SystemParametersInfoW(SPI_SETCURSORS)` (recarrega o esquema do próprio usuário). Um arquivo
  marcador registra "cursor trocado": restaura ao abrir (caso o app tenha caído), ao recriar a janela
  do pet e ao sair. Só aceita os nomes da lista e arquivos até 8 MB.

## Testes

- Unitários: codificadores `.cur`/`.ani` (cabeçalhos, tamanhos, máscara), arte (tamanhos, hotspot),
  regras de gatilho, sequência completa com Clawd real e porta falsa em tempo simulado (ordem
  hide → apply, cancelamento restaura, clique devolve, configuração desligada restaura, devolução
  automática), whitelist no Rust.
- Na máquina real: `--cursor steal`, captura da imagem do cursor do sistema (GetCursorInfo +
  DrawIconEx) para conferir que é o do Clawd, `--cursor return` e conferência da seta original.
