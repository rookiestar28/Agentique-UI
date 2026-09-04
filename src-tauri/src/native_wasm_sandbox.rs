use sha2::{Digest, Sha256};
use wasmi::{Config, EnforcedLimits, Engine, Linker, Module, Store, StoreLimitsBuilder};

pub(crate) const ADAPTER_ID: &str = "adapter.local-wasm";
pub(crate) const PERMISSION_PROFILE_ID: &str = "permission.local-wasm.sandboxed";
pub(crate) const MANIFEST_ID: &str = "manifest.local-wasm.v1";
pub(crate) const MODULE_DIGEST: &str =
    "32e9891ae7d3cedff10d21cea1ae3a989d4fb5424b89b9c2f93328535cf30af7";
pub(crate) const MODULE_BYTES: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, 0x03,
    0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00, 0x0a, 0x06, 0x01, 0x04,
    0x00, 0x41, 0x2a, 0x0b,
];
pub(crate) const FUEL_BUDGET: u64 = 10_000;
pub(crate) const MAX_MODULE_BYTES: usize = 4_096;
pub(crate) const MAX_MEMORY_BYTES: usize = 65_536;
pub(crate) const MAX_STACK_BYTES: usize = 65_536;
pub(crate) const MAX_OUTPUT_BYTES: usize = 65_536;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WasmSandboxExecution {
    pub(crate) result: i32,
    pub(crate) module_digest: String,
    pub(crate) module_bytes: usize,
    pub(crate) import_count: usize,
    pub(crate) fuel_budget: u64,
    pub(crate) fuel_consumed: u64,
    pub(crate) memory_limit_bytes: usize,
    pub(crate) stack_limit_bytes: usize,
}

pub(crate) fn execute_fixed_module() -> Result<WasmSandboxExecution, String> {
    execute_module(MODULE_BYTES, MODULE_DIGEST, FUEL_BUDGET)
}

fn execute_module(
    module_bytes: &[u8],
    expected_digest: &str,
    fuel_budget: u64,
) -> Result<WasmSandboxExecution, String> {
    if module_bytes.is_empty() || module_bytes.len() > MAX_MODULE_BYTES {
        return Err(
            "native-wasm.module-size: module bytes are outside the fixed bound.".to_string(),
        );
    }
    let digest = format!("{:x}", Sha256::digest(module_bytes));
    if digest != expected_digest || expected_digest != MODULE_DIGEST {
        return Err("native-wasm.module-digest: bundled module identity is invalid.".to_string());
    }
    if fuel_budget == 0 || fuel_budget > FUEL_BUDGET {
        return Err("native-wasm.fuel-budget: fuel is outside the fixed bound.".to_string());
    }

    let engine = configured_engine();
    let module = compile_zero_import_module(&engine, module_bytes)?;
    execute_compiled_module(&engine, &module, digest, module_bytes.len(), fuel_budget)
}

fn execute_compiled_module(
    engine: &Engine,
    module: &Module,
    digest: String,
    module_bytes: usize,
    fuel_budget: u64,
) -> Result<WasmSandboxExecution, String> {
    let limits = StoreLimitsBuilder::new()
        .memory_size(MAX_MEMORY_BYTES)
        .instances(1)
        .tables(0)
        .memories(0)
        .trap_on_grow_failure(true)
        .build();
    let mut store = Store::new(engine, limits);
    store.limiter(|limits| limits);
    store
        .set_fuel(fuel_budget)
        .map_err(|_| "native-wasm.fuel-enable: fuel metering is unavailable.".to_string())?;
    let linker = Linker::new(engine);
    let instance = linker
        .instantiate_and_start(&mut store, module)
        .map_err(|_| {
            "native-wasm.instantiate: zero-import module instantiation failed.".to_string()
        })?;
    let run = instance
        .get_typed_func::<(), i32>(&store, "run")
        .map_err(|_| "native-wasm.export: expected run:()->i32 export is missing.".to_string())?;
    let result = run
        .call(&mut store, ())
        .map_err(|error| format!("native-wasm.trap: fixed module trapped: {error}"))?;
    let remaining_fuel = store
        .get_fuel()
        .map_err(|_| "native-wasm.fuel-readback: fuel evidence is unavailable.".to_string())?;
    let fuel_consumed = fuel_budget.checked_sub(remaining_fuel).ok_or_else(|| {
        "native-wasm.fuel-readback: remaining fuel exceeded the budget.".to_string()
    })?;
    Ok(WasmSandboxExecution {
        result,
        module_digest: digest,
        module_bytes,
        import_count: 0,
        fuel_budget,
        fuel_consumed,
        memory_limit_bytes: MAX_MEMORY_BYTES,
        stack_limit_bytes: MAX_STACK_BYTES,
    })
}

