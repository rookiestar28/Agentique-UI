import { useI18n } from "../i18n/I18nProvider";
import type { LocaleCode } from "../i18n/types";
import type { SettingsWorkspaceProps } from "./TrustRunSettingsTypes";

export function SettingsWorkspace({
  configDraft,
  configExport,
  distributionReadiness,
  primaryResource,
  redactionReport,
  sampleUiSchema,
  sampleVaultState,
  localVaultSecretsUx
}: SettingsWorkspaceProps) {
  const activeNav = "settings";
  const { locale, setLocale, supportedLocales, t } = useI18n();
  const keychain = localVaultSecretsUx.keychainFeasibility ?? {};
  const redaction = localVaultSecretsUx.redactionEvidence ?? {};
  const operations = Array.isArray(localVaultSecretsUx.operations) ? localVaultSecretsUx.operations : [];

  return (
    <>
      {activeNav === "settings" ? (
        <div className="workspace-stack" data-page="settings">
          <section className="workspace-section language-workspace" aria-labelledby="settings-language-heading">
            <div className="section-heading">
              <p className="caption">{t("settings.language.caption")}</p>
              <h2 id="settings-language-heading">{t("settings.language.heading")}</h2>
            </div>
            <div className="language-selector-panel" aria-label={t("settings.language.label")}>
              <label htmlFor="settings-language-select">{t("settings.language.label")}</label>
              <select
                aria-describedby="settings-language-description settings-language-storage"
                id="settings-language-select"
                onChange={(event) => setLocale(event.target.value as LocaleCode)}
                value={locale}
              >
                {supportedLocales.map((localeOption) => (
                  <option key={localeOption.code} value={localeOption.code}>
                    {localeOption.nativeName} - {localeOption.englishName}
                  </option>
                ))}
              </select>
              <p id="settings-language-description">{t("settings.language.description")}</p>
              <p id="settings-language-storage">
                {t("settings.language.storageNote")} {t("settings.language.fallbackNote")}
              </p>
            </div>
          </section>

          <section className="workspace-section settings-workspace" aria-labelledby="settings-heading">
            <div className="section-heading">
              <p className="caption">{t("settings.sectionCaption")}</p>
              <h2 id="settings-heading">{t("settings.permissionHeading")}</h2>
            </div>
            <div className="field-list" aria-label={t("settings.permissionPostureLabel")}>
              <div>
                <span>{t("settings.files")}</span>
                <strong>{primaryResource.permissionState.files}</strong>
              </div>
              <div>
                <span>{t("settings.network")}</span>
                <strong>{primaryResource.permissionState.network}</strong>
              </div>
              <div>
                <span>{t("settings.shell")}</span>
                <strong>{primaryResource.permissionState.shell}</strong>
              </div>
              <div>
                <span>{t("settings.environment")}</span>
                <strong>{primaryResource.permissionState.environment}</strong>
              </div>
            </div>
          </section>

          <section className="workspace-section release-workspace" aria-labelledby="release-heading">
            <div className="section-heading">
              <p className="caption">{t("settings.release.caption")}</p>
              <h2 id="release-heading">{t("settings.release.heading")}</h2>
            </div>
            <div className="field-list" aria-label={t("settings.release.summaryLabel")}>
              <div>
                <span>{t("settings.release.status")}</span>
                <strong>{distributionReadiness.ok ? t("common.ready") : t("common.blocked")}</strong>
              </div>
              <div>
                <span>{t("settings.release.platforms")}</span>
                <strong>
                  {distributionReadiness.summary.readyPlatforms}/{distributionReadiness.summary.requiredPlatforms}
                </strong>
              </div>
              <div>
                <span>{t("settings.release.blockers")}</span>
                <strong>{distributionReadiness.summary.blockers}</strong>
              </div>
              <div>
                <span>{t("settings.release.bundling")}</span>
                <strong>{distributionReadiness.bundleActive ? t("common.enabled") : t("common.disabled")}</strong>
              </div>
            </div>
            <ol className="permission-audit" aria-label={t("settings.release.blockersLabel")}>
              {distributionReadiness.blockers.slice(0, 4).map((blocker: { code: string; message: string }) => (
                <li key={blocker.code}>
                  <span>{t("settings.release.blockerScope")}</span>
                  <strong>{blocker.code}</strong>
                  <small>{blocker.message}</small>
                </li>
              ))}
            </ol>
            <div className="fail-closed" role="status">
              <strong>{t("settings.release.noInstallerClaimTitle")}</strong>
              <span>{t("settings.release.noInstallerClaimBody")}</span>
            </div>
          </section>

          <section className="workspace-section config-workspace" aria-labelledby="config-heading">
            <div className="section-heading">
              <p className="caption">{t("settings.config.caption")}</p>
              <h2 id="config-heading">{t("settings.config.heading")}</h2>
            </div>
            <div className="config-fields" aria-label={t("settings.config.draftLabel")}>
              {sampleUiSchema.fields.map((field: { label: string; name: string; type: string }) => (
                <div className="config-field" key={field.name}>
                  <span>{field.label}</span>
                  <strong>{String(configDraft.redactedValues?.[field.name] ?? t("common.invalid"))}</strong>
                  <small>{field.type}</small>
                </div>
              ))}
            </div>
            <div className="config-actions" aria-label={t("settings.config.actionsLabel")}>
              <button className="secondary-action" type="button">
                {t("settings.config.resetDraft")}
              </button>
              <button className="secondary-action" type="button">
                {t("settings.config.importDraft")}
              </button>
              <button className="primary-action" type="button">
                {t("settings.config.exportRedactedDraft")}
              </button>
            </div>
            <div className="diff-list" aria-label="Config diff and redaction">
              <strong>{t("settings.config.draftDifferences", { count: configDraft.diff?.length ?? 0 })}</strong>
              <span>{configExport.ok ? t("settings.config.exportUsesRedactedValues") : t("settings.config.exportBlockedByInvalidSchema")}</span>
            </div>
            <div className="fail-closed" role="status">
              <strong>{t("settings.config.invalidSchemaTitle")}</strong>
              <span>{t("settings.config.invalidSchemaBody")}</span>
            </div>
          </section>

          <section className="workspace-section vault-workspace" aria-labelledby="vault-heading">
            <div className="section-heading">
              <p className="caption">{t("settings.vault.caption")}</p>
              <h2 id="vault-heading">{t("settings.vault.heading")}</h2>
            </div>
            <div className="vault-summary" aria-label={t("settings.vault.summaryLabel")}>
              <span>
                {redactionReport.referenceCount} {t("settings.vault.references")}
              </span>
              <span>
                {redactionReport.inlineSecretValues} {t("settings.vault.inlineValues")}
              </span>
              <span>{t("settings.vault.screenshotsRedacted")}</span>
              <span>{t("settings.vault.exportsRedacted")}</span>
              <span>{t("settings.vault.keychainStatus", { status: keychain.status ?? t("common.blocked") })}</span>
              <span>{t("settings.vault.lifecycleStates", { count: operations.length })}</span>
              <span>{redaction.supportBundleRedacted ? t("settings.vault.supportBundleRedacted") : t("common.blocked")}</span>
            </div>
            <div className="vault-list" aria-label={t("settings.vault.listLabel")}>
              {sampleVaultState.records.map((record: { kind: string; label: string; ref: string; status: string }) => (
                <div className="vault-row" key={record.ref}>
                  <div>
                    <strong>{record.label}</strong>
                    <span>{record.kind}</span>
                  </div>
                  <span className="decision-pill">{record.status}</span>
                </div>
              ))}
            </div>
            <div className="fail-closed" role="status">
              <strong>{t("settings.vault.secretValuesTitle")}</strong>
              <span>{t("settings.vault.secretValuesBody")}</span>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
