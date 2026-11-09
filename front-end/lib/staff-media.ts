import { apiFetch, type MediaItem, type PageResponse } from "@/lib/api";

export async function fetchStaffImages(): Promise<MediaItem[]> {
  const firstPage = await apiFetch<PageResponse<MediaItem>>(
    "/staff/media?kind=image&page=1&limit=50",
    {},
  );
  const pageCount = Math.max(1, Math.ceil(firstPage.total / 50));
  const remainingPages: PageResponse<MediaItem>[] = [];

  for (let firstPageNumber = 2; firstPageNumber <= pageCount; firstPageNumber += 10) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(10, pageCount - firstPageNumber + 1) }, (_, index) =>
        apiFetch<PageResponse<MediaItem>>(
          `/staff/media?kind=image&page=${firstPageNumber + index}&limit=50`,
          {},
        ),
      ),
    );
    remainingPages.push(...batch);
  }

  return [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
}
