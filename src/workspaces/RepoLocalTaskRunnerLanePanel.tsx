import type { AnyRecord } from "./TrustRunSettingsTypes";

type RepoLocalTaskRunnerLanePanelProps = {
  repoLocalTaskRunnerLane: AnyRecord;
};

export function RepoLocalTaskRunnerLanePanel({ repoLocalTaskRunnerLane }: RepoLocalTaskRunnerLanePanelProps) {
  return (
    <div className="curated-adapter-lane-panel" aria-label="Repo-local task runner lane">
      <div className="section-heading">
        <p className="caption">Task runner lane</p>
        <h2>Repo-local task runner lane</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Repo-owned task manifests">
        <div>
          <span>Repo-owned task manifests</span>
          <strong>{repoLocalTaskRunnerLane.summary.repoOwnedManifests}</strong>
          <small>{`${repoLocalTaskRunnerLane.summary.approvedFixedCommands} approved fixed command(s)`}</small>
        </div>
        <div>
          <span>Dry-run and approval receipts</span>
          <strong>{`${repoLocalTaskRunnerLane.summary.dryRunReceipts}/${repoLocalTaskRunnerLane.summary.approvalReceipts}`}</strong>
          <small>descriptor-only task review</small>
        </div>
        <div>
          <span>Artifact and cleanup receipts</span>
          <strong>{`${repoLocalTaskRunnerLane.summary.artifactReceipts}/${repoLocalTaskRunnerLane.summary.cleanupReceipts}`}</strong>
          <small>bounded path-neutral evidence</small>
        </div>
        <div>
          <span>Environment whitelist</span>
          <strong>{repoLocalTaskRunnerLane.summary.forwardedAmbient}</strong>
          <small>ambient variables forwarded</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Approved fixed commands">
        {repoLocalTaskRunnerLane.tasks.map((task: AnyRecord) => (
          <li key={task.taskId}>
            <span>{task.command.id}</span>
            <strong>{task.manifest.id}</strong>
            <small>{task.command.argv.join(" ")}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Working directory scope">
        {repoLocalTaskRunnerLane.tasks.map((task: AnyRecord) => (
          <li key={`${task.taskId}-working-directory`}>
            <span>{task.workingDirectory.scope}</span>
            <strong>{task.workingDirectory.insideRepo ? "inside repo" : "blocked"}</strong>
            <small>{task.workingDirectory.absolute ? "absolute path blocked" : "relative path only"}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Task runner audit receipts">
        {repoLocalTaskRunnerLane.tasks.map((task: AnyRecord) => (
          <li key={`${task.taskId}-audit`}>
            <span>{task.dryRun.status}</span>
            <strong>{task.approval.userApproved ? "approval recorded" : "approval missing"}</strong>
            <small>{`${task.dryRun.receipt} / ${task.cleanup.receipt}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-block-list" aria-label="Task runner blocked reasons">
        {repoLocalTaskRunnerLane.blockedSamples.map((sample: AnyRecord) => (
          <li key={sample.reason}>
            <span>{sample.reason}</span>
            <strong>{sample.status}</strong>
            <small>{sample.message}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Task runner permission ceiling">
        {repoLocalTaskRunnerLane.tasks.map((task: AnyRecord) => (
          <div key={`${task.taskId}-authority`}>
            <span>{task.taskId}</span>
            <strong>{task.authority.arbitraryShell ? "shell enabled" : "no generic shell"}</strong>
            <small>{task.environment.forwardedAmbient.length === 0 ? "no ambient environment forwarded" : "ambient blocked"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
