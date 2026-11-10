import { Hud } from "@/components/hud/Hud";
import { Hero } from "@/components/hero/Hero";
import { Info } from "@/components/info/Info";
import { RegistrationSection } from "@/components/registration/RegistrationSection";
import { Floor } from "@/components/floor/Floor";

export default function Home() {
  return (
    <>
      <a href="#registracia" className="skip-link">
        Preskočiť na registráciu
      </a>
      <Hud />
      <main className="page">
        <Hero />
        <Info />
        <RegistrationSection />
      </main>
      <Floor />
    </>
  );
}
