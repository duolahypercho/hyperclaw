export interface DocEntry {
  relativePath: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface DocsState {
  docs: DocEntry[];
  selectedPath: string | null;
  content: string | null;
  loading: boolean;
  listLoading: boolean;
  error: string | null;
}
