const messages = {
    app: {
      ariaLabel: "Espace de travail local Agentique UI",
      brandName: "Agentique UI",
      brandSubtitle: "Espace de travail local"
    },
    shell: {
      primaryNavigation: "Navigation principale",
      workspacePages: "Pages de l'espace de travail",
      mobileWorkspaceNavigation: "Navigation mobile de l'espace de travail",
      openWorkspaceNavigation: "Ouvrir la navigation de l'espace de travail",
      closeWorkspaceNavigation: "Fermer la navigation de l'espace de travail",
      workspaceNavigationTitle: "Navigation de l'espace de travail"
    },
    navigation: {
      library: "Bibliothèque",
      import: "Importer",
      verify: "Vérifier",
      preview: "Aperçu",
      graph: "Graphe",
      run: "Exécuter",
      handoff: "Transfert",
      settings: "Paramètres"
    },
    page: {
      library: {
        caption: "Bibliothèque",
        title: "Bibliothèque locale de ressources"
      },
      import: {
        caption: "Importer",
        title: "Ouvrir une ressource en sécurité"
      },
      verify: {
        caption: "Vérifier",
        title: "Examiner les portes de confiance et de validation"
      },
      preview: {
        caption: "Aperçu",
        title: "Inspecter la sortie statique de la ressource"
      },
      graph: {
        caption: "Graphe",
        title: "Modifier les descripteurs de workflow en sécurité"
      },
      run: {
        caption: "Exécuter",
        title: "Examiner l'exécution contrôlée"
      },
      handoff: {
        caption: "Transfert",
        title: "Préparer un transfert sans exécution"
      },
      settings: {
        caption: "Paramètres",
        title: "Configuration locale et secrets"
      }
    },
    workspace: {
      loading: "Chargement de l'espace de travail",
      library: { caption: "Bibliothèque", title: "Navigateur de ressources", proofSummary: "Résumé de validation de la bibliothèque de ressources" },
      import: {
        caption: "Entrée d'import",
        title: "Ouvrir une ressource en sécurité",
        intentLabel: "Contenu d'import",
        loadExample: "Charger un exemple",
        externalIntakeLabel: "Scanner d'entrée externe",
        runStaticScan: "Lancer l'analyse statique",
        loadSafeSample: "Charger un exemple sûr"
      },
      preview: {
        caption: "Aperçu sûr",
        note: "Inspection statique uniquement ; aucun code de ressource, octet média ou chemin local n'est chargé.",
        staticFileTree: "Arborescence statique",
        previewMode: "Mode aperçu"
      },
      handoff: {
        caption: "Transfert",
        title: "descripteur",
        descriptorReview: "Revue du descripteur",
        safetyFlags: "Indicateurs de sécurité d'exécution",
        agentClientCaption: "Client Agent",
        agentClientTitle: "Plan de transfert en revue seule",
        externalRuntimeCaption: "Runtime externe",
        externalRuntimeTitle: "Transfert par descripteur uniquement"
      },
      graph: {
        caption: "Canevas de graphe de workflow",
        title: "Visualiseur IR Agentique",
        subtitle: "Exécution locale protégée, seulement après revue des permissions",
        modeLabel: "Mode éditeur de graphe",
        editor: "Éditeur",
        executions: "Exécutions",
        evaluations: "Évaluations",
        review: "Revue",
        validationSummary: "Résumé de validation du graphe",
        canvasControls: "Contrôles du canevas de graphe",
        capabilityMatrix: "Matrice de capacité d'exécution du graphe",
        canvasLabel: "Canevas de graphe de workflow avec nœuds et liens visibles"
      },
      verify: { caption: "Vérification", title: "Gate d'import" },
      run: { caption: "Exécution contrôlée", title: "Revue d'adaptateur signé" }
    },
    command: {
      ariaLabel: "Barre de commande et d'état",
      selectedResource: "Ressource sélectionnée",
      resetIntent: "Réinitialiser le contenu d'import",
      validateIntent: "Valider le contenu d'import"
    },
    settings: {
      sectionCaption: "Paramètres",
      permissionHeading: "Aucune permission accordée",
      permissionPostureLabel: "Posture sans permission",
      files: "Fichiers",
      network: "Réseau",
      shell: "Shell",
      environment: "Environnement",
      language: {
        caption: "Langue",
        heading: "Langue",
        label: "Langue de l'interface",
        description: "Choisissez la langue utilisée par le chrome de l'application et les contrôles d'espace de travail.",
        storageNote: "Ce choix est stocké localement sur cet appareil.",
        fallbackNote: "Les valeurs enregistrées non prises en charge reviennent à l'anglais."
      },
      release: {
        caption: "Distribution",
        heading: "Porte de préparation de version",
        summaryLabel: "Résumé de préparation de distribution",
        blockersLabel: "Bloqueurs de préparation de distribution",
        blockerScope: "version",
        status: "Statut",
        platforms: "Plateformes",
        blockers: "Bloqueurs",
        bundling: "Assemblage",
        noInstallerClaimTitle: "Aucune revendication d'installateur publié",
        noInstallerClaimBody: "L'installateur, la signature, le programme de mise à jour, le retour arrière, la provenance, les tests d'installation, les tests de désinstallation et les preuves en environnement propre doivent être complets avant que la préparation de version puisse passer."
      },
      config: {
        caption: "Brouillon de configuration",
        heading: "Moteur de rendu ui.schema.json",
        draftLabel: "Brouillon de configuration typé",
        actionsLabel: "Actions du brouillon",
        resetDraft: "Réinitialiser le brouillon",
        importDraft: "Importer le brouillon",
        exportRedactedDraft: "Exporter le brouillon expurgé",
        draftDifferences: "{count} différences de brouillon",
        exportUsesRedactedValues: "L'export utilise les valeurs d'affichage expurgées.",
        exportBlockedByInvalidSchema: "L'export est bloqué par un schéma invalide.",
        invalidSchemaTitle: "Les schémas invalides échouent fermés",
        invalidSchemaBody: "Les champs inconnus, les champs secrets dangereux et les valeurs invalides bloquent l'import/export."
      },
      vault: {
        caption: "Coffre",
        heading: "Références locales de secrets",
        summaryLabel: "Résumé d'expurgation du coffre",
        listLabel: "Enregistrements du coffre en référence seule",
        references: "références",
        inlineValues: "valeurs en ligne",
        screenshotsRedacted: "captures expurgées",
        exportsRedacted: "exports expurgés",
        keychainStatus: "trousseau {status}",
        lifecycleStates: "{count} états de cycle de vie",
        supportBundleRedacted: "paquet de support expurgé",
        secretValuesTitle: "Les valeurs secrètes restent hors des paquets et des journaux",
        secretValuesBody: "Seules les références de coffre et les espaces réservés expurgés peuvent apparaître dans l'UI, les exports, les artefacts, les captures ou les enregistrements d'échec."
      }
    },
    common: {
      ready: "prêt",
      blocked: "bloqué",
      enabled: "activé",
      disabled: "désactivé",
      invalid: "invalide"
    }
  };

export default messages;
