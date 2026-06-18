export const platformWorkflowFixturePack = Object.freeze({
  accepted: [
    Object.freeze({
      id: "n8n-basic-review",
      platform: "n8n",
      provenance: "n8n workflow JSON fixture shaped from public import/export format docs",
      input: Object.freeze({
        name: "Fixture n8n review flow",
        versionId: "fixture-n8n-v1",
        nodes: [
          {
            id: "start",
            name: "Manual Trigger",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: "set-summary",
            name: "Set Summary",
            type: "n8n-nodes-base.set",
            typeVersion: 3,
            position: [260, 0],
            parameters: {
              values: {
                string: [{ name: "title", value: "={{ $json.title }}" }]
              }
            },
            credentials: {
              sampleApi: { id: "vault:n8nSampleApi", name: "Sample API" }
            }
          }
        ],
        connections: {
          "Manual Trigger": {
            main: [[{ node: "Set Summary", type: "main", index: 0 }]]
          }
        }
      }),
      golden: Object.freeze({
        adapter: { decision: "accepted", nodes: 2, edges: 1, credentialReferences: 1, expressions: 1, blockedFindings: 0 },
        canonicalIr: { nodes: 2, edges: 1, nodeTypes: ["input", "transform"] },
        capability: { status: "permission-required", executable: 1, permissionRequired: 1, blocked: 0, handoffOnly: 0 },
        lossReport: { preserved: 2, normalized: 1, degraded: 2, blocked: 0, handoffOnly: 0 }
      })
    }),
    Object.freeze({
      id: "dify-basic-review",
      platform: "dify",
      provenance: "Dify DSL YAML fixture shaped from public DSL/app portability docs",
      input: [
        "app:",
        "  name: Fixture Dify review flow",
        "  mode: workflow",
        "version: 0.3.0",
        "workflow:",
        "  graph:",
        "    nodes:",
        "      - id: start",
        "        data: { title: Start, type: start }",
        "      - id: answer",
        "        data:",
        "          title: Answer",
        "          type: llm",
        "          model: { provider: openai, name: gpt-safe-review }",
        "          prompt_template:",
        "            - { role: user, text: \"Review {{#sys.query#}}\" }",
        "    edges:",
        "      - { id: edge-start-answer, source: start, target: answer }",
        ""
      ].join("\n"),
      golden: Object.freeze({
        adapter: { decision: "accepted", nodes: 2, edges: 1, credentialReferences: 0, expressions: 1, blockedFindings: 0 },
        canonicalIr: { nodes: 2, edges: 1, nodeTypes: ["handoff", "input"] },
        capability: { status: "accepted", executable: 1, permissionRequired: 0, blocked: 0, handoffOnly: 1 },
        lossReport: { preserved: 2, normalized: 0, degraded: 1, blocked: 0, handoffOnly: 1 }
      })
    }),
    Object.freeze({
      id: "langgraph-basic-review",
      platform: "langgraph",
      provenance: "LangGraph manifest fixture shaped from public langgraph.json app structure docs",
      input: Object.freeze({
        node_version: "20",
        graphs: { agent: "./src/agent/graph.py:graph" },
        dependencies: ["."],
        env: {}
      }),
      golden: Object.freeze({
        adapter: { decision: "accepted", nodes: 1, edges: 0, credentialReferences: 0, expressions: 0, blockedFindings: 0 },
        canonicalIr: { nodes: 1, edges: 0, nodeTypes: ["handoff"] },
        capability: { status: "accepted", executable: 0, permissionRequired: 0, blocked: 0, handoffOnly: 1 },
        lossReport: { preserved: 0, normalized: 0, degraded: 0, blocked: 0, handoffOnly: 1 }
      })
    })
  ],
  negative: [
    Object.freeze({
      id: "n8n-dangling-edge",
      platform: "n8n",
      provenance: "Synthetic dangling target case",
      input: Object.freeze({
        nodes: [{ id: "start", name: "Start", type: "n8n-nodes-base.manualTrigger", position: [0, 0], parameters: {} }],
        connections: { Start: { main: [[{ node: "Missing", type: "main", index: 0 }]] } }
      }),
      expected: Object.freeze({ mode: "blocked", errorCode: "platform.dangling-edge" })
    }),
    Object.freeze({
      id: "dify-cycle",
      platform: "dify",
      provenance: "Synthetic cycle case",
      input: [
        "workflow:",
        "  graph:",
        "    nodes:",
        "      - id: a",
        "        data: { title: A, type: start }",
        "      - id: b",
        "        data: { title: B, type: llm }",
        "    edges:",
        "      - { id: ab, source: a, target: b }",
        "      - { id: ba, source: b, target: a }",
        ""
      ].join("\n"),
      expected: Object.freeze({ mode: "blocked", errorCode: "platform.cycle" })
    }),
    Object.freeze({
      id: "n8n-duplicate-id",
      platform: "n8n",
      provenance: "Synthetic duplicate id case",
      input: Object.freeze({
        nodes: [
          { id: "same", name: "One", type: "n8n-nodes-base.set", position: [0, 0], parameters: {} },
          { id: "same", name: "Two", type: "n8n-nodes-base.set", position: [100, 0], parameters: {} }
        ],
        connections: {}
      }),
      expected: Object.freeze({ mode: "blocked", errorCode: "platform.duplicate-node" })
    }),
    Object.freeze({
      id: "n8n-secret-like-value",
      platform: "n8n",
      provenance: "Synthetic secret-like value case",
      input: Object.freeze({
        nodes: [
          {
            id: "secret",
            name: "Secret",
            type: "n8n-nodes-base.set",
            position: [0, 0],
            parameters: { header: `Authorization: Bearer ${"a".repeat(20)}` }
          }
        ],
        connections: {}
      }),
      expected: Object.freeze({ mode: "blocked", errorCode: "platform.inline-secret" })
    }),
    Object.freeze({
      id: "n8n-shell-node",
      platform: "n8n",
      provenance: "Synthetic shell capability case",
      input: Object.freeze({
        nodes: [{ id: "shell", name: "Shell", type: "n8n-nodes-base.executeCommand", position: [0, 0], parameters: { command: "echo safe" } }],
        connections: {}
      }),
      expected: Object.freeze({ mode: "blocked", errorCode: "platform.executable-node" })
    }),
    Object.freeze({
      id: "langgraph-traversal-ref",
      platform: "langgraph",
      provenance: "Synthetic traversal source reference case",
      input: Object.freeze({ graphs: { agent: "../agent/graph.py:graph" }, dependencies: [] }),
      expected: Object.freeze({ mode: "blocked", errorCode: "platform.unsafe-path" })
    }),
    Object.freeze({
      id: "dify-unsupported-provider",
      platform: "dify",
      provenance: "Synthetic unsupported provider stays non-executable",
      input: [
        "workflow:",
        "  graph:",
        "    nodes:",
        "      - id: provider",
        "        data:",
        "          title: Provider",
        "          type: llm",
        "          model: { provider: unknown_vendor, name: unknown }",
        "    edges: []",
        ""
      ].join("\n"),
      expected: Object.freeze({ mode: "non-executable" })
    }),
    Object.freeze({
      id: "n8n-oversized",
      platform: "n8n",
      provenance: "Synthetic bounded size case",
      options: Object.freeze({ maxBytes: 10 }),
      input: Object.freeze({ nodes: [{ id: "start", name: "Start", type: "n8n-nodes-base.manualTrigger", position: [0, 0], parameters: {} }], connections: {} }),
      expected: Object.freeze({ mode: "blocked", errorCode: "platform.oversized" })
    })
  ]
});
