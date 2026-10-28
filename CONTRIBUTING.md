# Contribuir

O projeto usa JavaScript, HTML e CSS sem dependências externas. Para desenvolver, clone o repositório, abra `chrome://extensions`, ative o modo do desenvolvedor e carregue a pasta `extension/`.

## Validar

Use Node.js 18 ou superior para os testes e a checagem de sintaxe:

```sh
node --test
node --check extension/modes.js
node --check extension/popup.js
node --check extension/runner.js
node --check extension/service_worker.js
```

Os testes usam somente dados fictícios, armazenamento e DOM simulados, sem acessar o Instagram. Cobrem as duas diferenças de conjuntos, migração e separação do progresso, seleção da fila e cliques nas duas ações em português e inglês. Cliques, seletores e respostas da interface real precisam ser verificados manualmente; mudanças no site podem afetar a automação. Para verificar a importação sem executar ações, carregue a extensão, compare arquivos de exemplo e alterne entre as opções sem clicar em **Deixar de seguir** ou **Remover seguidores**.

Os testes `followers.browser.test.cjs` usam Playwright como dependência opcional de desenvolvimento e Chrome instalado. Se o módulo estiver disponível, `node --test` também verifica a busca e a remoção em páginas fictícias com DOM real. Todas as requisições dessas páginas são interceptadas; nenhuma conta do Instagram é acessada. Sem Playwright, esses testes são indicados como pulados. Para habilitá-los, instale `playwright` no ambiente de desenvolvimento ou exponha sua instalação pelo `NODE_PATH`. A extensão e os outros testes continuam sem dependências.

## Gerar o pacote

O empacotamento precisa apenas de Python 3.9 ou superior, com a biblioteca padrão:

```sh
python scripts/build_release.py
```

O script lê a versão do manifesto e cria os seguintes arquivos em `dist/`:

```text
instagram-followback-helper-vX.Y.Z.zip
SHA256SUMS.txt
```

O ZIP contém uma pasta `instagram-followback-helper/` com os nove arquivos da extensão, o README, a licença, o changelog e este guia. O empacotamento usa uma lista explícita de arquivos e metadados fixos para evitar incluir dados de usuários e permitir repetir o mesmo SHA-256 em diferentes ambientes.

Para validar uma tag e escolher a pasta de saída:

```sh
python scripts/build_release.py --tag v1.1.4 --output-dir dist
```

Uma tag incompatível com o manifesto interrompe o empacotamento. O checksum pode ser conferido com `sha256sum` no Linux/macOS ou `Get-FileHash -Algorithm SHA256` no PowerShell.

## Publicar uma release

1. Atualize a versão em `extension/manifest.json` e registre as mudanças no `CHANGELOG.md`.
2. Execute as validações e gere o pacote.
3. Faça commit e push do código, crie a tag da versão e envie-a ao GitHub.
4. Com a CLI `gh` autenticada, publique os artefatos. Use um arquivo UTF-8 real para as notas:

```sh
gh release create vX.Y.Z dist/instagram-followback-helper-vX.Y.Z.zip dist/SHA256SUMS.txt --verify-tag --title "Instagram Followback Helper vX.Y.Z" --notes-file release-notes.md
```

## Reportar problemas

Abra uma issue com a versão da extensão, a versão do Chrome, o idioma do Instagram, o comportamento esperado e o resultado observado. Se o problema envolver importação, use registros fictícios com a mesma estrutura. Nunca anexe sua exportação completa, cookies, senhas ou dados de sessão. Revise capturas de tela e registros antes de publicar.
