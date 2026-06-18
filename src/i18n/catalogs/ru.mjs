const messages = {
    app: {
      ariaLabel: "Локальная рабочая область Agentique UI",
      brandName: "Agentique UI",
      brandSubtitle: "Локальная рабочая область"
    },
    shell: {
      primaryNavigation: "Основная навигация",
      workspacePages: "Страницы рабочей области",
      mobileWorkspaceNavigation: "Мобильная навигация рабочей области",
      openWorkspaceNavigation: "Открыть навигацию рабочей области",
      closeWorkspaceNavigation: "Закрыть навигацию рабочей области",
      workspaceNavigationTitle: "Навигация рабочей области"
    },
    navigation: {
      library: "Библиотека",
      import: "Импорт",
      verify: "Проверка",
      preview: "Предпросмотр",
      graph: "Граф",
      run: "Запуск",
      handoff: "Передача",
      settings: "Настройки"
    },
    page: {
      library: {
        caption: "Библиотека",
        title: "Локальная библиотека ресурсов"
      },
      import: {
        caption: "Импорт",
        title: "Безопасно открыть ресурс"
      },
      verify: {
        caption: "Проверка",
        title: "Проверить доверие и валидационные барьеры"
      },
      preview: {
        caption: "Предпросмотр",
        title: "Проверить статический вывод ресурса"
      },
      graph: {
        caption: "Граф",
        title: "Безопасно редактировать дескрипторы workflow"
      },
      run: {
        caption: "Запуск",
        title: "Проверить контролируемое выполнение"
      },
      handoff: {
        caption: "Передача",
        title: "Подготовить передачу без выполнения"
      },
      settings: {
        caption: "Настройки",
        title: "Локальная конфигурация и секреты"
      }
    },
    workspace: {
      loading: "Загрузка рабочей области",
      library: { caption: "Библиотека", title: "Обозреватель ресурсов", proofSummary: "Сводка проверки библиотеки ресурсов" },
      import: {
        caption: "Вход импорта",
        title: "Безопасно открыть ресурс",
        intentLabel: "Данные импорта",
        loadExample: "Загрузить пример",
        externalIntakeLabel: "Сканер внешнего ввода",
        runStaticScan: "Запустить статическое сканирование",
        loadSafeSample: "Загрузить безопасный пример"
      },
      preview: {
        caption: "Безопасный предпросмотр",
        note: "Только статическая проверка; код ресурса, медиа-байты и локальные пути не загружаются.",
        staticFileTree: "Статическое дерево файлов",
        previewMode: "Режим предпросмотра"
      },
      handoff: {
        caption: "Передача",
        title: "дескриптор",
        descriptorReview: "Проверка дескриптора",
        safetyFlags: "Флаги безопасности выполнения",
        agentClientCaption: "Клиент Agent",
        agentClientTitle: "План передачи только для проверки",
        externalRuntimeCaption: "Внешняя среда выполнения",
        externalRuntimeTitle: "Передача только дескриптором"
      },
      graph: {
        caption: "Полотно графа рабочего процесса",
        title: "Визуализатор Agentique IR",
        subtitle: "Защищенное локальное выполнение только после проверки разрешений",
        modeLabel: "Режим редактора графа",
        editor: "Редактор",
        executions: "Выполнения",
        evaluations: "Оценки",
        review: "Проверка",
        validationSummary: "Сводка проверки графа",
        canvasControls: "Управление полотном графа",
        capabilityMatrix: "Матрица возможностей выполнения графа",
        canvasLabel: "Полотно графа рабочего процесса с видимыми узлами и ребрами"
      },
      verify: { caption: "Проверка", title: "Барьер импорта" },
      run: { caption: "Контролируемое выполнение", title: "Проверка подписанного адаптера" }
    },
    command: {
      ariaLabel: "Панель команд и состояния",
      selectedResource: "Выбранный ресурс",
      resetIntent: "Сбросить данные импорта",
      validateIntent: "Проверить данные импорта"
    },
    settings: {
      sectionCaption: "Настройки",
      permissionHeading: "Нет выданных разрешений",
      permissionPostureLabel: "Состояние без разрешений",
      files: "Файлы",
      network: "Сеть",
      shell: "Shell",
      environment: "Окружение",
      language: {
        caption: "Язык",
        heading: "Язык",
        label: "Язык интерфейса",
        description: "Выберите язык для интерфейса приложения и элементов управления рабочей области.",
        storageNote: "Выбор хранится локально на этом устройстве.",
        fallbackNote: "Неподдерживаемые сохраненные значения возвращаются к английскому."
      },
      release: {
        caption: "Дистрибуция",
        heading: "Барьер готовности релиза",
        summaryLabel: "Сводка готовности дистрибуции",
        blockersLabel: "Блокеры готовности дистрибуции",
        blockerScope: "релиз",
        status: "Статус",
        platforms: "Платформы",
        blockers: "Блокеры",
        bundling: "Сборка",
        noInstallerClaimTitle: "Нет заявления о опубликованном установщике",
        noInstallerClaimBody: "Установщик, подпись, обновление, откат, происхождение, проверка установки, проверка удаления и доказательства в чистой среде должны быть завершены до прохождения готовности релиза."
      },
      config: {
        caption: "Черновик конфигурации",
        heading: "Рендерер ui.schema.json",
        draftLabel: "Типизированный черновик конфигурации",
        actionsLabel: "Действия с черновиком",
        resetDraft: "Сбросить черновик",
        importDraft: "Импортировать черновик",
        exportRedactedDraft: "Экспортировать отредактированный черновик",
        draftDifferences: "{count} отличий черновика",
        exportUsesRedactedValues: "Экспорт использует отредактированные отображаемые значения.",
        exportBlockedByInvalidSchema: "Экспорт заблокирован недопустимой схемой.",
        invalidSchemaTitle: "Недопустимые схемы завершаются закрыто",
        invalidSchemaBody: "Неизвестные поля, небезопасные секретные поля и недопустимые значения блокируют импорт/экспорт."
      },
      vault: {
        caption: "Хранилище",
        heading: "Локальные ссылки на секреты",
        summaryLabel: "Сводка редактирования хранилища",
        listLabel: "Записи хранилища только со ссылками",
        references: "ссылок",
        inlineValues: "встроенных значений",
        screenshotsRedacted: "скриншоты отредактированы",
        exportsRedacted: "экспорты отредактированы",
        keychainStatus: "хранилище ключей {status}",
        lifecycleStates: "{count} состояний жизненного цикла",
        supportBundleRedacted: "пакет поддержки отредактирован",
        secretValuesTitle: "Секретные значения не попадают в пакеты и журналы",
        secretValuesBody: "В UI, экспортах, артефактах, скриншотах и записях ошибок могут появляться только ссылки хранилища и отредактированные заполнители."
      }
    },
    common: {
      ready: "готово",
      blocked: "заблокировано",
      enabled: "включено",
      disabled: "отключено",
      invalid: "недопустимо"
    }
  };

export default messages;
