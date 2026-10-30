# Clawd Pet — Subprojeto 1: Motor (design)

Data: 2026-10-30 · Status: aprovado (usuário delegou as decisões restantes)

## 1. Visão

Um "pet" de desktop do Clawd, o mascote do Claude Code. Ele vive em cenários de ASCII art, sai em **missões** (observar pássaros, ler num banco, programar…), traz **curiosidades** num bloco de notas e reage ao usuário. O produto final é um app leve para Windows, macOS e Linux (Tauri) com três modos de exibição: pet solto (overlay transparente), janelinha "terrário" e papel de parede.

Este documento cobre **só o motor**: uma aplicação web (TypeScript + Vite + canvas) que roda no navegador e que o app Tauri vai embutir no subprojeto 2.

### Subprojetos

| # | Subprojeto | Status |
|---|---|---|
| 1 | Motor (este doc) | em andamento |
| 2 | App desktop Tauri: 3 modos, onboarding, configurações, bandeja, autostart, instaladores | depois do 1 |
| 3 | Conteúdo: 8 missões restantes + banco completo de curiosidades | depois do 1 |
| 4 | Wallpaper Engine | adiado |

### Fora do escopo do subprojeto 1
Janelas nativas, click-through real, bandeja, autostart, instaladores, as 8 missões restantes, o banco completo de curiosidades.

## 2. Decisões de produto (tomadas no brainstorming)

- **Visual do Clawd:** pixel art "HD expressivo". Sprite numa grade de 36×21, com luz e sombra e olhos que mudam de expressão. Cor base `#D77757`.
- **Cenários:** ASCII art gerado por código, um bioma por missão.
- **Temas:** *escuro* (bege e cinza sobre `#141413`, só o Clawd colorido) e *claro* (tinta `#3d3929` sobre papel creme `#F0EEE6`). O usuário escolhe.
- **Idiomas:** PT-BR e inglês, à escolha do usuário. O padrão segue o idioma do sistema.
- **Interação:** vida própria é o foco. Os olhos seguem o cursor, ele acena ou se assusta com o mouse e reage a cliques.
- **11 missões:** observar pássaros, pescaria, acampamento, espaço, praia, floresta na chuva, cidade à noite, programando, caverna, escalada e banco lendo livro. O subprojeto 1 entrega **3**: `birdwatching`, `reading-bench`, `coding`.
- **Curiosidades:** depois de uma missão, ele às vezes traz um bloco de notas com uma curiosidade sobre o tema e deixa ali para o usuário ler.

## 3. Arquitetura

Feature-based, com MVC dentro de cada feature.

```
src/
  app/            composição (bootstrap), game loop, painel de debug
  shared/         infraestrutura sem regra de negócio
    render/       AsciiGrid, CanvasBackend (bg + fg), SpriteRenderer, PropArt, paletas
    events/       EventBus tipado
    i18n/  rng/  time/  geometry/
  host/           HostAdapter (contrato) + BrowserHost
  features/
    clawd/        model/ view/ controller/ sprites/ index.ts
    scene/        model/ view/ controller/ biomes/ index.ts
    missions/     model/ view/ controller/ catalog/ index.ts
    notes/        model/ view/ controller/ data/ index.ts
    settings/     model/ controller/ index.ts
```

Regras:
- **Model:** só estado e regras puras. Sem DOM nem canvas; testável em Node.
- **View:** lê o model e desenha numa `AsciiGrid` (texto) ou na camada de sprites. Nunca altera estado.
- **Controller:** recebe `update(dt)`, input e eventos, e altera o model.
- Uma feature só usa outra pelo `index.ts` dela ou pelo `EventBus`. Um **teste de arquitetura** varre os imports e falha se `features/A` importar `features/B/(model|view|controller|…)`, ou se `shared`/`host` importar `features`.
- Direção: `app → features → shared/host`.

### Game loop
- Atualização com passo fixo de 1/60 s (acumulador com limite de 0,25 s para evitar a "espiral da morte"). O desenho é limitado pelo FPS configurado (padrão 30).
- `timeScale` multiplica o `dt` (debug e testes: `?speed=8`).
- O loop pausa com `document.hidden` e retoma sem dar um "salto" de tempo.

