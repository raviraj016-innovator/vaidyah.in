import { useState, useMemo, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Pagination hook for tables
// ---------------------------------------------------------------------------

export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface UsePaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  totalItems?: number;
}

export interface UsePaginationReturn<T> {
  // State
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;

  // Derived
  startIndex: number;
  endIndex: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  pageRange: number[];
  paginatedData: T[];

  // Actions
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setTotalItems: (total: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  reset: () => void;
}

export function usePagination<T = unknown>(
  data: T[] = [],
  options: UsePaginationOptions = {},
): UsePaginationReturn<T> {
  const {
    initialPage = 1,
    initialPageSize = 10,
    totalItems: externalTotal,
  } = options;

  const [page, setPageState] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [overriddenTotal, setOverriddenTotal] = useState<number | undefined>(undefined);

  const totalItems = overriddenTotal ?? externalTotal ?? data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const isFirstPage = page === 1;
  const isLastPage = page >= totalPages;

  const paginatedData = useMemo(() => {
    if (externalTotal !== undefined) {
      // Server-side pagination: data is already the current page
      return data;
    }
    // Client-side pagination: slice from full dataset
    return data.slice(startIndex, endIndex);
  }, [data, startIndex, endIndex, externalTotal]);

  const setPage = useCallback(
    (newPage: number) => {
      const clamped = Math.max(1, Math.min(newPage, totalPages));
      setPageState(clamped);
    },
    [totalPages],
  );

  const setPageSize = useCallback(
    (size: number) => {
      setPageSizeState(size);
      setPageState(1); // Reset to first page when changing page size
    },
    [],
  );

  const setTotalItems = useCallback((total: number) => {
    setOverriddenTotal(total);
  }, []);

  const nextPage = useCallback(() => {
    setPage(page + 1);
  }, [page, setPage]);

  const prevPage = useCallback(() => {
    setPage(page - 1);
  }, [page, setPage]);

  const firstPage = useCallback(() => {
    setPage(1);
  }, [setPage]);

  const lastPage = useCallback(() => {
    setPage(totalPages);
  }, [setPage, totalPages]);

  const reset = useCallback(() => {
    setPageState(initialPage);
    setPageSizeState(initialPageSize);
  }, [initialPage, initialPageSize]);

  // Generate visible page numbers with ellipsis logic
  const pageRange = useMemo(() => {
    const maxVisible = 7;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: number[] = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    if (start > 2) pages.push(-1); // Left ellipsis marker

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages - 1) pages.push(-2); // Right ellipsis marker
    pages.push(totalPages);

    return pages;
  }, [page, totalPages]);

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    isFirstPage,
    isLastPage,
    pageRange,
    paginatedData,
    setPage,
    setPageSize,
    setTotalItems,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    reset,
  };
}

export default usePagination;
