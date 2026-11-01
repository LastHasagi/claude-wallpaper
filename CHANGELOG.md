# Novidades

O que mudou em cada versão do Clawd Pet. A release de cada tag publica a seção correspondente
(`scripts/release-notes.mjs`), e a pipeline falha se a versão não tiver entrada aqui.

## v0.6.0 — 2026-11-01

### Novo
- **Estações.** O cenário se enfeita sozinho: **Halloween** de 15/out a 15/nov (abóboras no chão e morcegos no céu), **Natal** de 16/nov a 15/jan (pinheiros, pisca-pisca colorido e neve) e **Carnaval** de 16/jan até a Quarta-feira de Cinzas (bandeirinhas, serpentinas e confete). Vale para o terrário e o papel de parede, em todos os cenários e monitores.
- **O Clawd dança (Windows).** Quando toca música ou vídeo (Spotify, YouTube no navegador, players), ele dança com notinhas em volta. Nas configurações, **Dançar com música**: nunca, às vezes (em rodadas, com pausas) ou sempre (enquanto tocar). Ele não larga uma missão no meio para dançar.
- **Enfeites.** Nova seção nas configurações para vestir o seu Clawd: na cabeça, chapéu de bruxa, gorro de Natal, coroa, boné ou laço; no rosto, óculos escuros, máscara de carnaval ou bigode. No **automático**, ele se veste conforme a estação. O Clawd do topo das configurações mostra como fica.

## v0.5.1 — 2026-11-01

### Corrigido
- **Papel de parede sumindo e levando os ícones junto.** Com a apresentação de slides do Windows ligada, a cada troca de imagem o cenário sumia atrás da foto do Windows; e depois de Win+D (ou de esconder e mostrar o Clawd pela bandeja) o cenário voltava por cima dos ícones da área de trabalho, que pareciam ter sumido. Agora o cenário fica sempre logo abaixo dos ícones, e o app o recoloca no lugar em poucos segundos se o Windows mexer nas camadas.
- **Comer arquivos no pet solto.** Arrastar itens da área de trabalho até o Clawd não fazia nada nesse modo: o Windows não entregava o arrasto à janela dele. Agora ele come normalmente, como no terrário.

## v0.5.0 — 2026-10-31

### Novo
- **Atualização por dentro do app.** Quando sai uma versão nova, o botão **Atualizar agora** (nas configurações, na bandeja ou no bilhete do Clawd) baixa e instala sozinho, com uma barrinha de progresso em ASCII, e o Clawd volta já na versão nova. Nada de abrir o navegador.
- O link **o que mudou** ainda leva à página da versão, para quem quiser ler as novidades.

### Segurança
- O instalador baixado é assinado; o app recusa qualquer arquivo cuja assinatura não confira.
- Antes de instalar, o Clawd devolve o cursor e os ícones que estiverem com ele.

### Observação
- Quem está na v0.4.1 ou anterior precisa baixar esta versão pela página uma última vez. Daqui em diante, as atualizações são pelo próprio app.

## v0.4.1 — 2026-10-31

### Corrigido
- Papel de parede em **Todos** com monitores de escalas diferentes (por exemplo, 4K a 150% e Full HD a 100%): o cenário do 4K ocupava só parte da tela, o do Full HD aparecia dentro do 4K e o Full HD ficava vazio. Agora cada monitor mostra o seu cenário inteiro, com o chão embaixo.
- Depois de abrir um jogo (ou qualquer coisa que reinicie a placa de vídeo), o cenário do papel de parede e do terrário sumia e só sobravam as nuvens. Agora ele é redesenhado inteiro assim que a placa de vídeo volta.

## v0.4.0 — 2026-10-31

### Novo
- **O Clawd come ícones da área de trabalho (Windows).** Arraste arquivos ou pastas da área de trabalho até ele: ele abre a boca, engole tudo ("nhac!") e mostra quantos comeu. Os itens somem da área de trabalho.
- Para pegar de volta, clique nele ou use **Devolver meus ícones** na bandeja. Ele também devolve sozinho depois de 5 minutos ("arrot!") e sempre que o app fecha, troca de modo ou é desinstalado.

### Segurança: nada é apagado
- "Comer" só marca o item como **oculto**. O arquivo ou a pasta continua no mesmo lugar, com o mesmo conteúdo, e ao ser devolvido só perde a marca de oculto.
- Ele só aceita itens que estão direto na sua área de trabalho (inclusive a do OneDrive). Recusa itens de outras pastas, itens já ocultos, itens de sistema e atalhos simbólicos, e come no máximo 20 de uma vez.
- Antes de esconder qualquer coisa, o app anota o que vai comer. Se o app cair no meio, tudo é devolvido na próxima abertura. Na desinstalação, ele devolve tudo antes de ser removido.
- Ao soltar, o Clawd responde ao Windows "copiar", nunca "mover", então o Explorer não remove nada do lugar original.
- Funciona no pet solto e no terrário. No papel de parede, quem recebe o arrasto é a própria área de trabalho.

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
