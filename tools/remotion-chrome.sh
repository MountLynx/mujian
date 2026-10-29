#!/usr/bin/env bash
# In this sandbox, Chrome's `--remote-debugging-port=0` listener is not
# connectable from the same process invocation. Remotion launches Chrome with
# port 0; rewrite it to a concrete free port so its CDP WebSocket works.
#
# Usage:
#   pnpm exec remotion render <entry> <composition> <out> \
#     --browser-executable "$PWD/tools/remotion-chrome.sh"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="$ROOT/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell"

if [[ ! -x "$CHROME" ]]; then
  echo "Remotion Chrome not found at $CHROME; run: pnpm exec remotion browser ensure" >&2
  exit 1
fi

PORT="$(node -e '
const net = require("node:net");
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  server.close(() => process.stdout.write(String(port)));
});
')"

args=()
has_origin=0
for arg in "$@"; do
  case "$arg" in
    --remote-debugging-port=0|--remote-debugging-port=*)
      args+=("--remote-debugging-port=$PORT")
      ;;
    --remote-allow-origins=*)
      has_origin=1
      args+=("$arg")
      ;;
    *)
      args+=("$arg")
      ;;
  esac
done
if [[ "$has_origin" -eq 0 ]]; then
  args+=("--remote-allow-origins=*")
fi

# The bundle server is advertised as http://localhost:<port>. In this
# environment Chrome may resolve localhost to ::1 while Node listens on IPv4.
args+=("--host-resolver-rules=MAP localhost 127.0.0.1")

exec "$CHROME" "${args[@]}"
