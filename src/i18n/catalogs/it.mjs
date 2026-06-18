const messages = {
    app: {
      ariaLabel: "Area di lavoro locale Agentique UI",
      brandName: "Agentique UI",
      brandSubtitle: "Area di lavoro locale"
    },
    shell: {
      primaryNavigation: "Navigazione principale",
      workspacePages: "Pagine dell'area di lavoro",
      mobileWorkspaceNavigation: "Navigazione mobile dell'area di lavoro",
      openWorkspaceNavigation: "Apri navigazione area di lavoro",
      closeWorkspaceNavigation: "Chiudi navigazione area di lavoro",
      workspaceNavigationTitle: "Navigazione area di lavoro"
    },
    navigation: {
      library: "Libreria",
      import: "Importa",
      verify: "Verifica",
      preview: "Anteprima",
      graph: "Grafo",
      run: "Esegui",
      handoff: "Passaggio",
      settings: "Impostazioni"
    },
    page: {
      library: {
        caption: "Libreria",
        title: "Libreria risorse locale"
      },
      import: {
        caption: "Importa",
        title: "Apri una risorsa in sicurezza"
      },
      verify: {
        caption: "Verifica",
        title: "Rivedi i gate di fiducia e validazione"
      },
      preview: {
        caption: "Anteprima",
        title: "Ispeziona l'output statico della risorsa"
      },
      graph: {
        caption: "Grafo",
        title: "Modifica i descrittori di workflow in sicurezza"
      },
      run: {
        caption: "Esegui",
        title: "Rivedi l'esecuzione controllata"
      },
      handoff: {
        caption: "Passaggio",
        title: "Prepara un passaggio senza esecuzione"
      },
      settings: {
        caption: "Impostazioni",
        title: "Configurazione locale e segreti"
      }
    },
    workspace: {
      loading: "Caricamento dell'area di lavoro",
      library: { caption: "Libreria", title: "Browser risorse", proofSummary: "Riepilogo verifica libreria risorse" },
      import: {
        caption: "Ingresso importazione",
        title: "Apri una risorsa in sicurezza",
        intentLabel: "Contenuto di importazione",
        loadExample: "Carica esempio",
        externalIntakeLabel: "Scanner intake esterno",
        runStaticScan: "Esegui scansione statica",
        loadSafeSample: "Carica campione sicuro"
      },
      preview: {
        caption: "Anteprima sicura",
        note: "Solo ispezione statica; codice risorsa, byte multimediali e percorsi locali non vengono caricati.",
        staticFileTree: "Albero file statico",
        previewMode: "Modalità anteprima"
      },
      handoff: {
        caption: "Passaggio",
        title: "descrittore",
        descriptorReview: "Revisione descrittore",
        safetyFlags: "Flag di sicurezza esecuzione",
        agentClientCaption: "Client Agent",
        agentClientTitle: "Piano di passaggio solo revisione",
        externalRuntimeCaption: "Runtime esterno",
        externalRuntimeTitle: "Passaggio solo descrittore"
      },
      graph: {
        caption: "Canvas grafo workflow",
        title: "Visualizzatore Agentique IR",
        subtitle: "Esecuzione locale protetta, solo dopo revisione dei permessi",
        modeLabel: "Modalità editor grafo",
        editor: "Editor",
        executions: "Esecuzioni",
        evaluations: "Valutazioni",
        review: "Revisione",
        validationSummary: "Riepilogo validazione grafo",
        canvasControls: "Controlli canvas grafo",
        capabilityMatrix: "Matrice capacità esecuzione grafo",
        canvasLabel: "Canvas grafo workflow con nodi e archi visibili"
      },
      verify: { caption: "Verifica", title: "Gate importazione" },
      run: { caption: "Esecuzione controllata", title: "Revisione adattatore firmato" }
    },
    command: {
      ariaLabel: "Barra comandi e stato",
      selectedResource: "Risorsa selezionata",
      resetIntent: "Reimposta contenuto di importazione",
      validateIntent: "Verifica contenuto di importazione"
    },
    settings: {
      sectionCaption: "Impostazioni",
      permissionHeading: "Nessun permesso concesso",
      permissionPostureLabel: "Stato senza permessi",
      files: "File",
      network: "Rete",
      shell: "Shell",
      environment: "Ambiente",
      language: {
        caption: "Lingua",
        heading: "Lingua",
        label: "Lingua dell'interfaccia",
        description: "Scegli la lingua usata dal chrome dell'app e dai controlli dell'area di lavoro.",
        storageNote: "La scelta viene salvata localmente su questo dispositivo.",
        fallbackNote: "I valori salvati non supportati tornano all'inglese."
      },
      release: {
        caption: "Distribuzione",
        heading: "Gate di prontezza al rilascio",
        summaryLabel: "Riepilogo prontezza distribuzione",
        blockersLabel: "Blocchi di prontezza distribuzione",
        blockerScope: "rilascio",
        status: "Stato",
        platforms: "Piattaforme",
        blockers: "Blocchi",
        bundling: "Pacchetto",
        noInstallerClaimTitle: "Nessuna dichiarazione di installer pubblicato",
        noInstallerClaimBody: "Installer, firma, aggiornamento, rollback, provenienza, smoke di installazione, smoke di disinstallazione e prove in ambiente pulito devono essere completi prima che la prontezza al rilascio possa passare."
      },
      config: {
        caption: "Bozza configurazione",
        heading: "Renderer ui.schema.json",
        draftLabel: "Bozza configurazione tipizzata",
        actionsLabel: "Azioni bozza",
        resetDraft: "Reimposta bozza",
        importDraft: "Importa bozza",
        exportRedactedDraft: "Esporta bozza oscurata",
        draftDifferences: "{count} differenze bozza",
        exportUsesRedactedValues: "L'export usa valori di visualizzazione oscurati.",
        exportBlockedByInvalidSchema: "L'export è bloccato da uno schema non valido.",
        invalidSchemaTitle: "Gli schemi non validi falliscono chiusi",
        invalidSchemaBody: "Campi sconosciuti, campi segreti non sicuri e valori non validi bloccano import/export."
      },
      vault: {
        caption: "Cassaforte",
        heading: "Riferimenti segreti locali",
        summaryLabel: "Riepilogo oscuramento cassaforte",
        listLabel: "Record cassaforte solo con riferimenti",
        references: "riferimenti",
        inlineValues: "valori inline",
        screenshotsRedacted: "screenshot oscurati",
        exportsRedacted: "export oscurati",
        keychainStatus: "portachiavi {status}",
        lifecycleStates: "{count} stati del ciclo di vita",
        supportBundleRedacted: "pacchetto di supporto oscurato",
        secretValuesTitle: "I valori segreti restano fuori da pacchetti e log",
        secretValuesBody: "Nell'UI, negli export, negli artefatti, negli screenshot o nei record di errore possono apparire solo riferimenti alla cassaforte e segnaposto oscurati."
      }
    },
    common: {
      ready: "pronto",
      blocked: "bloccato",
      enabled: "abilitato",
      disabled: "disabilitato",
      invalid: "non valido"
    }
  };

export default messages;
