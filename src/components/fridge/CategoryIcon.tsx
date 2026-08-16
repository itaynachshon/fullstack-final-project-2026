import {
  AppleIcon,
  BeefIcon,
  CarrotIcon,
  CookieIcon,
  CookingPotIcon,
  CupSodaIcon,
  DropletsIcon,
  MilkIcon,
  PackageIcon,
  SnowflakeIcon,
  type IconProps,
} from "@/components/icons";
import type { Category } from "@/lib/types";

/**
 * Canonical category → icon assignment (docs/UI_DESIGN.md §3.6). Used for the
 * product-image fallback tile and the manual-form category chips — the same
 * metaphor everywhere, never improvised per surface.
 */
const CATEGORY_ICONS: Record<
  Category,
  (props: IconProps) => React.ReactElement
> = {
  Dairy: MilkIcon,
  "Meat & Fish": BeefIcon,
  Vegetables: CarrotIcon,
  Fruit: AppleIcon,
  Drinks: CupSodaIcon,
  "Sauces & Spreads": DropletsIcon,
  Snacks: CookieIcon,
  Prepared: CookingPotIcon,
  Frozen: SnowflakeIcon,
  Other: PackageIcon,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className={className} aria-hidden="true" />;
}
