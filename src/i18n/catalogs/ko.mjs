const messages = {
    app: {
      ariaLabel: "Agentique UI 로컬 작업 영역",
      brandName: "Agentique UI",
      brandSubtitle: "로컬 작업 영역"
    },
    shell: {
      primaryNavigation: "기본 탐색",
      workspacePages: "작업 영역 페이지",
      mobileWorkspaceNavigation: "모바일 작업 영역 탐색",
      openWorkspaceNavigation: "작업 영역 탐색 열기",
      closeWorkspaceNavigation: "작업 영역 탐색 닫기",
      workspaceNavigationTitle: "작업 영역 탐색"
    },
    navigation: {
      library: "라이브러리",
      import: "가져오기",
      verify: "검증",
      preview: "미리보기",
      graph: "그래프",
      run: "실행",
      handoff: "핸드오프",
      settings: "설정"
    },
    page: {
      library: {
        caption: "리소스 라이브러리",
        title: "로컬 리소스 라이브러리"
      },
      import: {
        caption: "가져오기",
        title: "리소스를 안전하게 열기"
      },
      verify: {
        caption: "검증",
        title: "신뢰 및 검증 게이트 검토"
      },
      preview: {
        caption: "미리보기",
        title: "정적 리소스 출력 검사"
      },
      graph: {
        caption: "그래프",
        title: "워크플로 설명자를 안전하게 편집"
      },
      run: {
        caption: "실행",
        title: "제어된 실행 검토"
      },
      handoff: {
        caption: "핸드오프",
        title: "비실행 핸드오프 준비"
      },
      settings: {
        caption: "설정",
        title: "로컬 구성 및 비밀"
      }
    },
    workspace: {
      loading: "작업 영역 로드 중",
      library: { caption: "리소스 라이브러리", title: "리소스 브라우저", proofSummary: "리소스 라이브러리 검증 요약" },
      import: {
        caption: "가져오기 항목",
        title: "리소스를 안전하게 열기",
        intentLabel: "가져오기 내용",
        loadExample: "예제 불러오기",
        externalIntakeLabel: "외부 인테이크 스캐너",
        runStaticScan: "정적 스캔 실행",
        loadSafeSample: "안전 샘플 불러오기"
      },
      preview: {
        caption: "안전 미리보기",
        note: "정적 검사 전용이며 리소스 코드, 미디어 바이트 또는 로컬 경로를 로드하지 않습니다.",
        staticFileTree: "정적 파일 트리",
        previewMode: "미리보기 모드"
      },
      handoff: {
        caption: "핸드오프",
        title: "설명자",
        descriptorReview: "설명자 검토",
        safetyFlags: "실행 안전 플래그",
        agentClientCaption: "Agent 클라이언트",
        agentClientTitle: "검토 전용 핸드오프 계획",
        externalRuntimeCaption: "외부 런타임",
        externalRuntimeTitle: "설명자 전용 핸드오프"
      },
      graph: {
        caption: "워크플로 그래프 캔버스",
        title: "Agentique IR 시각화 도구",
        subtitle: "권한 검토 후에만 보호된 로컬 실행",
        modeLabel: "그래프 편집기 모드",
        editor: "편집기",
        executions: "실행",
        evaluations: "평가",
        review: "검토",
        validationSummary: "그래프 검증 요약",
        canvasControls: "그래프 캔버스 컨트롤",
        capabilityMatrix: "그래프 실행 능력 매트릭스",
        canvasLabel: "보이는 노드와 엣지가 있는 워크플로 그래프 캔버스"
      },
      verify: { caption: "검증", title: "가져오기 게이트" },
      run: { caption: "제어된 실행", title: "서명된 어댑터 검토" }
    },
    command: {
      ariaLabel: "명령 및 상태 표시줄",
      selectedResource: "선택한 리소스",
      resetIntent: "가져오기 내용 초기화",
      validateIntent: "가져오기 내용 검증"
    },
    settings: {
      sectionCaption: "설정",
      permissionHeading: "권한 부여 없음",
      permissionPostureLabel: "무권한 상태",
      files: "파일",
      network: "네트워크",
      shell: "셸",
      environment: "환경",
      language: {
        caption: "언어",
        heading: "언어",
        label: "인터페이스 언어",
        description: "앱 크롬과 작업 영역 컨트롤에 사용할 언어를 선택합니다.",
        storageNote: "이 선택은 이 장치에만 로컬로 저장됩니다.",
        fallbackNote: "지원되지 않는 저장 값은 영어로 돌아갑니다."
      },
      release: {
        caption: "배포",
        heading: "릴리스 준비 게이트",
        summaryLabel: "배포 준비 요약",
        blockersLabel: "배포 준비 차단 항목",
        blockerScope: "릴리스",
        status: "상태",
        platforms: "플랫폼",
        blockers: "차단 항목",
        bundling: "번들링",
        noInstallerClaimTitle: "릴리스된 설치 관리자 주장 없음",
        noInstallerClaimBody: "릴리스 준비를 통과하려면 설치 관리자, 서명, 업데이터, 롤백, 출처, 설치 스모크, 제거 스모크, 깨끗한 환경 증거가 완료되어야 합니다."
      },
      config: {
        caption: "구성 초안",
        heading: "ui.schema.json 렌더러",
        draftLabel: "형식화된 구성 초안",
        actionsLabel: "초안 작업",
        resetDraft: "초안 재설정",
        importDraft: "초안 가져오기",
        exportRedactedDraft: "수정된 초안 내보내기",
        draftDifferences: "초안 차이 {count}개",
        exportUsesRedactedValues: "내보내기는 수정된 표시 값을 사용합니다.",
        exportBlockedByInvalidSchema: "잘못된 스키마로 인해 내보내기가 차단되었습니다.",
        invalidSchemaTitle: "잘못된 스키마는 실패 종료됩니다",
        invalidSchemaBody: "알 수 없는 필드, 안전하지 않은 비밀 필드, 잘못된 값은 가져오기/내보내기를 차단합니다."
      },
      vault: {
        caption: "볼트",
        heading: "로컬 비밀 참조",
        summaryLabel: "볼트 수정 요약",
        listLabel: "참조 전용 볼트 기록",
        references: "개 참조",
        inlineValues: "개 인라인 값",
        screenshotsRedacted: "스크린샷 수정됨",
        exportsRedacted: "내보내기 수정됨",
        keychainStatus: "키체인 {status}",
        lifecycleStates: "수명 주기 상태 {count}개",
        supportBundleRedacted: "지원 번들이 수정됨",
        secretValuesTitle: "비밀 값은 패키지와 로그에 포함되지 않습니다",
        secretValuesBody: "UI, 내보내기, 아티팩트, 스크린샷 또는 실패 기록에는 볼트 참조와 수정된 자리 표시자만 표시될 수 있습니다."
      }
    },
    common: {
      ready: "준비됨",
      blocked: "차단됨",
      enabled: "활성화됨",
      disabled: "비활성화됨",
      invalid: "잘못됨"
    }
  };

export default messages;