### Render (duas camadas de canvas)
- **bg:** grade ASCII. Guarda o frame anterior e só redesenha as células que mudaram (o cenário é quase todo estático, então o custo fica proporcional ao que anima).
- **fg:** sprites, objetos animados, bilhete, emotes e interface. Limpo a cada frame; a área ocupada é pequena.
- A célula vem da fonte monoespaçada medida em runtime. O número de colunas é `clamp(largura/10, 80, 200)`, o que dá ~192 colunas em 1080p e 80 no terrário de 480 px. O canvas usa DPR para ficar nítido.
- Cores usam **papéis semânticos** (`bg`, `faint`, `dim`, `mid`, `strong`, `accent`), e cada tema mapeia esses papéis para hex. Nenhuma feature usa hex direto, exceto a paleta do sprite do Clawd.
- **Escala do sprite:** inteira em pixels de dispositivo: `round(cellW × sizeCells / 36 × dpr)`, com `sizeCells` P=8, M=12, G=16.

### HostAdapter
```ts
interface HostAdapter {
  readonly mode: 'full' | 'overlay';
  groundInset(): number;                 // px do fundo até o chão (overlay: altura da barra de tarefas)
  storage: { get(k: string): string | null; set(k: string, v: string): void };
  cursor: CursorSource;                  // move/click/leave; DOM no browser, posição global no app
  setInteractiveRects(r: Rect[]): void;  // overlay: o que NÃO deixa o clique atravessar
  systemLanguage(): string; systemPrefersDark(): boolean;
}
```
`BrowserHost` lê `?mode=full|overlay`. No overlay, o fundo fica transparente sobre um "desktop falso" de teste. Usa `localStorage` (com try/catch) e eventos DOM; `setInteractiveRects` só desenha os retângulos no debug.

## 4. Feature `clawd`

**Sprite em camadas:** corpo/pose + olhos + objeto na mão. Os quadros são definidos como texto (cada letra é uma cor da paleta e `.` é transparente). O parser valida as dimensões e as letras. Cada pose declara um ponto de olhos (`eyes`), um ponto de mão (`hand`) e o pé (`feet`, que é a âncora no chão).

**Poses:** `idle` (respiração), `walk`, `run`, `sit`, `sleep`, `jump`, `laugh`, `dizzy`, `startle`, `wave`, `angry`, `binoculars`, `read`, `type`, `carry`.
**Olhos:** `open`, `blink`, `happy`, `closed`, `wide`, `angry`, `dizzy`. Com `open`, a pupila se desloca ±1 px para o alvo do olhar.
**Objetos (pixel):** `binoculars`, `book`, `laptop`, `notepad`.
**Emotes (ASCII sobre a cabeça):** `!` `?` `♪` `…` `zZ` `♥` `@#!`.

**Model:** `x`, `y` (offset de pulo), `facing`, `pose`, `frame`, `eyes`, `lookTarget`, `prop`, `emote`, `mood`.

**Controller ("cérebro")**, com três níveis (o de cima interrompe o de baixo, que depois retoma):
1. **Reações:**
   - clique: `jump` + `laugh`
   - ≥3 cliques em 2 s: `dizzy` + emote `@#!`
   - cursor a mais de 1500 px/s a menos de 2 corpos de distância: `startle`
   - cursor parado a menos de 3 corpos por mais de 1 s: `wave` (com intervalo de 20 s)
   - os olhos seguem o cursor a menos de 6 corpos, exceto em `sleep`/`binoculars`
2. **Missão:** a fila de ações enviada pelo diretor.
3. **Vida própria:** sorteio ponderado entre andar até um ponto, sentar, olhar em volta, bocejar e cochilar. Entre 23h e 6h (relógio local), cochilar fica bem mais provável.

**Fila de ações:** cada chamada da API vira uma ação com `update(dt) → done`. Uma reação empilha por cima e congela o tempo da ação de baixo. Toda ação é cancelável (`AbortSignal`).

