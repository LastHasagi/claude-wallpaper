# Clawd Pet

Um pet de desktop do Clawd, o mascote do Claude Code. Ele vive em cenários de ASCII art, sai em missões, traz curiosidades num bloco de notas e reage ao mouse.

> Projeto de fã, não oficial. Claude, Claude Code e o Clawd são marcas da Anthropic.

## Rodando

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # testes unitários e de integração (Vitest)
npm run typecheck
npm run build        # gera dist/ (o que o app desktop embute)
npm run e2e          # build de produção + Edge/Chrome: matriz de missões, clique e teste de resistência
```

### Parâmetros de URL (desenvolvimento)

| Parâmetro | Efeito |
|---|---|
| `mode=overlay` | Modo pet solto: fundo transparente (no navegador aparece um desktop falso) |
| `mission=birdwatching\|coding\|reading-bench` | Começa direto nessa missão |
| `theme=dark\|light`, `lang=pt\|en`, `size=S\|M\|L`, `fps=15\|30\|60` | Sobrescrevem as configurações |
| `freq=often\|normal\|rare`, `notes=off\|sometimes\|always` | Frequência das missões e das curiosidades |
| `speed=N` | Acelera o tempo |
| `hour=H` | Força o horário (dia, entardecer, noite) |
| `seed=S` | Cenários e sorteios reproduzíveis |
| `debug=1` | Painel com FPS, tempos e estados. Teclas: **M** missão, **N** bilhete, **T** tema, **L** idioma |

## App desktop (Tauri)

```bash
npm run tauri dev     # app com recarga a quente (precisa do Rust instalado)
npm run tauri build   # instaladores em src-tauri/target/release/bundle/ (NSIS .exe e .msi no Windows)
npm run icon          # regenera os ícones a partir do sprite do Clawd
```

Na primeira execução aparece a tela de boas-vindas para escolher o modo. Depois disso, tudo fica no ícone da bandeja (mostrar/esconder, modos, configurações e sair).

| Modo | Como funciona |
|---|---|
| **Pet solto** | Janela transparente do tamanho da área de trabalho, sempre por cima. Os cliques atravessam, exceto sobre o Clawd e o bilhete (o cursor é consultado ~30 vezes por segundo). |
| **Terrário** | Janela pequena sem bordas. Arraste pela faixa do topo, onde fica a ⚙ para as configurações. Posição e tamanho são salvos. |
| **Papel de parede** | **Windows:** anexada atrás dos ícones (técnica WorkerW, compatível com o layout do Windows 11 24H2+). **macOS/Linux:** tela cheia "sempre por baixo" (alternativa, ainda não testada nesses sistemas). |

Linha de comando: `clawd-pet --mode overlay|terrarium|wallpaper`. Com o app já aberto, isso só troca o modo da instância em execução.

O config do app fica em `%APPDATA%\dev.clawdpet.app\config.json` (Windows). As preferências do motor ficam no armazenamento local do WebView.

**Compilação para macOS e Linux:** o workflow `.github/workflows/build.yml` gera os instaladores das 3 plataformas no GitHub Actions (ao criar uma tag `v*` ou manualmente) e não publica nada sozinho.

**Limitações conhecidas:** só o monitor principal; no modo papel de parede o Clawd não recebe cliques (quem recebe é a área de trabalho), mas os olhos seguem o cursor e ele acena; com a barra de tarefas em ocultar automaticamente, o pet solto anda rente à borda inferior.

## Arquitetura

Organizada por feature, com MVC dentro de cada uma. As features só conversam pelo `index.ts` umas das outras ou pelo `EventBus`, e um teste de arquitetura (`tests/architecture.test.ts`) garante isso.

```
src/
  app/        composição (bootstrap), game loop com passo fixo, debug
  shared/     rng, eventos, i18n, hora do dia, render (AsciiGrid, CanvasBackend, sprites, paletas)
  host/       HostAdapter (o contrato com quem embute o motor) + BrowserHost
  features/
    clawd/     personagem: sprites montados por partes, fila de ações, cérebro (reações + vida própria)
    scene/     biomas ASCII (montanhas, parque, quarto), céu por horário, props, efeitos, transições
    missions/  diretor de missões, contexto com cancelamento, terminal, catálogo das missões
    notes/     curiosidades PT/EN, sorteio sem repetição, entrega e dispensa do bilhete
    settings/  preferências validadas e persistidas
```

Duas camadas de canvas: o fundo ASCII só redesenha as células que mudaram (normalmente dezenas por frame), e a frente (sprites e interface) é redesenhada a cada frame. Em 1080p o render fica abaixo de 1 ms por frame.

Documentos: [spec](docs/superpowers/specs/2026-10-30-clawd-engine-design.md) · [plano](docs/superpowers/plans/2026-10-30-clawd-engine.md)
