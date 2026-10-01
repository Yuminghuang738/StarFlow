# 渲染进程契约（冻结）

> P5（Dashboard）与 P6（App/Report/store）之间的接口。骨架阶段已给出可用实现，
> P6 负责加固，P5 直接消费。**签名不得修改。**

## src/renderer/src/store/repoStore.ts —— 负责人 P6
export interface RepoFilters {
  keyword: string;
  language: string | null;
  category: AiCategory | null;
  onlyCloned: boolean;
}

export interface RepoStore {
  repos: Repo[];
  loading: boolean;
  filters: RepoFilters;
  visibleRepos(): Repo[];
  setFilters(patch: Partial<RepoFilters>): void;
  load(): Promise<void>;
  refreshFromGitHub(): Promise<void>;
  enrich(): Promise<void>;
  unstar(fullName: string): Promise<void>;
  fork(fullName: string): Promise<void>;
  clone(fullName: string): Promise<void>;
  openDir(path: string): Promise<void>;
}

export const useRepoStore: UseBoundStore<StoreApi<RepoStore>>;

## src/renderer/src/lib/api.ts —— 负责人 P6
export function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T>
// 把 { ok: false } 转成 toast + throw Error(error)，调用方可以 try/catch

## src/renderer/src/components/common/ConfirmDialog.tsx —— 负责人 P6
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element

## src/renderer/src/components/common/Toast.tsx —— 负责人 P6
export interface ToastItem { id: string; type: 'success' | 'error'; message: string }
export function ToastProvider(props: { children: React.ReactNode }): JSX.Element
export function useToast(): { push(t: { type: 'success' | 'error'; message: string }): void }
