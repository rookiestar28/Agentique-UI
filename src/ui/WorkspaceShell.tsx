import { type ReactNode, useState } from "react";
import { Menu, X } from "lucide-react";
import brandLogo from "../assets/logo-mark.svg";
import { useI18n } from "../i18n/I18nProvider";
import { navigation, pageMetadata, type NavigationKey } from "./navigation";

type WorkspaceShellProps = {
  activeNav: NavigationKey;
  children: ReactNode;
  onNavSelect: (key: NavigationKey) => void;
  onResetIntent: () => void;
  onValidateIntent: () => void;
  selectedResource: string;
};

export function WorkspaceShell({ activeNav, children, onNavSelect, onResetIntent, onValidateIntent, selectedResource }: WorkspaceShellProps) {
  const currentPage = pageMetadata[activeNav];
  const { t } = useI18n();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const handleNavigationSelect = (key: NavigationKey, closeOnSelect = false) => {
    onNavSelect(key);
    if (closeOnSelect) {
      setIsMobileNavOpen(false);
    }
  };

  const renderNavigationItems = (closeOnSelect = false) =>
    navigation.map((item) => {
      const Icon = item.icon;
      const isActive = activeNav === item.key;
      return (
        <button
          aria-controls="active-workspace-page"
          aria-pressed={isActive}
          className={isActive ? "nav-item active" : "nav-item"}
          key={item.key}
          onClick={() => handleNavigationSelect(item.key, closeOnSelect)}
          type="button"
        >
          <Icon aria-hidden="true" size={18} />
          <span>{t(item.labelMessageId)}</span>
        </button>
      );
    });

  return (
    <main className="app-shell" aria-label={t("app.ariaLabel")}>
      <aside className="sidebar" aria-label={t("shell.primaryNavigation")}>
        <div className="brand">
          <img className="brand-logo" src={brandLogo} alt="" aria-hidden="true" />
          <div className="brand-copy">
            <strong>{t("app.brandName")}</strong>
            <span>{t("app.brandSubtitle")}</span>
          </div>
          <button
            aria-controls="mobile-workspace-navigation"
            aria-expanded={isMobileNavOpen}
            aria-label={isMobileNavOpen ? t("shell.closeWorkspaceNavigation") : t("shell.openWorkspaceNavigation")}
            className="mobile-nav-toggle"
            onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
            title={t("shell.workspaceNavigationTitle")}
            type="button"
          >
            {isMobileNavOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
          </button>
        </div>
        <nav className="nav-list desktop-nav" aria-label={t("shell.workspacePages")}>
          {renderNavigationItems()}
        </nav>
        <nav aria-label={t("shell.mobileWorkspaceNavigation")} className="mobile-nav-panel" hidden={!isMobileNavOpen} id="mobile-workspace-navigation">
          {renderNavigationItems(true)}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="caption">{t(currentPage.captionMessageId)}</p>
            <h1 id="active-page-heading">{t(currentPage.titleMessageId)}</h1>
          </div>
        </header>

        <section className="resource-command" aria-label={t("command.ariaLabel")}>
          <div>
            <p className="caption">{t("command.selectedResource")}</p>
            <strong>{selectedResource}</strong>
          </div>
          <div className="resource-actions">
            <button className="secondary-action" type="button" onClick={onResetIntent}>
              {t("command.resetIntent")}
            </button>
            <button className="primary-action" type="button" onClick={onValidateIntent}>
              {t("command.validateIntent")}
            </button>
          </div>
        </section>

        <section className="workspace-page" id="active-workspace-page" tabIndex={-1} aria-labelledby="active-page-heading">
          {children}
        </section>
      </section>
    </main>
  );
}
