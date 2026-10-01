/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  // 主题切换靠 <html> 上的 .dark 类，而不是 prefers-color-scheme：
  // 「跟随系统」是三个选项之一，最终都要落到这个类上，由 lib/theme.ts 统一决定。
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 语义化 token。值在 src/renderer/src/index.css 的 :root / .dark 里定义。
        //
        // 必须是**空格分隔的 RGB 三元组**（`248 250 252`）而不是十六进制，
        // 否则 `bg-surface/60` 这类透明度修饰符会失效——代码里 /60 /40 /10
        // 用得很多，尤其是毛玻璃表面。
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        'border-strong': 'rgb(var(--c-border-strong) / <alpha-value>)',
        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--c-fg-muted) / <alpha-value>)',
        'fg-subtle': 'rgb(var(--c-fg-subtle) / <alpha-value>)',
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        // 实心语义背景（按钮 / toast / 选中态那种「有色底 + 白字」）。与上面那组同名语义色的
        // 区别见 index.css 里的说明——那组当文字用，这组当背景用，两套主题的取法正好相反。
        // 注意**没有** primary-fg 之类的「实心前景」别名：唯一正确的写法是 text-solid-fg，
        // 多一个近义 token 只会诱导出低对比度的组合。
        'primary-solid': 'rgb(var(--c-primary-solid) / <alpha-value>)',
        'success-solid': 'rgb(var(--c-success-solid) / <alpha-value>)',
        'warning-solid': 'rgb(var(--c-warning-solid) / <alpha-value>)',
        'danger-solid': 'rgb(var(--c-danger-solid) / <alpha-value>)',
        'solid-fg': 'rgb(var(--c-solid-fg) / <alpha-value>)',
        link: 'rgb(var(--c-link) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)'
      },
      backgroundImage: {
        // 应用底纹。渐变端点也是 token，两套主题各给一组。
        app: 'linear-gradient(135deg, rgb(var(--c-grad-from)) 0%, rgb(var(--c-bg)) 45%, rgb(var(--c-grad-to)) 100%)',
        // 强调色渐变，只给 hero / CTA / 选中态用，实心按钮仍走纯色 --c-primary。
        accent: 'linear-gradient(120deg, rgb(var(--c-accent-from)) 0%, rgb(var(--c-accent-to)) 100%)'
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem'
      },
      transitionDuration: {
        DEFAULT: '200ms'
      }
    }
  },
  plugins: []
}
