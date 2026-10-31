# Clawd Pet

Um pet de desktop do Clawd, o mascote do Claude Code. Ele vive em cenários de ASCII art, sai em missões, traz curiosidades num bloco de notas e reage ao mouse.

Criado por **Rodrigo Graça** · [GitHub](https://github.com/LastHasagi) · [LinkedIn](https://www.linkedin.com/in/rodrigo-de-souza-graca/)

![Clawd observando pássaros, programando e cochilando num livro](docs/media/clawd-demo.gif)

**Instalar:** baixe o instalador da sua plataforma em [Releases](https://github.com/LastHasagi/claude-wallpaper/releases) (Windows `.exe`/`.msi`, macOS `.dmg`, Linux `.AppImage`/`.deb`/`.rpm`). Os instaladores não são assinados. No Windows, o SmartScreen pode avisar: "Mais informações" → "Executar assim mesmo". No macOS, na primeira vez, clique com o botão direito no app → Abrir.

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
| **Papel de parede** | **Windows:** anexada atrás dos ícones (técnica WorkerW, compatível com o layout do Windows 11 24H2+). Com mais de um monitor, o app pergunta onde aplicar: em um monitor ou em **todos**. Em todos, cada monitor tem o próprio cenário e o próprio chão, e o Clawd passeia de um para o outro. **macOS/Linux:** tela cheia "sempre por baixo" (alternativa, ainda não testada nesses sistemas). |

Linha de comando: `clawd-pet --mode overlay|terrarium|wallpaper`. Com o app já aberto, isso só troca o modo da instância em execução.

O config do app fica em `%APPDATA%\dev.clawdpet.app\config.json` (Windows). As preferências do motor ficam no armazenamento local do WebView.

### Publicando uma versão

Releases são automáticas (`.github/workflows/release.yml`):

1. Suba a `version` em `src-tauri/tauri.conf.json` e no `package.json`.
2. Escreva em [CHANGELOG.md](CHANGELOG.md) uma seção `## vX.Y.Z` com o que mudou. Ela vira o texto da release (`node scripts/release-notes.mjs vX.Y.Z` mostra como vai ficar).
3. Faça commit e depois `git tag v0.2.0 && git push origin v0.2.0`.

O GitHub Actions roda os testes, confere se a tag bate com a versão do app e se o CHANGELOG tem a seção dela, compila Windows, macOS (universal) e Linux e publica a release com os instaladores. Em todo push e pull request, o `ci.yml` roda o typecheck e os testes.

**Atualizações:** o app consulta as Releases do GitHub ao abrir e a cada 6 horas. Quando sai uma versão nova, aparece um item na bandeja, um banner nas configurações e o Clawd traz um bilhete avisando. Dá para desligar em Configurações → "Avisar sobre novas versões". Nenhum outro dado é enviado.

**Limitações conhecidas:** o pet solto e o terrário usam o monitor principal; no modo papel de parede o Clawd não recebe cliques (quem recebe é a área de trabalho), mas os olhos seguem o cursor e ele acena; com a barra de tarefas em ocultar automaticamente, o pet solto anda rente à borda inferior.

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

## Licença

[PolyForm Noncommercial 1.0.0](LICENSE). Na prática:

- ✅ pode ler, usar, modificar e compartilhar para fins **não comerciais** (uso pessoal, estudo, pesquisa, organizações sem fins lucrativos);
- ✅ **crédito obrigatório**: toda cópia ou derivado precisa manter as linhas `Required Notice` do [LICENSE](LICENSE) (autor e links);
- ❌ **uso comercial** (vender, embutir em produto pago etc.) só com autorização do autor.

Claude, Claude Code e o Clawd são marcas da Anthropic. Este projeto não é afiliado nem endossado pela Anthropic.
