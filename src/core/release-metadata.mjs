import fs from "node:fs";

export const requiredBundleTargets = Object.freeze(["nsis", "msi", "app", "dmg", "deb", "rpm", "appimage"]);

export function readReleaseMetadata({ packagePath = "package.json", lockPath = "package-lock.json", tauriPath = "src-tauri/tauri.conf.json", cargoPath = "src-tauri/Cargo.toml" } = {}) {
  return {
    packageJson: JSON.parse(fs.readFileSync(packagePath, "utf8")),
    packageLock: JSON.parse(fs.readFileSync(lockPath, "utf8")),
    tauriConfig: JSON.parse(fs.readFileSync(tauriPath, "utf8")),
    cargoToml: fs.readFileSync(cargoPath, "utf8")
  };
}

export function validateReleaseMetadata(metadata = readReleaseMetadata()) {
  const findings = [];
  const packageVersion = metadata.packageJson?.version;
  const lockVersion = metadata.packageLock?.version;
  const lockRootVersion = metadata.packageLock?.packages?.[""]?.version;
  const tauriVersion = metadata.tauriConfig?.version;
  const cargoVersion = parseCargoValue(metadata.cargoToml, "version");
  const cargoLicense = parseCargoValue(metadata.cargoToml, "license");

  if (!semverStable(packageVersion)) {
    findings.push(issue("metadata.package-version", "package version must be a stable semantic version for release metadata"));
  }
  for (const [label, value] of [["package lock", lockVersion], ["package lock root", lockRootVersion], ["Tauri config", tauriVersion], ["Cargo", cargoVersion]]) {
    if (value !== packageVersion) {
      findings.push(issue("metadata.version-drift", `${label} version must match package version`));
    }
  }

  if (metadata.packageJson?.private !== true) {
    findings.push(issue("metadata.package-private", "package remains private to prevent accidental registry publication"));
  }
  if (metadata.packageJson?.license !== "Apache-2.0" || cargoLicense !== "Apache-2.0") {
    findings.push(issue("metadata.license", "package and Cargo license metadata must be Apache-2.0"));
  }
  if (metadata.tauriConfig?.bundle?.active !== true) {
    findings.push(issue("metadata.bundle-inactive", "Tauri bundle metadata must be active for release packaging validation"));
  }
  if (metadata.tauriConfig?.bundle?.createUpdaterArtifacts !== false) {
    findings.push(issue("metadata.updater-deferred", "updater artifacts stay disabled until updater signing is configured"));
  }

  const targets = metadata.tauriConfig?.bundle?.targets;
  if (!Array.isArray(targets)) {
    findings.push(issue("metadata.targets", "bundle targets must be explicit"));
  } else {
    for (const target of requiredBundleTargets) {
      if (!targets.includes(target)) findings.push(issue("metadata.target-missing", `bundle target missing: ${target}`));
    }
  }

  if (!Array.isArray(metadata.tauriConfig?.bundle?.icon) || metadata.tauriConfig.bundle.icon.length === 0) {
    findings.push(issue("metadata.icon", "bundle icon must be configured"));
  }
  if (metadata.tauriConfig?.identifier !== "io.agentique.ui") {
    findings.push(issue("metadata.identifier", "Tauri identifier must be stable"));
  }
  if (!String(metadata.tauriConfig?.app?.security?.csp ?? "").includes("default-src 'self'")) {
    findings.push(issue("metadata.csp", "CSP must keep default-src self"));
  }

  return {
    ok: findings.length === 0,
    version: packageVersion,
    bundleActive: metadata.tauriConfig?.bundle?.active === true,
    targets: Array.isArray(targets) ? targets : [],
    findings
  };
}

function semverStable(value) {
  return /^\d+\.\d+\.\d+$/u.test(String(value ?? ""));
}

function parseCargoValue(text, key) {
  const match = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "mu").exec(text);
  return match?.[1] ?? "";
}

function issue(code, message) {
  return { code, message };
}
