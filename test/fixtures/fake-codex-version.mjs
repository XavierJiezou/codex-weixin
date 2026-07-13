if (process.argv[2] !== "--version") {
  process.stderr.write(`unexpected arguments: ${process.argv.slice(2).join(" ")}\n`);
  process.exit(2);
}

process.stdout.write("codex-cli windows-shim-test\n");
