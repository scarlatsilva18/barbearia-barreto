# Projeto: Sistema de Agendamento Online para Barbearia

**Documento:** Escopo funcional e requisitos iniciais\
**Versão:** 1.0\
**Tipo:** MVP (Produto Mínimo Viável)

## 1. Objetivo do projeto

Desenvolver um sistema web responsivo para gerenciamento de agendamentos
de uma barbearia. O sistema permitirá que os clientes consultem horários
disponíveis e realizem seus próprios agendamentos de forma simples e
intuitiva, sem precisar instalar um aplicativo.

A solução deverá integrar-se ao WhatsApp para compartilhar links de
acesso, enviar confirmações e lembretes de agendamentos, além de
comunicados, promoções e divulgação de horários disponíveis.

Os principais objetivos são:

-   Automatizar o processo de agendamento.
-   Reduzir o trabalho operacional da barbearia.
-   Diminuir faltas e horários ociosos.
-   Melhorar a comunicação e o relacionamento com os clientes.
-   Disponibilizar informações gerenciais sobre a operação.

## 2. Escopo e perfis de acesso

O sistema deverá possuir inicialmente dois perfis: administrador e
cliente.

### 2.1. Administrador (barbeiro)

O administrador será responsável pela configuração e gestão da
barbearia. Deverá poder:

-   Visualizar os agendamentos em visões diária, semanal e mensal.
-   Criar, editar, confirmar, concluir e cancelar agendamentos.
-   Cadastrar, editar e inativar serviços.
-   Definir duração e preço dos serviços.
-   Configurar dias e horários de funcionamento.
-   Bloquear horários específicos para almoço, compromissos, folgas ou
    imprevistos.
-   Cadastrar feriados e exceções de funcionamento.
-   Consultar e atualizar os dados dos clientes.
-   Consultar o histórico de agendamentos dos clientes.
-   Enviar mensagens individuais ou campanhas pelo WhatsApp, respeitando
    as autorizações dos contatos.
-   Consultar indicadores básicos da barbearia.

### 2.2. Cliente

O cliente receberá um link de acesso ao sistema, preferencialmente pelo
WhatsApp. Na versão inicial, não será obrigatório criar uma senha.

A identificação poderá ser feita pelo número de celular, sendo o e-mail
opcional. O cliente deverá poder:

-   Visualizar os serviços disponíveis, suas descrições, durações e
    preços.
-   Consultar datas e horários disponíveis.
-   Selecionar o serviço, a data e o horário desejados.
-   Informar nome e número de celular.
-   Confirmar o agendamento.
-   Consultar seus próximos agendamentos.
-   Solicitar alteração ou cancelamento, conforme as regras definidas
    pela barbearia.

**Observação de segurança:** embora o MVP possa dispensar senha,
recomenda-se evoluir para validação por código temporário (OTP) enviado
ao celular. Apenas informar um número de telefone não deve ser
suficiente para consultar ou cancelar agendamentos, pois isso permitiria
acesso indevido aos dados de terceiros.

## 3. Regras de funcionamento da agenda

### 3.1. Horários padrão

  Dia                       Horário de funcionamento
  ------------------------- --------------------------
  Terça a sexta-feira       09:00 às 19:00
  Sábado                    08:00 às 18:00
  Domingo e segunda-feira   Fechado

Os horários deverão ser configuráveis pelo administrador, permitindo
ajustes futuros sem necessidade de alteração no código do sistema.

### 3.2. Regras de disponibilidade

-   O sistema deverá gerar os horários disponíveis com base no
    expediente, na duração do serviço e nos agendamentos existentes.
-   Um horário já reservado não poderá ser selecionado por outro
    cliente.
-   O sistema deverá impedir agendamentos fora do expediente.
-   O administrador poderá bloquear períodos ou horários específicos.
-   Deverá ser possível cadastrar feriados, férias, folgas e exceções.
-   A agenda deverá considerar a duração de cada serviço para evitar
    sobreposição de atendimentos.
-   A disponibilidade deverá ser validada novamente no momento da
    confirmação, evitando que dois clientes reservem simultaneamente o
    mesmo horário.
-   O sistema deverá permitir configurar antecedência mínima e limite
    máximo para agendamentos, se necessário.

## 4. Cadastro de serviços

O administrador poderá cadastrar os serviços oferecidos pela barbearia,
informando nome, descrição, duração estimada, preço e situação (ativo ou
inativo).

Exemplo ilustrativo:

  Serviço                Duração       Valor
  ----------------- ------------ -----------
  Corte de cabelo     30 minutos   R\$ 35,00
  Barba               20 minutos   R\$ 25,00
  Cabelo + barba      50 minutos   R\$ 55,00
  Sobrancelha         15 minutos   R\$ 15,00

