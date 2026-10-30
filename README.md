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
