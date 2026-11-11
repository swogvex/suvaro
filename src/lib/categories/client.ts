/** Browser side of Settings › Categories: thin calls to the API (`ApiError.code` says what went wrong). */
import { ApiError, call } from '../movements/client';
import type { CategoryFields, CategoryRow, ColorIndex } from './model';

export { ApiError };

export async function createCategory(id: string, fields: CategoryFields): Promise<CategoryRow> {
  const response = await call('POST', '/api/categories', { id, ...fields });
  return ((await response.json()) as { category: CategoryRow }).category;
}

export async function updateCategory(
  id: string,
  fields: CategoryFields,
): Promise<{ name: string; icon: string; color: ColorIndex }> {
  const response = await call('PATCH', `/api/categories/${id}`, fields);
  return ((await response.json()) as { category: { name: string; icon: string; color: ColorIndex } })
    .category;
}

export async function deleteCategory(id: string, moveTo: string | null): Promise<void> {
  await call('DELETE', `/api/categories/${id}`, { moveTo });
}
