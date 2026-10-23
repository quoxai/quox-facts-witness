#!/bin/bash
# push-witness.sh: publish local witness commits to origin/main, loudly.
#
# The history is append-only and every run writes its own new files, so a
# rebase onto the remote never rewrites a published entry. Before 2026-10-23
# each script ran a bare `git push`; once the remote gained commits made
# elsewhere every push was rejected, and 12 days of canaries stayed local
# with nobody told. Now: sync first, push, and on any failure alert the
# owner and exit non-zero.
set -u
cd "$(dirname "$0")"
label="${1:-witness}"

alert() {
  local msg="quox-facts-witness: $label push FAILED ($1). Local commits are NOT public. Fix: cd $(pwd) && git pull --rebase origin main && git push origin HEAD:main"
  echo "$msg" >&2
  command -v quox-beep >/dev/null 2>&1 && quox-beep "$msg" >/dev/null 2>&1
  tg="$HOME/.claude/skills/telegram-owner/tg-send.sh"
  [ -x "$tg" ] && bash "$tg" "WITNESS" "$msg" >/dev/null 2>&1
  exit 1
}

git fetch -q origin main || alert "fetch"
git pull -q --rebase --autostash origin main || { git rebase --abort >/dev/null 2>&1; alert "rebase onto origin/main"; }
git push -q origin HEAD:main || alert "push"
git fetch -q origin main || alert "verify fetch"
ahead=$(git rev-list --count origin/main..HEAD)
[ "$ahead" = "0" ] || alert "still $ahead commit(s) ahead after push"
