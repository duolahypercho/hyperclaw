declare global {
  namespace HyperchoApi {
    interface HyperchoResponse<T> {
      success: boolean;
      status: number;
      code: string;
      message: string;
      data?: T;
      error?: string;
    }
    interface PaginationType {
      totalPages: number;
      total: number;
      page: number;
      limit: number;
    }
    interface PaginatedResponse<T> {
      data: T;
      pagination: PaginationType;
    }
    interface HyperchoPaginatedResponse<T> {
      success: boolean;
      status: number;
      code: string;
      message: string;
      data?: PaginatedResponse<T>;
      error?: string;
    }
  }

  // Global type aliases
  type HyperchoResponse<T> = HyperchoApi.HyperchoResponse<T>;
  type PaginationType = HyperchoApi.PaginationType;
  type PaginatedResponse<T> = HyperchoApi.PaginatedResponse<T>;
  type HyperchoPaginatedResponse<T> = HyperchoApi.HyperchoPaginatedResponse<T>;
}

export {};
