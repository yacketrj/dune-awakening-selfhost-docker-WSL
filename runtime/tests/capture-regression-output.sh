#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")/../.."

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_dir="${REGRESSION_OUTPUT_DIR:-work/regression-output/$timestamp}"
summary_file="$output_dir/summary.md"
commands_file="$output_dir/commands.tsv"
overall_status=0

mkdir -p "$output_dir"

{
  echo "# Runtime Shell Regression Output"
  echo
  echo "- Captured at: ${timestamp} UTC"
  echo "- Output directory: \`$output_dir\`"
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "- Git branch: \`$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)\`"
    echo "- Git commit: \`$(git rev-parse HEAD 2>/dev/null || true)\`"
  fi
  echo
  echo "| Gate | Exit code | Log |"
  echo "|---|---:|---|"
} > "$summary_file"

printf 'gate\tcommand\texit_code\tlog\n' > "$commands_file"

run_capture() {
  local gate="$1"
  shift
  local log_file="$output_dir/${gate}.log"
  local command_display
  local status

  printf -v command_display '%q ' "$@"
  command_display="${command_display% }"

  {
    echo "# $gate"
    echo
    echo "Command: $command_display"
    echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo
  } > "$log_file"

  "$@" >> "$log_file" 2>&1
  status=$?

  {
    echo
    echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Exit code: $status"
  } >> "$log_file"

  printf '| `%s` | %s | `%s` |\n' "$gate" "$status" "$log_file" >> "$summary_file"
  printf '%s\t%s\t%s\t%s\n' "$gate" "$command_display" "$status" "$log_file" >> "$commands_file"

  if [ "$status" -ne 0 ]; then
    overall_status=1
  fi
}

run_capture "runtime-shell-syntax" bash -c '
  mapfile -t shell_files < <(find runtime/scripts runtime/tests -type f -name "*.sh" | sort)
  if [ "${#shell_files[@]}" -eq 0 ]; then
    echo "No runtime shell files found." >&2
    exit 1
  fi
  bash -n "${shell_files[@]}"
'

run_capture "runtime-shell-tests" bash -c '
  found=0
  for test_file in runtime/tests/test-*.sh; do
    [ -e "$test_file" ] || continue
    found=1
    echo "==> $test_file"
    bash "$test_file"
  done
  if [ "$found" -eq 0 ]; then
    echo "No runtime test scripts found." >&2
    exit 1
  fi
'

{
  echo
  if [ "$overall_status" -eq 0 ]; then
    echo "Overall result: PASS"
  else
    echo "Overall result: FAIL"
  fi
} >> "$summary_file"

echo "Runtime shell regression output written to: $output_dir"
echo "Summary: $summary_file"

exit "$overall_status"
