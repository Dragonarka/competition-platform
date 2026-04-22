#!/bin/bash
# Post-tool hook: Detect git commits and suggest QA validation
# Reads JSON from stdin with tool_input.command

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only trigger on git commit commands
if [[ "$COMMAND" == *"git commit"* ]]; then
  echo "--- QA REMINDER ---" >&2
  echo "A commit was just made. Run /qa-validate to automatically test this change in the browser." >&2
  echo "-------------------" >&2
fi

exit 0
