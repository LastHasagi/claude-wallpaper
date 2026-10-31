# Clawd come ícones da área de trabalho — design

Pedido: "se arrastarmos ícones da área de trabalho para ele, ele come os ícones, pastas e afins…
mas precisamos tomar cuidado para ele não comer as coisas e deletar projetos do usuário".

## Regra de ouro

**Nada é apagado, movido ou alterado.** "Comer" = marcar o item com o atributo *oculto* do Windows.
O arquivo/pasta continua exatamente onde estava, com o mesmo conteúdo; só some da área de trabalho.
"Cuspir" = tirar o atributo oculto que *nós* colocamos.

## Experiência

1. Você arrasta um ou mais ícones da área de trabalho até o Clawd. Quando o arrasto passa por cima
   dele, ele abre a boca e arregala os olhos ("!").
2. Ao soltar: os ícones voam para a boca, ele mastiga ("nhac!") e mostra quantos comeu ("+3"). Os
   itens somem da área de trabalho.
3. A barriga devolve tudo ("ptui!", os ícones voam de volta) quando: você clica nele; você usa
   "Devolver meus ícones" na bandeja; passam 5 minutos (ele "digere" e devolve); o app fecha, troca
   de modo ou é desinstalado; o app abre depois de ter caído.
4. Ele recusa (balança a cabeça, "eca!") o que não é da área de trabalho, itens já ocultos, itens
   de sistema e atalhos especiais (Lixeira, Este Computador não são arquivos). Com 20 itens na
   barriga ele está "cheio!" e recusa o resto.

Só no Windows e só nos modos pet solto e terrário (no papel de parede, quem recebe o arrasto é a
própria área de trabalho).

## Segurança

- Só aceita itens cuja pasta-mãe é a Área de Trabalho do usuário (`desktop_dir`, que segue a
  redireção do OneDrive). Nada de subpastas, outros discos ou caminhos com `..`.
- Recusa pontos de reparse (atalhos simbólicos/junções), itens já ocultos e itens de sistema
  (`desktop.ini`).
- Registro (`belly.json`) gravado **antes** de ocultar: se o app cair no meio, a próxima abertura
  sabe o que devolver. Devolver um item que não chegou a ser ocultado é inofensivo.
- Devolver só mexe em itens que estão no registro, ainda existem no mesmo caminho e ainda estão
  ocultos. Itens renomeados/movidos pelo usuário nesse meio-tempo são esquecidos.
- O desinstalador chama `clawd-pet --restore-all` antes de remover o app (devolve ícones e cursor).
- A barriga nunca sobrevive a um reinício do app: tudo é devolvido ao sair e ao abrir.

## Arquitetura

- Rust `belly.rs`: `Belly { ledger, desktop }` com `eat(paths) -> EatReport` e `spit_all()`;
  validação pura testável com pastas temporárias; Windows usa `SetFileAttributesW` e
  `SHChangeNotify` para a área de trabalho atualizar na hora.
- Comandos `belly_eat`, `belly_spit`; bandeja "Devolver meus ícones (N)"; `--restore-all`; hook do
  instalador NSIS.
- Motor: feature `belly/` (MVC): fome ao arrastar por cima, cena de comer/recusar/cuspir, contagem,
  digestão. Host: `onFileDrag` (eventos de arrasto do WebView com caminhos) e `BellyPort`.
