#!/usr/bin/env node

// Native-owned runtime discovery avoids inline source and package-manager execution.
process.stdout.write(`${process.execPath}\n`);
