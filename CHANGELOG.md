# Changelog

## 1.1.3 — 2026-10-28

- Release pública que reúne os novos modos, a identificação da conta e as correções de remoção da [PR #1](https://github.com/Mapa0/instagram-followback-helper/pull/1), contribuição de [@wizard-moises-ximenes](https://github.com/wizard-moises-ximenes).
- README atualizado com a comparação dos dois modos, os arquivos CSV de cada ação, a identificação da conta e o guia de migração da `1.0.4`.
- Corrigida a busca que era interrompida quando o Instagram recriava o modal ou o campo de pesquisa.
- O campo e o modal são localizados novamente durante a busca e a confirmação; texto rejeitado é preenchido novamente com tentativas limitadas e entrada incremental.
- Busca primeiro pelo @ completo e, se necessário, por termos mais curtos, incluindo nomes sem o sufixo numérico. A remoção exige sempre o @ completo no resultado, mesmo quando a pesquisa é abreviada.
- Mensagens distintas para campo que não mantém o texto, modal indisponível e @ exato não encontrado.
- Testes de regressão com substituição de elementos, busca abreviada, sufixos como `.64` e nomes parecidos que devem ser preservados.

## 1.1.2 — 2026-10-27

- O contador **Seguidores** pode ser um `span`, botão ou controle genérico, sem link; o clique reconhece o texto e propaga o evento até o controle do Instagram.
- Suporte ao modal suspenso sem mudança na URL e a painéis sem `role="dialog"`, incluindo a confirmação de remoção.
- Reutiliza a lista quando já está aberta e aguarda o carregamento do contador antes de pular o perfil.
- Testes no Chrome reproduzem o HTML aninhado do contador e o modal com pesquisa.

## 1.1.1 — 2026-10-27

- Corrigida a remoção quando o menu de três pontos do perfil não oferece **Remover seguidor**.
- A extensão identifica a conta logada, verifica o perfil candidato e busca o @ exato na lista de **Seguidores** do próprio usuário para remover e confirmar.
- Verificação da linha correta, da conta e do desaparecimento do resultado; testes de integração com DOM no Chrome em português e inglês, sem usar uma conta real.

## 1.1.0 — 2026-10-27

- Opção **Remover seguidores que não sigo**, usando os mesmos arquivos `followers_*.json` e `following.json` da Meta.
- Comparação nas duas direções, com seleção da ação, progresso e nomes de CSV separados.
- Remoção pelo menu do perfil com confirmação visual; seguidores que você passou a seguir ou solicitou seguir são preservados.
- Progresso salvo durante a execução mesmo com o popup fechado, com compatibilidade com os dados antigos de unfollow.
- Testes com dados e interface simulados para as duas ações, migração e isolamento do progresso.

## 1.0.4 — 2026-10-27

- Primeira publicação pública, sob licença MIT.
- Guia completo para exportar seguidores e seguindo na Central de Contas da Meta, instalar a extensão e acompanhar os resultados.
- Seleção de múltiplos arquivos `followers_*.json` para exportações divididas em partes.
- Empacotamento reproduzível em ZIP com checksum SHA-256 e testes com dados fictícios.

## 1.0.3 — 2026-10-06

- Detecção de páginas indisponíveis em português e inglês.
- Perfis indisponíveis pulados sem a espera adicional entre registros.

## 1.0.2 — 2026-10-06

- Intervalo entre perfis e pausas periódicas configuráveis, com preferências salvas localmente.

## 1.0.1 — 2026-10-06

- Continuidade da fila após erros de um perfil, mantendo a interrupção quando detectados captcha, bloqueio ou pedido de login.

## 1.0.0

- Importação de seguidores e seguindo, comparação local e automação dos unfollows pela interface web.
- Lista de candidatos, progresso e exportação de registros CSV.
