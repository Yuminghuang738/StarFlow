#!/usr/bin/env bash
# P2 交付推进脚本：推送 feat/ai-p2 并开 PR。
#
# 为什么需要这个脚本：
#   本机沙箱里 Windows 的 TLS（schannel）拿不到吊销列表，GitHub 直连会报
#   CRYPT_E_NO_REVOCATION_CHECK (0x80092012)；走环境里的代理又会碰到自签证书链
#   （unable to get local issuer certificate）。所以推送时必须显式指定
#   http.sslBackend=openssl + http.sslVerify=false（或把代理的根证书加进 CA bundle）。
#   在你自己正常的网络环境里，直接跑 `git push` 也不需要这一长串参数。
#
# 用法：
#   bash scripts/push-ai-p2.sh              # 只推送
#   bash scripts/push-ai-p2.sh --with-pr    # 推送后若装了 gh，顺带开 PR
set -euo pipefail

BRANCH="feat/ai-p2"
BASE="main"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "==> 当前分支: $(git branch --show-current)"
echo "==> 将要推送: $(git log --oneline "$BASE..HEAD" | wc -l) 个提交"
git log --oneline "$BASE..HEAD"

# 只对本次命令生效，不写入仓库配置（避免把关闭校验留成长期状态）
GIT_TLS=(-c http.sslBackend=openssl -c http.sslVerify=false)

echo
echo "==> 推送到 origin/$BRANCH ..."
git "${GIT_TLS[@]}" push -u origin "$BRANCH"

echo
echo "✅ 推送完成。开 PR 的地址："
echo "   https://github.com/Yuminghuang738/StarFlow/compare/$BASE...$BRANCH?expand=1"

if [ "${1:-}" = "--with-pr" ]; then
  PR_BODY="$(dirname "${BASH_SOURCE[0]}")/selfcheck/PR-ai-p2.md"
  if command -v gh >/dev/null 2>&1; then
    echo
    echo "==> 用 gh 创建 PR ..."
    gh pr create \
      --base "$BASE" \
      --head "$BRANCH" \
      --title "feat(ai): 实现摘要、分类、批量补全与周报文案生成" \
      --body-file "$PR_BODY"
  else
    echo "（未装 gh CLI，请点上面链接手动开 PR，描述可直接复制 $PR_BODY）"
  fi
fi
