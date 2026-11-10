import Image from "next/image";
import { EVENT } from "@/lib/event";
import { PixelSprite } from "@/components/pixel/pixel";

/** Svetlý „floor“ pás z plagátu: panáčik prejde od 00:00 k vlajke 24:00, logá partnerov, kontakt. */
export function Floor() {
  const year = new Date(EVENT.startsAt).getFullYear();
  return (
    <footer className="floor">
      <div className="floor-track" aria-hidden="true">
        <span className="floor-clock floor-clock--start">00:00</span>
        <div className="walker">
          <PixelSprite name="sprite" scale={4} className="walker-sprite" />
        </div>
        <div className="floor-flag">
          <span className="floor-clock">24:00</span>
          <span className="floor-pole" />
          <PixelSprite name="flag" scale={5} className="floor-flag-cloth" />
        </div>
      </div>

      <div className="floor-band">
        <ul className="partners" aria-label="Partneri">
          {EVENT.partners.map((p) => (
            <li key={p.src}>
              <Image src={p.src} alt={p.name} width={p.width} height={p.height} sizes="(max-width: 640px) 40vw, 200px" className="partner-logo" />
            </li>
          ))}
        </ul>
        <div className="floor-meta">
          <p>
            Otázky? Napíš organizátorom:{" "}
            <a href={`mailto:${EVENT.contactEmail}`} className="floor-link">
              {EVENT.contactEmail}
            </a>
          </p>
          <p>
            © {year} {EVENT.presenter} · {EVENT.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
