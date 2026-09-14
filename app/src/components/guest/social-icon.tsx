import type { SocialPlatform } from "@/lib/modules/socialLinks";
import { InstagramIcon, FacebookIcon, YoutubeIcon, TiktokIcon, LinkedinIcon, WebsiteIcon } from "./icons";

const SOCIAL_ICON: Record<SocialPlatform, (props: { className?: string; style?: React.CSSProperties }) => React.ReactNode> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
  linkedin: LinkedinIcon,
  website: WebsiteIcon,
};

/** One place mapping a platform key to its icon component - shared by
 * Stay Connected and Facilitator social links so both render identically. */
export function SocialIcon({ platform, className, style }: { platform: SocialPlatform; className?: string; style?: React.CSSProperties }) {
  const Icon = SOCIAL_ICON[platform];
  return <Icon className={className} style={style} />;
}
