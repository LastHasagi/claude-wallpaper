# Clawd Pet — Subprojeto 2: App desktop (design)

Data: 2026-10-30 · Status: aprovado (decisões delegadas pelo usuário)

## Objetivo
Empacotar o motor (subprojeto 1) num app leve para Windows, macOS e Linux, com três modos escolhidos na primeira execução e trocáveis a qualquer momento: **pet solto**, **terrário** e **papel de parede**.

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Runtime | **Tauri 2** (webview do sistema) | Instalador de ~5–10 MB contra ~100 MB do Electron. O motor é web puro e entra sem mudanças. |
| Lógica nativa | O mínimo em Rust: janelas, bandeja, config do app e anexar ao desktop (Windows). Todo o resto fica em TS. | Menos código nativo para manter por plataforma. |
| Janela do pet | Uma janela `pet`, recriada ao trocar de modo (`index.html?mode=…`) | Cada modo tem atributos de janela incompatíveis entre si (transparência, decorações, nível). |
| Pet solto | Janela transparente do tamanho da **área de trabalho** do monitor principal (sem a barra de tarefas), sem decorações, sempre por cima, fora da barra de tarefas, sem roubar foco. Os cliques atravessam por padrão. | Como a janela termina acima da barra de tarefas, o chão é a borda de baixo. |
| Clique no pet solto | O JS consulta a posição global do cursor (~30 Hz). Quando o cursor está sobre uma área interativa (Clawd ou bilhete), desliga o click-through. | API pronta do Tauri (`cursorPosition`, `setIgnoreCursorEvents`), sem hook de mouse nativo. |
| Terrário | Janela 520×300 sem decorações, redimensionável e movível por uma faixa de arraste no topo, com "sempre por cima" configurável. Posição e tamanho são salvos. | É o modo mais simples e portável. |
| Papel de parede | **Windows:** janela em tela cheia anexada atrás dos ícones (técnica WorkerW, com o caminho novo do Windows 11 24H2+). **macOS/Linux:** tela cheia com `always_on_bottom` como alternativa. | A técnica WorkerW é a mesma do Wallpaper Engine e do Lively. Nos outros sistemas não há API equivalente portável. Sem cliques nesse modo (a área de trabalho fica com eles); olhar e aceno continuam funcionando. |
| Configurações | Página `settings.html` (Vite multi-página) numa janela própria. Também serve de boas-vindas na primeira execução. | Reaproveita a validação da feature `settings`. |
| Sincronização | As preferências do motor ficam no `localStorage` (mesma origem para todas as janelas). A janela de configurações emite o evento `settings-changed` e o pet aplica na hora. Modo, onboarding e geometria do terrário ficam num `config.json` do app (Rust). | Cada dado fica com quem é dono dele. |
| Bandeja | Mostrar/esconder, os 3 modos (com marcação), Configurações… e Sair. Rótulos em PT/EN conforme o idioma do motor. | |
| Extras | `tauri-plugin-single-instance` (uma única instância: abrir de novo mostra as configurações) e `tauri-plugin-autostart` (iniciar com o sistema). | Plugins oficiais. |
| Distribuição | `tauri build` gera NSIS + MSI no Windows. Um workflow do GitHub Actions (tauri-action) gera os de macOS e Linux. | Não dá para compilar macOS neste PC. O workflow fica pronto, sem publicar nada. |

## Mudanças no motor
- `HostAdapter` ganha `onExternalSettings?(cb)` (opcional).
- `TauriHost` (novo, em `src/host/`): cursor por eventos DOM e/ou polling global; click-through por áreas; armazenamento local; escuta `settings-changed`.
- `main.ts` escolhe `TauriHost` quando roda dentro do Tauri e `BrowserHost` caso contrário.

## Fora do escopo
Publicar em lojas, assinatura de código, múltiplos monitores (só o principal), as missões novas (subprojeto 3).

## Validação
- Testes unitários para a lógica pura nova: decisão de click-through e conversão de coordenadas do cursor.
- `cargo check`/`clippy` sem avisos e `tauri build` gerando os instaladores.
- **No PC real:** rodar o app em cada modo e capturar a tela inteira (screenshot do desktop) para conferir: overlay transparente acima da barra de tarefas com cliques atravessando; terrário; papel de parede atrás dos ícones.
