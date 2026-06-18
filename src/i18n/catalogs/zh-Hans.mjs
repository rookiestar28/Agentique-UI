const messages = {
    app: {
      ariaLabel: "Agentique UI 本地工作区",
      brandName: "Agentique UI",
      brandSubtitle: "本地工作区"
    },
    shell: {
      primaryNavigation: "主导航",
      workspacePages: "工作区页面",
      mobileWorkspaceNavigation: "移动端工作区导航",
      openWorkspaceNavigation: "打开工作区导航",
      closeWorkspaceNavigation: "关闭工作区导航",
      workspaceNavigationTitle: "工作区导航"
    },
    navigation: {
      library: "资源库",
      import: "导入",
      verify: "验证",
      preview: "预览",
      graph: "图谱",
      run: "运行",
      handoff: "交接",
      settings: "设置"
    },
    page: {
      library: {
        caption: "资源库",
        title: "本地资源库"
      },
      import: {
        caption: "导入",
        title: "安全打开资源"
      },
      verify: {
        caption: "验证",
        title: "检查信任与验证门槛"
      },
      preview: {
        caption: "预览",
        title: "检查静态资源输出"
      },
      graph: {
        caption: "图谱",
        title: "安全编辑工作流描述符"
      },
      run: {
        caption: "运行",
        title: "检查受控执行"
      },
      handoff: {
        caption: "交接",
        title: "准备非执行交接"
      },
      settings: {
        caption: "设置",
        title: "本地配置与机密"
      }
    },
    workspace: {
      loading: "正在加载工作区",
      library: { caption: "资源库", title: "资源浏览器", proofSummary: "资源库验证摘要" },
      import: {
        caption: "导入入口",
        title: "安全打开资源",
        intentLabel: "导入内容",
        loadExample: "加载示例",
        externalIntakeLabel: "外部导入扫描器",
        runStaticScan: "运行静态扫描",
        loadSafeSample: "加载安全样本"
      },
      preview: {
        caption: "安全预览",
        note: "仅静态检查；不会加载资源代码、媒体字节或本地路径。",
        staticFileTree: "静态文件树",
        previewMode: "预览模式"
      },
      handoff: {
        caption: "交接",
        title: "描述符",
        descriptorReview: "描述符审查",
        safetyFlags: "执行安全标志",
        agentClientCaption: "Agent 客户端",
        agentClientTitle: "仅审查交接计划",
        externalRuntimeCaption: "外部运行时",
        externalRuntimeTitle: "仅描述符交接"
      },
      graph: {
        caption: "工作流图画布",
        title: "Agentique IR 可视化器",
        subtitle: "受保护的本地执行，仅限权限审查后",
        modeLabel: "图编辑器模式",
        editor: "编辑器",
        executions: "执行",
        evaluations: "评估",
        review: "审查",
        validationSummary: "图验证摘要",
        canvasControls: "图画布控制",
        capabilityMatrix: "图执行能力矩阵",
        canvasLabel: "带可见节点和边的工作流图画布"
      },
      verify: { caption: "验证", title: "导入门槛" },
      run: { caption: "受控执行", title: "已签名适配器审查" }
    },
    command: {
      ariaLabel: "命令与状态栏",
      selectedResource: "已选资源",
      resetIntent: "重置导入内容",
      validateIntent: "验证导入内容"
    },
    settings: {
      sectionCaption: "设置",
      permissionHeading: "无权限授权",
      permissionPostureLabel: "无权限状态",
      files: "文件",
      network: "网络",
      shell: "Shell",
      environment: "环境",
      language: {
        caption: "语言",
        heading: "语言",
        label: "界面语言",
        description: "选择应用框架与工作区控件使用的语言。",
        storageNote: "此选择只会存储在本机设备上。",
        fallbackNote: "不支持的保存值会回退到英语。"
      },
      release: {
        caption: "分发",
        heading: "发布就绪门槛",
        summaryLabel: "分发就绪摘要",
        blockersLabel: "分发就绪阻断项",
        blockerScope: "发布",
        status: "状态",
        platforms: "平台",
        blockers: "阻断项",
        bundling: "打包",
        noInstallerClaimTitle: "不声明已发布安装包",
        noInstallerClaimBody: "安装包、签名、更新器、回滚、来源证明、安装冒烟、卸载冒烟和干净环境证据必须完整，发布就绪才能通过。"
      },
      config: {
        caption: "配置草稿",
        heading: "ui.schema.json 渲染器",
        draftLabel: "类型化配置草稿",
        actionsLabel: "草稿操作",
        resetDraft: "重置草稿",
        importDraft: "导入草稿",
        exportRedactedDraft: "导出已脱敏草稿",
        draftDifferences: "{count} 个草稿差异",
        exportUsesRedactedValues: "导出会使用已脱敏显示值。",
        exportBlockedByInvalidSchema: "无效架构会阻止导出。",
        invalidSchemaTitle: "无效架构会失败关闭",
        invalidSchemaBody: "未知字段、不安全的机密字段和无效值会阻止导入/导出。"
      },
      vault: {
        caption: "保险库",
        heading: "本地机密引用",
        summaryLabel: "保险库脱敏摘要",
        listLabel: "仅引用的保险库记录",
        references: "个引用",
        inlineValues: "个内联值",
        screenshotsRedacted: "截图已脱敏",
        exportsRedacted: "导出已脱敏",
        keychainStatus: "钥匙串 {status}",
        lifecycleStates: "{count} 个生命周期状态",
        supportBundleRedacted: "支持包已脱敏",
        secretValuesTitle: "机密值不会进入包和日志",
        secretValuesBody: "UI、导出、产物、截图或失败记录中只能出现保险库引用和脱敏占位符。"
      }
    },
    common: {
      ready: "就绪",
      blocked: "已阻断",
      enabled: "已启用",
      disabled: "已禁用",
      invalid: "无效"
    }
  };

export default messages;
