# Secondary Workflow Format Compatibility Backlog

Status: Backlog/reference only.

Agentique UI currently treats n8n, Dify, and LangGraph as the first-class import formats for adapter, canonical IR, loss-report, capability, fixture, and run-plan validation. The formats below are compatibility candidates only. They are not supported import options, not local execution targets, and not early support promises.

## Promotion Gate

A secondary format can move out of backlog only after all of these are present:

- adapter tests
- loss report mapping
- capability classification
- public-safe fixtures
- UI exposure review
- public boundary validation
- full validation pass

Until then, every candidate remains descriptor-only, non-executing, and hidden from supported import UI.

## Decision Matrix

| Format | Input Format | Schema Availability | Import Value | Risk | Local Subset | Handoff Target | Fixture Feasibility | Decision |
|---|---|---|---|---|---|---|---|---|
| Node-RED | flow JSON export | Documented flow JSON conventions; node palette schemas vary. | Visual event flows and wiring conventions. | High | None until node palette classification exists. | User-owned Node-RED runtime descriptor. | Medium | No-go for early support. |
| Serverless Workflow | JSON or YAML workflow definition | Published specification and schema artifacts. | Portable state-machine and event metadata. | Medium | Static graph and transition review only. | Serverless platform descriptor. | High | No-go for early support. |
| Argo Workflows | Kubernetes workflow YAML | CRDs and Argo documentation. | DAG, step templates, and artifact dependencies. | High | None until container and cluster policies are modeled. | User-owned Kubernetes or Argo runtime descriptor. | Medium | No-go for early support. |
| Flowise | chatflow JSON export | Public export format with evolving node catalog. | LLM chain and tool graph comparison. | High | Static graph review only. | User-owned Flowise runtime descriptor. | Medium | No-go for early support. |
| Langflow | flow JSON export | Public flow export format with component catalog. | Component-level LLM pipeline graphs. | High | Static graph review only. | User-owned Langflow runtime descriptor. | Medium | No-go for early support. |
| GitHub Actions | workflow YAML | Documented workflow syntax. | Trigger, job, dependency, matrix, and artifact flow analysis. | High | Static job graph and permission review only. | User-owned CI runtime descriptor. | High | No-go for early support. |
| Airflow | DAG definitions and serialized metadata | Public DAG concepts; source definitions are commonly code-first. | DAG scheduling, operator taxonomy, and retry semantics. | High | None until operator families can be statically classified. | User-owned Airflow deployment descriptor. | Low | No-go for early support. |
| BPMN | BPMN XML | OMG BPMN specification and XML schema family. | Business process diagrams, events, gateways, and human tasks. | Medium | Diagram and process graph review only. | BPMN engine descriptor. | High | No-go for early support. |
| Haystack | pipeline YAML or Python-defined pipeline metadata | Public pipeline component documentation. | Retrieval pipeline and component dependency mapping. | High | Static pipeline graph review only. | User-owned Haystack runtime descriptor. | Medium | No-go for early support. |
| Kestra | flow YAML | Public flow and task documentation. | Workflow orchestration and task dependency concepts. | High | Static flow graph review only. | User-owned Kestra runtime descriptor. | Medium | No-go for early support. |
| AutoGen | agent/team definitions and code-first workflows | Public agent framework documentation; workflow data shape varies. | Multi-agent conversation and tool orchestration concepts. | High | None until agent and tool declarations are safe descriptors. | User-owned AutoGen runtime descriptor. | Low | No-go for early support. |
| LlamaIndex Workflows | workflow definitions and code-first event flows | Public workflow documentation; source definitions are commonly code-first. | Event-driven AI workflow concepts. | High | None until workflow events and steps are static descriptors. | User-owned LlamaIndex runtime descriptor. | Low | No-go for early support. |
| CrewAI | crew, agent, task, and flow definitions | Public framework documentation; definitions can be YAML or code-first. | Task delegation and multi-agent role modeling. | High | Static role and task graph review only after descriptor schema selection. | User-owned CrewAI runtime descriptor. | Low | No-go for early support. |

## Security Boundary

- No secondary format is a supported import option.
- No secondary format can start a runtime, bridge, container, provider call, package lifecycle action, shell command, or browser/session-data read.
- Credentials, local files, environment values, and browser data remain blocked until a format-specific safety gate exists.
- UI exposure requires adapter tests, loss report mapping, capability classification, public-safe fixtures, and full validation.
