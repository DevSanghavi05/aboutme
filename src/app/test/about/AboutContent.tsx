import Image from "next/image";
import styles from "../test.module.css";

export function AboutContent() {
  return (
    <>
      <h1 id="about-heading" className={styles.aboutTitle}>About</h1>
      <div className={styles.aboutGrid}>
        <figure className={styles.travelFigure}>
          <Image
            className={styles.travelImage}
            src="/dev-boardwalk-portrait.png"
            alt="Dev Sanghavi walking along a wooden boardwalk by the water"
            width={580}
            height={772}
            priority
          />
        </figure>

        <div className={styles.aboutCopy}>
          <p className={styles.aboutLead}>
            Hi! I&apos;m Dev Sanghavi, a 7th grader from Houston, TX 😎.
          </p>
          <p>
            I focus on creating high-impact systems ⚡, mostly in consumer
            software 📱. Right now, I&apos;m building{" "}
            <a href="https://getlearnr.com" target="_blank" rel="noopener noreferrer">
              Learnr 🎓
            </a>
            , a platform that turns user prompts into full, personalized courses.
          </p>
          <p>
            Outside of building, I love learning languages, with a 1000+ day
            Duolingo streak 🔥. I&apos;m fluent in 3 languages 🗣️ and learning a
            fourth.
          </p>
          <p>
            I also play guitar 🎸 and have traveled to 87 countries ✈️ so far.
          </p>
        </div>
      </div>

    </>
  );
}
