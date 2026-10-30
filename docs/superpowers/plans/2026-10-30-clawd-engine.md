# Clawd Engine — Plano de implementação

> **Execução:** inline pelo próprio autor do plano (superpowers:executing-plans), com contexto completo. Por isso o plano especifica interfaces, arquivos, casos de teste e comandos, mas não repete o corpo do código: o código vive nos commits. Os passos usam checkbox (`- [ ]`).

**Objetivo:** motor web do Clawd rodando no navegador, com 3 missões, curiosidades, reações e temas e idiomas. Pronto para ser embutido no Tauri.

**Arquitetura:** feature-based com MVC por feature (ver a spec em `docs/superpowers/specs/2026-10-30-clawd-engine-design.md`). Duas camadas de canvas (bg ASCII com diff, fg com sprites). Game loop com passo fixo.

**Stack:** TypeScript 5 (strict), Vite 6, Vitest 3, playwright-core (usando o Chrome/Edge instalado) para E2E visual. Sem framework de interface e sem dependências em runtime.

---

## Mapa de arquivos

```
index.html                         página única (2 canvas + debug)
vite.config.ts  tsconfig.json  package.json
src/main.ts                        entrada: cria BrowserHost e chama bootstrap
src/app/bootstrap.ts               compõe as features e liga os eventos
src/app/game-loop.ts               passo fixo, limite de fps, pausa
src/app/debug.ts                   overlay de debug + teclas
src/shared/rng.ts                  mulberry32 + helpers (range, pick, chance, weighted)
src/shared/events.ts               EventBus<EventMap> tipado
src/shared/geometry.ts             Rect, Point, clamp, lerp, contains, dist
src/shared/time.ts                 timeOfDay(hour) -> 'day'|'dusk'|'night'
src/shared/i18n.ts                 Lang, resolveLang(setting, system), t(record, lang)
src/shared/render/roles.ts         ColorRole, Theme, PALETTES
src/shared/render/ascii-grid.ts    AsciiGrid (char+role por célula, blit, text, fill, toString)
src/shared/render/prop-art.ts      parsePropArt(lines, mask?, anchors?) -> PropArt
src/shared/render/sprite.ts        parseSprite(rows, palette) -> Sprite (pixels) + validação
src/shared/render/canvas-backend.ts CanvasBackend: métricas de fonte, bg com diff, fg, desenho de sprite/texto
src/host/host.ts                   HostAdapter, CursorSource, CursorEvent
src/host/browser-host.ts           BrowserHost (URL ?mode, localStorage, eventos DOM)
src/features/settings/{model,controller,index}.ts
src/features/clawd/sprites/{palette,body,eyes,props}.ts
src/features/clawd/model/clawd-model.ts
src/features/clawd/model/actions.ts       Action, ActionQueue (interromper/retomar/cancelar)
src/features/clawd/controller/brain.ts    vida própria + reações
src/features/clawd/controller/clawd-controller.ts
src/features/clawd/view/clawd-view.ts
src/features/clawd/index.ts               ClawdApi + createClawd()
src/features/scene/biomes/{layers,mountains,park,room,index}.ts
src/features/scene/model/scene-model.ts   cena atual, seed, efeitos, transição, props visíveis
src/features/scene/controller/scene-controller.ts
src/features/scene/view/scene-view.ts
src/features/scene/index.ts
src/features/missions/catalog/{birdwatching,reading-bench,coding,props,index}.ts
src/features/missions/model/director-model.ts  regras: escolha, intervalos, estados
src/features/missions/controller/director.ts   roda roteiros, contexto, erros
src/features/missions/view/mission-view.ts     balão-terminal / interface específica de missão
src/features/missions/index.ts
src/features/notes/data/facts.json
src/features/notes/model/note-picker.ts
src/features/notes/controller/notes-controller.ts
src/features/notes/view/note-view.ts
src/features/notes/index.ts
tests/**                          espelha src/ (+ architecture.test.ts, content.test.ts)
scripts/e2e-shots.mjs             Playwright: screenshots por cenário
```

## Tarefas

