# Novidades

O que mudou em cada versão do Clawd Pet. A release de cada tag publica a seção correspondente
(`scripts/release-notes.mjs`), e a pipeline falha se a versão não tiver entrada aqui.

## v0.3.0 — 2026-10-31

### Novo
- **O Clawd rouba o seu cursor (Windows).** Se o ponteiro do mouse ficar parado perto dele, ele pode engolir o ponteiro ("nhac!", "glup") e cuspir o dele. Há um cursor animado para cada ação: seta, link, texto, ocupado, carregando em segundo plano e proibido.
- Para pegar o seu de volta, clique no Clawd ou use **Devolver meu cursor** na bandeja. Ele também devolve sozinho depois de 10 minutos, ao trocar de modo e quando o app fecha. Se o app fechar de repente, o cursor original volta na próxima abertura (ou no logoff).
- Nova opção **Roubar o cursor** nas configurações: nunca, às vezes (padrão) ou frequentes. Na bandeja, **Clawd, pega meu cursor!** faz ele roubar na hora.
- O Clawd ganhou boca: ela aparece quando ele puxa o ar, mastiga e cospe.
- Linha de comando: `clawd-pet --cursor steal` e `clawd-pet --cursor return`.

### Detalhes
- No papel de parede, ele só rouba quando o ponteiro está sobre a área de trabalho, não sobre uma janela.
- As missões esperam a cena terminar. Se você pedir o cursor de volta enquanto ele está numa missão, o cursor volta na hora.
- O texto de cada release agora diz o que mudou naquela versão.

## v0.2.1 — 2026-10-30

### Corrigido
- Papel de parede em **Todos** com monitores de escalas diferentes (por exemplo, 4K a 150% e Full HD a 100%): o cenário aparecia com letras 2 a 3 vezes maiores e desalinhado. Agora o tamanho dos caracteres é calculado por monitor e a janela é posicionada em pixels reais.
- O cenário se reorganiza quando a escala da tela muda com o app aberto.

### Novo
- O app percebe quando um monitor é conectado ou desconectado (ou quando você troca de Duplicar para Estender): refaz o papel de parede e pergunta em qual monitor aplicar.
- Com um monitor só, as configurações avisam e sugerem Win+P → Estender.

### Limitação conhecida
- Em monitores com escalas diferentes, o de escala menor mostra o cenário um pouco maior, porque o Windows desenha a janela inteira numa escala só.

## v0.2.0 — 2026-10-30

### Novo
- Papel de parede em vários monitores: com mais de um, o app pergunta onde aplicar, em um só ou em todos.
- Em **Todos**, cada monitor tem seu próprio cenário e chão. O Clawd passeia de um para o outro, e as missões acontecem ora num, ora noutro.
- Aviso de nova versão: o app consulta as releases ao abrir e a cada 6 horas. Quando sai uma versão nova, aparece um item na bandeja, um aviso nas configurações e o Clawd traz um bilhete (uma vez por versão). Dá para desligar nas configurações.

### Segurança
- O app só abre links da página de releases do projeto e só se conecta a `api.github.com`.

## v0.1.0 — 2026-10-30

### Primeira versão
- O Clawd vive em cenários de ASCII art (montanhas, parque e quarto) que mudam com a hora do dia, em tema escuro ou claro.
- Três missões: observar pássaros com binóculos, programar no notebook e ler no banco da praça.
- 40 curiosidades em português e inglês, que ele traz num bloco de notas.
- Reage ao mouse: acena, se assusta com movimentos bruscos, ri com cliques e fica tonto com cliques demais.
- Três modos, escolhidos na primeira abertura e trocáveis a qualquer momento: pet solto sobre a tela, terrário (uma janela) e papel de parede.
- Windows, macOS e Linux, com menu na bandeja e opção de iniciar com o sistema.