fn configured_engine() -> Engine {
    let mut config = Config::default();
    config
        .consume_fuel(true)
        .floats(false)
        .enforced_limits(EnforcedLimits::strict())
        .set_max_stack_height(MAX_STACK_BYTES)
        .set_max_cached_stacks(0);
    Engine::new(&config)
}

fn compile_zero_import_module(engine: &Engine, module_bytes: &[u8]) -> Result<Module, String> {
    let module = Module::new(engine, module_bytes)
        .map_err(|_| "native-wasm.module-invalid: module validation failed.".to_string())?;
    // CRITICAL: an empty Linker is insufficient proof by itself; reject every import before
    // instantiation or a future linker edit could silently grant WASI or ambient host authority.
    if module.imports().next().is_some() {
        return Err("native-wasm.imports: every module import is denied.".to_string());
    }
    Ok(module)
}

#[cfg(test)]
mod tests {
    use super::*;

    const IMPORTING_MODULE: &[u8] = &[
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x60, 0x00, 0x00, 0x60,
        0x00, 0x01, 0x7f, 0x02, 0x07, 0x01, 0x01, 0x78, 0x01, 0x79, 0x00, 0x00, 0x03, 0x02, 0x01,
        0x01, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x01, 0x0a, 0x06, 0x01, 0x04, 0x00,
        0x41, 0x2a, 0x0b,
    ];
    const MEMORY_MODULE: &[u8] = &[
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
        0x03, 0x02, 0x01, 0x00, 0x05, 0x03, 0x01, 0x00, 0x02, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75,
        0x6e, 0x00, 0x00, 0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b,
    ];
    const TRAP_MODULE: &[u8] = &[
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
        0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00, 0x0a, 0x05,
        0x01, 0x03, 0x00, 0x00, 0x0b,
    ];
    const INFINITE_MODULE: &[u8] = &[
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
        0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00, 0x0a, 0x0b,
        0x01, 0x09, 0x00, 0x03, 0x40, 0x0c, 0x00, 0x0b, 0x41, 0x00, 0x0b,
    ];

    #[test]
    fn native_wasm_exact_module_executes_with_bounded_evidence() {
        let result = execute_fixed_module().expect("exact fixed module must execute");
        assert_eq!(result.result, 42);
        assert_eq!(result.module_digest, MODULE_DIGEST);
        assert_eq!(result.module_bytes, 36);
        assert_eq!(result.import_count, 0);
        assert!(result.fuel_consumed > 0);
        assert!(result.fuel_consumed <= FUEL_BUDGET);
    }

    #[test]
    fn native_wasm_digest_and_import_mutations_fail_closed() {
        let mut tampered = MODULE_BYTES.to_vec();
        *tampered.last_mut().expect("module byte") ^= 1;
        assert!(execute_module(&tampered, MODULE_DIGEST, FUEL_BUDGET)
            .expect_err("tamper must fail")
            .contains("module-digest"));

        let importing_digest = format!("{:x}", Sha256::digest(IMPORTING_MODULE));
        assert!(
            execute_module(IMPORTING_MODULE, &importing_digest, FUEL_BUDGET)
                .expect_err("foreign digest must fail")
                .contains("module-digest")
        );
        assert!(
            compile_zero_import_module(&configured_engine(), IMPORTING_MODULE)
                .expect_err("import must fail")
                .contains("imports")
        );
    }

    #[test]
    fn native_wasm_resource_inputs_are_fixed() {
        assert!(execute_module(MODULE_BYTES, MODULE_DIGEST, 0)
            .expect_err("zero fuel must fail")
            .contains("fuel-budget"));
        assert!(execute_module(MODULE_BYTES, MODULE_DIGEST, FUEL_BUDGET + 1)
            .expect_err("extra fuel must fail")
            .contains("fuel-budget"));
    }

    #[test]
    fn native_wasm_trap_fuel_and_memory_limits_fail_closed() {
        let engine = configured_engine();
        for (module_bytes, expected) in [
            (TRAP_MODULE, "native-wasm.trap"),
            (INFINITE_MODULE, "native-wasm.trap"),
            (MEMORY_MODULE, "native-wasm.instantiate"),
        ] {
            let module = compile_zero_import_module(&engine, module_bytes).expect("test module");
            let error = execute_compiled_module(
                &engine,
                &module,
                "test-only-module".to_string(),
                module_bytes.len(),
                100,
            )
            .expect_err("resource mutation must fail");
            assert!(error.contains(expected), "unexpected error: {error}");
        }
    }
}
