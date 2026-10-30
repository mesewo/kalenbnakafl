"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import PublicMediaFigure from "@/components/PublicMediaFigure";
import type { MediaItem } from "@/lib/api";

export type HomeSliderItem = {
  id: number;
  media: MediaItem;
  caption: string;
  link: string;
};

export default function HomeSlider({ slides }: { slides: HomeSliderItem[] }) {
  const t = useTranslations("site");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [motionPreferenceKnown, setMotionPreferenceKnown] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setReducedMotion(preference.matches);
      setMotionPreferenceKnown(true);
    };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || paused || reducedMotion || !motionPreferenceKnown) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [motionPreferenceKnown, paused, reducedMotion, slides.length]);

  if (slides.length === 0) return null;
  const current = slides[index];
  const displayedImage = (
    <PublicMediaFigure
      media={current.media}
      caption={current.caption}
      priority={index === 0}
      className="home-slider-image"
    />
  );
  const move = (offset: number) => {
    setIndex((currentIndex) => (currentIndex + offset + slides.length) % slides.length);
    setPaused(true);
  };

  return (
    <section
      className="home-slider-section"
      aria-label={t("homeSlider")}
      aria-roledescription={t("carousel")}
    >
      <div
        className="container home-slider"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
        }}
      >
        <div className="home-slider-content" aria-live="polite" aria-atomic="true">
          {current.link ? (
            <Link href={current.link} className="home-slider-link">
              {displayedImage}
            </Link>
          ) : (
            displayedImage
          )}
          <p className="visually-hidden">
            {t("slidePosition", { current: index + 1, total: slides.length })}
          </p>
        </div>
        <div className="home-slider-controls">
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => move(-1)}
            disabled={slides.length < 2}
          >
            {t("previousSlide")}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => setPaused((value) => !value)}
            aria-pressed={paused || reducedMotion}
            disabled={slides.length < 2}
          >
            {reducedMotion ? t("motionPaused") : paused ? t("resumeSlides") : t("pauseSlides")}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => move(1)}
            disabled={slides.length < 2}
          >
            {t("nextSlide")}
          </button>
        </div>
      </div>
    </section>
  );
}
