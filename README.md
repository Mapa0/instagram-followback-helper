# Instagram Followback Helper

[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-green.svg)](LICENSE)
[![Baixar extensão](https://img.shields.io/github/v/release/Mapa0/instagram-followback-helper?label=baixar)](https://github.com/Mapa0/instagram-followback-helper/releases/latest)

Extensão local para o Chrome que compara as listas oficiais de **seguidores** e **seguindo** exportadas pelo Instagram. Você pode deixar de seguir quem não segue de volta ou remover os seguidores que você não segue, usando os mesmos arquivos da Meta.

**[Baixar a extensão pronta na última release](https://github.com/Mapa0/instagram-followback-helper/releases/latest)** · [Exportar os dados da Meta](#1-exportar-os-dados-da-meta) · [Instalar](#2-instalar-a-extensão) · [Usar](#3-importar-as-listas-e-executar)

Não precisa de Python, Node.js, Selenium ou serviço pago para usar. O ZIP da release já contém a extensão; basta extrair e carregar no Chrome.

## O que ela faz

- Calcula `seguindo − seguidores` para unfollows e `seguidores − seguindo` para remover seguidores usando os mesmos arquivos JSON da sua conta.
- Aceita vários arquivos `followers_*.json` da mesma exportação e elimina duplicados.
- Lista os candidatos com busca, links, cópia da lista e exportação CSV.
- Visita cada perfil, identifica **Seguindo/Following**, clica e confirma **Deixar de seguir/Unfollow**.
- Na opção **Remover seguidores que não sigo**, verifica o perfil e depois busca o @ exato na sua própria lista de **Seguidores**, clica em **Remover/Remove** e confirma. Preserva quem você passou a seguir ou solicitou seguir.
- Mantém listas, progresso e arquivos CSV separados por opção.
- Permite configurar o intervalo entre perfis e as pausas periódicas.
- Pula páginas indisponíveis e registra os resultados em CSV.
- Guarda listas, progresso e preferências no armazenamento local da extensão.

**Ao clicar em “Deixar de seguir — N perfis” ou “Remover seguidores — N perfis”, as ações são reais e não há confirmação individual por perfil na extensão.** Confira a conta logada, a opção e os candidatos antes de iniciar. Para preservar alguém, marque a caixa ao lado do nome como concluído antes de executar: os nomes marcados ficam fora da fila da opção selecionada.

> A lista de candidatos reflete a data da exportação. A extensão confere se você ainda segue o perfil antes de clicar, mas não consulta em tempo real se a pessoa começou a seguir você depois. Use uma exportação recente e completa. A detecção de bloqueios e erros depende dos textos visíveis na página; mudanças no Instagram podem exigir atualização da extensão.

## 1. Exportar os dados da Meta

Você precisa dos dados da **conta do Instagram que vai usar na extensão**, em **JSON**, com o período **Todo o período / Desde o início / All time**.

### Pelo aplicativo do Instagram

1. Abra seu perfil e toque no menu **☰**.
2. Entre em **Central de Contas**. Conforme a versão do app, ela aparece dentro de **Configurações e atividade** ou **Configurações e privacidade**.
3. Abra **Suas informações e permissões**.
4. Escolha **Exportar suas informações** e depois **Criar exportação**. Em algumas versões, os nomes são **Baixar suas informações** e **Baixar ou transferir informações**.
5. Selecione o perfil correto do **Instagram**. Evite misturar perfis ou exportar o Facebook por engano.
6. Escolha **Exportar para o dispositivo / Baixar no dispositivo**.
7. Em **Personalizar informações / Algumas das suas informações**, desmarque as outras categorias e selecione **Conexões → Seguidores e seguindo**. A ordem dessas telas pode variar.
8. Configure a exportação:

   | Opção | Valor necessário |
   | --- | --- |
   | Categoria | Seguidores e seguindo |
   | Intervalo de datas | Todo o período / Desde o início / All time |
   | Formato | **JSON** |
   | Destino | Dispositivo |
   | Qualidade da mídia | Qualquer uma; a extensão não usa fotos nem vídeos |

9. Confirme em **Iniciar exportação / Criar arquivos**. Se a Meta solicitar a senha, informe-a apenas no app ou site oficial.
10. Aguarde o aviso de que os arquivos estão prontos. Volte à Central de Contas para baixar todos os ZIPs dessa solicitação e extraia-os no computador.

### Pelo navegador

Com a conta logada, abra a [Central de Contas do Instagram](https://accountscenter.instagram.com/), entre em **Suas informações e permissões** e siga o mesmo fluxo de exportação acima. O atalho [Exportar/baixar suas informações](https://accountscenter.instagram.com/info_and_permissions/dyi/) também pode abrir essa seção diretamente.

Os nomes e a ordem dos menus variam por versão, idioma e conta. A Meta documenta a exportação na [Central de Ajuda do Instagram](https://help.instagram.com/181231772500920) e confirma que os controles de download ficam na [Central de Contas](https://about.fb.com/news/2023/10/manage-your-information-across-apps/). O acesso a essas páginas pode exigir login. Guia revisado em **27/10/2026**.

### Encontrar os arquivos de entrada

Depois de extrair o ZIP da Meta, procure uma estrutura semelhante a esta:

```text
connections/
└── followers_and_following/
    ├── followers_1.json
    ├── followers_2.json     ← se existir, inclua também
    ├── followers_3.json     ← inclua todas as partes
    └── following.json
```

A pasta externa pode ter outro nome. Você deve selecionar os arquivos **JSON extraídos**, não o ZIP nem arquivos HTML.

| Campo na extensão | O que selecionar |
| --- | --- |
| **Seguidores** | Todos os `followers_*.json` da mesma exportação. Use Ctrl+clique no Windows ou Cmd+clique no macOS para selecionar mais de um. |
| **Seguindo** | O arquivo `following.json` da mesma conta e da mesma solicitação. |

Se só existir `followers_1.json`, basta selecioná-lo. **Não importe apenas a primeira parte quando houver outras:** os seguidores das partes ausentes poderiam ser tratados como pessoas que não seguem você. Não misture arquivos de datas ou contas diferentes.

O formato esperado é uma lista de registros no arquivo de seguidores e um objeto com a chave `relationships_following` no arquivo de seguindo. Outros relatórios, como solicitações de amizade pendentes, não substituem esses arquivos.

## 2. Instalar a extensão

Requisito: **Google Chrome no computador**, com acesso ao Instagram. A extensão não funciona dentro do aplicativo móvel do Instagram e não é distribuída pela Chrome Web Store.

1. Abra a [última release](https://github.com/Mapa0/instagram-followback-helper/releases/latest).
2. Em **Assets**, baixe `instagram-followback-helper-vX.Y.Z.zip`. Os arquivos automáticos **Source code (zip/tar.gz)** são o código do repositório; o ZIP nomeado da extensão é o pacote pronto para instalar.
3. **Extraia** o ZIP para uma pasta permanente no computador.
4. No Chrome, digite `chrome://extensions` na barra de endereços.
5. Ative **Modo do desenvolvedor**.
6. Clique em **Carregar sem compactação** e selecione a pasta `instagram-followback-helper` que contém o arquivo **`manifest.json`**.
7. No menu de extensões do Chrome (ícone de quebra-cabeça), fixe **Instagram Followback Helper** para facilitar o acesso.

O pacote pronto é uma extensão sem compactação para carregar nesse modo. Não é necessário compilar nem instalar dependências. Mantenha a pasta no disco enquanto usar a extensão.

## 3. Importar as listas e executar

1. Abra `https://www.instagram.com/` no Chrome e entre na conta da exportação.
2. Com essa aba selecionada, clique no ícone da extensão.
3. Em **Seguidores**, selecione todos os arquivos `followers_*.json`.
4. Em **Seguindo**, selecione `following.json` e clique em **Comparar listas**.
5. Em **O que você quer fazer?**, selecione **Deixar de seguir quem não me segue** ou **Remover seguidores que não sigo**. A segunda opção lista quem aparece em `followers_*.json` e não em `following.json`; não precisa baixar outros arquivos.
6. Confira os números, busque os nomes que quiser e marque como concluídos os perfis que deseja excluir da execução. Você também pode baixar o CSV antes de agir.
7. Ajuste os intervalos, se necessário.
8. Com a aba do Instagram ativa, abra a extensão novamente e clique em **Deixar de seguir — N perfis** ou **Remover seguidores — N perfis**, conforme a opção selecionada. Para remover seguidores, abra seu próprio perfil antes de iniciar; a extensão identifica sua conta pelo link **Perfil** ou pelo botão **Editar perfil**.
9. A extensão abre uma aba de progresso e usa a aba do Instagram para visitar os perfis. **Mantenha as duas abertas** e não navegue manualmente na aba usada pela execução.
10. Acompanhe os resultados. Para interromper, use **Parar após o perfil atual**. Ao terminar, clique em **Baixar registro CSV** para guardar o histórico.

Ao atualizar de uma versão anterior à 1.1.0, compare novamente os mesmos arquivos já baixados da Meta para habilitar a lista de remoção. As versões anteriores guardavam somente os candidatos a unfollow, por isso não é possível reconstruir a lista inversa apenas com o resultado salvo. Nas comparações novas, você pode alternar entre as opções sem reimportar. Durante uma execução, a seleção da opção e a importação ficam desabilitadas.

Na remoção, a extensão primeiro confere que você não segue o perfil. Depois abre seu próprio perfil, entra em **Seguidores**, pesquisa o @ e usa apenas o botão **Remover** da linha desse usuário. Confere a confirmação de **Remover seguidor** e verifica se o @ desapareceu dos resultados. Se a busca, o botão ou a confirmação não forem reconhecidos, o perfil é registrado como pulado. O menu de três pontos do perfil de outra pessoa não é usado nesse fluxo.

O contador **Seguidores** pode aparecer como link, botão ou texto em um `span`. A lista pode abrir em um modal suspenso, mantendo o endereço do seu perfil. A extensão reconhece esses formatos e reutiliza o modal se ele já estiver aberto.

Se a pesquisa pelo @ completo não encontrar o perfil, a extensão tenta termos mais curtos. Por exemplo, procura `51_joao.93` e depois `51_joao`. O @ usado para escolher o botão **Remover** continua sendo o completo; um nome parecido não é suficiente. A extensão também reencontra o modal e o campo quando o Instagram os recria durante a pesquisa e tenta preencher novamente o texto se ele for perdido.

Fechar o popup da extensão não interrompe a fila. Fechar a aba de progresso interrompe a execução. A extensão não oferece retomada automática da fila após reiniciar o navegador; os registros salvos ajudam a revisar o que ocorreu.

### Configurar os intervalos

As preferências ficam salvas para a próxima execução. Ajuste antes de iniciar; durante a execução os campos ficam desabilitados.

| Campo | Padrão | Faixa | Efeito do valor `0` |
| --- | --- | --- | --- |
| Intervalo entre perfis | 15 segundos | 0–300 segundos | Não adiciona espera entre perfis |
| Pausa a cada | 25 perfis | 0–5.000 perfis | Desativa a pausa periódica |
| Duração da pausa | 120 segundos | 0–3.600 segundos | Desativa a pausa periódica |

A pausa periódica substitui o intervalo comum naquele ponto da fila. O carregamento da página e a espera pelas confirmações do Instagram continuam levando tempo. Páginas reconhecidas como indisponíveis são puladas sem aplicar essa espera adicional. Intervalos curtos podem provocar restrições no Instagram; não existe um intervalo garantido contra bloqueios.

### Resultados e perfis pulados

| Status no registro | Significado |
| --- | --- |
| `unfollowed` | A interface passou a mostrar **Seguir/Follow** depois da confirmação. |
| `already_not_following` | O perfil já mostrava **Seguir/Follow** antes de qualquer ação. |
| `follower_removed` | A remoção foi confirmada e o @ deixou de aparecer na busca da sua lista de seguidores. |
| `now_following` | Você segue o perfil ou solicitou segui-lo atualmente; o seguidor foi preservado e fica fora de uma nova fila de remoção. |
| `skipped` | Página indisponível, botão não reconhecido, erro de carregamento ou ação sem confirmação visual. A fila segue adiante. |
| `blocked` | Foi detectado captcha, desafio, pedido de login ou bloqueio. A execução para. |

O CSV de execução inclui `username`, `status`, `detail` e `timestamp`. O CSV do popup lista os candidatos com `username`, `profile_url` e `status` de progresso; são relatórios diferentes.

Os registros `unfollowed` e `already_not_following` são incorporados ao progresso de unfollows; `follower_removed` e `now_following`, ao de remoção. O progresso é salvo mesmo com o popup fechado. Perfis `skipped` continuam pendentes e podem ser tentados novamente. Marcar uma caixa manualmente só altera o progresso local. **Zerar progresso** limpa somente a opção selecionada; não reverte as ações no Instagram. Importar e comparar novamente inicia um novo progresso para as duas opções. Baixe o registro de execução antes de iniciar outra fila, pois ele é substituído pela próxima execução.

## Solução de problemas

| Problema | O que verificar |
| --- | --- |
| “Arquivo não tem o formato esperado” | Confira se baixou JSON, extraiu o ZIP e selecionou os arquivos corretos. HTML e outros relatórios não são suportados. |
| Candidatos demais ou conhecidos aparecendo na lista | Confirme **Todo o período**, a mesma conta e todas as partes `followers_*.json`. Gere uma exportação nova se necessário. |
| “Abra uma aba do Instagram” | Ative uma aba com `https://www.instagram.com/`, confirme o login e abra a extensão nessa aba. |
| “Esta página não está disponível” | A extensão reconhece a mensagem em português/inglês e pula o perfil automaticamente. |
| Botão mudou ou não apareceu | O perfil é registrado como pulado. O Instagram pode ter mudado a interface; veja se existe uma release mais recente. |
| Captcha, bloqueio ou verificação | A extensão interrompe a fila. Resolva a situação diretamente no Instagram e confira os registros antes de iniciar outra execução. Ela não tenta contornar essas telas. |
| A fila aparece em andamento, mas a aba de progresso foi perdida | Se a aba de progresso ainda existir, feche-a e reabra o popup. Se o estado ficou preso após um fechamento inesperado, veja a recuperação abaixo. |
| Chrome diz que o manifesto está ausente | Selecione a pasta interna que realmente contém `manifest.json`, não a pasta acima dela nem o ZIP. |

**Recuperação de estado preso:** como último recurso, remover e reinstalar a extensão limpa o armazenamento local, incluindo listas, progresso, preferências e o registro de execução. Salve os CSVs antes, se ainda puder acessá-los, e reimporte uma exportação recente ao reinstalar.

### Atualizar

Pare a execução, baixe a nova release e substitua os arquivos na **mesma pasta** carregada no Chrome. Em `chrome://extensions`, clique em **Recarregar** no cartão da extensão. Reabra o popup e confira o progresso. Carregar uma cópia em outro caminho pode criar uma instalação separada; remover a antiga apaga os dados locais dela.

## Privacidade e permissões

A comparação ocorre no navegador. A extensão não envia os arquivos JSON nem os registros para um servidor próprio, não tem telemetria e não pede sua senha. Durante a execução, o Instagram recebe as navegações e os cliques feitos na sua sessão logada. As listas, preferências e registros ficam em `chrome.storage.local` até serem substituídos ou a extensão ser removida.

| Permissão | Uso |
| --- | --- |
| `storage` | Guardar listas, configurações, progresso e histórico localmente. |
| `clipboardWrite` | Copiar a lista de candidatos pendentes. |
| `activeTab` | Identificar a aba ativa usada para iniciar a execução. |
| `scripting` | Executar os cliques e verificações na página do Instagram. |
| `https://www.instagram.com/*` | Permitir acesso às páginas do Instagram usadas pela fila. |

As automações dependem da interface web e podem ser limitadas pelo Instagram. Este projeto é independente, sem vínculo com a Meta. Os arquivos de exportação são pessoais: não os publique em issues, commits ou comentários. Para reportar um erro, forneça um exemplo fictício ou remova os dados identificáveis.

## Código e desenvolvimento

O código é JavaScript, HTML e CSS, sem dependências externas em tempo de execução. O manifesto usa **Manifest V3**.

```text
extension/            # Pasta que pode ser carregada diretamente no Chrome
  manifest.json       # Metadados e permissões
  modes.js            # Opções de ação e progresso separado
  popup.*             # Importação, comparação, ajustes e lista de candidatos
  service_worker.js   # Inicialização da execução e controle das abas
  runner.*            # Fila, cliques e registro
scripts/
  build_release.py    # Empacotamento reproduzível e checksum SHA-256
tests/
  *.test.cjs          # Importação, opções, progresso, fila e interface simulada
```

Para desenvolver, clone o projeto e carregue a pasta **`extension/`** em `chrome://extensions`. Veja [CONTRIBUTING.md](CONTRIBUTING.md) para validação e empacotamento. A [lista de mudanças](CHANGELOG.md) registra as versões.

## Licença

[MIT](LICENSE). Você pode usar, estudar, modificar e redistribuir o código conforme os termos da licença.
