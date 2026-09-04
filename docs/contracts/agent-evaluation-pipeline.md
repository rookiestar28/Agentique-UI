# Agent Evaluation Pipeline Contract

The evaluation pipeline is an additive, offline repository check for the accepted local runtime
contracts. It does not replace targeted tests, desktop interaction evidence, the complete repository
validation gate, release gates, or human judgment.

## Authority And Inputs

- Cases use `agentique.agentEvaluationCase.v1` and reports use
  `agentique.agentEvaluationReport.v1`.
- A case must be a bounded repo-owned inline fixture or a separately pinned Git fixture with an
  exact digest. Runtime-loaded, downloaded, reference, production, and user-workspace fixtures are
  not accepted.
- Case data selects one code-owned adapter id. It cannot supply an executable, command, arguments,
  environment, package action, URL, network target, credential, or filesystem path.
- Reports bind the repository id, exact Git tree or uncommitted candidate digest, operating system,
  runtime versions, and fixed validation commands.

## Deterministic And Human Results

Deterministic checks are selected from a fixed registry. They cover permission decisions, calls and
results, effects, mutation/read/verification ordering, errors, the single terminal, projection
ordering, checkpoint commits, and cleanup. Interruption or cleanup failure prevents a passing
machine result.

Human review is a separate `unreviewed`, `pass`, or `fail` disposition. A favorable human review
cannot turn a deterministic failure into a pass, and an unfavorable review does not rewrite the
machine facts. Neither result alone proves semantic quality, safety, production readiness, or
repository acceptance.

## Bounds And Privacy

One campaign accepts at most 32 cases. A fixture is limited to 128 KiB, 64 checks, 128 trace entries,
32 artifacts, and a 300-second declared timeout. JSON reports are limited to 256 KiB and Markdown
reports to 16 KiB.

Reports contain safe ids, counts, booleans, digests, bounded review text, and path-neutral runtime
identity. Absolute host paths, credential material, browser data, internal material, unbounded raw
output, and unsafe artifact metadata fail report generation.

## Failure And Rollback

Digest drift, unknown adapters/checks, unsafe authority fields, trace/report overflow, invalid
ordering, interruption, cleanup failure, or sanitization failure fails closed. Rollback removes the
additive evaluator registration while retaining schemas, fixtures, and emitted evidence read-only;
all existing validation gates remain independently runnable.