### Tarefa 0: Scaffold + teste de arquitetura
- [ ] `package.json` com os scripts `dev`, `build`, `test`, `typecheck`, `e2e`; dependências de dev: `typescript vite vitest playwright-core`.
- [ ] `tsconfig.json` strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` desligado por ergonomia) e `resolveJsonModule`.
- [ ] `tests/architecture.test.ts`: varre `src/**/*.ts` com regex de import e falha se:
  - (a) `src/features/A/**` importa `features/B/` com B≠A, exceto `features/B/index`;
  - (b) `src/shared/**` ou `src/host/**` importa `features/` ou `app/`;
  - (c) `src/features/**` importa `app/`.
- [ ] Rodar `npm test` → arquitetura verde (só com o arquivo vazio de entrada). Commit.

### Tarefa 1: Utilitários compartilhados
- [ ] Testes: o rng com o mesmo seed gera a mesma sequência; `range` fica dentro dos limites; `weighted` respeita o peso 0. O `EventBus` entrega na ordem, `off` remove e `once` dispara uma vez. `timeOfDay`: 5→night, 6→day, 16→day, 17→dusk, 18→dusk, 19→night. `resolveLang`: `system` + `pt-BR`→pt, `system` + `de`→en, `pt`→pt.
- [ ] Implementar `rng.ts`, `events.ts`, `geometry.ts`, `time.ts` e `i18n.ts`. Testes verdes. Commit.

### Tarefa 2: Primitivas de render
- [ ] Testes do `AsciiGrid`: `set/get` fora dos limites é no-op ou null; `text()` escreve com papel; `blit(prop, x, y)` ignora espaços (transparente) e aplica a máscara; `toString()` gera as linhas; `fillRect`; `clone`; `diff(other)` lista as células alteradas.
- [ ] Testes de `PALETTES`: cada tema define todos os `ColorRole` como hex válido.
- [ ] Testes de `parsePropArt`: linhas com larguras diferentes são preenchidas à direita; a máscara de tamanho diferente lança erro; as âncoras são preservadas.
- [ ] Testes de `parseSprite`: letra fora da paleta lança erro; linhas de larguras diferentes lançam erro; `.` é transparente.
- [ ] Implementar. `CanvasBackend` (sem teste unitário, validado visualmente): mede a célula com `measureText`, `resize(w,h,dpr)`, `presentGrid(grid, theme)` com diff do frame anterior, `clearFg()`, `drawSprite(sprite, x, y, scale, flip)`, `drawText`, `fillRect` e `transparentBg` para o overlay. Commit.

### Tarefa 3: Host
- [ ] `host.ts`: interfaces da spec, seção 3. `CursorEvent = {type:'move'|'down'|'leave', x, y, t}`.
- [ ] `browser-host.ts`: `mode` vem de `?mode`; `storage` usa try/catch em volta do `localStorage`; o cursor vem de `pointermove/pointerdown/pointerleave` na janela; `groundInset` é 0 no full e 48 no overlay (simulando a barra de tarefas); `setInteractiveRects` guarda os retângulos para o debug.
- [ ] Typecheck. Commit.

### Tarefa 4: Feature settings
- [ ] Testes: o storage vazio dá os padrões; JSON inválido dá os padrões; um campo inválido isolado cai para o padrão e os outros se mantêm; os overrides de URL valem; `set()` persiste e emite `settings:changed` com o diff; `resolved()` resolve `system` para tema e idioma usando o host.
- [ ] Implementar `model.ts` (tipos, `DEFAULTS`, `validate`), `controller.ts` (`SettingsController`) e `index.ts`. Commit.

### Tarefa 5: Game loop + bootstrap mínimo
- [ ] Testes do `GameLoop` com um relógio falso: `step(elapsed)` chama `update` em passos fixos de 1/60; o acumulador fica limitado a 0,25 s; `timeScale` multiplica; o render respeita o fps; `pause/resume` não dá salto de tempo.
- [ ] `index.html` (canvas `#bg` e `#fg` empilhados e `#debug`), `main.ts` e `bootstrap.ts` desenhando uma grade de teste. Rodar `npm run dev` e verificar no navegador (screenshot com Playwright). Commit.

### Tarefa 6: Sprites do Clawd
- [ ] `palette.ts`: letras → cores. `O` laranja `#D77757`, `H` destaque `#EDA085`, `h` meia-luz `#E89377`, `S` sombra `#B25C3F`, `L` perna `#C2664A`, `K` olho `#141414`, `W` brilho `#FFFFFF`, `P` blush `#F2A3A0`, mais as cores dos objetos.
- [ ] `body.ts`: as poses da spec (idle 2 quadros, walk 2, run 2, sit 1, sleep 2, jump 2, laugh 2, dizzy 2, startle 1, wave 2, angry 2, binoculars 1, read 2, type 2, carry 2). Cada uma com os pontos `eyes`, `hand` e `feet`.
- [ ] `eyes.ts`: os estados de olho como mini sprites de 2 olhos, com `dx` para a pupila.
- [ ] `props.ts`: binoculars, book (aberto e fechado), laptop, notepad.
- [ ] Teste: todos parseiam; as âncoras ficam dentro da grade; todo quadro de uma pose tem o mesmo tamanho. Commit.

### Tarefa 7: Feature clawd (model, ações, cérebro, view, API)
- [ ] Testes do `ActionQueue`: executa em ordem; `interrupt(action)` pausa a atual e retoma depois; `cancelAll()` rejeita as promises com `AbortError`; uma ação com `duration` termina no tempo certo.
- [ ] Testes de `walkTo`: chega no x, vira para o lado certo e usa a pose `walk`.
- [ ] Testes de reações (cérebro com cursor simulado):
  - clique dentro dos bounds dá `jump`;
  - 3 cliques em 2 s dão `dizzy`;
  - cursor rápido e perto dá `startle`;
  - cursor parado perto por 1 s dá `wave`, sem repetir antes de 20 s;
  - os olhos olham para o cursor perto e não olham dormindo.
- [ ] Testes da vida própria: sem missão, com o tempo avançando, o cérebro escolhe atividades; às 2h o sorteio de cochilo é mais provável que às 14h (mesmo seed e muitas amostras).
- [ ] Implementar o model, o controller, a view (desenha o corpo + olhos + objeto + emote no fg com a escala da spec) e o `index.ts`. Commit.

### Tarefa 8: Feature scene
- [ ] `layers.ts`: geradores puros (céu com sol, lua e estrelas por `timeOfDay`, cordilheira, colinas, chão, árvores, poste, janela com skyline, estante) e o helper de cume (`/ \ ^ _`).
- [ ] Biomas `mountains`, `park` e `room`. Teste: o mesmo seed gera a mesma string; seeds diferentes geram strings diferentes; nenhuma célula fica fora da grade; o chão fica na linha `rows - groundRows`.
- [ ] Model: `current {biome, seed}`, `transition {from, to, progress}`, `props: Map<id, {art, x, y, frame}>`, `effects` (birds, steam), `label`. Testes: a transição avança e termina, e então emite `scene:transitioned`; o overlay ignora as camadas do bioma.
- [ ] View: monta a `AsciiGrid` (bioma + props + efeitos + rótulo; no overlay, só props e efeitos com contorno) e aplica o scramble durante a transição.
- [ ] Controller e API: `setBiome(id, seed?)` retorna uma Promise que resolve quando a transição termina; `showProp/hideProp/setPropFrame`; `effect('birds', opts)`; `setLabel`; `groundY()`; `cols/rows`; `cellToPx/pxToCell`. Commit.

### Tarefa 9: Feature missions
- [ ] Testes do `director-model`: `pickNext` nunca repete as 2 últimas; com `prefers:'night'`, às 14h o peso é menor (não zero); os intervalos de `often/normal/rare` ficam nas faixas da spec; a máquina de estados `idle → exiting → transitioning → entering → running → noting → idle`.
- [ ] Catálogo: o ASCII dos props (rocha-mirante, banco, poste, mesa com laptop e caneca) e os roteiros das 3 missões.
- [ ] Teste de roteiros: um `MissionContext` falso (a API do clawd resolve na hora e conta as chamadas; o scene é falso) roda cada missão com `wait` acelerado; ela termina, deixa `hold(null)` no fim e não lança exceção.
- [ ] Teste de erro: uma missão que lança exceção vai para a lista negra e o diretor volta para `idle`.
- [ ] Controller `Director` (com `update(dt)` e timers) e a view (balão-terminal da missão `coding`). Commit.

### Tarefa 10: Feature notes
- [ ] `facts.json`: 10 `birds`, 10 `books`, 10 `computing` e 10 `general`, em PT e EN. Só fatos bem estabelecidos.
- [ ] Teste de conteúdo: ids únicos; pt e en não vazios com até 180 caracteres; os temas são conhecidos.
- [ ] Testes do picker: prefere o tema; cai para `general`; não repete até esgotar; o histórico persiste e é restaurado via storage; quando esgota tudo, reinicia o ciclo.
- [ ] Controller: `maybeDeliver(topic)` decide pela configuração e roda o fluxo de entrega pela API do clawd; o clique no bilhete dispara `dismiss()`. A view desenha o cartão no fg com quebra de linha (testar a função `wrap(text, cols)` à parte). Commit.

### Tarefa 11: Integração e debug
- [ ] O bootstrap liga tudo: os eventos de `settings:changed` (tema, idioma, tamanho e fps aplicados na hora), os `interactiveRects` (clawd + bilhete) e o host.
- [ ] Os parâmetros de URL `mission/speed/hour/seed/debug` e as teclas de debug `M/N/T/L`.
- [ ] Rodar `npm run dev` e testar manualmente pelo Playwright. Commit.

### Tarefa 12: Validação E2E visual
- [ ] `scripts/e2e-shots.mjs`: sobe o `vite preview` e abre o Chrome/Edge do sistema via `playwright-core` (`channel: 'chrome'`, ou `msedge` como alternativa). Para cada missão × tema × modo, tira 4 screenshots com `?speed=6`; também clica no Clawd e captura a reação. Junta os erros do console num `artifacts/console.json` e mede o FPS/ms pelo overlay.
- [ ] Inspecionar os screenshots e corrigir o que estiver errado (sobreposição, legibilidade, escala, cortes). Repetir até ficar bom.
- [ ] Rodar 10 min acelerados (`?speed=20`) sem erros no console. Commit.

### Tarefa 13: Acabamento
- [ ] Um README curto (como rodar, parâmetros de debug, arquitetura).
- [ ] `npm run typecheck && npm test && npm run build` verdes. Commit final do subprojeto 1.
