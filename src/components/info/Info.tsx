import { EVENT } from "@/lib/event";
import { PixelIcon } from "@/components/pixel/pixel";
import { PixelWindow } from "@/components/PixelWindow";
import { Reveal } from "@/components/Reveal";
import { PrizeCounter } from "./PrizeCounter";

const fmt = (n: number) => `${n} ${EVENT.currency}`;

export function Info() {
  return (
    <section className="info" aria-labelledby="info-title">
      <h2 id="info-title" className="sr-only">
        Kedy a kde
      </h2>

      <div className="divider" aria-hidden="true">
        <span>×</span>
      </div>

      <dl className="info-grid">
        <div className="info-col">
          <dt className="info-label info-label--pink">
            <PixelIcon name="cal" scale={4} className="info-icon" />
            <span>Kedy?</span>
          </dt>
          <dd className="info-value">{EVENT.dateLabel}</dd>
          <dd className="info-sub">štvrtok – piatok</dd>
        </div>
        <div className="info-col">
          <dt className="info-label info-label--lime">
            <PixelIcon name="clock" scale={4} className="info-icon" />
            <span>Štart</span>
          </dt>
          <dd className="info-value">{EVENT.startLabel}</dd>
          <dd className="info-sub">{EVENT.durationLabel}</dd>
        </div>
        <div className="info-col">
          <dt className="info-label info-label--violet">
            <PixelIcon name="pin" scale={4} className="info-icon" />
            <span>Kde?</span>
          </dt>
          <dd className="info-value">{EVENT.venue}</dd>
          <dd className="info-sub">{EVENT.venueCity}</dd>
        </div>
      </dl>

      <Reveal>
        <PixelWindow tab="High score" tabTone="pink" className="prize" as="section" aria-label="Výhry">
          <div className="prize-body">
            <PixelIcon name="trophy" scale={5} className="prize-trophy" />
            <p className="prize-main">
              <PrizeCounter value={EVENT.prizes.main} />
              <span className="prize-cur" aria-hidden="true">
                {EVENT.currency}
              </span>
              <span className="sr-only">Hlavná výhra {fmt(EVENT.prizes.main)}</span>
            </p>
          </div>
          <p className="prize-others">
            <span>hlavná výhra</span>
            <span>
              <span aria-hidden="true" className="prize-plus">
                +{" "}
              </span>
              ďalšie ceny v hodnote{" "}
              <strong>{EVENT.prizes.others.map(fmt).join(" · ")}</strong>
            </span>
          </p>
        </PixelWindow>
      </Reveal>
    </section>
  );
}