A duração cadastrada deverá ser utilizada no cálculo automático dos
horários disponíveis. Os valores deverão ser editáveis pelo
administrador.

## 5. Integração com WhatsApp

A integração com o WhatsApp será uma funcionalidade central do sistema.

### 5.1. Mensagens transacionais

O sistema deverá permitir o envio de mensagens relacionadas aos
agendamentos:

-   Link de acesso ao sistema.
-   Confirmação do agendamento.
-   Lembrete antes do atendimento.
-   Aviso de alteração ou cancelamento.
-   Notificação sobre disponibilidade de um horário desejado, quando
    aplicável.

Sugestão inicial de lembretes:

-   Um lembrete 24 horas antes do atendimento.
-   Um lembrete adicional 2 horas antes, opcional.

### 5.2. Mensagens de divulgação

O administrador poderá enviar:

-   Promoções e descontos.
-   Divulgação de novos serviços.
-   Comunicados gerais.
-   Campanhas para clientes inativos.
-   Divulgação de horários vagos ou encaixes disponíveis.

O envio deverá permitir selecionar destinatários e visualizar a mensagem
antes do disparo.

### 5.3. Requisitos e limitações da integração

-   Priorizar a API oficial do WhatsApp Business Platform ou um provedor
    autorizado.
-   Respeitar as regras do WhatsApp para modelos de mensagem, janelas de
    atendimento e limites de envio.
-   Registrar o consentimento dos clientes para o recebimento de
    mensagens promocionais.
-   Disponibilizar uma forma simples para o cliente deixar de receber
    campanhas.
-   Manter registro dos envios e, quando disponível, do status de
    entrega.
-   Não presumir que uma aplicação web terá acesso irrestrito à agenda
    de contatos do WhatsApp.

**Alternativa para cadastro de contatos:** permitir cadastro manual,
inclusão pelo próprio cliente ao realizar o primeiro agendamento ou
importação de arquivo CSV com contatos obtidos de forma legítima e com
as autorizações necessárias.

## 6. Notificações e lembretes automáticos

O sistema deverá automatizar as principais comunicações para reduzir
esquecimentos e faltas.

  Evento                           Notificação sugerida
  -------------------------------- ----------------------------------
  Agendamento confirmado           Imediatamente após a confirmação
  Atendimento próximo              24 horas antes
  Atendimento próximo (opcional)   2 horas antes
  Agendamento cancelado            Após o cancelamento
  Agendamento alterado             Após a alteração

As mensagens deverão conter, no mínimo, o nome do cliente, serviço,
data, horário e identificação da barbearia, conforme aplicável.

## 7. Painel administrativo e indicadores

O administrador deverá contar com um painel para acompanhar a operação.

Indicadores sugeridos:

-   Quantidade de agendamentos do dia.
-   Atendimentos concluídos.
-   Agendamentos pendentes ou confirmados.
-   Agendamentos cancelados.
-   Horários ainda disponíveis.
-   Quantidade de clientes novos e recorrentes.
-   Serviços mais procurados.
-   Faturamento estimado por período, com base nos serviços registrados.

Os indicadores financeiros deverão ser tratados como estimativas
enquanto o sistema não possuir controle efetivo de pagamentos e
recebimentos.

## 8. Funcionalidades adicionais recomendadas

As funcionalidades abaixo são sugestões para evoluções posteriores e não
precisam fazer parte da primeira entrega.

### 8.1. Lista de espera

Quando não houver horários disponíveis, o cliente poderá solicitar
inclusão em uma lista de espera. Se surgir uma vaga, o sistema poderá
notificar os clientes da lista, conforme critérios definidos pela
barbearia.

### 8.2. Programa de fidelidade

Permitir o acúmulo de pontos ou a contabilização de atendimentos para
oferecer benefícios, como desconto ou serviço gratuito após determinada
quantidade de visitas.

Exemplo: a cada dez cortes realizados, o cliente ganha um corte
gratuito.

### 8.3. Controle financeiro

Registrar serviços realizados, valores recebidos, formas de pagamento e
faturamento diário, semanal e mensal.

### 8.4. Avaliação do atendimento

Após o atendimento, enviar uma mensagem solicitando uma avaliação. O
administrador poderá consultar as avaliações recebidas.

### 8.5. Escolha do profissional

Caso a barbearia tenha mais de um profissional, permitir que o cliente
escolha o barbeiro. A disponibilidade deverá considerar a agenda
individual de cada profissional.

## 9. Requisitos não funcionais

-   **Responsividade:** funcionar adequadamente em celulares, tablets e
    computadores.
-   **Usabilidade:** apresentar fluxo de agendamento simples, com poucos
    passos.
-   **Segurança:** proteger os dados dos clientes e restringir funções
    administrativas a usuários autorizados.
