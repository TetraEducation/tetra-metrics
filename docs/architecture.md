# Arquitetura em Camadas

Este documento define a separação arquitetural do projeto em quatro camadas: **domain**, **application**, **infrastructure** e **interface**.

## 1) Domain

### Responsabilidade
- Representar o **núcleo de negócio** e suas regras invariantes.
- Definir entidades, value objects, agregados e políticas de domínio.
- Expor contratos de negócio (por exemplo, regras de validação e consistência) sem depender de tecnologia específica.

### Dependências permitidas
- Pode depender apenas de bibliotecas utilitárias puras (sem acoplamento a framework/IO).
- **Não pode depender** de application, infrastructure ou interface.

---

## 2) Application

### Responsabilidade
- Orquestrar casos de uso (use cases).
- Coordenar fluxo entre domínio e portas externas (repositórios, mensageria, serviços externos), via interfaces.
- Definir DTOs de entrada/saída do caso de uso e políticas transacionais.

### Dependências permitidas
- Pode depender de **domain**.
- Pode definir e consumir **interfaces/ports** implementadas pela infrastructure.
- **Não pode depender diretamente** de detalhes concretos de infrastructure.
- **Não deve depender** de interface (controllers/UI).

---

## 3) Infrastructure

### Responsabilidade
- Implementar detalhes técnicos: persistência, cache, filas, integrações externas, observabilidade e adapters.
- Conter implementações concretas de ports definidas na application.
- Isolar escolhas de tecnologia (ORM, SQL, Redis, HTTP clients, etc.).

### Dependências permitidas
- Pode depender de **application** (para implementar interfaces/ports) e **domain** (quando necessário para mapeamento).
- Pode depender de bibliotecas/frameworks técnicos.
- **Não deve conter regra de negócio central** (isso pertence ao domain/application).

---

## 4) Interface

### Responsabilidade
- Expor o sistema para o mundo externo: HTTP controllers, CLI, workers de entrada, webhooks e serializers.
- Realizar parsing/validação superficial de protocolo (ex.: HTTP payload), delegando regra de negócio para application.
- Tratar concern de apresentação (status code, shape de resposta, contratos públicos).

### Dependências permitidas
- Pode depender de **application**.
- Pode usar componentes de infrastructure estritamente para bootstrap/wiring via DI.
- **Não deve depender** de lógica interna de domain além do necessário para tipagem de contratos.

---

## Matriz de dependências (resumo)

- `domain` → (nenhuma camada interna)
- `application` → `domain`
- `infrastructure` → `application`, `domain`
- `interface` → `application` (e wiring para infrastructure)

Regra geral: dependências devem apontar para dentro (do detalhe técnico para o núcleo), mantendo o domínio estável e protegido.
