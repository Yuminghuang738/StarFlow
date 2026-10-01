import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      // 并行的 git worktree / 子会话目录。它们是仓库的完整副本，各自的
      // 构建产物与旧代码会被 `eslint .` 一并扫进来（实测曾报 6600+ 个假错误）。
      // 注意 `.claude/` 只写在 .git/info/exclude 里，CI 看不到，所以不忽略也不影响流水线，
      // 但会稳定地在本地制造假红。
      '.claude/**'
    ]
  },

  ...tseslint.configs.recommended,

  // 渲染进程：禁止碰主进程代码与 Node API
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/main/**', '@shared/../main/*'],
              message: '渲染进程禁止 import 主进程代码'
            },
            {
              group: ['fs', 'path', 'child_process', 'electron', 'node:*'],
              message: '渲染进程禁止使用 Node API，请走 window.api'
            }
          ]
        }
      ],
      'no-restricted-globals': [
        'error',
        'process',
        'require',
        '__dirname',
        '__filename',
        'Buffer'
      ]
    }
  },

  // 主进程 / preload：允许 Node globals，关闭 React 相关规则
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'electron.vite.config.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off'
    }
  }
)
