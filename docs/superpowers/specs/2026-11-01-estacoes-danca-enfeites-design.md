# Estações, dança e enfeites do Clawd — design

Pedido: "vamos fazer o clawd dançar + cenário de halloween que vai ficar até dia 15 de novembro e o
de natal que começa dia 16 de novembro e vai até 15 de janeiro e dps vai começar o de carnaval",
e depois: "deixa a pessoa poder enfeitar o clawd dela".

Três partes independentes, que só se tocam no acessório automático da estação.

## 1. Estações

### Calendário

| Estação  | De     | Até (inclusive)                              |
|----------|--------|----------------------------------------------|
| Halloween | 15/out | 15/nov                                      |
| Natal    | 16/nov | 15/jan (atravessa a virada do ano)           |
| Carnaval | 16/jan | Quarta-feira de Cinzas (Páscoa − 46 dias)    |
| —        | resto do ano: cenário normal                       |

`seasonOn(date): Season | null` é pura e fica em `shared/season.ts`. A Páscoa sai do algoritmo
gregoriano anônimo (Meeus/Jones/Butcher); nada de tabela de datas. A data é a local do computador.
A estação é reavaliada junto com a hora do dia (a cada 30 s), então vira sozinha à meia-noite.

`?season=halloween|natal|carnaval|none` na URL força uma estação (prévia e testes), como `?hour=`.

### Decoração

Uma camada por cima de qualquer cenário (montanhas, parque, quarto), sem mudar os cenários:

- **Halloween:** abóboras `(\_/)` no chão, teia num canto do céu, morcegos `^v^` cruzando o céu.
- **Natal:** pisca-pisca colorido ao longo do chão, pinheiro com estrela, neve caindo.
- **Carnaval:** bandeirinhas no alto, serpentinas, confete colorido caindo.

A parte fixa entra no fundo cacheado (custo zero por quadro); morcegos, neve e confete entram na
parte animada. Cada painel (monitor) recebe a decoração com a sua própria semente.

A decoração respeita os `spots` das missões (banco, mesa…): nada é pintado em cima deles.

No **pet solto** não há cenário: só o enfeite do Clawd aparece (neve e confete sobre a área de
trabalho seriam poluição).

## 2. Dança

### Detectar música (Windows)

O lado nativo pergunta ao Windows se há mídia tocando (`GlobalSystemMediaTransportControls`: Spotify,
YouTube no navegador, players). Roda na vigia que já existe (a cada 3 s) e manda o evento `music`
(`true`/`false`) à janela do Clawd **só quando o estado muda**, e logo que a janela é criada. Usa a
crate `windows` que o Tauri já traz (0.62), só com mais recursos ligados.

Som de jogo ou de chamada não conta (não é sessão de mídia). macOS e Linux não dançam.

### Comportamento

Pose nova `dance`: balança de um lado para o outro, alterna os braços, notas `♪ ♫` em volta.

Configuração **Dançar com música**:

- **nunca**
- **às vezes** (padrão): rodadas de 15–30 s, com pausas de 40–90 s em que ele volta à vida normal.
- **sempre**: dança enquanto tocar; missões esperam a música parar.

Ele só começa a dançar quando está livre: não interrompe missão, refeição de ícones, roubo de cursor
nem bilhete. Se ele está dançando e algo dessas começa, a dança para. Quando a música para, a dança
termina na hora.

## 3. Enfeites

Dois espaços que se combinam:

- **Cabeça:** chapéu de bruxa, gorro de Natal, coroa, boné, laço.
- **Rosto:** óculos escuros, máscara de carnaval, bigode.

Cada espaço vale **Automático** (padrão), **Nenhum** ou uma peça. O automático segue a estação:

| Estação   | Cabeça          | Rosto   |
|-----------|-----------------|---------|
| Halloween | chapéu de bruxa | —       |
| Natal     | gorro de Natal  | —       |
| Carnaval  | —               | máscara |
| fora      | —               | —       |

As peças são sprites presos à cabeça, desenhados depois do corpo, nos mesmos moldes dos itens
segurados (`props.ts`): acompanham todas as poses e o espelhamento. Enquanto um item cobre os olhos
(binóculo), o enfeite do rosto não é desenhado.

### Configurações

Seção nova **Enfeites**, com uma fileira por espaço. O Clawd do topo da tela de configurações vira
prévia e mostra o que foi escolhido. As escolhas são preferências do motor como as outras
(`Settings`: `dance`, `head`, `face`), salvas no mesmo armazenamento e transmitidas pelo mesmo
`settings-changed`.

## Testes

- Calendário: limites de cada estação (14/out, 15/out, 15/nov, 16/nov, 15/jan, 16/jan), Quarta de
  Cinzas em anos conhecidos (2026: 18/fev, 2027: 10/fev, 2028: 1/mar), virada de ano.
- Decoração: só aparece na estação certa e nunca em cima de um `spot`.
- Enfeites: automático segue a estação; escolha manual vence; `none` não desenha; rosto some com
  binóculo.
- Dança: começa com `music: true` e o Clawd livre; não começa no meio de missão; para quando a
  música para; `never` nunca dança; `always` não deixa missão começar enquanto toca.
- Configurações: valores inválidos voltam ao padrão (validação existente).
