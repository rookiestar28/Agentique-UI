const messages = {
    app: {
      ariaLabel: "Agentique UI ローカルワークスペース",
      brandName: "Agentique UI",
      brandSubtitle: "ローカルワークスペース"
    },
    shell: {
      primaryNavigation: "プライマリナビゲーション",
      workspacePages: "ワークスペースページ",
      mobileWorkspaceNavigation: "モバイルワークスペースナビゲーション",
      openWorkspaceNavigation: "ワークスペースナビゲーションを開く",
      closeWorkspaceNavigation: "ワークスペースナビゲーションを閉じる",
      workspaceNavigationTitle: "ワークスペースナビゲーション"
    },
    navigation: {
      library: "ライブラリ",
      import: "インポート",
      verify: "検証",
      preview: "プレビュー",
      graph: "グラフ",
      run: "実行",
      handoff: "引き渡し",
      settings: "設定"
    },
    page: {
      library: {
        caption: "ライブラリ",
        title: "ローカルリソースライブラリ"
      },
      import: {
        caption: "インポート",
        title: "リソースを安全に開く"
      },
      verify: {
        caption: "検証",
        title: "信頼と検証ゲートを確認"
      },
      preview: {
        caption: "プレビュー",
        title: "静的リソース出力を確認"
      },
      graph: {
        caption: "グラフ",
        title: "ワークフロー記述子を安全に編集"
      },
      run: {
        caption: "実行",
        title: "制御された実行を確認"
      },
      handoff: {
        caption: "引き渡し",
        title: "非実行の引き渡しを準備"
      },
      settings: {
        caption: "設定",
        title: "ローカル設定とシークレット"
      }
    },
    workspace: {
      loading: "ワークスペースを読み込み中",
      library: { caption: "ライブラリ", title: "リソースブラウザ", proofSummary: "リソースライブラリ検証サマリー" },
      import: {
        caption: "インポート入口",
        title: "リソースを安全に開く",
        intentLabel: "インポート内容",
        loadExample: "例を読み込む",
        externalIntakeLabel: "外部インテークスキャナー",
        runStaticScan: "静的スキャンを実行",
        loadSafeSample: "安全なサンプルを読み込む"
      },
      preview: {
        caption: "安全なプレビュー",
        note: "静的検査のみ。リソースコード、メディアバイト、ローカルパスは読み込まれません。",
        staticFileTree: "静的ファイルツリー",
        previewMode: "プレビューモード"
      },
      handoff: {
        caption: "引き渡し",
        title: "記述子",
        descriptorReview: "記述子レビュー",
        safetyFlags: "実行安全フラグ",
        agentClientCaption: "Agent クライアント",
        agentClientTitle: "レビュー専用引き渡し計画",
        externalRuntimeCaption: "外部ランタイム",
        externalRuntimeTitle: "記述子のみの引き渡し"
      },
      graph: {
        caption: "ワークフローグラフキャンバス",
        title: "Agentique IR ビジュアライザー",
        subtitle: "保護されたローカル実行、権限レビュー後のみ",
        modeLabel: "グラフエディターモード",
        editor: "エディター",
        executions: "実行",
        evaluations: "評価",
        review: "レビュー",
        validationSummary: "グラフ検証サマリー",
        canvasControls: "グラフキャンバス操作",
        capabilityMatrix: "グラフ実行能力マトリクス",
        canvasLabel: "可視ノードとエッジを含むワークフローグラフキャンバス"
      },
      verify: { caption: "検証", title: "インポートゲート" },
      run: { caption: "制御された実行", title: "署名済みアダプターレビュー" }
    },
    command: {
      ariaLabel: "コマンドとステータスバー",
      selectedResource: "選択中のリソース",
      resetIntent: "インポート内容をリセット",
      validateIntent: "インポート内容を検証"
    },
    settings: {
      sectionCaption: "設定",
      permissionHeading: "権限付与なし",
      permissionPostureLabel: "権限なしの状態",
      files: "ファイル",
      network: "ネットワーク",
      shell: "シェル",
      environment: "環境",
      language: {
        caption: "言語",
        heading: "言語",
        label: "インターフェイス言語",
        description: "アプリの枠組みとワークスペース操作に使う言語を選びます。",
        storageNote: "この選択はこのデバイスにのみ保存されます。",
        fallbackNote: "未対応の保存値は英語に戻ります。"
      },
      release: {
        caption: "配布",
        heading: "リリース準備ゲート",
        summaryLabel: "配布準備の概要",
        blockersLabel: "配布準備のブロッカー",
        blockerScope: "リリース",
        status: "状態",
        platforms: "プラットフォーム",
        blockers: "ブロッカー",
        bundling: "バンドル",
        noInstallerClaimTitle: "公開済みインストーラーとは主張しません",
        noInstallerClaimBody: "リリース準備に合格するには、インストーラー、署名、アップデーター、ロールバック、来歴、インストールスモーク、アンインストールスモーク、クリーン環境の証拠が完了している必要があります。"
      },
      config: {
        caption: "設定ドラフト",
        heading: "ui.schema.json レンダラー",
        draftLabel: "型付き設定ドラフト",
        actionsLabel: "ドラフト操作",
        resetDraft: "ドラフトをリセット",
        importDraft: "ドラフトをインポート",
        exportRedactedDraft: "マスク済みドラフトをエクスポート",
        draftDifferences: "{count} 件のドラフト差分",
        exportUsesRedactedValues: "エクスポートはマスク済み表示値を使用します。",
        exportBlockedByInvalidSchema: "無効なスキーマによりエクスポートはブロックされます。",
        invalidSchemaTitle: "無効なスキーマはフェイルクローズします",
        invalidSchemaBody: "不明なフィールド、安全でないシークレットフィールド、無効な値はインポート/エクスポートをブロックします。"
      },
      vault: {
        caption: "ボールト",
        heading: "ローカルシークレット参照",
        summaryLabel: "ボールトのマスク概要",
        listLabel: "参照のみのボールト記録",
        references: "件の参照",
        inlineValues: "件のインライン値",
        screenshotsRedacted: "スクリーンショットはマスク済み",
        exportsRedacted: "エクスポートはマスク済み",
        keychainStatus: "キーチェーン {status}",
        lifecycleStates: "{count} 件のライフサイクル状態",
        supportBundleRedacted: "サポートバンドルはマスク済み",
        secretValuesTitle: "シークレット値はパッケージやログに入りません",
        secretValuesBody: "UI、エクスポート、成果物、スクリーンショット、失敗記録には、ボールト参照とマスク済みプレースホルダーのみ表示できます。"
      }
    },
    common: {
      ready: "準備完了",
      blocked: "ブロック済み",
      enabled: "有効",
      disabled: "無効",
      invalid: "無効"
    }
  };

export default messages;
