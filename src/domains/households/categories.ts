import { ids } from '@/lib/ids';
import { categories } from '@/db/schema';
import type { Database } from '@/db';
import { chunkRows } from '@/db/batch';

/**
 * Default category set, seeded per household so a couple can rename or archive
 * them later without touching a global table.
 */

export interface CategoryDefault {
  slug: string;
  name: string;
  icon: string;
  color: string;
  kind: 'expense' | 'income' | 'both';
}

export const DEFAULT_CATEGORIES: CategoryDefault[] = [
  { slug: 'mercado', name: 'Mercado', icon: 'ShoppingCart', color: 'emerald', kind: 'expense' },
  { slug: 'alimentacao', name: 'Alimentação', icon: 'UtensilsCrossed', color: 'amber', kind: 'expense' },
  { slug: 'delivery', name: 'Delivery', icon: 'Bike', color: 'orange', kind: 'expense' },
  { slug: 'transporte', name: 'Transporte', icon: 'Car', color: 'sky', kind: 'expense' },
  { slug: 'moradia', name: 'Moradia', icon: 'Home', color: 'indigo', kind: 'expense' },
  { slug: 'energia', name: 'Energia', icon: 'Zap', color: 'yellow', kind: 'expense' },
  { slug: 'internet', name: 'Internet', icon: 'Wifi', color: 'cyan', kind: 'expense' },
  { slug: 'saude', name: 'Saúde', icon: 'HeartPulse', color: 'rose', kind: 'expense' },
  { slug: 'educacao', name: 'Educação', icon: 'GraduationCap', color: 'violet', kind: 'expense' },
  { slug: 'lazer', name: 'Lazer', icon: 'Popcorn', color: 'fuchsia', kind: 'expense' },
  { slug: 'roupa', name: 'Roupa', icon: 'Shirt', color: 'pink', kind: 'expense' },
  { slug: 'assinaturas', name: 'Assinaturas', icon: 'Repeat', color: 'purple', kind: 'expense' },
  { slug: 'cartao', name: 'Cartão', icon: 'CreditCard', color: 'slate', kind: 'expense' },
  { slug: 'filhos', name: 'Filhos', icon: 'Baby', color: 'teal', kind: 'expense' },
  { slug: 'pets', name: 'Pets', icon: 'PawPrint', color: 'lime', kind: 'expense' },
  { slug: 'viagem', name: 'Viagem', icon: 'Plane', color: 'blue', kind: 'expense' },
  { slug: 'outros', name: 'Outros', icon: 'Circle', color: 'stone', kind: 'expense' },
  { slug: 'salario', name: 'Salário', icon: 'Wallet', color: 'emerald', kind: 'income' },
  { slug: 'freela', name: 'Freela / Extra', icon: 'Briefcase', color: 'teal', kind: 'income' },
  { slug: 'outras-entradas', name: 'Outras entradas', icon: 'PiggyBank', color: 'green', kind: 'income' },
];

/** Slug used when nothing better can be inferred from a description. */
export const FALLBACK_EXPENSE_CATEGORY = 'outros';
export const FALLBACK_INCOME_CATEGORY = 'outras-entradas';

export async function seedHouseholdCategories(
  db: Database,
  householdId: string,
  now: Date,
): Promise<void> {
  const rows = DEFAULT_CATEGORIES.map((category, index) => ({
    id: ids.category(),
    householdId,
    slug: category.slug,
    name: category.name,
    icon: category.icon,
    color: category.color,
    kind: category.kind,
    isSystem: true,
    sortOrder: index,
    createdAt: now,
  }));

  // 11 bound columns per row; batched so D1's 100-parameter limit is never hit.
  for (const batch of chunkRows(rows, 11)) {
    await db.insert(categories).values(batch);
  }
}
