import { Icon } from './ui';
import StarBorder from './vendor/react-bits/StarBorder';

interface AcademyHeroProps {
  resume: boolean;
  onStart: () => void;
  onScenarios: () => void;
}

export default function AcademyHero({ resume, onStart, onScenarios }: AcademyHeroProps) {
  return (
    <section className="academy-hero" aria-labelledby="academy-heading">
      <div className="academy-hero-art" aria-hidden="true">
        <img className="academy-hero-photo" src="/courtroom-preview.png" alt="" fetchPriority="high" />
        <div className="academy-hero-beam" />
        <div className="academy-hero-frame" />
        <div className="academy-hero-shutters">
          <div className="academy-shutter" />
          <div className="academy-shutter" />
          <div className="academy-shutter" />
        </div>
      </div>
      <div className="academy-hero-copy">
        <span className="learn-eyebrow">3D SUD SIMULYATORI</span>
        <h1 id="academy-heading">
          <span className="academy-title-line"><span>Huquqni o‘qishdan</span></span>
          <span className="academy-title-line"><em>uni qo‘llashga.</em></span>
        </h1>
        <p>Rolingizni tanlang, dalillarni o‘rganing va 3D sud zalida qaroringizni asoslang.</p>
        <StarBorder className="learn-primary" onClick={onStart} radius={10}
          color="#efe7ff" trailColor="#c4b0ff" duration={4.5} sparkle>
          {resume ? 'O‘qishni davom ettirish' : 'Birinchi xonani boshlash'}
          <Icon name="play" size={17} />
        </StarBorder>
      </div>
      <button className="academy-hero-preview" onClick={onScenarios}>
        <span className="academy-preview-icon"><Icon name="scales" size={19} /></span>
        <span>Real hayot ssenariylari</span>
        <span aria-hidden="true">↗</span>
      </button>
    </section>
  );
}
