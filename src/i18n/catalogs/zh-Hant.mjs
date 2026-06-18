const messages = {
    app: {
      ariaLabel: "Agentique UI 本機工作區",
      brandName: "Agentique UI",
      brandSubtitle: "本機工作區"
    },
    shell: {
      primaryNavigation: "主要導覽",
      workspacePages: "工作區頁面",
      mobileWorkspaceNavigation: "行動工作區導覽",
      openWorkspaceNavigation: "開啟工作區導覽",
      closeWorkspaceNavigation: "關閉工作區導覽",
      workspaceNavigationTitle: "工作區導覽"
    },
    navigation: {
      library: "資源庫",
      import: "匯入",
      verify: "驗證",
      preview: "預覽",
      graph: "圖譜",
      run: "執行",
      handoff: "交接",
      settings: "設定"
    },
    page: {
      library: {
        caption: "資源庫",
        title: "本機資源庫"
      },
      import: {
        caption: "匯入",
        title: "安全開啟資源"
      },
      verify: {
        caption: "驗證",
        title: "檢查信任與驗證門檻"
      },
      preview: {
        caption: "預覽",
        title: "檢查靜態資源輸出"
      },
      graph: {
        caption: "圖譜",
        title: "安全編輯工作流程描述"
      },
      run: {
        caption: "執行",
        title: "檢查受控執行"
      },
      handoff: {
        caption: "交接",
        title: "準備非執行交接"
      },
      settings: {
        caption: "設定",
        title: "本機設定與機密"
      }
    },
    workspace: {
      loading: "正在載入工作區",
      library: { caption: "資源庫", title: "資源瀏覽器", proofSummary: "資源庫驗證摘要" },
      import: {
        caption: "匯入入口",
        title: "安全開啟資源",
        intentLabel: "匯入內容",
        loadExample: "載入範例",
        externalIntakeLabel: "外部匯入掃描器",
        runStaticScan: "執行靜態掃描",
        loadSafeSample: "載入安全樣本"
      },
      preview: {
        caption: "安全預覽",
        note: "僅靜態檢查；不會載入資源程式碼、媒體位元組或本機路徑。",
        staticFileTree: "靜態檔案樹",
        previewMode: "預覽模式"
      },
      handoff: {
        caption: "交接",
        title: "描述符",
        descriptorReview: "描述符審查",
        safetyFlags: "執行安全標誌",
        agentClientCaption: "Agent 用戶端",
        agentClientTitle: "僅審查交接計畫",
        externalRuntimeCaption: "外部執行階段",
        externalRuntimeTitle: "僅描述符交接"
      },
      graph: {
        caption: "工作流程圖畫布",
        title: "Agentique IR 視覺化器",
        subtitle: "受保護的本機執行，僅限權限審查後",
        modeLabel: "圖編輯器模式",
        editor: "編輯器",
        executions: "執行",
        evaluations: "評估",
        review: "審查",
        validationSummary: "圖驗證摘要",
        canvasControls: "圖畫布控制",
        capabilityMatrix: "圖執行能力矩陣",
        canvasLabel: "含可見節點與邊的工作流程圖畫布"
      },
      verify: { caption: "驗證", title: "匯入門檻" },
      run: { caption: "受控執行", title: "已簽名適配器審查" }
    },
    command: {
      ariaLabel: "命令與狀態列",
      selectedResource: "已選資源",
      resetIntent: "重設匯入內容",
      validateIntent: "驗證匯入內容"
    },
    settings: {
      sectionCaption: "設定",
      permissionHeading: "無權限授權",
      permissionPostureLabel: "無權限狀態",
      files: "檔案",
      network: "網路",
      shell: "Shell",
      environment: "環境",
      language: {
        caption: "語言",
        heading: "語言",
        label: "介面語言",
        description: "選擇應用框架與工作區控制項使用的語言。",
        storageNote: "此選擇只會儲存在這台裝置上。",
        fallbackNote: "不支援的已儲存值會回退到英文。"
      },
      release: {
        caption: "發佈",
        heading: "發佈就緒門檻",
        summaryLabel: "發佈就緒摘要",
        blockersLabel: "發佈就緒阻斷項",
        blockerScope: "發佈",
        status: "狀態",
        platforms: "平台",
        blockers: "阻斷項",
        bundling: "打包",
        noInstallerClaimTitle: "不宣稱已發佈安裝程式",
        noInstallerClaimBody: "安裝程式、簽章、更新器、回復、來源證明、安裝冒煙、解除安裝冒煙和乾淨環境證據必須完整，發佈就緒才能通過。"
      },
      config: {
        caption: "設定草稿",
        heading: "ui.schema.json 轉譯器",
        draftLabel: "型別化設定草稿",
        actionsLabel: "草稿操作",
        resetDraft: "重設草稿",
        importDraft: "匯入草稿",
        exportRedactedDraft: "匯出已遮蔽草稿",
        draftDifferences: "{count} 個草稿差異",
        exportUsesRedactedValues: "匯出會使用已遮蔽顯示值。",
        exportBlockedByInvalidSchema: "無效架構會阻止匯出。",
        invalidSchemaTitle: "無效架構會失敗關閉",
        invalidSchemaBody: "未知欄位、不安全的機密欄位和無效值會阻止匯入/匯出。"
      },
      vault: {
        caption: "保管庫",
        heading: "本機機密引用",
        summaryLabel: "保管庫遮蔽摘要",
        listLabel: "僅引用的保管庫紀錄",
        references: "筆引用",
        inlineValues: "筆內嵌值",
        screenshotsRedacted: "截圖已遮蔽",
        exportsRedacted: "匯出已遮蔽",
        keychainStatus: "鑰匙圈 {status}",
        lifecycleStates: "{count} 個生命週期狀態",
        supportBundleRedacted: "支援套件已遮蔽",
        secretValuesTitle: "機密值不會進入套件與日誌",
        secretValuesBody: "UI、匯出、產物、截圖或失敗紀錄中只能出現保管庫引用和遮蔽占位符。"
      }
    },
    common: {
      ready: "就緒",
      blocked: "已阻斷",
      enabled: "已啟用",
      disabled: "已停用",
      invalid: "無效"
    }
  };

export default messages;