**API pública:**
```ts
walkTo(x, { speed? }) / runTo(x)       // Promise<void>
play(pose, { duration?, loops? })      // Promise<void>
hold(prop | null); setEyes(e); lookAt(p | null); emote(sym, sec?)
face(dir); placeAt(x); bounds(): Rect
```
**Eventos:** `clawd:clicked`, `clawd:reaction`.

## 5. Feature `scene`

- **Bioma** = lista de camadas geradas por funções puras `(cols, rows, seed, ctx) → células`, com papel de cor. Camadas: céu (sol, lua e estrelas conforme a hora: dia 6–17h, entardecer 17–19h, noite), nuvens (derivam), cordilheira distante, colinas, chão, mais as específicas de cada bioma (árvores, poste, janela com skyline…).
- **Camadas animadas:** nuvens, estrelas piscando e efeitos (bando de pássaros, vapor do café, chuva no futuro).
- **Objetos locais (props):** ASCII de várias linhas, com máscara opcional de papel por caractere e quadros de animação. Têm âncoras (`seat`, `desk`…) em células. Ficam no model de `missions`, mas são desenhados pela view de `scene` via API.
- **Modo `full`:** desenha tudo. **Modo `overlay`:** só props e efeitos, com um contorno de 1 célula na cor `bg` para continuarem legíveis sobre qualquer janela.
- **Transição:** "scramble" em varredura da esquerda para a direita (~1,2 s). Cada coluna embaralha caracteres aleatórios por alguns frames até virar a cena nova.
- **Rótulo da missão** no canto superior esquerdo, com papel `accent` (`[ missão 03: observar pássaros ]`).
- O mesmo seed gera a mesma cena (teste de snapshot). O seed muda a cada visita, então a cena varia.

## 6. Feature `missions`

```ts
interface MissionDef {
  id: string;
  number: number;                         // exibido no rótulo
  title: Record<Lang, string>;
  biome: BiomeId;
  prefers?: 'day' | 'night' | 'any';
  noteTopic: string;
  props(stage: Stage): PropPlacement[];
  run(ctx: MissionContext): Promise<void>;
}
```
`MissionContext` oferece a API do `clawd`, `props.show/hide/setFrame`, `scene.effect(...)`, `wait(s)`, `rng`, `stage` (largura, chão, pontos de ancoragem), `lang` e `signal` (cancelamento).

**Diretor (controller):** `idle` (vida própria) → escolhe a missão (ponderada, sem repetir as últimas 2, respeitando `prefers`) → sai de cena (anda para fora; no overlay, só os props somem) → transição → entra → roda o roteiro → talvez traga um bilhete → volta para `idle` na cena atual.
O intervalo entre missões é sorteado conforme `missionFrequency`: `often` 20–40 s, `normal` 60–180 s, `rare` 5–10 min.

**As 3 missões do subprojeto 1:**
1. **`birdwatching`** (prefere dia). Bioma: montanhas. Ele vai até um mirante (prop: rocha), pega o binóculo, olha para um lado, um bando de pássaros cruza o céu, ele acompanha virando, `!`, fica feliz e guarda o binóculo.
2. **`reading-bench`** (qualquer hora). Bioma: parque (árvores e poste, com a luz do poste acesa à noite). Ele senta no banco, abre o livro e vira páginas de vez em quando (`…`, `!`, `♥`). À noite pode cochilar (`zZ`) e acordar assustado. Fecha o livro e levanta.
3. **`coding`** (qualquer hora). Bioma: quarto (janela com skyline, estante e caneca com vapor). Ele senta na mesa e digita no laptop. Um balão-terminal mostra `> npm run build` e depois `✗ build failed`, ele fica bravo (`@#!`), toma café, digita de novo, aparece `✓ 42 tests passed`, ele pula e comemora.

**Erros:** se o roteiro lançar exceção, o diretor registra o erro, cancela as ações, solta o objeto, limpa os props, coloca a missão na lista negra da sessão e volta para `idle`. O app nunca para.

