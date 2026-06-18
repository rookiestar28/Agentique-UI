const messages = {
    app: {
      ariaLabel: "Espacio de trabajo local de Agentique UI",
      brandName: "Agentique UI",
      brandSubtitle: "Espacio de trabajo local"
    },
    shell: {
      primaryNavigation: "Navegación principal",
      workspacePages: "Páginas del espacio de trabajo",
      mobileWorkspaceNavigation: "Navegación móvil del espacio de trabajo",
      openWorkspaceNavigation: "Abrir navegación del espacio de trabajo",
      closeWorkspaceNavigation: "Cerrar navegación del espacio de trabajo",
      workspaceNavigationTitle: "Navegación del espacio de trabajo"
    },
    navigation: {
      library: "Biblioteca",
      import: "Importar",
      verify: "Verificar",
      preview: "Vista previa",
      graph: "Grafo",
      run: "Ejecutar",
      handoff: "Transferencia",
      settings: "Configuración"
    },
    page: {
      library: {
        caption: "Biblioteca",
        title: "Biblioteca local de recursos"
      },
      import: {
        caption: "Importar",
        title: "Abrir un recurso de forma segura"
      },
      verify: {
        caption: "Verificar",
        title: "Revisar puertas de confianza y validación"
      },
      preview: {
        caption: "Vista previa",
        title: "Inspeccionar salida estática del recurso"
      },
      graph: {
        caption: "Grafo",
        title: "Editar descriptores de flujo de forma segura"
      },
      run: {
        caption: "Ejecutar",
        title: "Revisar ejecución controlada"
      },
      handoff: {
        caption: "Transferencia",
        title: "Preparar una transferencia sin ejecución"
      },
      settings: {
        caption: "Configuración",
        title: "Configuración local y secretos"
      }
    },
    workspace: {
      loading: "Cargando espacio de trabajo",
      library: { caption: "Biblioteca", title: "Explorador de recursos", proofSummary: "Resumen de validación de la biblioteca de recursos" },
      import: {
        caption: "Entrada de importación",
        title: "Abrir un recurso de forma segura",
        intentLabel: "Contenido de importación",
        loadExample: "Cargar ejemplo",
        externalIntakeLabel: "Escáner de entrada externa",
        runStaticScan: "Ejecutar escaneo estático",
        loadSafeSample: "Cargar muestra segura"
      },
      preview: {
        caption: "Vista previa segura",
        note: "Solo inspección estática; no se carga código de recurso, bytes multimedia ni rutas locales.",
        staticFileTree: "Árbol de archivos estático",
        previewMode: "Modo de vista previa"
      },
      handoff: {
        caption: "Transferencia",
        title: "descriptor",
        descriptorReview: "Revisión de descriptor",
        safetyFlags: "Indicadores de seguridad de ejecución",
        agentClientCaption: "Cliente Agent",
        agentClientTitle: "Plan de transferencia solo revisión",
        externalRuntimeCaption: "Runtime externo",
        externalRuntimeTitle: "Transferencia solo con descriptor"
      },
      graph: {
        caption: "Lienzo de grafo de flujo",
        title: "Visualizador IR de Agentique",
        subtitle: "Ejecución local protegida, solo con revisión de permisos",
        modeLabel: "Modo editor de grafo",
        editor: "Editor",
        executions: "Ejecuciones",
        evaluations: "Evaluaciones",
        review: "Revisar",
        validationSummary: "Resumen de validación del grafo",
        canvasControls: "Controles del lienzo de grafo",
        capabilityMatrix: "Matriz de capacidad de ejecución del grafo",
        canvasLabel: "Lienzo de grafo de flujo con nodos y aristas visibles"
      },
      verify: { caption: "Verificación", title: "Puerta de importación" },
      run: { caption: "Ejecución controlada", title: "Revisión de adaptador firmado" }
    },
    command: {
      ariaLabel: "Barra de comandos y estado",
      selectedResource: "Recurso seleccionado",
      resetIntent: "Restablecer contenido de importación",
      validateIntent: "Validar contenido de importación"
    },
    settings: {
      sectionCaption: "Configuración",
      permissionHeading: "Sin permisos concedidos",
      permissionPostureLabel: "Postura sin permisos",
      files: "Archivos",
      network: "Red",
      shell: "Shell",
      environment: "Entorno",
      language: {
        caption: "Idioma",
        heading: "Idioma",
        label: "Idioma de la interfaz",
        description: "Elige el idioma usado por el marco de la app y los controles del espacio de trabajo.",
        storageNote: "La elección se almacena localmente en este dispositivo.",
        fallbackNote: "Los valores guardados no compatibles vuelven al inglés."
      },
      release: {
        caption: "Distribución",
        heading: "Puerta de preparación de lanzamiento",
        summaryLabel: "Resumen de preparación de distribución",
        blockersLabel: "Bloqueos de preparación de distribución",
        blockerScope: "lanzamiento",
        status: "Estado",
        platforms: "Plataformas",
        blockers: "Bloqueos",
        bundling: "Empaquetado",
        noInstallerClaimTitle: "Sin afirmación de instalador publicado",
        noInstallerClaimBody: "Instalador, firma, actualizador, reversión, procedencia, prueba de instalación, prueba de desinstalación y evidencia en entorno limpio deben completarse antes de aprobar la preparación de lanzamiento."
      },
      config: {
        caption: "Borrador de configuración",
        heading: "Renderizador ui.schema.json",
        draftLabel: "Borrador de configuración tipado",
        actionsLabel: "Acciones del borrador",
        resetDraft: "Restablecer borrador",
        importDraft: "Importar borrador",
        exportRedactedDraft: "Exportar borrador redactado",
        draftDifferences: "{count} diferencias del borrador",
        exportUsesRedactedValues: "La exportación usa valores de visualización redactados.",
        exportBlockedByInvalidSchema: "La exportación está bloqueada por un esquema inválido.",
        invalidSchemaTitle: "Los esquemas no válidos fallan cerrados",
        invalidSchemaBody: "Campos desconocidos, campos secretos inseguros y valores no válidos bloquean importación/exportación."
      },
      vault: {
        caption: "Bóveda",
        heading: "Referencias locales de secretos",
        summaryLabel: "Resumen de redacción de bóveda",
        listLabel: "Registros de bóveda solo con referencias",
        references: "referencias",
        inlineValues: "valores en línea",
        screenshotsRedacted: "capturas redactadas",
        exportsRedacted: "exportaciones redactadas",
        keychainStatus: "llavero {status}",
        lifecycleStates: "{count} estados de ciclo de vida",
        supportBundleRedacted: "paquete de soporte redactado",
        secretValuesTitle: "Los valores secretos quedan fuera de paquetes y registros",
        secretValuesBody: "En la UI, exportaciones, artefactos, capturas o registros de error solo pueden aparecer referencias de bóveda y marcadores redactados."
      }
    },
    common: {
      ready: "listo",
      blocked: "bloqueado",
      enabled: "activado",
      disabled: "desactivado",
      invalid: "no válido"
    }
  };

export default messages;
