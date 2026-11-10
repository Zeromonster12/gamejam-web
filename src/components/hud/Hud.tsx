import { EVENT } from "@/lib/event";
import { PixelSprite } from "@/components/pixel/pixel";
import { Countdown } from "./Countdown";

/** Herná HUD lišta ako na plagáte: 1UP + srdiečka · HI-SCORE · TIME (odpočet do štartu). */
export function Hud() {
  return (
    <header className="hud">
      <div className="hud-inner">
        <div className="hud-cell">
          <span className="hud-label">1UP</span>
          <span className="hud-hearts" aria-hidden="true">
            <PixelSprite name="heart" scale={2} className="hud-heart" />
            <PixelSprite name="heart" scale={2} className="hud-heart" />
            <PixelSprite name="heart" scale={2} className="hud-heart" />
          </span>
        </div>
        <div className="hud-cell hud-cell--center">
          <span className="hud-label">HI-SCORE</span>
          <span className="hud-value">
            {EVENT.prizes.main} {EVENT.currency}
          </span>
        </div>
        <div className="hud-cell hud-cell--right">
          <span className="hud-label">TIME</span>
          <span className="hud-value hud-value--lime">
            <Countdown startsAt={EVENT.startsAt} endsAt={EVENT.endsAt} />
          </span>
        </div>
      </div>
    </header>
  );
}