## 7. Feature `notes`

- **Quando:** no fim da missão, conforme a configuração `notes`: `off` (nunca), `sometimes` (50%) ou `always` (sempre).
- **Fluxo:** ele pega o `notepad` (`carry`), anda até um ponto livre, cola o bilhete (pulinho) e volta para `idle`.
- **Bilhete:** cartão de papel desenhado no `fg` com o título `Você sabia?` / `Did you know?`, o texto quebrado em até ~38 colunas e a assinatura `— Clawd`. No modo full fica na metade de cima da tela, longe do rótulo; no overlay fica logo acima do chão, perto de onde ele estava.
- **Dispensar:** clicar no bilhete faz o Clawd vir buscar ("dobra" e `♥`). Um bilhete novo substitui o antigo. Só existe um por vez.
- **Dados:** `notes/data/facts.json`, no formato `[{ id, topic, pt, en }]`. São ~10 por tema (`birds`, `books`, `computing`) + 10 `general` no subprojeto 1. Só fatos bem estabelecidos e verificáveis.
- **Sorteio:** prefere o tema da missão e cai para `general` quando ele se esgota. Não repete enquanto houver inéditos (o histórico é salvo no storage do host). Se faltar o idioma pedido, usa o outro.

## 8. Feature `settings`

```ts
{ theme: 'system'|'dark'|'light', language: 'system'|'pt'|'en', size: 'S'|'M'|'L',
  fps: 15|30|60, missionFrequency: 'often'|'normal'|'rare', notes: 'off'|'sometimes'|'always' }
```
Carrega do storage do host e valida campo a campo: valor inválido vira o padrão. Emite `settings:changed` com o diff. No navegador, os parâmetros da URL sobrescrevem (`?theme=light&lang=en`). O painel de configurações de verdade fica no app (subprojeto 2). No navegador existe um painel de debug.

## 9. Debug e validação

- `?debug=1`: overlay com FPS, ms de update/render, estado do diretor e do cérebro, e os retângulos interativos.
- Parâmetros: `?mission=<id>` (força a missão logo de cara), `?speed=N`, `?hour=H` (força o horário), `?seed=S`, `?mode=overlay`.
- Teclas no modo debug: `M` (próxima missão), `N` (força bilhete), `T` (alterna tema), `L` (alterna idioma).

## 10. Testes

1. **Unitários (Vitest, Node):** AsciiGrid, parser de sprites (todo quadro retangular, letras válidas, âncoras dentro da grade), PropArt, paletas (todo papel definido nos 2 temas), EventBus, rng com seed, settings (validação e fallback), sorteio de notas (sem repetição, fallback de tema e idioma), regras do diretor (não repetir, `prefers`, intervalos), fila de ações (interromper e retomar, cancelar), reações (limites de velocidade e distância, intervalo do aceno).
2. **Biomas:** snapshot de texto com seed fixo e verificação de que são determinísticos.
3. **Roteiros:** cada missão roda num contexto simulado em tempo acelerado. Tem que terminar dentro do limite de tempo, sem exceções, com o Clawd em estado neutro (sem objeto, pose `idle`) e sem props pendurados.
4. **Conteúdo:** todo fato tem `pt` e `en`, não vazio, com até ~180 caracteres, e ids únicos. Toda missão tem título nos 2 idiomas.
5. **Arquitetura:** teste de limites de import (seção 3).
6. **Typecheck:** `tsc --noEmit` em modo strict.
7. **Visual / E2E (Playwright com o Chrome/Edge instalado):** abre cada missão × tema × modo com `?speed`, tira screenshots em momentos-chave e inspeciona. Verifica que não há erro no console, que o FPS está dentro do esperado e que um clique no Clawd dispara a reação.

**Critérios de pronto:** todos os testes verdes; as 3 missões rodam de ponta a ponta nos 2 temas, 2 idiomas e 2 modos; nenhum erro no console em 10 min de execução acelerada; render ≤ 4 ms por frame em 1080p.
