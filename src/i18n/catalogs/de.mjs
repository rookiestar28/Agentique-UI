const messages = {
    app: {
      ariaLabel: "Lokaler Agentique-UI-Arbeitsbereich",
      brandName: "Agentique UI",
      brandSubtitle: "Lokaler Arbeitsbereich"
    },
    shell: {
      primaryNavigation: "Hauptnavigation",
      workspacePages: "Arbeitsbereichsseiten",
      mobileWorkspaceNavigation: "Mobile Arbeitsbereichsnavigation",
      openWorkspaceNavigation: "Arbeitsbereichsnavigation öffnen",
      closeWorkspaceNavigation: "Arbeitsbereichsnavigation schließen",
      workspaceNavigationTitle: "Arbeitsbereichsnavigation"
    },
    navigation: {
      library: "Bibliothek",
      import: "Import",
      verify: "Prüfen",
      preview: "Vorschau",
      graph: "Graph",
      run: "Ausführen",
      handoff: "Übergabe",
      settings: "Einstellungen"
    },
    page: {
      library: {
        caption: "Bibliothek",
        title: "Lokale Ressourcenbibliothek"
      },
      import: {
        caption: "Import",
        title: "Eine Ressource sicher öffnen"
      },
      verify: {
        caption: "Prüfen",
        title: "Vertrauens- und Validierungstore prüfen"
      },
      preview: {
        caption: "Vorschau",
        title: "Statische Ressourcenausgabe prüfen"
      },
      graph: {
        caption: "Graph",
        title: "Workflow-Deskriptoren sicher bearbeiten"
      },
      run: {
        caption: "Ausführen",
        title: "Kontrollierte Ausführung prüfen"
      },
      handoff: {
        caption: "Übergabe",
        title: "Nicht ausführende Übergabe vorbereiten"
      },
      settings: {
        caption: "Einstellungen",
        title: "Lokale Konfiguration und Geheimnisse"
      }
    },
    workspace: {
      loading: "Arbeitsbereich wird geladen",
      library: { caption: "Bibliothek", title: "Ressourcenbrowser", proofSummary: "Prüfzusammenfassung der Ressourcenbibliothek" },
      import: {
        caption: "Import-Einstieg",
        title: "Eine Ressource sicher öffnen",
        intentLabel: "Importinhalt",
        loadExample: "Beispiel laden",
        externalIntakeLabel: "Externer Intake-Scanner",
        runStaticScan: "Statischen Scan ausführen",
        loadSafeSample: "Sicheres Beispiel laden"
      },
      preview: {
        caption: "Sichere Vorschau",
        note: "Nur statische Prüfung; Ressourcencode, Mediendaten und lokale Pfade werden nicht geladen.",
        staticFileTree: "Statischer Dateibaum",
        previewMode: "Vorschaumodus"
      },
      handoff: {
        caption: "Übergabe",
        title: "Deskriptor",
        descriptorReview: "Deskriptorprüfung",
        safetyFlags: "Ausführungssicherheitsflags",
        agentClientCaption: "Agent-Client",
        agentClientTitle: "Nur-Prüfung-Übergabeplan",
        externalRuntimeCaption: "Externe Laufzeit",
        externalRuntimeTitle: "Nur-Deskriptor-Übergabe"
      },
      graph: {
        caption: "Workflow-Graph-Canvas",
        title: "Agentique-IR-Visualisierung",
        subtitle: "Geschützte lokale Ausführung, nur nach Berechtigungsprüfung",
        modeLabel: "Graph-Editor-Modus",
        editor: "Editor",
        executions: "Ausführungen",
        evaluations: "Auswertungen",
        review: "Prüfen",
        validationSummary: "Graph-Validierungszusammenfassung",
        canvasControls: "Graph-Canvas-Steuerung",
        capabilityMatrix: "Graph-Ausführungsfähigkeitsmatrix",
        canvasLabel: "Workflow-Graph-Canvas mit sichtbaren Knoten und Kanten"
      },
      verify: { caption: "Prüfung", title: "Import-Gate" },
      run: { caption: "Kontrollierte Ausführung", title: "Signierte Adapterprüfung" }
    },
    command: {
      ariaLabel: "Befehls- und Statusleiste",
      selectedResource: "Ausgewählte Ressource",
      resetIntent: "Importinhalt zurücksetzen",
      validateIntent: "Importinhalt prüfen"
    },
    settings: {
      sectionCaption: "Einstellungen",
      permissionHeading: "Keine Berechtigungen gewährt",
      permissionPostureLabel: "Status ohne Berechtigungen",
      files: "Dateien",
      network: "Netzwerk",
      shell: "Shell",
      environment: "Umgebung",
      language: {
        caption: "Sprache",
        heading: "Sprache",
        label: "Oberflächensprache",
        description: "Wählen Sie die Sprache für App-Chrome und Arbeitsbereichssteuerung.",
        storageNote: "Diese Auswahl wird nur lokal auf diesem Gerät gespeichert.",
        fallbackNote: "Nicht unterstützte gespeicherte Werte fallen auf Englisch zurück."
      },
      release: {
        caption: "Distribution",
        heading: "Tor für Release-Bereitschaft",
        summaryLabel: "Zusammenfassung der Distributionsbereitschaft",
        blockersLabel: "Blocker der Distributionsbereitschaft",
        blockerScope: "Release",
        status: "Status",
        platforms: "Plattformen",
        blockers: "Blocker",
        bundling: "Bündelung",
        noInstallerClaimTitle: "Kein Anspruch auf veröffentlichten Installer",
        noInstallerClaimBody: "Installer, Signierung, Updater, Rollback, Herkunftsnachweis, Installations-Smoke, Deinstallations-Smoke und Nachweise aus sauberer Umgebung müssen vollständig sein, bevor Release-Bereitschaft bestehen kann."
      },
      config: {
        caption: "Konfigurationsentwurf",
        heading: "ui.schema.json-Renderer",
        draftLabel: "Typisierter Konfigurationsentwurf",
        actionsLabel: "Entwurfsaktionen",
        resetDraft: "Entwurf zurücksetzen",
        importDraft: "Entwurf importieren",
        exportRedactedDraft: "Redigierten Entwurf exportieren",
        draftDifferences: "{count} Entwurfsunterschiede",
        exportUsesRedactedValues: "Der Export verwendet redigierte Anzeigewerte.",
        exportBlockedByInvalidSchema: "Der Export wird durch ein ungültiges Schema blockiert.",
        invalidSchemaTitle: "Ungültige Schemas schließen fehl",
        invalidSchemaBody: "Unbekannte Felder, unsichere Geheimnisfelder und ungültige Werte blockieren Import/Export."
      },
      vault: {
        caption: "Tresor",
        heading: "Lokale Geheimnisreferenzen",
        summaryLabel: "Tresor-Redaktionsübersicht",
        listLabel: "Nur referenzierte Tresoreinträge",
        references: "Referenzen",
        inlineValues: "Inline-Werte",
        screenshotsRedacted: "Screenshots redigiert",
        exportsRedacted: "Exporte redigiert",
        keychainStatus: "Schluesselbund {status}",
        lifecycleStates: "{count} Lebenszykluszustaende",
        supportBundleRedacted: "Support-Paket redigiert",
        secretValuesTitle: "Geheimniswerte bleiben aus Paketen und Logs",
        secretValuesBody: "In UI, Exporten, Artefakten, Screenshots oder Fehleraufzeichnungen dürfen nur Tresorreferenzen und redigierte Platzhalter erscheinen."
      }
    },
    common: {
      ready: "bereit",
      blocked: "blockiert",
      enabled: "aktiviert",
      disabled: "deaktiviert",
      invalid: "ungültig"
    }
  };

export default messages;
