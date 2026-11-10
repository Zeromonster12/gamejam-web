/**
 * Herné okno / dialóg: notched pixel rámik (svetlá linka + fialový okraj),
 * tvrdý tieň a voliteľný štítok na hornej hrane (ako „MENU“ v reels).
 * Bez hookov – použiteľné v server aj client components.
 */
export function PixelWindow({
  children,
  tab,
  tabTone = "lime",
  tone = "violet",
  className = "",
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode;
  tab?: React.ReactNode;
  tabTone?: "lime" | "pink" | "violet";
  tone?: "violet" | "pink";
  className?: string;
  as?: "div" | "section" | "aside";
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  return (
    <Tag className={`pwin pwin--${tone} ${tab ? "pwin--tabbed" : ""} ${className}`} {...rest}>
      <span className="pwin-shadow" aria-hidden="true" />
      <div className="pwin-frame">
        <div className="pwin-inner">{children}</div>
      </div>
      {tab ? <span className={`pwin-tab pwin-tab--${tabTone}`}>{tab}</span> : null}
    </Tag>
  );
}
