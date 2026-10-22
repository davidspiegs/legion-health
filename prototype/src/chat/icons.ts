import {
  Activity,
  Brain,
  CalendarDays,
  CircleHelp,
  Clock3,
  CloudRain,
  CreditCard,
  Ellipsis,
  Landmark,
  MessageCircle,
  Moon,
  Phone,
  Scale,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  ADHD: Brain,
  Depression: CloudRain,
  Anxiety: Activity,
  "Bipolar Disorder": Scale,
  PTSD: Shield,
  "I'm not sure": CircleHelp,
  Other: Ellipsis,
  insurance: ShieldCheck,
  selfpay: CreditCard,
  public: Landmark,
  unsure: CircleHelp,
  mornings: Sunrise,
  afternoons: Sun,
  evenings: Sunset,
  weekends: CalendarDays,
  soonest: Clock3,
  night: Moon,
  message: MessageCircle,
  phone: Phone,
  spark: Sparkles,
};

export function iconFor(key: string): LucideIcon | null {
  return ICONS[key] ?? null;
}
