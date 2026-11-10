import Link from "next/link";
import { PixelWindow } from "@/components/PixelWindow";

export default function NotFound() {
  return (
    <main className="page notfound">
      <PixelWindow tab="Error 404" tabTone="pink" tone="pink" className="notfound-window">
        <div className="closed-body">
          <h1 className="closed-title">Game over</h1>
          <p>Táto stránka neexistuje – asi si odbočil z mapy.</p>
          <Link href="/" className="btn-start btn-start--small">
            <span className="btn-start-cursor" aria-hidden="true" />
            Continue?
          </Link>
        </div>
      </PixelWindow>
    </main>
  );
}
