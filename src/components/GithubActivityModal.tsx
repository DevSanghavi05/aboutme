"use client";

import { useState } from "react";
import { Github, Mail, Phone, X } from "lucide-react";
import type { GithubActivityData } from "@/lib/githubActivity";
import styles from "@/app/test/test.module.css";

export function HomeContactArea({ activity }: { activity: GithubActivityData }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <ul className={`${styles.contacts} ${styles.homeContacts}`} aria-label="Contact links">
        <li>
          <a className={styles.homeContact} href="tel:+17133633348" aria-label="Call Dev Sanghavi">
            <Phone aria-hidden="true" />
          </a>
        </li>
        <li>
          <a
            className={styles.homeContact}
            href="https://mail.google.com/mail/?view=cm&fs=1&to=devrsanghavi05%40gmail.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Email Dev Sanghavi at devrsanghavi05@gmail.com"
            title="devrsanghavi05@gmail.com"
          >
            <Mail aria-hidden="true" />
          </a>
        </li>
        <li>
          <button type="button" className={styles.homeContact} onClick={() => setIsOpen(true)} aria-label="Open GitHub activity">
            <Github aria-hidden="true" />
          </button>
        </li>
      </ul>
    );
  }

  return (
    <section className={styles.githubInlineActivity} aria-label="GitHub activity">
      <div className={styles.githubChartWrap}>
        <button className={styles.githubInlineClose} type="button" onClick={() => setIsOpen(false)} aria-label="Close GitHub activity">
          <X aria-hidden="true" />
        </button>
        <div className={styles.githubActivityCard}>
          <span className={styles.githubGrid} aria-hidden="true">
            {activity.levels.map((level, index) => (
              <span className={`${styles.githubCell} ${styles[`githubLevel${level}`]}`} key={index} />
            ))}
          </span>
        </div>
      </div>
      <div className={styles.githubInlineFooter}>
        <a href="https://github.com/DevSanghavi05" target="_blank" rel="noopener noreferrer">
          github.com/DevSanghavi05
        </a>
        <p className={styles.githubContributionTotal}>
          {activity.total.toLocaleString()} contributions in the last year
        </p>
      </div>
    </section>
  );
}