-   **Privacidade:** coletar apenas os dados necessários e observar a
    Lei Geral de Proteção de Dados (LGPD).
-   **Disponibilidade:** manter a agenda acessível aos clientes,
    conforme a infraestrutura contratada.
-   **Integridade:** impedir reservas duplicadas e sobreposição de
    horários.
-   **Auditoria:** registrar operações administrativas relevantes, como
    cancelamentos, bloqueios e alterações de agendamento.
-   **Manutenibilidade:** manter a aplicação organizada para permitir
    inclusão de novas funcionalidades.

## 10. Tecnologias sugeridas

A escolha definitiva deverá considerar custo, experiência da equipe e
infraestrutura disponível. Para o protótipo, sugere-se:

  -----------------------------------------------------------------------
  Camada                              Tecnologia sugerida
  ----------------------------------- -----------------------------------
  Front-end                           React ou Next.js

  Back-end                            Node.js

  Banco de dados                      PostgreSQL

  Hospedagem                          AWS ou Vercel, conforme arquitetura

  Mensageria                          WhatsApp Business Platform (Cloud
                                      API) ou provedor autorizado

  Autenticação futura                 Código temporário enviado por SMS
                                      ou WhatsApp

  Interface                           Layout responsivo para celular e
                                      desktop
  -----------------------------------------------------------------------

As tecnologias são sugestões iniciais, não uma restrição obrigatória.

## 11. Planejamento de desenvolvimento

O desenvolvimento poderá ser dividido em três fases.

### Fase 1 --- MVP

-   Cadastro e acesso administrativo.
-   Configuração dos horários de funcionamento.
-   Cadastro de serviços, preços e duração.
-   Consulta de disponibilidade.
-   Agendamento pelo cliente.
-   Identificação básica do cliente.
-   Visualização e gerenciamento da agenda.
-   Bloqueio manual de horários.
-   Confirmação do agendamento na tela.

### Fase 2 --- Automação e WhatsApp

-   Integração com WhatsApp Business.
-   Envio do link de agendamento.
-   Mensagens de confirmação e lembretes.
-   Avisos de cancelamento e alteração.
-   Divulgação de horários disponíveis.
-   Campanhas promocionais com controle de consentimento.
-   Lista de espera.

### Fase 3 --- Gestão e expansão

-   Controle financeiro.
-   Programa de fidelidade.
-   Avaliações de atendimento.
-   Indicadores e relatórios avançados.
-   Gestão de múltiplos profissionais.
-   Suporte a múltiplas barbearias.

## 12. Diretriz de arquitetura para expansão

Embora o primeiro uso seja na Barbearia Barreto, recomenda-se projetar a
solução considerando a possibilidade de atender outras barbearias no
futuro.

Essa abordagem permitirá transformar o sistema em um SaaS (Software as a
Service), disponibilizado por assinatura.

Desde o início, recomenda-se prever a separação dos dados por
estabelecimento, incluindo:

-   Dados e configurações da barbearia.
-   Clientes.
-   Profissionais.
-   Serviços e preços.
-   Horários de funcionamento.
-   Agendamentos.
-   Configurações de comunicação.

Cada estabelecimento deverá visualizar e administrar somente seus
próprios dados.

## 13. Critérios de aceite do MVP

A primeira versão será considerada funcional quando atender aos
seguintes critérios:

-   O administrador conseguir configurar os dias e horários de
    funcionamento.
-   O administrador conseguir cadastrar serviços, preços e duração.
-   O cliente conseguir acessar o sistema por um link.
-   O cliente conseguir informar seus dados e selecionar um serviço.
-   O sistema exibir somente horários compatíveis com o expediente e com
    a disponibilidade da agenda.
-   O sistema impedir a reserva duplicada de um mesmo horário.
-   O cliente conseguir concluir um agendamento.
-   O administrador conseguir visualizar, alterar e cancelar
    agendamentos.
-   O administrador conseguir bloquear horários.
-   O sistema apresentar uma confirmação do agendamento ao cliente.

A integração efetiva com o WhatsApp e o envio automatizado de mensagens
poderão ser entregues na Fase 2, caso não façam parte do primeiro
protótipo.

## 14. Considerações finais

O protótipo deverá priorizar simplicidade, facilidade de uso e agilidade
no agendamento. O cliente deverá conseguir realizar uma reserva em
poucos passos, enquanto o administrador terá uma visão centralizada da
agenda e dos atendimentos.

A recomendação é iniciar com as funcionalidades essenciais do MVP e
evoluir gradualmente, mantendo desde o início uma estrutura técnica que
permita adicionar automações, recursos gerenciais e novos
estabelecimentos sem a necessidade de reconstruir toda a solução.
