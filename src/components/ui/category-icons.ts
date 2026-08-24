import {
  Baby,
  Bike,
  Briefcase,
  Car,
  Circle,
  CreditCard,
  GraduationCap,
  HeartPulse,
  Home,
  PawPrint,
  PiggyBank,
  Plane,
  Popcorn,
  Repeat,
  Shirt,
  ShoppingCart,
  Target,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Explicit registry of the icons a category (or a goal) may reference.
 *
 * Categories store an icon by NAME, so resolving it needs a lookup. Doing that
 * with `import * as Icons from 'lucide-react'` defeats tree-shaking and pulls
 * the entire icon set into the Worker bundle — around 30 MB of source, roughly
 * 1 MB gzipped after bundling. That alone pushed the Worker past Cloudflare's
 * 3 MB free-plan script limit.
 *
 * Listing them by hand keeps the bundle honest: an icon is only shipped if it
 * can actually be rendered. Adding a category means adding its icon here.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Baby,
  Bike,
  Briefcase,
  Car,
  Circle,
  CreditCard,
  GraduationCap,
  HeartPulse,
  Home,
  PawPrint,
  PiggyBank,
  Plane,
  Popcorn,
  Repeat,
  Shirt,
  ShoppingCart,
  Target,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
};

export const FALLBACK_ICON: LucideIcon = Circle;

